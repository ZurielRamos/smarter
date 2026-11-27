# Canal WhatsApp PorkColombia Bugfix Design

## Overview

El inbox "Whatsapp PorkColombia" (tenant `research-control`) nunca se conectó: no tiene `phoneNumberId`, `wabaId` ni `accessToken`. Por eso Estado no muestra datos de Meta y el canal no envía ni recibe mensajes. Además, el código que debería ayudar a conectarlo tiene tres defectos en `backend/src/chats/chats.service.ts`:

- `syncWhatsAppPhoneNumber` (~L7208) asigna `phones[0]` de la WABA cuando el inbox no tiene `phoneNumberId`, lo que le daría a PorkColombia el número de otro canal.
- `manualConnect` (~L1014) y `syncWhatsAppPhoneNumber` no validan que el `phoneNumberId` no esté en otro inbox.
- `syncWhatsAppPhoneNumber` no deja `status = 'connected'`.

El alcance aprobado cubre datos y código. La estrategia es:

1. Corregir el código primero (validación de duplicados, sync sin número por defecto, estado `connected`). Así la corrección de datos pasa por las mismas validaciones.
2. Corregir los datos de PorkColombia con una llamada a `manual-connect`, usando el `wabaId` y el token de un canal hermano.

## Glossary

- **Bug_Condition (C)**: Una solicitud de conectar o sincronizar un inbox de WhatsApp que (a) no tiene número ni token, (b) es una sincronización sin `phoneNumberId`, o (c) usa un `phoneNumberId` ya asignado a otro inbox.
- **Property (P)**: El inbox queda con el número pedido y `status = 'connected'`, o la operación falla con un error explícito sin asignar un número ajeno ni duplicado.
- **Preservation**: Comportamiento actual de los inboxes ya conectados, `assertSingleWabaPerTenant`, Messenger, Instagram, Email y Embedded Signup.
- **manualConnect**: `ChatsService.manualConnect(inboxId, data)`, expuesto en `POST /chats/inboxes/:id/manual-connect`. Guarda token, número y WABA, lee el nombre del número en Meta y suscribe la WABA al webhook.
- **syncWhatsAppPhoneNumber**: `ChatsService.syncWhatsAppPhoneNumber(inboxId)`, expuesto en `POST /chats/whatsapp/sync-phone`. Lista los números de la WABA y actualiza el inbox.
- **assertSingleWabaPerTenant**: Regla existente que impide que un tenant use WABAs distintas.
- **assertPhoneNumberIdUnique** (nuevo): Regla que impide que dos inboxes del tenant compartan `phoneNumberId`.

## Bug Details

### Bug Condition

El bug aparece cuando un inbox de WhatsApp se conecta o sincroniza sin datos propios, o con un número que ya pertenece a otro inbox. Hoy `syncWhatsAppPhoneNumber` elige `phones[0]`, y ni ese método ni `manualConnect` consultan los demás inboxes.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type InboxConnectRequest { inbox, operation, phoneNumberId?, wabaId?, accessToken? }
  OUTPUT: boolean

  RETURN (input.inbox.channel = 'whatsapp'
            AND input.inbox.phoneNumberId = null
            AND input.inbox.accessToken = null)
      OR (input.operation = 'sync' AND input.inbox.phoneNumberId = null
            AND input.phoneNumberId = null)
      OR (input.phoneNumberId <> null
            AND EXISTS other IN tenantInboxes(input.inbox.tenantId)
                WHERE other.id <> input.inbox.id
                  AND other.phoneNumberId = input.phoneNumberId)
END FUNCTION
```

### Examples

- PorkColombia sin datos: Estado muestra "Sin nombre verificado" y `getWhatsAppAccountStatus` devuelve `{ error: 'No access token configured' }`. Esperado: tras conectar, muestra nombre verificado "Research Control | Frescas", calidad y tier.
- Sync sobre un inbox con `wabaId` y token pero sin `phoneNumberId`: hoy guarda `phones[0]` (número de Research o Strategee). Esperado: no modifica el inbox y devuelve los números libres de la WABA para elegir.
- `manual-connect` en PorkColombia con el `phoneNumberId` de Strategee: hoy guarda y deja dos inboxes con el mismo número. Esperado: `BadRequestException` que nombra a "Whatsapp Strategee".
- Sync con éxito: hoy el `status` queda como estaba. Esperado: `connected`.
- Caso límite: reconectar el mismo inbox con su propio `phoneNumberId` está permitido (se excluye a sí mismo de la comparación).

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- "Whatsapp Research" y "Whatsapp Strategee" siguen usando su número, WABA y token sin cambios.
- `syncWhatsAppPhoneNumber` sobre un inbox cuyo `phoneNumberId` existe en la WABA sigue refrescando `channelName` y devuelve los mismos campos (`phoneNumberId`, `displayPhoneNumber`, `verifiedName`, `qualityRating`, `totalPhoneNumbers`), más el `status`.
- `assertSingleWabaPerTenant` sigue rechazando WABAs distintas y permite otros números de la misma WABA.
- `manualConnect` con un número libre sigue conectando y suscribiendo la WABA al webhook.
- Messenger, Instagram, Email (SMTP) y Embedded Signup no cambian.

**Scope:**
Quedan sin cambios todas las entradas fuera de la condición: inboxes que ya tienen número y lo conservan, números únicos en el tenant y canales que no son WhatsApp.

## Hypothesized Root Cause

1. **Inbox nunca conectado**: el inbox se creó sin pasar por Embedded Signup ni `manual-connect`. Es la causa de los datos vacíos.
2. **Fallback implícito en sync**: el operador ternario de `syncWhatsAppPhoneNumber` usa `phones[0]` cuando no hay coincidencia. El método no recibe un `phoneNumberId` de entrada, así que no hay forma de elegir.
3. **Sin validación de unicidad**: solo existe `assertSingleWabaPerTenant`, que compara `wabaId`, no `phoneNumberId`.
4. **Estado no actualizado**: el flujo de sync nunca asigna `inbox.status`; solo lo hacen `manualConnect` y `registerWhatsAppPhoneNumber`.

## Correctness Properties

Property 1: Bug Condition - Conexión y sincronización sin ambigüedad

_For any_ solicitud donde la condición de bug se cumple, el código corregido SHALL dejar el inbox con el `phoneNumberId` pedido y `status = 'connected'`, o SHALL fallar o devolver la lista de selección sin modificar el inbox. Nunca SHALL asignar un número elegido por defecto ni un `phoneNumberId` ya usado por otro inbox del tenant. El conflicto de número SHALL generar un error que nombra el canal que lo usa.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

Property 2: Preservation - Conexión y sincronización existentes

_For any_ solicitud donde la condición de bug NO se cumple, el código corregido SHALL producir el mismo resultado que el original, preservando el comportamiento de los inboxes ya conectados, `assertSingleWabaPerTenant`, la suscripción al webhook y los canales distintos de WhatsApp.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

## Fix Implementation

### Changes Required

**File**: `backend/src/chats/chats.service.ts`

**1. Nuevo helper `assertPhoneNumberIdUnique(tenantId, phoneNumberId, currentInboxId)`** (junto a `assertSingleWabaPerTenant`, ~L766)
- Busca inboxes `channel: 'whatsapp'` del tenant con ese `phoneNumberId` e `id` distinto.
- Si hay uno, lanza `BadRequestException("El número {phoneNumberId} ya está asignado al canal «{name}».")`.
- Un helper compañero `getUsedPhoneNumberIds(tenantId, excludeInboxId)` devuelve el conjunto de `phoneNumberId` usados, para filtrar la lista de selección.
- Alcance: por tenant, igual que la regla de WABA. Si se quiere unicidad global, debe decidirse aparte (ver Notas).

**2. `manualConnect`** (~L1014)
- Si llega `data.phoneNumberId`, llamar `assertPhoneNumberIdUnique` junto a `assertSingleWabaPerTenant`, antes de mutar el inbox.
- El resto del flujo no cambia. La asignación de `status = 'connected'` y la suscripción al webhook siguen igual.

**3. `syncWhatsAppPhoneNumber(inboxId, requestedPhoneNumberId?)`** (~L7208)
- Elegir el número objetivo: `requestedPhoneNumberId ?? inbox.phoneNumberId`.
- Si no hay objetivo: no tocar el inbox. Devolver `{ requiresSelection: true, availablePhoneNumbers: [{ id, displayPhoneNumber, verifiedName, qualityRating }] }`, con solo los números de la WABA que no usa otro inbox del tenant. Si la lista queda vacía, lanzar `BadRequestException`.
- Si hay objetivo y no existe en `phones`: lanzar `BadRequestException` en lugar de caer en `phones[0]`. Hoy, un `phoneNumberId` guardado que ya no está en la WABA también cae en `phones[0]`; ese cambio es intencional y se documenta en Notas.
- Si hay objetivo y existe: llamar `assertPhoneNumberIdUnique`, asignar `phoneNumberId`, `channelName` y `status = 'connected'`, guardar.
- El resultado conserva los campos actuales y añade `status`.

**File**: `backend/src/chats/chats.controller.ts`

**4. `syncPhoneNumber`** (~L242)
- Cuerpo `{ inboxId: string; phoneNumberId?: string }` y se pasa a `syncWhatsAppPhoneNumber`. `@TenantRefs` no cambia.

**5. Llamadores en el frontend**
- Buscar con grep los usos de `whatsapp/sync-phone` en `frontend/src`. Si alguno espera siempre `phoneNumberId` en la respuesta, ajustarlo para manejar `requiresSelection`. El cambio de UI se limita a ese manejo; no se añade pantalla nueva sin pedirlo.

### Corrección de datos de PorkColombia

**Opción recomendada: `manual-connect` existente, tras desplegar el código corregido.**

1. Obtener el `id` del inbox PorkColombia y, de "Whatsapp Research" (o Strategee), su `wabaId` y `accessToken`.
2. Llamar con un usuario autorizado del tenant:
```
POST /chats/inboxes/<id PorkColombia>/manual-connect
{ "accessToken": "<token del canal hermano>",
  "phoneNumberId": "1444767485389859",
  "wabaId": "<wabaId del canal hermano>" }
```
3. `manualConnect` valida WABA y unicidad, consulta `display_phone_number`, fija `channelName`, deja `connected` y suscribe la WABA al webhook.
4. Verificar en Estado (nombre verificado, calidad, tier). Si Meta marca el número como pendiente, llamar `POST /chats/whatsapp/register-phone` con `{ inboxId, pin }`.

**Alternativa: script único** (`backend/src/scripts/` o `npx ts-node`), si no hay usuario con acceso a la API o el token está cifrado en base de datos. El script debe: leer el token del inbox hermano con la misma capa que usa el servicio, llamar `ChatsService.manualConnect` (no escribir SQL directo, para conservar validaciones y suscripción al webhook), y ser idempotente. Se recomienda `manual-connect` por ser más simple y auditable.

**Reglas operativas**
- El token no se escribe en código, logs ni en el repositorio; se pasa solo en la llamada.
- Antes de cambiar, registrar el estado actual del inbox PorkColombia (sus campos vacíos) para poder revertir.
- Si el token no tiene acceso al número, Meta devuelve error al consultar el número y `channelName` no se actualiza. Hay que generar un token con acceso a la WABA.

### Notas y decisiones abiertas

- `manualConnect` hoy guarda aunque la consulta a Meta falle (solo hace `console.error`). No se cambia: está fuera de alcance. Por eso el paso 4 de verificación es obligatorio.
- Unicidad por tenant. Varios tenants pueden compartir una WABA según el comentario de `assertSingleWabaPerTenant`; si dos tenants usaran el mismo número, el enrutamiento de webhooks por `phoneNumberId` seguiría ambiguo. No se aborda aquí.
- No hay restricción única en base de datos; el chequeo en servicio tiene una ventana de carrera mínima. No se añade índice ni migración en este alcance.

## Testing Strategy

### Validation Approach

Primero se escriben pruebas que fallan sobre el código actual y confirman las causas. Luego se verifican la corrección y la preservación. No existe `chats.service.spec.ts`; se crea uno con repositorios y `fetch` simulados (patrón de los specs existentes, por ejemplo `backend/src/auth/password-reset.service.spec.ts`). Comando: `npx jest chats.service --runInBand` desde `backend/`.

### Exploratory Bug Condition Checking

**Goal**: Mostrar el bug antes de corregirlo y confirmar o refutar las causas.

**Test Plan**: Simular inboxes en un tenant con tres inboxes de WhatsApp y `fetch` de Meta que devuelve tres números. Ejecutar sobre el código sin corregir.

**Test Cases**:
1. **Sync sin número**: inbox con WABA y token, sin `phoneNumberId`; el resultado asigna `phones[0]` (falla al esperar que no se modifique).
2. **Duplicado en manualConnect**: conectar con el `phoneNumberId` de otro inbox; se guarda sin error (falla al esperar excepción).
3. **Duplicado en sync**: pedir un número usado por otro inbox; se guarda (falla).
4. **Estado tras sync**: inbox con `status` distinto de `connected`; sigue igual tras el sync (falla).

**Expected Counterexamples**:
- Inbox sin número termina con el `id` de `phones[0]`.
- Dos inboxes del tenant con el mismo `phoneNumberId`.
- Causas posibles: fallback `phones[0]`, ausencia de validación de unicidad, `status` no asignado.

### Fix Checking

**Goal**: Para toda entrada con la condición de bug, el código corregido cumple Property 1.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := connectOrSync'(input)
  ASSERT (result.inbox.phoneNumberId = input.phoneNumberId AND result.inbox.status = 'connected')
      OR result = ExplicitError
      OR (result.requiresSelection AND inbox unchanged)
END FOR
```

### Preservation Checking

**Goal**: Para toda entrada sin la condición de bug, el resultado coincide con el original.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT connectOrSync(input) = connectOrSync'(input)
END FOR
```

**Testing Approach**: Se recomiendan pruebas basadas en propiedades porque generan muchas combinaciones de inboxes y números y detectan casos límite que las pruebas por ejemplo omiten. Si `fast-check` no está en `backend/package.json`, se usan tablas de casos parametrizadas en Jest en lugar de añadir una dependencia sin permiso.

**Test Plan**: Capturar el comportamiento actual con inboxes que ya tienen número válido y números únicos, y comprobar que sigue igual tras el cambio.

**Test Cases**:
1. **Sync con número existente en la WABA**: mismo `channelName` y mismos campos de respuesta que antes.
2. **manualConnect con número libre**: conecta, fija `channelName` y llama a `subscribeWabaToWebhook`.
3. **WABA distinta**: sigue lanzando el error de `assertSingleWabaPerTenant`.
4. **Canales no WhatsApp**: Messenger/Instagram/SMTP sin llamadas a las nuevas validaciones.

### Unit Tests

- `assertPhoneNumberIdUnique`: libre, usado por otro inbox, usado por el mismo inbox (permitido), mismo número en otro tenant (permitido).
- `syncWhatsAppPhoneNumber`: sin objetivo devuelve lista filtrada y no guarda; lista vacía lanza error; objetivo inexistente lanza error; objetivo válido guarda `connected`.
- Mensaje de error nombra el canal en conflicto.
- Controlador pasa `phoneNumberId` al servicio.

### Property-Based Tests

- Para cualquier conjunto de inboxes y números de WABA, tras una operación exitosa no existen dos inboxes del tenant con el mismo `phoneNumberId`.
- Para cualquier sync sin objetivo, el inbox no cambia y la lista excluye los números usados.
- Para cualquier inbox con número existente en la WABA, el resultado del sync equivale al original, salvo el campo `status` añadido.

### Integration Tests

- Flujo PorkColombia con Meta simulado: `manual-connect` con `1444767485389859` y el `wabaId` hermano, luego `getWhatsAppAccountStatus` devuelve nombre verificado, calidad y tier.
- Intentar luego conectar otro inbox con ese mismo número falla.
- Verificación manual posterior a la corrección de datos: PorkColombia en Estado, y envío y recepción de un mensaje de prueba; Research y Strategee siguen operando.
