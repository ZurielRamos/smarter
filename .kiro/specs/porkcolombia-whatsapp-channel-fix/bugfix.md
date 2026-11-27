# Bugfix Requirements Document

## Introduction

El canal "Whatsapp PorkColombia" del tenant `research-control` existe como inbox de tipo `whatsapp`, pero no tiene `phone_number_id`, `waba_id` ni `access_token`. Por eso la pestaña Estado muestra "Sin nombre verificado", calidad y tier "No disponible", y el canal no puede enviar ni recibir mensajes. El número +57 311 6475331 (phone_number_id `1444767485389859`, nombre "Research Control | Frescas") ya está en la misma WABA que "Whatsapp Research" y "Whatsapp Strategee".

La causa principal es de datos: el inbox nunca se conectó. El backend sí tiene un endpoint para conectarlo (`POST /chats/inboxes/:id/manual-connect`, `ChatsService.manualConnect`). El código tiene además dos defectos que hacen la asociación frágil o incorrecta:

- `ChatsService.syncWhatsAppPhoneNumber` (`backend/src/chats/chats.service.ts`, ~L7208) recibe solo el `inboxId`. Cuando el inbox no tiene `phoneNumberId`, toma `phones[0]` de la WABA, que es el número de otro canal, y se lo asigna sin avisar.
- Ni `manualConnect` ni `syncWhatsAppPhoneNumber` comprueban que el `phoneNumberId` ya esté usado por otro inbox. Dos inboxes con el mismo número hacen ambiguo el enrutamiento por `phoneNumberId` (webhooks, claves de Flows en `flow-encryption-key.service.ts`).

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN el inbox "Whatsapp PorkColombia" no tiene `phoneNumberId`, `wabaId` ni `accessToken` THEN the system muestra en Estado "Sin nombre verificado", "Desconocido", calidad y tier "No disponible", y `getWhatsAppAccountStatus` devuelve `{ error: 'No access token configured' }`.

1.2 WHEN se ejecuta `syncWhatsAppPhoneNumber` sobre un inbox con `wabaId` y `accessToken` pero sin `phoneNumberId` THEN the system asigna el primer número de la WABA (`phones[0]`), que puede pertenecer a "Whatsapp Research" o "Whatsapp Strategee", en lugar de un número elegido explícitamente.

1.3 WHEN `manualConnect` o `syncWhatsAppPhoneNumber` reciben un `phoneNumberId` que ya está asignado a otro inbox del tenant THEN the system lo guarda sin validar y deja dos canales con el mismo número.

1.4 WHEN `syncWhatsAppPhoneNumber` se ejecuta THEN the system solo actualiza `phoneNumberId` y `channelName`, y no deja `status` en `connected`.

### Expected Behavior (Correct)

2.1 WHEN el inbox "Whatsapp PorkColombia" se conecta con `phoneNumberId` `1444767485389859`, el `wabaId` de la WABA compartida y un token válido de esa WABA THEN the system SHALL guardar esos valores, dejar `status = 'connected'`, fijar `channelName` en "+57 311 6475331" (formato devuelto por Meta) y suscribir la WABA al webhook. La pestaña Estado SHALL mostrar nombre verificado, calidad, tier y verificación obtenidos de Meta.

2.2 WHEN `syncWhatsAppPhoneNumber` se ejecuta sobre un inbox sin `phoneNumberId` THEN the system SHALL NOT elegir un número por defecto. SHALL exigir un `phoneNumberId` explícito, o devolver la lista de números de la WABA que no estén asignados a otro inbox del tenant, para que el usuario elija.

2.3 WHEN un `phoneNumberId` ya está asignado a otro inbox del mismo tenant THEN the system SHALL rechazar la operación con un error claro que indique qué canal lo usa.

2.4 WHEN `syncWhatsAppPhoneNumber` termina con éxito sobre un inbox con token y número válidos THEN the system SHALL dejar `status = 'connected'` y devolver nombre verificado, calidad y tier.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN "Whatsapp Research" y "Whatsapp Strategee" se consultan, envían o reciben mensajes THEN the system SHALL CONTINUE TO usar su `phoneNumberId`, `wabaId` y token sin cambios.

3.2 WHEN un inbox ya tiene `phoneNumberId` y existe en la WABA THEN `syncWhatsAppPhoneNumber` SHALL CONTINUE TO refrescar `channelName` y devolver el mismo resultado que hoy.

3.3 WHEN un tenant intenta conectar un número de una WABA distinta a la de sus otros inboxes THEN the system SHALL CONTINUE TO rechazarlo mediante `assertSingleWabaPerTenant`. Conectar otro número de la misma WABA SHALL CONTINUE TO estar permitido.

3.4 WHEN se conectan inboxes de Messenger, Instagram o Email, o se usa Embedded Signup THEN the system SHALL CONTINUE TO funcionar como hoy.

3.5 WHEN `manualConnect` recibe un `phoneNumberId` no usado por otro inbox THEN the system SHALL CONTINUE TO conectar el canal y suscribir la WABA al webhook.

## Bug Condition

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type InboxConnectRequest { inbox, phoneNumberId?, wabaId?, accessToken? }
  OUTPUT: boolean

  RETURN (X.inbox.channel = 'whatsapp' AND X.inbox.phoneNumberId = null AND X.inbox.accessToken = null)
      OR (X.operation = 'sync' AND X.inbox.phoneNumberId = null)
      OR (X.phoneNumberId ≠ null AND EXISTS other IN tenantInboxes(X.inbox.tenantId)
            WHERE other.id ≠ X.inbox.id AND other.phoneNumberId = X.phoneNumberId)
END FUNCTION

// Property: Fix Checking
FOR ALL X WHERE isBugCondition(X) DO
  result ← connectOrSync'(X)
  ASSERT (result.inbox.phoneNumberId = X.phoneNumberId AND result.inbox.status = 'connected')
      OR result = ExplicitError   // sin asignar un número ajeno ni duplicado
END FOR

// Property: Preservation Checking
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT connectOrSync(X) = connectOrSync'(X)
END FOR
```

## Corrección de datos para el caso PorkColombia

Esto se puede hacer sin cambiar código, con el endpoint existente:

```
POST /chats/inboxes/<id de "Whatsapp PorkColombia">/manual-connect
{
  "accessToken": "<mismo token que usan los otros canales WhatsApp del tenant>",
  "phoneNumberId": "1444767485389859",
  "wabaId": "<waba_id de Whatsapp Research / Strategee>"
}
```

El `wabaId` y el token se toman del inbox de otro canal del tenant. El número queda en la WABA compartida, así que `assertSingleWabaPerTenant` lo acepta. Si el token no tiene acceso al número, Meta devolverá error al consultarlo. Una vez conectado, puede ser necesario registrar el número con `POST /chats/whatsapp/register-phone` (body `{ inboxId, pin }`) si Meta lo marca como pendiente.
