# Encuestas con reclutamiento y recompensas: guía de arquitectura

Estado: diseño aprobado. **Fases 0 (endurecimiento de Encuestas) y 1 (reclutamiento) implementadas** el 2026-11-17; fases 2 a 6 pendientes. Ver sección 13.
Este documento es la guía para construir, por fases, un sistema donde cuentas **reclutadoras** gestionan encuestadores (contratos y pagos) y los asignan a estudios de cuentas **clientes**.

## 1. Contexto y decisiones tomadas

| # | Decisión |
|---|---|
| 1 | Smarter cobra al cliente y paga al encuestador. |
| 2 | Operación en varios países. Los pagos son **manuales**, con verificación previa de una persona. La plataforma no custodia fondos. |
| 3 | Los encuestadores son un híbrido: personas con contrato de prestación de servicios. |
| 4 | Hay un cliente piloto para montar la operación. Aún no se usará en producción real. |
| 5 | Encuestadores y encuestados son **contactos** (`ClientRecord`). La persona es una sola entidad y los roles se expresan con perfiles. |
| 6 | Los establecimientos se modelan como `Organization` en el CRM (empresa con jerarquía). |
| 7 | Las **cuentas reclutadoras** (capacidad habilitada por superadmin) tienen los encuestadores, los contratos y los pagos. Asignan encuestadores a estudios de otras cuentas mediante un **acuerdo**. Una cuenta puede ser reclutadora y cliente de sí misma. |
| 8 | Un encuestador pertenece a **una sola** reclutadora en la primera versión. |

## 2. Qué existe hoy (base reutilizable)

Fuente: lectura del código al 2026-11-17.

- **Encuestas** (`backend/src/surveys/`): `Survey` y `SurveyResponse`. El cuerpo es un `flowJson` en formato Meta Flow. Hay enlace público `/s/:slug`, enlaces por agente (`agentTokens`), `requireLocation` con lat/lng dentro de `responseData.__location__`, canales web, WhatsApp y api, y atribución al CRM con `crmMapping` (`SurveyCrmService`).
- **CRM** (`backend/src/records/`): `ClientRecord` (tabla `clients`). Teléfono único por tenant (`uq_clients_tenant_phone`). Email y documento no son únicos. No hay campo de tipo o rol. `tags` es jsonb de texto libre. `assigned_to` apunta a un `User` sin clave foránea. No hay vínculo user↔record.
- **Empresas**: no existe el módulo. Solo existen el flag `Tenant.features.companies` y la columna de texto `clients.company`.
- **Feature flags** (`Tenant.features`, `ModuleFeatureGuard`, `@RequiresFeature`). El tipo `TenantFeature` no incluye `encuestas`. Se activan con `PATCH /tenants/:id/features` y se auditan como `tenant.features.update`.
- **Portal con OTP** (`backend/src/cursos/`): `CursosOtpService`, JWT con `purpose: 'course-portal'` de 30 días, sin revocación, y `CourseEnrollment` con `accessToken`.
- **Créditos** (`backend/src/billing/`): `CreditPlan`, `CreditBalance`, `CreditTransaction`, `CreditCost` y `@RequiresCredits`. Cubre el consumo de la plataforma, no pagos a terceros.
- **Mobile** (`mobile/`): Expo con SQLite como fuente de verdad, outbox y sync. Hoy solo es un inbox de chats. No tiene encuestas, GPS ni autenticación para encuestadores.
- **Infraestructura**: BullMQ/Redis, R2 con `MediaStorageService` y `synchronize: true` en TypeORM (ver riesgos).

## 3. Modelo conceptual

```
Cuenta RECLUTADORA (tenant con features.reclutamiento)
  ├─ Contactos con perfil "surveyor"  ── contrato, pagos, calificación
  ├─ Acuerdos ───────────────┐
  └─ Ledger de pago          │
                             ▼
Cuenta CLIENTE (tenant)  ◄── Acuerdo (tarifa, zonas, vigencia, aceptado por el cliente)
  ├─ Estudios (Survey) ── asignaciones de encuestadores
  ├─ Respuestas (datos del cliente)
  └─ Organizations (establecimientos) y contactos encuestados
```

Principios:
1. **Identidad, capacidad y autenticación son tres capas.** Identidad = `ClientRecord`. Capacidad = `contact_profiles`. Autenticación = OTP más JWT propio, sin `User`.
2. **Los datos de la respuesta son del cliente.** La reclutadora ve conteos, estado y calidad, no el contenido, salvo que el acuerdo lo permita.
3. **Los datos personales, de contrato y de pago viven solo en la reclutadora.** El cliente ve alias y calificación.
4. **El ledger es append-only.** El saldo se deriva, nunca se edita.
5. **No custodiamos fondos.** La plataforma calcula lo que se debe y registra lo que se pagó. El pago lo hace una persona.

## 4. Entidades nuevas

Convenciones: `tenantId` en todas las tablas, `snake_case` en columnas, soft delete donde haya historial, índices por `tenant_id` primero.

### 4.1 Núcleo CRM (independiente de encuestas)

**`organizations`**: empresas y establecimientos.
- `id`, `tenantId`, `parentId` (nullable, jerarquía cadena→sucursal), `name`, `type` (`establishment | client | other`), `documentType`, `documentNumber`, `address`, `city`, `region`, `countryCode`, `lat`, `lng`, `customData` (jsonb), `status`, `deletedAt`.
- Índices: `(tenantId)`, `(tenantId, parentId)`, `(tenantId, documentNumber)`, `(tenantId, city)`.
- Decidir al implementar: unicidad por `(tenantId, documentNumber)` parcial cuando el documento no es nulo.

**`contact_organizations`**: relación muchos a muchos.
- `tenantId`, `recordId`, `organizationId`, `role` (`owner | employee | manager | other`), único `(recordId, organizationId, role)`.

**`contact_profiles`**: capacidades de un contacto en una cuenta.
- `id`, `tenantId`, `recordId`, `type` (`surveyor`, luego `panelist`), `status` (`candidate | active | suspended | ended`), `enabledBy`, `enabledAt`, `statusReason` (motivo de la última suspensión o terminación), `data` (jsonb, datos no sensibles del rol: zona, idiomas, disponibilidad), `qualityScore`, `tokenVersion` (int, para revocar sesiones).
- Único `(tenantId, recordId, type)`.

### 4.2 Reclutamiento

**`surveyor_contracts`**: contrato de prestación de servicios.
- `id`, `tenantId` (reclutadora), `profileId`, `countryCode`, `startDate`, `endDate`, `defaultRate` (decimal), `currency`, `status` (`draft | active | ended`), `notes`.
- El documento firmado (`documentUrl`) queda **pendiente**: `MediaStorageService` publica archivos, y un contrato necesita almacenamiento privado con URLs firmadas.
- Un contrato solo se edita en borrador. Un perfil tiene como máximo un contrato activo (índice único parcial).

**`surveyor_payment_methods`**: datos de pago. Tabla aparte, acceso restringido, **campos sensibles cifrados**.
- `id`, `tenantId`, `profileId`, `method` (`bank_transfer | wallet | other`), `holderName`, `details` (cifrado), `verifiedBy`, `verifiedAt`, `isDefault`.
- Nunca se expone en `customData` ni en listados del CRM.

**`recruitment_agreements`**: acuerdo reclutadora-cliente.
- `id`, `recruiterTenantId`, `clientTenantId`, `status` (`proposed | active | paused | ended`), `acceptedBy`, `acceptedAt`, `clientRate` (decimal, lo que paga el cliente por respuesta aprobada), `currency`, `validFrom`, `validUntil`, `zones` (jsonb), `dataAccess` (`counts_only | full`), `terms` (texto).
- Único activo por `(recruiterTenantId, clientTenantId)` en la primera versión.

**`survey_assignments`**: asignación de un encuestador a un estudio.
- `id`, `workTenantId` (cliente), `surveyId`, `agreementId`, `profileId` (encuestador), `recruiterTenantId`, `quota` (int), `zone` (jsonb), `organizationId` (opcional, para visitas a un establecimiento concreto), `validFrom`, `validUntil`, `status` (`active | paused | completed | revoked`).
- Índices: `(workTenantId, surveyId)`, `(profileId, status)`.

### 4.3 Respuestas (cambios en tablas existentes)

`survey_responses` (añadir):
- `workTenantId` (= `tenantId` actual, se mantiene por compatibilidad), `payoutTenantId`, `surveyorProfileId`, `assignmentId`, `organizationId` (establecimiento evaluado), `clientUuid` (idempotencia offline), `durationSec`, `deviceId`, `lat`, `lng`, `accuracyM` (columnas reales, no jsonb).
- Revisión de dos etapas: `recruiterReviewStatus` y `clientReviewStatus` (`pending | approved | rejected | flagged`), con `reviewedBy`, `reviewedAt`, `rejectReason`, `qualityFlags` (jsonb).
- Único `(surveyId, clientUuid)` parcial.

`surveys` (añadir): `clientOrganizationId` opcional y `reward` (referencia a regla vigente).

### 4.4 Dinero

**`reward_ledger`**: libro append-only, **un asiento por movimiento**.
- `id`, `payoutTenantId`, `workTenantId`, `profileId`, `agreementId`, `responseId`, `type` (`accrual | reversal | payout | adjustment`), `amount` (decimal, con signo), `currency`, `balanceAfter`, `createdBy`, `createdAt`, `note`.
- Invariante: el saldo de un perfil es la suma de sus asientos. Los asientos no se modifican ni se borran.
- Un asiento paralelo `receivable_ledger` (o `ledger_side = 'client_receivable'`) registra lo que el cliente debe a la reclutadora. Decidir si es tabla aparte o una columna al diseñar la Fase 4.

**`payout_requests`**: solicitud y registro de pago.
- `id`, `payoutTenantId`, `profileId`, `amount`, `currency`, `status` (`requested | approved | paid | rejected`), `requestedAt`, `approvedBy`, `paidBy`, `paidAt`, `proofUrl` (comprobante en R2), `paymentMethodId`, `ledgerEntryId`.
- Regla: pasar a `paid` crea el asiento `payout` en el ledger en la misma transacción.

### 4.5 Auditoría

**`tenant_audit_logs`**: auditoría por tenant. `AdminAuditLog` actual es solo de superadmin. Registra aprobaciones, rechazos, pagos, cambios de acuerdos y de datos de pago, con `actorType` (`user | surveyor | system`), `actorId`, `action`, `targetType`, `targetId`, `metadata`.

## 5. Autenticación del encuestador

- **Sin `User`.** Un encuestador no es agente: no ocupa `maxAgents` ni ve el CRM.
- **Flujo**: OTP al email o teléfono (reutilizar el servicio de OTP de Cursos, extrayéndolo a un servicio común) → JWT con `purpose: 'surveyor'`, `tenantId` de la reclutadora, `profileId` y `tokenVersion`.
- **Revocación**: cada petición carga el perfil y exige `status = active` y `tokenVersion` igual al del token. Suspender o terminar un perfil incrementa `tokenVersion`.
- **Vida del token**: corta (por ejemplo 12 h) con renovación, no 30 días.
- **Dispositivo**: registrar `deviceId` en el primer inicio de sesión y exigir aprobación de la reclutadora para un cambio.
- **Guard propio** (`SurveyorAuthGuard`). No usar `JwtStrategy` de usuarios, que valida otra cosa.
- **Supervisores** de la reclutadora y del cliente sí son `User` con sus roles actuales.

## 6. Flujos principales

1. **Alta de reclutadora.** Superadmin activa `features.reclutamiento` en el tenant.
2. **Alta de encuestador.** La reclutadora crea o importa el contacto, le crea un `contact_profile` (`candidate`), carga el contrato y los datos de pago, una persona los verifica y el perfil pasa a `active`.
3. **Acuerdo.** La reclutadora propone un `recruitment_agreement` al cliente. El cliente lo acepta y queda `active`.
4. **Estudio.** El cliente crea la encuesta. La reclutadora asigna encuestadores (`survey_assignments`) con cuota, zona y, si aplica, establecimientos.
5. **Trabajo de campo.** El encuestador entra con OTP, ve solo sus asignaciones y responde con o sin conexión. Se capturan GPS, duración y dispositivo. La respuesta entra como `pending`.
6. **Revisión etapa 1 (reclutadora).** Reglas automáticas marcan `flagged`. Un revisor aprueba o rechaza. Al aprobar se crea el asiento `accrual` en el ledger del encuestador, con la tarifa del contrato.
7. **Revisión etapa 2 (cliente).** El cliente acepta o rechaza lo entregado. Al aceptar se crea el asiento a cobrar al cliente, con la tarifa del acuerdo. Un rechazo posterior genera un `reversal`, y el acuerdo define quién asume el costo.
8. **Pago.** El encuestador solicita retiro, una persona de la reclutadora verifica, paga fuera de la plataforma y registra el comprobante. Eso crea el asiento `payout`.
9. **Cobro al cliente.** Un reporte por acuerdo y periodo sirve para facturar fuera de la plataforma.

## 7. Calidad y antifraude

Mínimos antes de pagar: tiempo mínimo frente a la mediana, GPS dentro de la zona y sin saltos imposibles, detección de duplicados (mismo dispositivo, mismo contenido, mismo `respondentIdentifier`), patrones sospechosos (respuestas idénticas, ráfagas), muestreo de auditoría (por ejemplo 10% al azar), preguntas de control, evidencia opcional (foto o audio en R2). Un encuestador no puede responder una encuesta sobre sí mismo ni sobre sus propios establecimientos.

## 8. Seguridad y privacidad

- Todas las consultas de respuestas, asignaciones, perfiles y ledger filtran por tenant. No se busca nada solo por `id`.
- Los datos de pago se cifran en reposo, con clave en variable de entorno o gestor de secretos, y se leen solo con un permiso específico. Cada lectura se audita.
- El cliente nunca recibe documento, teléfono ni datos de pago del encuestador.
- La reclutadora no recibe el contenido de las respuestas si el acuerdo es `counts_only`.
- Consentimiento y política de retención para datos personales y geolocalización. Bloquear o autorizar a menores.
- Rate limit y captcha en endpoints públicos. El envío del encuestador usa autenticación, no el endpoint público.

## 9. Deuda técnica a cerrar antes (Fase 0)

Hallazgos de la lectura del código. Confirmar cada uno antes de actuar.

1. `TenantFeature` no incluye `encuestas`, y el controlador de encuestas no lo exige.
2. `SurveysService.findOne(id)`, `findResponses(id)` y `getAgentLinkToken` buscan por `id` sin `tenantId`. `TenantAccessGuard` deja pasar las rutas sin `tenantId`, así que otro tenant podría acceder a una encuesta ajena si conoce el UUID.
3. El envío público solo tiene el throttler global, sin captcha ni validación del payload contra el `flowJson`.
4. El contador `responseCount` se incrementa fuera de transacción.
5. La ubicación vive en jsonb, sin columnas ni índice.
6. `synchronize: true` aplica cambios de esquema automáticamente. Para tablas con datos financieros hace falta una estrategia de migraciones manuales (como las de `backend/src/migrations`) y desactivar `synchronize` en producción.
7. `uq_clients_tenant_phone` hace único el teléfono por tenant. Un encuestador y un encuestado con el mismo teléfono comparten contacto. Es deseable, pero se debe validar el caso de fraude (autoencuesta).

## 10. Plan por fases

### Fase 0. Endurecimiento
Cierra la sección 9 en lo que aplique a encuestas. Se puede hacer en paralelo con la Fase 1.

### Fase 1. Reclutamiento (inicio)
Objetivo: una reclutadora gestiona encuestadores con contrato y datos de pago verificados, sin encuestas todavía.
1. Flag `reclutamiento` en `Tenant.features`, en `TenantFeature` y en el DTO de features. Toggle en la administración.
2. `contact_profiles` y su servicio (crear, activar, suspender, terminar).
3. `surveyor_contracts` y `surveyor_payment_methods` (con cifrado y permiso específico).
4. `tenant_audit_logs` y su uso en las acciones anteriores.
5. Frontend: sección "Reclutamiento" para listar encuestadores, ficha con contrato y datos de pago, y estados.
6. Migraciones manuales de las tablas nuevas.

Criterio de cierre: una reclutadora de prueba da de alta un encuestador, carga y verifica su contrato y su método de pago, lo suspende, y todo queda auditado, sin acceso cruzado entre tenants.

### Fase 2. Núcleo CRM de organizaciones
`organizations`, `contact_organizations`, endpoints y pantalla de Empresas (activando `features.companies`). Backfill opcional desde `clients.company`.

### Fase 3. Acuerdos y asignaciones
`recruitment_agreements`, `survey_assignments`, aceptación por el cliente, vista del encuestador limitada a lo asignado. **Rediseñada como «Proyectos» (sección 14):** el acuerdo pasa a llamarse proyecto, tiene landing y formulario propios, y la fase se entrega en tres partes (3a proyectos, 3b landing y postulantes, 3c estudios y asignaciones).

### Fase 4. Respuestas, revisión y ledger
Columnas nuevas en `survey_responses`, revisión de dos etapas, reglas automáticas de calidad, `reward_ledger`, `payout_requests`, reportes de pago y de cobro.

### Fase 5. Autenticación y app móvil del encuestador
Servicio de OTP común, `SurveyorAuthGuard`, renderizador del `flowJson` en React Native, GPS (`expo-location`), cola offline con `clientUuid`, saldo y retiros.

### Fase 6. Piloto
Con el cliente piloto, una reclutadora (Smarter) y un acuerdo. Medir tasa de rechazo, tiempo de revisión y concordancia GPS.

### Después
Panel propio por tenant (panelistas desde el CRM con OTP y segmentos), ancla global `surveyor_identities` si se permiten varias reclutadoras por encuestador, pasarela de pagos (`PayoutProvider`), portal de resultados para clientes.

## 11. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Fraude por pago por respuesta | Sección 7 y pago solo tras la revisión de etapa 1. |
| La reclutadora paga y el cliente no | Anticipos o créditos prepagados en el acuerdo. Reportes de cuentas por cobrar. |
| Fuga de datos entre tenants | Filtro por tenant en toda consulta y pruebas de aislamiento. |
| Datos de pago expuestos | Tabla aparte, cifrado, permiso específico, auditoría de lectura. |
| Contratos distintos por país | `countryCode` y plantillas por país. Validar con asesor legal. |
| Cambios de esquema sin migraciones | Migraciones manuales y revisar `synchronize`. |
| Alcance creciente | Cada fase se entrega y valida sola. No se empieza la siguiente sin cerrar el criterio de la anterior. |

## 12. Pendiente por decidir

- Si el asiento de cuentas por cobrar es una tabla aparte o un lado del mismo ledger.
- Quién asume el costo cuando el cliente rechaza lo que la reclutadora ya aprobó (regla por acuerdo).
- Moneda y conversión cuando acuerdo y contrato tienen monedas distintas.
- Método de cifrado de datos de pago (clave por entorno o gestor de secretos).
- Si `organizations` exige unicidad por documento.
- Alcance de la vista de resultados para la reclutadora (`counts_only` por defecto).

## 13. Estado de implementación

### Fase 1. Reclutamiento: implementada (2026-11-17)

**Backend** (`backend/src/reclutamiento/`, `backend/src/audit/`, `backend/src/auth/`)
- Flag `reclutamiento` en `Tenant.features`, `TenantFeature` y `UpdateTenantFeaturesDto`. Se activa por superadmin desde Administración → cuenta → Módulos (el panel lo toma de `frontend/src/config/modules.ts`).
- Entidades: `contact_profiles`, `surveyor_contracts`, `surveyor_payment_methods` y `tenant_audit_logs`. El esquema se crea con `synchronize` (decisión del equipo).
- `PaymentCryptoService`: AES-256-GCM con clave `PAYMENT_DATA_KEY`, ligada a tenant y perfil mediante AAD. Falla cerrado si la clave falta o es inválida.
- `TenantAuditService` (global): registro por tenant, escrito dentro de la misma transacción que la acción auditada.
- `TenantAdminGuard`: exige owner/admin y valida el UUID de `params.tenantId`. Orden de guards del controlador: `JwtAuthGuard`, `TenantAccessGuard`, `TenantAdminGuard`, `ModuleFeatureGuard`.
- API bajo `/api/reclutamiento/:tenantId/...` (tenant en la ruta, para que los guards y los servicios usen el mismo valor): perfiles (listar, crear, detalle, editar datos, `activate | suspend | end | reopen`), contratos (crear, editar borrador, `activate`, `end`, eliminar borrador), métodos de pago (crear, editar, `verify`, `default`, `reveal`, eliminar) y auditoría.

**Frontend** (`frontend/src/pages/reclutamiento/`, `frontend/src/services/reclutamiento.ts`)
- Módulo "Reclutamiento" en la navegación (visible con el flag activo) con lista, búsqueda, filtro por estado y paginación. Ficha del encuestador con contratos, métodos de pago e historial. Solo owner/admin.

**Reglas implementadas**
- Máquina de estados: `candidate → active ↔ suspended → ended → candidate` (reabrir). Un `UPDATE` condicional al estado impide aplicar dos veces la misma transición en solicitudes simultáneas.
- Activar exige un contrato activo y un método de pago **verificado** por una persona.
- Suspender y terminar incrementan `tokenVersion` (para invalidar sesiones en la Fase 5). Suspender exige motivo. Terminar el perfil termina sus contratos activos.
- Editar los datos de un método de pago borra su verificación. Un perfil activo no puede quedarse sin ningún método verificado.
- `reveal` registra la consulta en la auditoría **antes** de devolver el dato, y es la única vía de lectura (`details` tiene `select: false`).
- Los asientos de auditoría nunca incluyen datos de pago.

**Verificación realizada**
- `tsc` del backend sin errores. Frontend sin errores nuevos de tipos ni de `oxlint` en los archivos tocados.
- Prueba de integración sobre un Postgres desechable (56 comprobaciones): aislamiento entre tenants, compuerta de activación, cifrado en base de datos, ciphertext no reutilizable en otro perfil, concurrencia, búsqueda con `%` y SQL literal, auditoría.
- Prueba HTTP con módulo NestJS real (28 comprobaciones): acceso por rol, por cuenta y por flag, `tenantId` inválido, `tenantId` falsificado en el body, ausencia de datos de pago en listados y detalle.
- Esas pruebas fueron scripts temporales y **no** forman parte del repositorio. La interfaz no se probó en navegador.

**Antes de usarlo en un entorno**
1. Definir `PAYMENT_DATA_KEY` (`openssl rand -hex 32`). No cambiarla después de guardar datos de pago, porque los datos existentes dejarían de descifrarse. Para rotarla hará falta una migración con el prefijo de versión `v1`.
2. Activar el flag `reclutamiento` en la cuenta reclutadora.

**Pendiente de la Fase 1**
- Adjuntar el documento del contrato (requiere almacenamiento privado).
- Editar `data` del perfil (zona, idiomas, disponibilidad) desde la interfaz. El backend ya lo soporta.
- Verificación por una segunda persona (cuatro ojos): hoy quien crea un método de pago también puede verificarlo. Ambos quedan registrados.

### Fase 0. Endurecimiento de Encuestas: implementada (2026-11-17)

Cambios en `backend/src/surveys/` y `backend/src/auth/`. Cada punto remite a la numeración de la sección 9.

| # | Hallazgo | Qué se hizo |
|---|---|---|
| 1 | Flag `encuestas` sin aplicar | `TenantFeature` incluye `encuestas`. Hasta 14.14 el flag era **activo por defecto** (solo `false` lo apagaba) porque las cuentas existentes no lo tenían definido; desde 14.14 está apagado por defecto. `DEFAULT_ON_FEATURES` e `isFeatureEnabled` en `requires-feature.decorator.ts` deben coincidir con `defaultOn` de `frontend/src/config/modules.ts`. Se aplica en el controlador y en el enlace público. |
| 2 | Rutas `:id` sin verificar tenant | `SurveyAccessGuard`: toma el tenant de la **propia encuesta** y exige membresía. Quien no pertenece recibe 404 (no se confirma que el UUID exista en otra cuenta). Cubre lectura, edición, borrado, respuestas, analíticas, publicación en Meta y enlaces de agente. |
| 2 | Rutas de colección sin `tenantId` | `GET /surveys`, `published-flows` y `crm/targets` listaban **todas** las cuentas si faltaba `tenantId`. Ahora es obligatorio (400) y, si llega en query y body, deben coincidir. Los servicios también lo exigen. |
| 2 | `PUT /surveys/:id` hacía `Object.assign` del cuerpo | Lista blanca (`parseSurveyUpdate`): nombre, título, descripción, tema, ubicación y metadata. Se ignoran `tenantId`, `slug`, `status`, `metaFlowId`, `responseCount`, `agentTokens`, `logoUrl`, `flowJson`. `logoUrl` ajeno permitía que `removeLogo` borrara archivos de otra cuenta en R2. |
| 2 | Gestor de la encuesta con cualquier UUID | `setManager` exige que el usuario sea miembro activo del mismo tenant. |
| 2 | Mapeo al CRM sin validar | `parseCrmMapping`: los destinos deben existir en el catálogo de campos del tenant. |
| 2 | Rol `viewer` podía modificar | Es de solo lectura según `tenant-role.enum.ts`; ahora recibe 403 en cualquier método que no sea GET. |
| 3 | Envío público sin validación | `sanitizeResponseData`: solo texto, números, booleanos y listas; máximo 64 KB, 200 campos, 5000 caracteres por texto; descarta claves `__*` (la ubicación ya no se puede falsificar). Valida rangos de lat/lng. Solo acepta envíos en encuestas **activas** (antes bastaba con "no archivada"), de cuentas activas y con el módulo encendido. Límite de tasa propio por IP: 3/s, 20/min y 200/h. |
| 4 | Contador fuera de transacción | Respuesta y `responseCount` se guardan en una sola transacción. |
| — | Subida de logo sin límite | Máximo 5 MB y 1 archivo. |

**Verificación realizada:** 90 comprobaciones HTTP con controlador, servicio y guards reales sobre un Postgres desechable (IDOR en las 17 rutas con `:id`, colecciones, flag, rol, asignación masiva, mapeo al CRM, saneamiento y ubicación del envío público, atribución por agente, límite de tasa). Se reprodujo el comportamiento anterior sin el guard nuevo: un administrador de otra cuenta leía y borraba encuestas ajenas con 200. La suite de `jest` existente pasa (69 pruebas) y `tsc` compila. Las pruebas fueron scripts temporales y no se conservan en el repositorio.

**Decididos como pendientes (no son parte de esta fase):**
- **Ubicación en columnas** (punto 5): sigue en `responseData.__location__`. Se hará en la Fase 4 junto con las demás columnas de `survey_responses`, porque requiere migrar datos existentes y hoy nada la consulta.
- **Captcha** (Turnstile): requiere cuenta y claves de Cloudflare y un widget en `PublicSurvey.tsx`. El límite de tasa reduce el abuso pero no lo impide.
- **Validación contra el `flowJson`** (campos requeridos, opciones válidas): hoy se sanea el tipo y el tamaño, no la coincidencia con las preguntas. El formato Meta Flow JSON tiene varios componentes y una validación estricta podría descartar respuestas legítimas.
- **Idempotencia del envío** (doble clic): llega con `clientUuid` en la Fase 4.

**Hallazgos fuera del alcance de Encuestas (sin cambios):**
- `TenantAccessGuard` deja pasar cualquier ruta sin `tenantId`. Otros controladores con rutas `:id` (por ejemplo `GET /records/:id`, `GET /records/notes?recordId=`) pueden tener el mismo problema. Conviene una revisión similar módulo por módulo.
- La atribución al CRM por enlace público (`SurveyCrmService.attribute`) actualiza un contacto existente si coincide el email, teléfono o documento. Quien conozca esos datos de un contacto puede sobrescribir los campos mapeados desde un envío anónimo.
- `backend/.env.example` contiene lo que parecen credenciales reales y no está en git.

### Contratos: plantilla de solo texto con variables (2026-11-17)

Una cuenta reclutadora redacta **plantillas de contrato** como un único texto, genera contratos a partir de ellas y registra su firma. Al escribir `{{` en el editor se abre un desplegable con las variables disponibles (mismo comportamiento que el editor de flujos).

> **Aviso.** Los modelos por país son un punto de partida, **no asesoría legal**. Cada plantilla debe ser revisada por un abogado de la jurisdicción antes de usarse.

**Modelo**
- `contract_templates`: por cuenta, con nombre, país (ISO), idioma (`es`, `en`), prefijo de numeración y **`body`** (el texto). Estados `draft → published → archived`. Una publicada es **inmutable**: se modifica creando una nueva versión (misma `familyId`, `version + 1`); publicar archiva la anterior.
- No hay cláusulas, parámetros legales, datos de la empresa ni variables definidas aparte: quien redacta escribe esos datos directamente en el texto. Las columnas del modelo anterior (`clauses`, `variables`, `legal_config`, `company`, `required_party_fields`, `legal_review`, `contract_type`, `currency`) **siguen en la tabla, sin uso**, para no perder datos con `synchronize`. Las plantillas creadas con el modelo anterior quedan con el texto vacío y hay que redactarlas de nuevo.
- `surveyor_contracts`: número (`CT-2026-0007`, único por cuenta), fecha de emisión, valores capturados `{datos, contacto}`, **texto congelado** (`rendered_clauses`, un único bloque), **huella SHA-256**, estado y evidencia de firma. `contract_counters` guarda el consecutivo por cuenta y serie.

**Variables** (`contracts/contract-variables.ts`)
| Prefijo | Qué es | Ejemplos |
|---|---|---|
| `contacto.*` | Ficha del contacto en el CRM | `nombre_completo`, `tipo_documento`, `numero_documento`, `direccion`, `ciudad`, `correo`, `telefono`, `fecha_nacimiento`… |
| `contacto.<campo>` | Campos personalizados del CRM de la cuenta | `contacto.barrio` (solo claves con letras, números y `_`) |
| `contrato.*` | Datos del contrato | `numero`, `fecha_emision`, `fecha_inicio`, `fecha_fin`, `tarifa`, `moneda`, `pais` |
| `datos.*` | Valor libre que se pide al generar cada contrato | `datos.zona_de_trabajo` |

El desplegable inserta los filtros adecuados (`| date`, `| money`, `| words`). El motor (`contract-engine.ts`) no ejecuta código: variables, filtros (`date`, `money`, `number`, `pct`, `words`, `upper`, `lower`), condicionales `{{#if}} / {{#unless}} / {{else}}` y números en letras es/en. No lee propiedades heredadas.

**Modelos por país** (`contracts/contract-starters.ts`): Colombia, México, Perú, Chile, Argentina, Ecuador, España, Estados Unidos y «otro país». Cada uno genera un texto completo en español o inglés (cláusulas numeradas), con las variables del contacto y del contrato ya insertadas. Lo que no se puede afirmar (razón social, identificación tributaria y domicilio de la empresa, ley aplicable, jurisdicción) queda como `[MARCADOR]` para reemplazar. Cada modelo trae advertencias propias (riesgo de contrato realidad o falso autónomo, retenciones, etc.).

**Reglas**
- No se publica una plantilla vacía, con error de sintaxis o con variables que no existen (los campos personalizados se validan contra el CRM de la **misma** cuenta).
- No se emite un contrato con datos faltantes: el servidor responde `CONTRACT_MISSING_DATA` y la interfaz pide en el momento los datos del contacto (solo para ese contrato, sin tocar su ficha) y los `datos.*` del texto.
- Edad mínima 18 años, regla fija de la plataforma, si el contacto tiene fecha de nacimiento.
- El consecutivo se incrementa de forma atómica en la misma transacción que guarda el contrato.
- Un contrato firmado no se edita ni se elimina. Un borrador sin firmar se puede volver a redactar conservando su número.
- La plataforma **no firma por las partes**: registra cómo y cuándo se firmó (método, fecha, referencia, testigo opcional), ligado a la huella del texto. Un contrato de plantilla se activa solo si está firmado y su texto coincide con la huella.
- Los contratos manuales (sin plantilla) y los generados con el modelo anterior siguen funcionando y verificándose.

**API** bajo `/api/reclutamiento/:tenantId` (solo owner/admin): `contract-catalog` (variables incluidas las de la cuenta, modelos y filtros), `templates` (GET/POST, `preview`, `:id` GET/PATCH/DELETE, `:id/publish|new-version|archive|duplicate|validate`) y `contracts/:id/sign|document`.

**Interfaz**: «Plantillas de contrato» (lista y creación en blanco o desde un modelo de país), editor de una sola página (nombre, país, idioma, prefijo, texto con desplegable `{{` y vista previa en vivo), y en la ficha del encuestador: generar desde plantilla, ver el documento (integridad e impresión a PDF), registrar firma y activar.

**Verificación realizada**
- 58 comprobaciones HTTP con guards de acceso sustituidos y servicios reales sobre un Postgres desechable: catálogo con campos personalizados de la cuenta (y sin los de otra), creación en blanco y desde modelo, errores de variables y sintaxis, publicación, inmutabilidad, versiones, duplicado, generación con datos faltantes y con menor de edad, 5 contratos simultáneos con números distintos, firma, detección de alteración, aislamiento entre cuentas, auditoría sin datos personales y plantillas del modelo anterior.
- Los 9 modelos × 2 idiomas se analizan sin errores y se redactan completos, sin variables sin resolver.
- Interfaz: tipos y `oxlint` sin errores, empaquetado correcto y comprobaciones de la lógica del desplegable (disparador, filtro, inserción, cursor) y del renderizado. **No se probó en un navegador contra un backend en ejecución.** Las pruebas fueron scripts temporales y no se conservan.

**Pendiente**
- PDF generado en el servidor (hoy se imprime desde el navegador) y firma del contratista dentro de la plataforma.
- Modelos en otros idiomas (portugués) y de más países; revisión por abogados locales.
- Limpieza manual de lo que queda sin uso: tabla `recruiter_settings` y las columnas del modelo anterior de `contract_templates`.

### Portal del encuestador (2026-11-17)

Cada cuenta con el módulo `reclutamiento` activo tiene un portal público en **`/r/<slug-de-la-cuenta>`** (antes `/encuestador/<slug>`, que redirige conservando `?i=`). La persona completa los datos que faltan en su ficha, sube sus documentos y firma sus contratos. Por defecto no hay registro abierto: solo entra quien ya tiene perfil `candidate` o `active`. El modo abierto y la landing se describen en «Landing y registro abierto».

**Autenticación** (misma idea que el portal de cursos, sin sus debilidades)
- Se entra con un código de 6 dígitos de un solo uso enviado por correo o WhatsApp, vigente 10 minutos y con 5 intentos. Se guarda solo un HMAC del código. El intento se cuenta de forma atómica antes de comparar.
- Dos formas de llegar: el **enlace personal** de la invitación (`?i=<token>`; solo guarda el hash; no inicia sesión, solo indica a quién enviar el código) o escribiendo el correo/teléfono registrados.
- La respuesta de «pedir código» es idéntica exista o no el destino (no se puede averiguar quién es encuestador); hay espera de 30 s entre envíos y 5 por hora por destino, más un tope por perfil y límite por IP.
- Sesión: JWT firmado con una clave **propia del portal** (derivada de `JWT_SECRET`), enviado en la cabecera `x-portal-token`, con la versión del perfil (`tokenVersion`). Suspender o terminar al encuestador invalida su sesión. Duración configurable (por defecto 12 h). Un token del CRM no sirve en el portal ni al revés.
- Firmar un contrato exige un código nuevo (confirmación), ligado a ese contrato y a ese encuestador.

**Configuración** (Reclutamiento → Portal del encuestador; guarda en `recruit_portal_configs`)
- Canal de la **invitación**: correo, WhatsApp, ambos o solo copiar el enlace. Asunto y mensaje del correo editables; para WhatsApp, número, plantilla aprobada de Meta y qué dato va en cada variable. Vigencia del enlace.
- Canal del **código de verificación**: correo, WhatsApp o que el encuestador elija; plantillas propias.
- **Datos que se piden** (campos fijos del contacto y campos personalizados del CRM, con «obligatorio»), **documentos que se piden** (nombre, indicaciones, obligatorio), duración de la sesión y mensaje de bienvenida.
- El correo y el teléfono no se editan desde el portal (son los canales de identidad). Nombre, documento y fecha de nacimiento se bloquean cuando el encuestador ya firmó un contrato.

**Documentos**
- El bucket de medios es público por URL, así que los documentos se guardan **cifrados** (AES-256-GCM, clave `RECRUIT_DOCS_KEY` o, si no existe, `PAYMENT_DATA_KEY`) bajo una clave de objeto aleatoria y solo se entregan por la API tras comprobar quién los pide. Se valida el tipo real por los primeros bytes (PDF, JPG, PNG, WebP), máximo 8 MB.
- El equipo los ve, aprueba o rechaza (con motivo, que el encuestador ve en su portal). Un documento aprobado no se reemplaza ni se elimina. Cada consulta por parte del equipo queda en la auditoría.

**Contratos**
- Un contrato en borrador sin firmar se pone a disposición con «Enviar al portal» (y se retira con «Retirar del portal»). Mientras está en el portal no se puede editar. El encuestador lo lee, acepta y confirma con un código. Queda registrado como firma electrónica simple (`signedBy: contractor_portal`) con la huella del texto, el canal y destino enmascarado del código, la IP y el navegador. Después el administrador lo activa como siempre.
- La plataforma no firma por la empresa: enviar el contrato equivale a su oferta, y la aceptación del encuestador lo deja firmado. Si necesitas una firma de la empresa por separado, es una ampliación pendiente.

**API pública** `/api/recruit-portal/:slug`: `GET /`, `GET invitation/:token`, `POST otp/request`, `POST otp/verify`, y con sesión `GET me`, `PATCH me/data`, `POST documents/:docKey`, `GET|DELETE documents/:id`, `GET contracts/:id`, `POST contracts/:id/sign/request`, `POST contracts/:id/sign`. **API de administración** (owner/admin): `portal-config` (+ `whatsapp-inboxes`, `whatsapp-templates`), `profiles/:id/invite`, `profiles/:id/portal`, `documents/:id/file|review`, `contracts/:id/send|withdraw`.

**Verificación realizada**: 114 comprobaciones HTTP con servicios reales sobre un Postgres desechable, con correo y almacenamiento simulados (validación de la configuración, invitación, hash del token, enlace invalidado al reinvitar, código y su bloqueo tras 5 intentos, uniformidad de respuestas con destinos desconocidos, espera entre envíos, tokens manipulados/de otra cuenta/del CRM, aislamiento entre encuestadores y entre cuentas, edición de datos y campos bloqueados, subida/cifrado/descarga/revisión de documentos, envío/retiro/firma de contratos con integridad, revocación por suspensión y auditoría sin datos personales). Interfaz: tipos, `oxlint`, empaquetado y 6 comprobaciones de renderizado. **No se probó en un navegador ni se envió un correo o WhatsApp real.**

**Antes de usarlo**: definir `PAYMENT_DATA_KEY` o `RECRUIT_DOCS_KEY` (`openssl rand -hex 32`; no se puede cambiar después de subir documentos) y `FRONTEND_URL` (para los enlaces de invitación). Para WhatsApp hacen falta plantillas aprobadas por Meta (una de utilidad para la invitación y una de autenticación para el código).

**Pendiente / límites conocidos**: el límite de solicitudes de código por destino está en memoria (por instancia); las invitaciones por WhatsApp no pueden ir con botón de URL; los documentos no se purgan al terminar el perfil; el encuestador no puede editar sus datos de pago desde el portal.

### Landing y registro abierto (portal)
Reclutamiento → **Landing** edita la página de presentación que se ve en `/r/<slug>`; Reclutamiento → **Portal de registro** → «Acceso» elige quién puede crear su perfil.

**Landing** (`portal/portal-landing.ts`; se guarda en `recruit_portal_configs.config.landing`)
- Secciones fijas que la cuenta activa, ordena y edita: portada, sobre el proyecto, beneficios, pasos, requisitos, preguntas frecuentes y llamado final. El encabezado (con «Ingresar») y el pie van siempre. Marca: paleta de colores, apariencia (claro, oscuro o automático según el dispositivo de quien visita), tipografía (moderna o clásica), logo y nombre. `{{empresa}}` en cualquier texto se reemplaza por el nombre de la cuenta.
- **Tema** (`frontend/.../landing/landingTheme.ts`): de un solo color de marca se derivan fondos, tarjetas, bordes, textos y botones, en claro y en oscuro, con contraste verificado para las 12 paletas incluidas (más «Personalizado»). El tema se aplica a la landing y a todo el portal público (acceso, registro, datos, documentos y contratos) mediante variables CSS y la clase `dark` de `<html>` mientras el portal está abierto; sin landing publicada el portal usa el tema normal de la aplicación.
- **Fondo de la portada** (`content.hero.background`): ninguno, una imagen subida (con oscurecimiento de 0 a 80 % para que el texto se lea) o uno de 14 diseños generados con CSS a partir de la paleta (`landing/heroPresets.ts`), que cambian solos con la paleta y el modo. No dependen de archivos ni licencias externas. Sobre fondos oscuros el texto y el botón van claros. Una galería de fotos de stock sigue pendiente (ver «Pendiente»).
- **Pasos como línea de tiempo** (`landing/StepsTimeline.tsx`): los pasos van unidos por una línea que se llena con el scroll; cada paso se activa (círculo relleno, texto visible) cuando la línea lo alcanza. Con «reducir movimiento» activado en el dispositivo se muestra completa y sin animación. En el editor reacciona al scroll de la vista previa.
- **Animaciones** (`landing/Reveal.tsx`): toda la landing aparece con un desvanecimiento y un leve desplazamiento al entrar en pantalla, con retrasos escalonados en portada, tarjetas y requisitos. Las tarjetas y los botones se elevan al pasar el cursor, las imágenes hacen un zoom mínimo y las respuestas de las preguntas se despliegan suavemente. Todo es CSS más un `IntersectionObserver`, sin dependencias, y con «reducir movimiento» activado se muestra completo y sin transiciones.
- **Iconos en los beneficios**: biblioteca de 118 iconos (`landing/landingIcons.ts`) con buscador en español; el contenido guarda solo el identificador.
- **Interruptor de publicación** (`landing.enabled`, apagado por defecto). Apagada, el portal muestra solo la pantalla de acceso. No hay borrador separado: lo que se guarda con el interruptor encendido queda público; la pestaña «Vista previa» muestra los cambios sin guardar.
- Solo texto plano: no hay HTML libre. Los enlaces del pie deben ser http(s). Las imágenes (logo, portada, «sobre el proyecto») solo pueden ser las subidas desde el editor a la carpeta de la propia cuenta (`media/<tenantId>/recruit-landing/`); JPG, PNG o WebP verificados por sus primeros bytes, máximo 5 MB. Al quitar o reemplazar una imagen se borra del almacenamiento.
- API admin (owner/admin): `PUT /reclutamiento/:tenantId/portal-landing` y `POST .../portal-landing/images/:slot` (`logo | hero | about`). `PUT .../portal-config` nunca modifica la landing. Pública: `GET /recruit-portal/:slug` devuelve `landing` (nula si no está publicada) y `registration: { open, consentText }`.

**Registro abierto** (`registration.mode`: `invite` por defecto, u `open`)
- `POST /recruit-portal/:slug/register/request` (nombre, canal, destino, consentimiento) envía un código. **No se crea nada hasta verificarlo**: el contacto y el perfil `candidate` nacen en `otp/verify`, así que nadie registra un destino que no controla. El consentimiento (texto editable) queda en `profile.data.registration`.
- Si el destino ya tiene perfil, se envía un código de ingreso. Si el perfil está suspendido o terminado, no se envía nada. La respuesta es idéntica en los tres casos.
- Si el CRM de la cuenta ya tiene **un único** contacto con ese correo o teléfono verificado y sin perfil, se vincula a él (sin modificar sus datos), igual que el portal de cursos. Con dos teléfonos iguales no se crea nada; con dos correos iguales se crea un contacto nuevo. Verificaciones simultáneas del mismo destino se serializan con un bloqueo de PostgreSQL.
- Si el registro se cierra entre la solicitud y la verificación, no se crea nada. Cada registro queda en la auditoría (`reclutamiento.portal.register`, sin datos personales).
- Límites: 5 solicitudes por minuto por IP, 30 s entre códigos al mismo destino y 5 por hora (en memoria, por instancia), y 10 códigos por hora y destino en base de datos.
- **Pendiente:** captcha (Turnstile). Hasta entonces, alguien con correos desechables puede crear candidatos falsos; el equipo los revisa antes de activarlos (activar exige contrato y método de pago verificados).

**Verificación realizada:** 13 pruebas unitarias del validador de la landing (`portal-landing.spec.ts`, en el repositorio). Scripts temporales, no conservados: 61 comprobaciones del servicio sobre un PostgreSQL desechable (registro cerrado, validaciones, creación del perfil y del contacto, vinculación con contactos existentes por correo y teléfono, ambigüedad, suspendido, cierre entre medias, concurrencia, aislamiento entre cuentas, landing, subida de imágenes) y 11 de renderizado de la landing (orden, escape de HTML, enlaces `javascript:`, modo abierto y por invitación). **No se probó en un navegador ni se enviaron correos o WhatsApp reales; el límite por IP del controlador tampoco.**

## 14. Fase 3: Proyectos (diseño; REEMPLAZADO por la sección 15)
> **Reemplazado.** El modelo de esta sección (acuerdo con un cliente, estudios, lotes, facturación) se retiró para desplegar por etapas. Vigente: sección 15. Se conserva como referencia para la etapa de estudios.

Estado: diseño aprobado. **Las entregas 3a, 3b y 3c están implementadas** (ver 14.9, 14.10 y 14.11). La captura de respuestas por los encuestadores es la Fase 4 y la 5. Reemplaza el nombre `recruitment_agreements` de la sección 4.2: **el acuerdo es el proyecto**.

### 14.1 Decisiones
| # | Decisión |
|---|---|
| 1 | **Un proyecto por cliente** (por pareja reclutadora-cliente) en la primera versión. Los estudios del cliente viven dentro del proyecto. |
| 2 | La **reclutadora propone y el cliente acepta**. |
| 3 | La landing muestra el **nombre del proyecto**, configurable. El nombre de la cuenta cliente **solo se muestra si la reclutadora lo activa** (`showClientName`, apagado por defecto). |
| 4 | Cada proyecto puede tener **preguntas de selección propias**, además de los datos y documentos generales del portal. |
| 5 | Las encuestas y tareas se configuran **en la cuenta cliente**. La reclutadora gestiona reclutamiento, contratos y pagos, y ve los estudios del proyecto en solo lectura. |
| 6 | Una persona que se inscribe por un proyecto queda como **perfil de la reclutadora**. La identidad, el contrato y los pagos siguen siendo de la reclutadora. |

### 14.2 Entidades
**`recruitment_projects`** (reclutadora ↔ cliente)
- `id`, `recruiterTenantId`, `clientTenantId`, `name`, `slug` (único por reclutadora; forma parte de la dirección pública), `status` (`draft | proposed | active | paused | ended`), `proposedBy`, `proposedAt`, `acceptedBy`, `acceptedAt`, `endedAt`.
- Condiciones: `clientRate` (decimal), `currency`, `validFrom`, `validUntil`, `zones` (jsonb), `dataAccess` (`counts_only | full`, por defecto `counts_only`), `terms` (texto).
- Cara pública: `publicName` (por defecto `name`), `showClientName` (bool), `landing` (jsonb, el mismo modelo `LandingConfig`), `registrationOpen` (bool, apagado por defecto), `form` (jsonb, ver 14.4).
- Único `(recruiterTenantId, clientTenantId)` salvo proyectos `ended` (índice parcial). Único `(recruiterTenantId, slug)`.
- Las condiciones no se editan una vez aceptado el proyecto. Cambiarlas exigirá una versión nueva y una aceptación nueva (fuera de esta fase).

**`project_memberships`** (perfil ↔ proyecto)
- `id`, `tenantId` (reclutadora), `projectId`, `profileId`, `status` (`applied | approved | rejected | paused | ended`), `answers` (jsonb, respuestas del formulario), `source` (`landing | invite | manual`), `appliedAt`, `decidedBy`, `decidedAt`, `decisionReason`.
- Único `(projectId, profileId)`.
- Hay **dos filtros**: el perfil lo activa la reclutadora (contrato y método de pago verificados, como hoy) y la membresía la aprueba para ese proyecto. Tomar un estudio exige las dos (entrega 3c).

### 14.3 Quién configura qué
| Cuenta | Qué hace |
|---|---|
| Reclutadora | Proyectos, landing y formulario del proyecto, postulantes (aprobar o rechazar), contratos y pagos, asignar gente. Ve los estudios del proyecto en solo lectura. |
| Cliente | Crea y configura encuestas y tareas, y las publica en el proyecto (3c). Acepta, pausa o termina el proyecto. Nunca ve datos personales. |
| Encuestador | Su portal: estudios disponibles, tareas, contratos, documentos y saldo. |

Interfaz de la reclutadora: sección **Proyectos** en Reclutamiento, con lista (nombre, cliente, estado, postulantes) y detalle con pestañas Resumen, Acuerdo, Landing, Formulario, Postulantes, Encuestadores y Estudios (esta última desde 3c). Interfaz del cliente: página **Socios reclutadores** con las propuestas, aceptar o rechazar, pausar y terminar. Muestra solo conteos.

### 14.4 Landing, formulario y registro por proyecto
- **Dirección pública:** `/r/<slug-reclutadora>/<slug-proyecto>`. La dirección general `/r/<slug-reclutadora>` sigue funcionando.
- **Landing:** el mismo motor y editor (`LandingConfig`), con la configuración guardada en el proyecto. Variables de texto: `{{empresa}}` es la reclutadora, `{{proyecto}}` es el nombre público, y `{{cliente}}` solo existe con `showClientName`. Las imágenes van a `media/<reclutadora>/recruit-landing/<proyecto>/` y se validan igual que hoy.
- **Formulario:** hasta 15 preguntas. Tipos: texto corto, texto largo, opción única, opción múltiple, sí/no y número. Cada una con `required`. Las respuestas solo las ve la reclutadora.
- **Condiciones para que sea público:** proyecto `active`, `registrationOpen` encendido y landing publicada. En `draft` o `proposed` la reclutadora puede prepararlo, pero no se ve.
- **Registro:** `register/request` recibe además `projectSlug` y `answers`, que se validan contra las preguntas del proyecto y se guardan en el payload del código. Al verificar el código (`otp/verify`):
  - Persona nueva: se crea el contacto, el perfil `candidate` y la membresía `applied`, como hoy.
  - Persona con perfil `candidate` o `active`: el código es de ingreso y se le suma la membresía.
  - Perfil suspendido o terminado: no se envía nada y la respuesta es idéntica, como hoy.
  - Todo en una transacción, con bloqueo por destino, auditoría sin datos personales y sin duplicar membresías.
- El modo de acceso de la reclutadora (`invite` u `open`) gobierna solo la landing general. Cada proyecto tiene su propio interruptor.

### 14.5 Acceso y seguridad
- **Rutas de la reclutadora:** `/api/reclutamiento/:tenantId/projects...` con los guards actuales (JWT, pertenencia, administrador, flag `reclutamiento`).
- **Rutas del cliente:** `/api/partners/:tenantId/...` con JWT, pertenencia y administrador de la cuenta cliente. Solo ve y decide sobre proyectos donde `clientTenantId` es su cuenta.
- **Lectura entre cuentas (3c):** la reclutadora lee estudios de la cuenta cliente por un guard nuevo que exige un proyecto `active` entre ambas, no la pertenencia a la cuenta. Es el riesgo principal y lleva pruebas de aislamiento propias.
- **Búsqueda del cliente:** la reclutadora lo identifica por el identificador exacto de su cuenta (slug), con límite de tasa. Antes de aceptar, ve solo el nombre de la cuenta.
- **Aviso:** al proponer, se envía un correo a los administradores de la cuenta cliente.
- **Privacidad:** las preguntas del formulario pueden recoger datos personales. No se admiten preguntas de datos sensibles (salud, religión, etnia, etc.) y la política de retención se define antes del piloto.

### 14.6 Entregas
**3a. Proyectos y acuerdo.**
- Entidad `recruitment_projects`, sección Proyectos en la reclutadora (crear, listar, detalle con acuerdo), propuesta, página Socios reclutadores del cliente, aceptar, rechazar, pausar y terminar, correo de aviso y auditoría en las dos cuentas.
- Cierre: la reclutadora propone, el cliente acepta, ninguna cuenta ve proyectos ajenos, y las condiciones quedan bloqueadas tras aceptar.

**3b. Landing y postulantes.**
- Landing y formulario por proyecto (el editor actual parametrizado), ruta pública, membresías, cola de postulantes con aprobar y rechazar con motivo, y pestaña Encuestadores.
- Cierre: una persona se inscribe desde la landing del proyecto con sus respuestas, queda asociada a la reclutadora y al proyecto, y no se duplica si entra por otro proyecto.

**3c. Estudios y asignaciones.**
- Publicación de estudios del cliente en el proyecto, pestaña Estudios (solo lectura), `survey_assignments` y los tres modos de asignación (directa, abierta con aprobación, abierta automática), y el panel de estudios disponibles del encuestador. Los 4 puntos pendientes de la sección 12 se cierran aquí.

### 14.7 Pruebas
A diferencia de las fases anteriores, la suite de integración **se conserva en el repositorio**: aislamiento entre cuentas y entre proyectos, máquinas de estado del proyecto y de la membresía, respuestas uniformes del registro, concurrencia y auditoría. Necesita un PostgreSQL de prueba.

### 14.8 Pendiente
Captcha del registro, versiones del acuerdo, varios proyectos por cliente, documentos propios por proyecto, retención de datos del formulario y migraciones manuales de las tablas nuevas (hoy el esquema depende de `synchronize`).

### 14.9 Estado de la entrega 3a: proyectos y acuerdo (implementada)
**Backend** (`backend/src/reclutamiento/`)
- `entities/recruitment-project.entity.ts`: tabla `recruitment_projects`, con índice único parcial por pareja (`status <> 'ended'`) y único `(reclutadora, slug)`.
- `projects.service.ts`: máquina de estados con `UPDATE` condicional al estado de origen (dos acciones simultáneas: una gana y la otra recibe 409). Acciones y quién puede ejecutarlas:

| Acción | Origen → destino | Lado |
|---|---|---|
| propose | draft → proposed (exige tarifa, moneda e inicio) | reclutadora |
| withdraw | proposed → draft | reclutadora |
| accept | proposed → active | cliente |
| reject | proposed → ended (motivo obligatorio) | cliente |
| pause | active → paused (motivo obligatorio) | ambos |
| resume | paused → active (solo quien pausó) | ambos |
| end | active o paused → ended (motivo obligatorio, definitivo) | ambos |

- Solo se edita un borrador. Solo se elimina un borrador. El cliente nunca ve un borrador (para él no existe, 404).
- La vista del cliente (`toClientView`) solo incluye el nombre de la reclutadora y las condiciones; no incluye ids de la reclutadora, direcciones ni personas.
- Auditoría: cada transición queda en la cuenta que actúa (con la persona) y en la contraparte (como `system`, «Cuenta X», sin la persona). Al proponer se envía un correo a los propietarios y administradores activos del cliente (no a agentes, lectores, invitaciones pendientes ni usuarios dados de baja; tampoco si la cuenta es su propio cliente).
- API reclutadora (`/api/reclutamiento/:tenantId/projects`, owner/admin con `reclutamiento`): `GET lookup?slug=`, `GET`, `POST`, `GET|PATCH|DELETE :id`, `POST :id/propose|withdraw|pause|resume|end`. API cliente (`/api/partners/:tenantId/projects`, owner/admin con `estudios`): `GET`, `GET :id`, `POST :id/accept|reject|pause|resume|end`. `lookup` y la creación llevan límite de 20 por minuto.

**Frontend**
- **Proyectos** (módulo propio desde 14.15, `pages/reclutamiento/proyectos/`): lista con filtro por estado y búsqueda, modal para identificar a la cuenta cliente y crear el borrador, y detalle con el acuerdo editable (tarifa, moneda, vigencia, zonas, acceso a datos, términos) y las acciones del ciclo de vida con confirmación (`ConfirmModal`) o motivo (`ReasonModal`).
- **Estudios** (`/:slug/estudios`, `pages/estudios/EstudiosLayout.tsx` y `pages/encuestas/SociosReclutadores.tsx`, solo administradores, módulo `estudios`): propuestas y proyectos del cliente. Desde 14.12 vive en su propio módulo; la ruta anterior `/:slug/encuestas/socios` redirige.

**Pruebas** (se conservan en el repositorio)
- `backend/src/reclutamiento/projects.integration.spec.ts`: 34 pruebas sobre PostgreSQL. Cubren búsqueda, validaciones, direcciones únicas, un proyecto por pareja, edición solo en borrador, avisos por correo, visibilidad y aislamiento entre tres cuentas, cada lado con sus acciones, ciclo de vida, concurrencia, búsqueda con `%`, auditoría en ambas cuentas, y la API HTTP con los guards reales (rol, cuenta, módulo, identificadores inválidos, ruta `lookup`, cuerpo que intenta imponer cuentas y estado). Se omiten si no hay base de pruebas. Para ejecutarlas:
  `docker run -d --rm --name smarter-test-pg -e POSTGRES_PASSWORD=test -e POSTGRES_DB=smarter_test -p 127.0.0.1:55432:5432 postgres`
  `TEST_DATABASE_URL=postgres://postgres:test@127.0.0.1:55432/smarter_test npx jest projects.integration`
  La prueba borra y recrea el esquema, por lo que se niega a correr si el nombre de la base no contiene «test».
- Verificación manual con scripts temporales (no se conservan): 16 comprobaciones del editor y la vista de condiciones, y 36 de las tres pantallas (borrador, proponer, retirar, pausar, reanudar, rechazado, eliminar, filtro, modal de nuevo proyecto con cuenta inexistente o con proyecto existente, y socios reclutadores del cliente) sobre jsdom con la API simulada. **No se probó en un navegador real.**

**Pendiente de 3a**
- El cliente no tiene aviso dentro de la aplicación fuera del contador (solo correo).
- Las condiciones no tienen versiones: cambiarlas exige retirar la propuesta, y una vez aceptado el proyecto hay que terminarlo y crear otro.
- El esquema depende de `synchronize`.

### 14.10 Estado de la entrega 3b: landing, formulario y postulantes por proyecto (implementada)
**Qué hay**
- Dirección pública **`/r/<cuenta>/<proyecto>`** (`GET /api/recruit-portal/:slug/projects/:projectSlug`). Solo se sirve con el proyecto **activo**; un borrador, una propuesta, un proyecto pausado o terminado responde 404, igual que uno que no existe. El nombre del cliente solo aparece si la reclutadora activa `showClientName`; `{{cliente}}` sin eso se reemplaza por el nombre del proyecto, para no delatarlo.
- **Landing del proyecto**: el mismo editor y motor que la landing general (`LandingEditorCore`), guardados en `recruitment_projects.landing`, con valores iniciales propios (`{{proyecto}}`). Imágenes en `media/<reclutadora>/recruit-landing/<proyecto>/`: una landing no acepta imágenes de otro proyecto ni de otra cuenta. Variables de texto: `{{empresa}}`, `{{proyecto}}` y `{{cliente}}`.
- **Interruptor «Recibir postulaciones»** (`registrationOpen`) y **nombre público** (`publicName`), independientes del modo de acceso general de la cuenta. La landing puede prepararse mientras el proyecto es borrador o propuesta; se publica cuando el cliente acepta.
- **Formulario** (`project-form.ts`): hasta 15 preguntas (texto, párrafo, una opción, varias, sí/no, número) con obligatoriedad, ayuda, opciones (2 a 12) y rango. Guarda de **datos sensibles** por palabras clave (salud, religión, origen étnico, orientación sexual, opiniones políticas o sindicales, biométricos, antecedentes judiciales) en preguntas, ayudas y opciones; es una guarda, no una garantía. Las respuestas se guardan como **copia con el texto de la pregunta de ese momento**, así que editar el formulario después no desfigura lo recibido.
- **Postulación**: `POST /api/recruit-portal/:slug/projects/:projectSlug/register/request` valida las respuestas y las manda en el payload del código; **no se crea nada hasta verificarlo**. Al verificar (`otp/verify`): persona nueva → contacto, perfil `candidate` y membresía `applied` en una sola transacción; persona con perfil → entra y se le suma la membresía; perfil suspendido o terminado → no se envía nada y la respuesta es idéntica. Si el proyecto se cierra entre el código y la verificación: la persona nueva no se crea (error genérico) y la existente entra pero sin membresía, y la respuesta lo indica (`project.status: closed`). Volver a postularse no cambia las respuestas ni reabre a quien fue rechazado o terminado, y desde fuera se ve igual. Verificaciones simultáneas del mismo destino se serializan.
- **Postulantes** (`project-members.service.ts`, pestaña «Postulantes» del proyecto): lista por estado con conteos, búsqueda (nombre, correo, teléfono) y paginación; detalle con las respuestas; decisiones `approve | reject | pause | resume | end` con motivo obligatorio donde corresponde, UPDATE condicional al estado de origen y auditoría con el historial colgando del encuestador (`scopeId = perfil`). Un rechazado puede reconsiderarse (aprobar). Con el proyecto terminado ya no se decide. **Aprobar la postulación no activa al perfil**: sigue exigiendo contrato y método de pago verificados.
- El portal de la persona muestra «Tus postulaciones» (nombre público y estado de cada proyecto no terminado).
- API de la reclutadora (`/api/reclutamiento/:tenantId/projects/:id/...`): `GET public`, `PUT public/settings | public/landing | public/form`, `POST public/landing/images/:slot`, `GET members`, `GET members/:memberId`, `POST members/:memberId/approve | reject | pause | resume | end`.

**Cambios respecto del diseño**
- «Postulantes» y «Encuestadores» son **una sola pestaña** con filtro por estado (Postulados, Aprobados, Pausados, Rechazados, Terminados).
- La landing y el formulario se editan mientras el proyecto no esté terminado, incluso antes de que el cliente acepte.
- Cada tabla nueva (`project_memberships`) y las columnas nuevas de `recruitment_projects` y `recruit_otps` (`payload` ampliado, `profile_id` admite nulo) siguen dependiendo de `synchronize`.

**Pruebas** (se conservan en el repositorio)
- `project-form.spec.ts` (13, sin base de datos): validación de preguntas, guarda de datos sensibles y de respuestas.
- `project-members.integration.spec.ts` (33, PostgreSQL): configuración pública, dirección pública, postulación (persona nueva, existente, repetida, rechazada, suspendida, cierre entre medias, contacto del CRM, concurrencia, aislamiento entre reclutadoras), cola de postulantes, decisiones, auditoría y API HTTP con los guards reales y los endpoints públicos. Se comprobó que las pruebas fallan al romper a propósito la publicación, la privacidad del cliente, el cierre entre medias y la creación de personas nuevas.
- Las suites de integración comparten base de pruebas y se turnan con un bloqueo de PostgreSQL (`testing/test-db.ts`), así que pueden correr en paralelo. Los comandos de 14.9 siguen valiendo: `npx jest integration`.
- Scripts temporales (no se conservan), sobre jsdom con la API simulada: 50 comprobaciones de las pantallas nuevas (editor del formulario, postulantes y su modal, landing del proyecto, página pública con postulación completa) y las anteriores, que siguen pasando. **No se probó en un navegador real.**

**Hallazgo fuera de alcance**: `OtpInput` (`pages/cursos/OtpInput.tsx`) nunca llama a `onComplete` porque `maybeComplete` usa `!code.includes("")`, que siempre es falso. El código no se envía solo al completar los 6 dígitos: hay que pulsar «Entrar». Afecta también al portal de cursos. No se tocó.

**Pendiente de 3b**
- La reclutadora no recibe aviso de postulaciones nuevas (hay que abrir la pestaña).
- La ficha del encuestador no lista sus proyectos.
- El texto de consentimiento es el de la cuenta, no uno por proyecto.
- Captcha del registro.

### 14.11 Estado de la entrega 3c: estudios y asignaciones (implementada)
**Decisiones tomadas por omisión** (quedaron sin confirmar; se pueden cambiar):
- Modo de asignación por defecto: **con aprobación**, configurable por estudio por la reclutadora.
- La persona ve el **título del estudio y el nombre público del proyecto**; el nombre de la cuenta cliente solo si la reclutadora activó `showClientName`.
- En modo automático el cupo es **por orden de llegada**; con aprobación, la reclutadora elige entre las solicitudes.
- Un proyecto por cliente (ya decidido).

**Qué hay**
- **Cliente** (Estudios, dentro de cada proyecto activo o pausado): publica una de sus encuestas **activas** como estudio con título, instrucciones, zonas, máximo de encuestadores, meta de respuestas y vigencia; la edita, la pausa, la reanuda o la cierra (definitivo). Ve conteos (encuestadores y respuestas), nunca quiénes son ni el modo de asignación. Una encuesta ajena, inexistente o eliminada responde igual (404).
- **Reclutadora** (pestaña «Estudios» del proyecto): ve cada estudio con el nombre y el estado de la encuesta y su conteo de respuestas, y **nada más de la encuesta** (ni flujo, ni respuestas, ni enlaces). Elige el modo (`direct`, `approval`, `auto`), aprueba o rechaza solicitudes, asigna personas directamente y las pausa, reanuda o retira, siempre con motivo donde corresponde.
- **Persona** (portal, sección «Estudios»): ve los estudios publicados de los proyectos donde está aprobada, con su estado (disponible, solicitud enviada, asignado, pausado, no asignado, retirado, completado, sin cupos, lo asigna tu reclutadora, no disponible) y una pista de por qué. Toma (automático) o solicita (con aprobación), o retira su solicitud pendiente.

**Reglas**
- Para trabajar en un estudio hace falta: aprobación en el proyecto, **perfil activo** (contrato y método de pago verificados) y estudio **disponible** (publicado, encuesta activa, dentro de la vigencia, proyecto activo).
- El **cupo** (activas + pausadas) se comprueba dentro de una transacción con el estudio bloqueado: dos personas a la vez no pueden pasarse del máximo. El cliente no puede bajar el máximo por debajo de quienes ya están dentro.
- Una decisión ya tomada no se reabre pidiendo de nuevo; la reclutadora puede reactivar una asignación retirada o rechazada asignando directamente.
- **Cerrar un estudio** (o terminar el proyecto) da por completada la participación de quienes estaban dentro y cierra las solicitudes pendientes.
- **Lectura entre cuentas**: la reclutadora lee de la encuesta solo `nombre`, `estado` y `responseCount`, siempre acotado a la cuenta cliente dueña del estudio, y solo mientras el proyecto está activo o pausado; con el proyecto terminado esos datos dejan de salir. Cada consulta filtra por el tenant del lado que la ejecuta.
- Auditoría: el cliente deja constancia en ambas cuentas (en la contraparte como «Cuenta X», sin la persona); las decisiones sobre asignaciones cuelgan del historial del encuestador (`scopeId = perfil`) y no copian datos personales.

**API**
- Cliente (`/api/partners/:tenantId/projects/:id/studies`): `GET`, `GET candidates`, `POST`, `PATCH :studyId`, `POST :studyId/pause | resume | close`.
- Reclutadora (`/api/reclutamiento/:tenantId/projects/:id/studies`): `GET`, `GET :studyId`, `PUT :studyId/mode`, `GET :studyId/assignments`, `GET :studyId/candidates`, `POST :studyId/assignments`, `POST :studyId/assignments/:assignmentId/approve | reject | pause | resume | revoke`.
- Portal (`/api/recruit-portal/:slug`, con sesión): `GET me/studies`, `POST studies/:studyId/take`, `POST studies/:studyId/cancel`.

**Pruebas** (se conservan en el repositorio)
- `project-studies.integration.spec.ts` (46, PostgreSQL): publicación, aislamiento entre cuentas y entre proyectos, lectura acotada de la encuesta (incluida una referencia cruzada forzada en la base), modos de asignación, elegibilidad, cupo con concurrencia, decisiones, cierre en cascada, panel de la persona y API HTTP con los guards reales. Se comprobó que las pruebas fallan al romper a propósito el acotado por cuenta, la lectura solo con el proyecto vivo, la elegibilidad, el cupo, el proyecto activo y la pertenencia al proyecto.
- El tiempo límite de Jest sube a 60 s (`backend/package.json`): las suites de integración comparten una base y esperan su turno con un bloqueo, así que la espera cuenta contra el límite de cada una.
- Scripts temporales (no se conservan), sobre jsdom con la API simulada: 49 comprobaciones de las pantallas nuevas (estudios de la reclutadora, publicación y edición del cliente, sección del portal) y las anteriores, que siguen pasando. **No se probó en un navegador real.**

**Límites conocidos**
- **Todavía no se pueden responder los estudios**: «Asignado» no abre ninguna acción de trabajo. Contestar con atribución al encuestador, GPS, revisión y pago es la Fase 4 y la 5.
- La **zona, el idioma y la calificación mínima** no se exigen para asignar (no hay datos del encuestador contra los que comparar); la zona del estudio es informativa. La meta de respuestas también es informativa.
- Nadie recibe aviso de una solicitud, aprobación o rechazo: hay que abrir la pestaña o el portal.
- Un estudio cerrado no se puede reabrir; hay que publicar la encuesta de nuevo.
- El esquema nuevo (`project_studies`, `study_assignments`) depende de `synchronize`; falta migración manual antes de producción.

### 14.12 Módulo `estudios`: un solo activador para el lado cliente (implementado)

Antes, el lado cliente dependía del flag `encuestas` (activo por defecto) y una cuenta sin él no podía responder propuestas. Ahora todo lo que el cliente hace con socios reclutadores se activa con **un solo flag**, `estudios`, apagado por defecto.

- **Activación:** el superadmin lo enciende en Administración → cuenta → Módulos. Aparece el ítem **Estudios** en la navegación de esa cuenta (solo owner/admin entran a la página).
- **Qué cubre:** socios reclutadores (aceptar, rechazar, pausar, terminar proyectos), publicar estudios y, más adelante, tareas. Las rutas `/api/partners/:tenantId/projects...` pasan de `@RequiresFeature('encuestas')` a `@RequiresFeature('estudios')`. `encuestas` sigue gobernando solo las encuestas.
- **La reclutadora no cambia:** sigue con `reclutamiento`. Si la cuenta es reclutadora y cliente a la vez (proyecto propio), necesita ambos.
- **Proponer exige el módulo en el cliente:** `POST .../propose` responde 409 con `code: CLIENT_MODULE_DISABLED` si la cuenta cliente no tiene `estudios`. El borrador sí se puede crear y guardar. `GET lookup` devuelve `clientReady` y la vista del proyecto trae `client.estudios`; la interfaz avisa en el modal de nuevo proyecto y deshabilita «Proponer al cliente» con un aviso en el detalle.
- **Privacidad:** la reclutadora sabe así si la cuenta tiene el módulo, y nada más de sus flags.
- **Proyectos ya aceptados:** siguen vigentes, pero los administradores del cliente solo ven la página cuando se activa `estudios`. Hay que activarlo en las cuentas cliente que ya tengan proyectos.
- **Correo de aviso:** el enlace apunta a `/:slug/estudios`.
- **Contador de pendientes:** se retiró de la barra lateral de Encuestas (la navegación no admite insignias).
- **Pruebas:** backend 269 pasan (nuevas: proponer sin módulo, `clientReady`, rutas `partners` 403 con solo `encuestas` y 200 con `estudios`); jsdom 9 comprobaciones del módulo (acceso por flag, aviso y botón deshabilitado) y las 135 anteriores.

### 14.13 Estudios propios de la cuenta cliente, asignados a socios (implementado)

Cambia el modelo de 14.11: el estudio ya no nace dentro de un proyecto. La cuenta cliente lo **crea completo** en el módulo Estudios y después lo **asigna** a uno o varios socios reclutadores. Las decisiones se confirmaron con «ok a todo» sobre la propuesta.

**Modelo**
- `client_studies` (nuevo): el estudio de la cuenta cliente. Tipo (`kind`), recurso (`surveyId`), título, instrucciones, zonas, meta de respuestas y vigencia. Estados: `active`, `paused`, `closed` (definitivo). Una misma encuesta puede estar en varios estudios.
- `project_studies` (cambia de sentido): es la **asignación** del estudio a un proyecto. Conserva su id, que sigue siendo el «estudio» de la reclutadora y del portal (rutas y asignaciones de encuestadores sin cambios). Guarda solo lo propio de cada socio: `clientStudyId`, cupo `maxSurveyors` (lo define la cliente) y `assignmentMode` (lo define la reclutadora). Estados: `published` o `closed` (retirado). El contenido sale del estudio de la cliente.
- Un estudio no se asigna dos veces a la vez al mismo proyecto; se puede volver a asignar después de retirarlo (nace una asignación nueva).

**Tipos de estudio.** El catálogo vive en `entities/client-study.entity.ts` (`STUDY_KINDS`) y la API lo expone en `GET /partners/:tenantId/studies/kinds`. Solo **Encuesta** está disponible. **Curso, Grupo focal, Entrevista, Cliente oculto** y **Auditoría en punto de venta** se muestran como «Próximamente» y el servidor responde 409 si se intentan crear. Curso queda pendiente porque hay que definir cómo hace un encuestador un curso del Academy (hoy tiene su propio acceso por OTP, distinto al del portal).

**Disponibilidad.** Un encuestador puede tomar o recibir un estudio si: la asignación está vigente, el estudio está `active`, el proyecto está activo, la encuesta está activa y hoy cae dentro de la vigencia. Pausar el estudio lo deja sin tomar en todos los socios (quien ya participa lo sigue viendo). Cerrarlo lo retira de todos y completa la participación. Retirarlo de un socio solo afecta a ese socio. Terminar un proyecto retira sus asignaciones, pero el estudio sigue activo para los demás socios.

**API de la cuenta cliente** (`/api/partners/:tenantId/studies`, owner/admin con el módulo `estudios`): `GET` (lista con socios y conteos), `GET kinds`, `GET candidates` (encuestas activas), `POST`, `GET|PATCH :id`, `POST :id/pause|resume|close`, `GET :id/projects` (proyectos activos a los que se puede asignar), `POST :id/projects` (`projectId`, `maxSurveyors` opcional), `PATCH :id/projects/:projectId` (cupo; no baja de quienes ya están dentro) y `DELETE :id/projects/:projectId` (retirar). Se eliminaron las rutas `partners/:tenantId/projects/:id/studies...`. La cliente ve conteos por socio y total, nunca quiénes son los encuestadores ni el modo de asignación. Un proyecto ajeno, en borrador o inexistente responde 404 igual.

**API de la reclutadora y del portal:** sin cambios de ruta. La vista de la reclutadora añade `kind`; el estado `paused` o `closed` del estudio de la cliente se refleja en su lista.

**Interfaz.** El módulo Estudios tiene dos secciones: **Estudios** (crear, editar, pausar, cerrar, asignar a socios, cambiar cupo, retirar) y **Socios reclutadores** (propuestas y proyectos). Al crear un estudio se ofrece asignarlo de inmediato. La ruta `/:slug/encuestas/socios` redirige a `/:slug/estudios/socios`, y el correo de propuesta enlaza ahí.

**Datos existentes.** El esquema depende de `synchronize`. Las filas de `project_studies` anteriores a este cambio no tienen `client_study_id`, no se muestran y pierden su contenido (las columnas de título, encuesta y vigencia desaparecen de esa tabla). Antes de arrancar contra una base con estudios ya publicados hay que convertirlos en estudios de la cliente o aceptar perderlos.

**Pruebas:** backend 272 pasan (estudios del cliente, asignación a varios socios, cupo, retiro, cierre, aislamiento entre cuentas, tipos próximamente, rutas HTTP con guards reales); jsdom 148 comprobaciones de interfaz.

### 14.14 La encuesta se arma dentro del estudio (implementado)

Sustituye el selector de encuestas de 14.13: el estudio **contiene** su encuesta y no se escoge una del módulo Encuestas.

- **Creación.** «Nuevo estudio» pide tipo, título y condiciones, y crea en una transacción el estudio (estado `draft`) y su encuesta (`surveys.client_study_id`, en borrador, con una pregunta de ejemplo). La pantalla pasa directo a la pestaña Edición del estudio.
- **Pantalla del estudio** (`/:slug/estudios/:studyId`, un solo encabezado con el estado y las acciones Activar, Pausar y Reanudar; la pestaña activa vive en `?tab=`). **Resumen:** indicadores (respuestas y avance hacia la meta, encuestadores, socios, preguntas), encuestadores por socio, resultados y respuestas de la encuesta. **Edición:** constructor de preguntas, apariencia y ajustes de la encuesta (los mismos componentes del módulo Encuestas, sin su encabezado ni pestañas de CRM o enlace público). **Configuración:** datos del estudio (título, instrucciones, zonas, meta y vigencia), socios reclutadores (asignar, cupo, retirar) y zona delicada (cerrar y eliminar borrador). La lista `/:slug/estudios` solo muestra cada estudio con su avance y lo abre en esta pantalla.
- **Ciclo de vida del estudio** (`draft → active ↔ paused → closed`). **Activar** exige al menos una pregunta, deja la encuesta activa y genera su dirección. **Cerrar** archiva la encuesta, retira el estudio de todos los socios y completa la participación. Solo se asigna a socios un estudio `active`. Un borrador se puede eliminar (se elimina también su encuesta); uno activado solo se cierra. Renombrar el estudio renombra la encuesta.
- **Preguntas bloqueadas.** Las preguntas (`flowJson`) se editan libremente en borrador y mientras no haya respuestas ni encuestadores. Se bloquean (409) cuando la encuesta recibe una respuesta, cuando se asigna cualquier encuestador a cualquier asignación del estudio (en cualquier estado) o cuando el estudio se cierra. Los textos, el título y la apariencia siguen editables. Para otra versión se crea un estudio nuevo, así nunca se mezclan respuestas de cuestionarios distintos.
- **Separación del módulo Encuestas.** Las encuestas de un estudio no aparecen en su lista. Por la API de encuestas no se pueden activar, archivar, eliminar, publicar en WhatsApp ni vincular al CRM (409), y `clientStudyId` no se puede escribir. El acceso a ellas exige el módulo `estudios` y rol propietario o administrador; el módulo `encuestas` no basta. El enlace público de una encuesta de estudio depende de `estudios`.
- **`encuestas` deja de ser un módulo por defecto.** `DEFAULT_ON_FEATURES` queda vacío y `defaultOn` de `encuestas` pasa a `false`. Las cuentas que hoy usan Encuestas **pierden el menú, la API y los enlaces públicos hasta que un superadmin lo active** (Administración → cuenta → Módulos). Para conservar el acceso a las cuentas que ya tienen encuestas: `UPDATE tenants SET features = COALESCE(features, '{}'::jsonb) || '{"encuestas": true}' WHERE id IN (SELECT DISTINCT tenant_id FROM surveys WHERE client_study_id IS NULL AND deleted_at IS NULL) AND NOT (COALESCE(features, '{}'::jsonb) ? 'encuestas');`.
- **API** (`/api/partners/:tenantId/studies`): cambia `POST` (ya no recibe `surveyId`; el título es obligatorio), desaparece `GET candidates`, y se añaden `POST :id/activate` y `DELETE :id`. La vista del estudio trae `survey: { id, name, status, questions, locked }`.
- **Datos existentes.** El esquema depende de `synchronize`: se agrega `surveys.client_study_id` (nulo en las encuestas actuales). Los estudios ya creados con una encuesta del módulo Encuestas (14.13) quedan con esa referencia, pero la encuesta no pertenece al estudio ni se bloquea; conviene recrearlos.
- **Pruebas:** backend 307 pasan (encuesta nace con el estudio, activación, borrado de borrador, bloqueo de preguntas por respuestas/asignaciones/cierre, aislamiento del módulo Encuestas, acceso por módulo y rol, enlace público); jsdom 59 comprobaciones del módulo Estudios y 9 de la encuesta incrustada.

### 14.15 Proyectos como módulo propio (implementado)

Los proyectos salen de la barra lateral de Reclutamiento y pasan a ser un módulo con su propio ítem en la navegación principal, para no saturar Reclutamiento (que conserva Encuestadores, Plantillas de contrato, Portal y Landing).

- **Sin interruptor propio.** El módulo `proyectos` es derivado: se muestra cuando la cuenta tiene activo `reclutamiento` (`derivedFrom` en `frontend/src/config/modules.ts`) y no aparece entre los módulos administrables ni se guarda en `Tenant.features`. Al activar Reclutamiento aparecen los dos.
- **Rutas.** `/:slug/proyectos` (lista) y `/:slug/proyectos/:projectId` (detalle con Acuerdo, Landing, Formulario, Postulantes y Estudios), con `ProyectosLayout` (encabezado propio; redirige al dashboard sin Reclutamiento o sin rol de administrador). `/:slug/reclutamiento/proyectos[/:id]` redirigen a la ruta nueva.
- **Backend sin cambios.** La API sigue en `/api/reclutamiento/:tenantId/projects` con el flag `reclutamiento`.
- **Pruebas:** 7 comprobaciones de jsdom (módulo derivado, orden en la navegación, no administrable, acceso del layout).

### 14.16 Acuerdo profesional de campo (reemplazado por 14.18)

El proyecto pasa de siete datos sueltos (tarifa, moneda, vigencia, zonas en texto libre, acceso a datos y términos) a una propuesta de campo completa, como la arma una agencia de investigación de mercados. Se guarda en `recruitment_projects.spec` (jsonb, validado en `project-spec.ts`) y queda fija al proponer, igual que las condiciones.

**Formulario por pasos** (pestaña Acuerdo, con el valor estimado en vivo y la lista de lo que falta para proponer):
1. **Identificación:** código consecutivo por reclutadora (`PRY-AAAA-NNN`, columna `code`, generado con un bloqueo por cuenta), metodología (presencial CAPI, telefónica CATI, en línea CAWI, cliente oculto, auditoría en punto de venta o mixta), sector y contactos de las dos cuentas.
2. **Alcance y cuotas:** meta de encuestas efectivas, duración, incidencia esperada, días de encuestador y cuotas por sexo, rango de edad (sin superponerse) y estrato 1 a 6. Cada dimensión no puede superar la meta.
3. **Cobertura:** solo Colombia. Selector de departamentos y municipios con la codificación DIVIPOLA del DANE (33 departamentos y 1.122 municipios, generados de datos.gov.co, conjunto `gdxc-w37w`, en `geo/divipola.data.ts` y `frontend/src/data/divipola.data.ts`). Por zona: ámbito (urbano, rural o ambos), cuota y tarifa especial. No se admite un municipio junto con su departamento completo, para no contar dos veces.
4. **Costos** (siempre COP; el servidor rechaza otra moneda):
   - Modalidades: por encuesta efectiva, precio fijo o por día de encuestador. `clientRate` es el valor base de la modalidad.
   - Recargo rural en porcentaje y tarifa especial por zona.
   - IVA del 19%: adicional, incluido o exento.
   - Incentivos a encuestados, pagados por el cliente o por la reclutadora.
   - Transporte y viáticos incluidos, o facturados aparte con tope.
   - Anticipo, hitos de pago y saldo contra entrega, con plazo en días.
   - **Costo interno** por unidad (`internal_cost`): solo lo ve la reclutadora, se puede ajustar con el proyecto en curso y da el margen.
5. **Calidad y cronograma:** verificación (10% por defecto), duración mínima, anular duplicados y fuera de zona, plazo de revisión del cliente (5 días hábiles), aprobación automática al vencer, reposición de rechazadas sin costo, vigencia del acuerdo, inicio y fin de campo, y entrega.
6. **Legal y anexos:** responsable del tratamiento según la Ley 1581 de 2012, acceso a las respuestas, confidencialidad, código ICC/ESOMAR, sin recontacto, y anexo en texto libre.

**Cálculo** (`project-estimate.ts`, con copia idéntica en `frontend/src/pages/reclutamiento/proyectos/projectEstimate.ts`; las pruebas de los dos usan los mismos casos). El valor del servicio sale de la modalidad: por encuesta, cada zona con cuota usa su tarifa (o la base) y las rurales llevan el recargo; las encuestas no repartidas van a la tarifa base. El IVA se calcula sobre el servicio. El total suma incentivos del cliente y el tope de gastos. El plan de pagos reparte el total. La vista del cliente trae el `estimate` sin `internal` ni `internalCost`.

**Para proponer** se exige: metodología, contacto del cliente (nombre y correo), meta, cobertura, valor base (y días si es por día), inicio del acuerdo y fechas de campo. La respuesta 400 `PROJECT_INCOMPLETE` incluye `missing`.

**Zonas de los estudios.** También pasan a códigos DIVIPOLA con el mismo selector. El portal del encuestador recibe los nombres. Las zonas de texto libre guardadas antes se siguen mostrando tal cual.

**Pendiente.** Cobrar «por encuesta aprobada» y aplicar la revisión con plazo, la verificación y las anulaciones necesita la atribución de respuestas al encuestador y la revisión en dos etapas (fase 4). Hoy esos datos se pactan y se muestran, pero todavía no actúan sobre las respuestas. La cobertura del proyecto no restringe las zonas de los estudios, porque un mismo estudio puede ir a varios socios.

**Pruebas:**
- Backend: 319 pasan.
  - Unitarias (10): catálogo, cálculo y validación.
  - Integración: código consecutivo concurrente, costo interno oculto al cliente y editable tras proponer, acuerdo fijo al proponer, lista de faltantes y zonas de estudio.
- jsdom: 35 comprobaciones del editor, el resumen, el selector de zonas y la vista del cliente, más las anteriores actualizadas.

### 14.17 Varios proyectos por cliente (implementado)

Cambia la decisión 1 de 14.1 («un proyecto por cliente»). Desde 14.16 el proyecto es un estudio de campo con su propia meta, cobertura, costos y fechas, así que una pareja reclutadora-cliente puede tener varios proyectos a la vez, cada uno con su ciclo de vida.

- Se quitó el índice único parcial `uq_recruitment_projects_pair` y queda un índice normal por pareja. `synchronize` elimina el índice viejo al arrancar.
- `GET lookup` devuelve `openProjects` (proyectos no terminados con esa cuenta) en lugar de `existing`. Es informativo: el modal de nuevo proyecto lo menciona pero no bloquea la creación. Desaparece el error `PROJECT_EXISTS`.
- Para el cliente, cada proyecto aceptado es un destino distinto al asignar un estudio: el selector muestra el nombre del proyecto y el de la reclutadora.

### 14.18 Acuerdo simple, primera versión (implementado)

Reemplaza 14.16. El acuerdo del proyecto vuelve a ser comercial y corto: la mayoría de los datos de campo (metodología, metas, cuotas, calidad, fechas de campo, incentivos) no se administran en el proyecto sino en los estudios del cliente y, más adelante, en sus lotes.

- **Campos:** nombre, código (`PRY-AAAA-NNN`), tarifa por encuesta efectiva en COP (`client_rate`), IVA (adicional, incluido o exento) y plazo de pago en días (`spec`, jsonb: `{ vat, paymentTermDays }`), vigencia, zonas DIVIPOLA opcionales (columna `zones`), acceso a los datos, anexo libre y costo interno por encuesta (solo la reclutadora).
- **Para proponer:** tarifa y fecha de inicio, como al principio.
- **Precio:** las vistas traen `pricing` por encuesta (sin IVA, IVA y lo que paga el cliente). La de la reclutadora añade `internal` con el costo y el margen por encuesta. No hay valor total: depende de las encuestas que el cliente programe.
- **Se eliminó:** el formulario por pasos, las tres modalidades de cobro, las cuotas, la calidad, el cronograma de campo, los contactos y los compromisos legales separados (el anexo los cubre). `project-estimate.ts` se borró. `specOf` lee el formato anterior de 14.16 (IVA y plazo) sin romper.
- **Pantalla:** una sola vista con tres secciones (Proyecto, Condiciones económicas, Datos y anexo) y la tarjeta de precio por encuesta a la derecha.
- **Pruebas:** backend 315 pasan; jsdom 14 comprobaciones del acuerdo y las anteriores actualizadas.

### 14.19 Lotes de un estudio y un solo socio por estudio (implementado)

Decisiones confirmadas: el lote pertenece al estudio; las filas van por zona o por establecimiento (sirve para cualquier estudio, no solo control de precios); cada estudio va a una sola reclutadora; programa el cliente; el valor del lote es informativo.

**Un solo socio por estudio.** Un estudio se asigna a un único proyecto a la vez (índice único parcial `uq_project_studies_one_partner` sobre `project_studies.client_study_id` mientras no esté cerrado; reemplaza al índice por proyecto). Asignarlo a otro responde 409 y dice a quién está asignado. Para cambiar de socio se retira y se asigna al nuevo. La pantalla del estudio muestra «Socio reclutador» en singular y oculta «Asignar» mientras haya uno.

**Lote** (`study_batches`):
- **Campos:** nombre, periodo (inicio y fin), criterio y filas (jsonb), total de encuestas, indicaciones, estado y, al programarlo, el proyecto al que va.
- **Criterio por zona:** municipio o departamento DIVIPOLA con su cantidad; sin repetidos ni municipio junto con su departamento.
- **Criterio por establecimiento:** nombre, dirección opcional, municipio y cantidad; hasta 2.000 filas.
- **Límites del estudio:** si el estudio tiene zonas, las filas deben caer dentro de ellas. El periodo debe estar dentro de la vigencia del estudio.
- **Estados:** `draft` (lo prepara el cliente, nadie más lo ve), `scheduled` (programado: lo ve la reclutadora del estudio) y `closed`.
- **Programar exige:** estudio activo, asignado a un proyecto activo, al menos una fila y el periodo completo. Queda ligado a ese proyecto.
- **Editar:** se puede en borrador y programado. Un lote programado no puede quedar sin filas ni sin fechas, y sus cambios quedan en la auditoría de las dos cuentas.
- **Eliminar y cerrar:** se elimina solo en borrador; uno programado se cierra.
- **Cierre automático:** al retirar el estudio del socio o al terminar el proyecto se cierran sus lotes programados. Al cerrar el estudio se cierran también los borradores.
- **Valor:** cantidad × tarifa del proyecto, con su IVA. Lo ven el cliente (sin costo interno) y la reclutadora (con su costo y margen). Es nulo si el estudio no tiene socio o el proyecto no tiene tarifa.

**API cliente** (`/api/partners/:tenantId/studies/:id/batches`): `GET`, `POST`, `PATCH|DELETE :batchId`, `POST :batchId/schedule|close`. **API reclutadora:** `GET /api/reclutamiento/:tenantId/projects/:id/studies/:studyId/batches`, solo lectura, con los lotes programados y cerrados de su proyecto.

**Interfaz:**
- **Pestaña Lotes en el estudio del cliente:** lista con estado, periodo, total y valor; filas desplegables; programar, cerrar y eliminar con confirmación.
- **Editor de lote:** por zona con el selector de municipios, o por establecimiento con una tabla. Incluye «Pegar desde Excel» con las columnas nombre, dirección, municipio y cantidad, que reconoce el municipio por nombre (sin tildes; «Nombre, Departamento» si se repite; Cali, Cartagena y Cúcuta por su nombre común) y explica cada línea que no entiende.
- **Reclutadora:** en el detalle del estudio ve «Lotes programados» con los establecimientos o zonas, las indicaciones y su margen.

**Pendiente:** el avance por lote (encuestas hechas frente a programadas) necesita atribuir cada respuesta al encuestador y al lote (fase 4). Tampoco hay todavía carga de establecimientos desde el módulo Empresas.

**Pruebas:**
- Backend: 323 pasan, 8 nuevas de lotes. Cubren el borrador y el valor, los establecimientos, la validación, las reglas para programar, la vista y el aislamiento de la reclutadora, el cierre en cascada, la auditoría y las rutas HTTP. Las pruebas de asignación se reescribieron para un solo socio, incluida una asignación simultánea a dos socios donde solo una gana.
- jsdom: 27 comprobaciones de lotes (municipios por texto, pegado, editor, programar, vista de la reclutadora) y las anteriores actualizadas.

### 14.20 Trabajo de campo desde el portal y avance por lote (implementado)

Primera parte de la fase 4. El encuestador hace la encuesta del estudio desde su portal y cada respuesta queda atribuida.

- **Atribución:** `survey_responses` suma cuatro columnas: `profile_id` (encuestador), `study_link_id` (la asignación del estudio al socio), `batch_id` y `batch_row` (lote y posición de la fila). El cliente ve como identificador de la respuesta el municipio o el establecimiento, nunca a la persona.
- **Sin enlace público:** la encuesta de un estudio ya no se responde por `/s/:slug`. Solo la responden desde el portal las personas con una asignación activa, para que ninguna respuesta quede sin dueño.
- **Para trabajar hace falta:**
  - una asignación activa, no pausada, y el perfil activo (contrato y pago verificados);
  - el proyecto activo, y el estudio activo y dentro de su vigencia;
  - la encuesta activa.
  Si algo falla, el portal dice por qué.
- **Modos de trabajo:**
  - Un estudio que nunca tuvo lotes en ese proyecto se trabaja libre.
  - Un estudio con lotes exige elegir una fila de un lote programado cuyo periodo incluya hoy. Si no hay ninguno, el portal lo dice.
- **Cupo por fila:** una fila no pasa de su cantidad. El conteo va dentro de una transacción con un bloqueo por fila, así que envíos simultáneos no lo exceden.
- **Ubicación:** si la encuesta la exige, se pide y se guarda.
- **Edición de un lote con encuestas hechas:** las filas que ya tienen encuestas no se quitan, no se mueven y no bajan de lo hecho. Tampoco se cambia el criterio del lote. Subir cantidades y agregar filas sí se puede.
- **Avance:** las vistas de lote traen `rowsDone` y `done`.
  - El cliente ve «X de Y» por lote, con una barra, y por fila.
  - La reclutadora ve «X de Y» y las encuestas que faltan.
- **Rutas del portal:** `GET /recruit-portal/:slug/studies/:studyId/work` (encuesta, lotes en curso con avance, o el motivo por el que no se puede) y `POST .../responses` (`responseData`, `batchId`, `row`, `location`; la persona sale de la sesión, nunca del cuerpo; límite de 3 por segundo).
- **Interfaz del portal:** los estudios asignados muestran «Hacer encuesta». Se abre una pantalla completa para elegir el lote y el punto (con «X de Y» y los llenos deshabilitados) y responder. Después del envío ofrece hacer otra en el mismo punto, elegir otro punto o terminar.

**Pendiente de la fase 4:** la revisión en dos etapas (reclutadora y cliente), con aprobación y rechazo y el plazo y la reposición del acuerdo; el pago al encuestador por encuesta aprobada; y modo sin conexión.

**Pruebas:**
- Backend: 330 pasan, 7 nuevas de trabajo de campo. Cubren el trabajo libre, quién puede y por qué no, el cupo con cinco envíos simultáneos a una fila de 2, los lotes fuera de periodo o cerrados, la edición con encuestas hechas, la ubicación y la ruta del portal sin suplantación.
- jsdom: 13 comprobaciones del panel y del avance.

### 14.21 Revisión de encuestas en dos etapas (implementado)

Segunda parte de la fase 4. Cada encuesta de campo pasa por dos revisiones: primero la reclutadora (calidad del trabajo de su gente) y luego el cliente (aprobación final).

- **Estados** (`survey_responses.review_status`):
  - `pending_recruiter` → `pending_client` → `approved`, o `rejected` en cualquiera de las dos etapas.
  - Junto al estado se guardan quién rechazó (`rejected_by`), el motivo, y quién decidió en cada etapa y cuándo.
  - Las respuestas de encuestas que no son de un estudio siguen con estado nulo.
- **Rechazar exige motivo y libera el cupo:** una respuesta rechazada no cuenta en la fila del lote, así que el encuestador puede reponerla. El portal le muestra cuántas lleva aprobadas, en revisión y rechazadas, con los últimos motivos.
- **Qué ve cada lado:**
  - La reclutadora ve todo lo de su asignación, con el nombre del encuestador. Ve el contenido de las respuestas solo si el acuerdo es de acceso completo; con «solo conteos» revisa quién, dónde y cuándo.
  - El cliente ve lo que la reclutadora aprobó y lo que él mismo rechazó. Nunca ve quién hizo la encuesta ni lo que rechazó la reclutadora.
  - La lista general de respuestas y los resultados de la encuesta del estudio aplican el mismo filtro y no exponen los identificadores internos.
- **Decisiones:**
  - Se decide sobre una respuesta o en bloque, hasta 200 a la vez.
  - Solo cambian las que siguen pendientes en la etapa de quien decide. Decidir dos veces responde 409 si es una sola respuesta; en bloque, las ya revisadas se omiten y se informan.
  - Cada decisión queda en la auditoría de la cuenta que decide.
- **Lotes:** además de `done` (no rechazadas), las vistas traen `approved` y `rowsApproved`, que son las aprobadas por el cliente: lo facturable.
- **API:**
  - Reclutadora: `GET|POST /api/reclutamiento/:tenantId/projects/:id/studies/:studyId/responses[/approve|/reject]`.
  - Cliente: `GET|POST /api/partners/:tenantId/studies/:id/responses[/approve|/reject]`, con `{ ids, reason }`.
  - Filtros: `status=pending|approved|rejected`, `batchId` y paginación.
- **Interfaz:**
  - La lista de revisión es la misma para los dos lados: filtros con contadores, selección y aprobación en bloque, rechazo con motivo, respuestas desplegables con el texto de cada pregunta y enlace a la ubicación.
  - El cliente la usa desde la pestaña «Revisión» del estudio. La reclutadora, desde «Revisión de encuestas» en el detalle del estudio dentro del proyecto.

**Pendiente:**
- la aprobación automática al vencer un plazo (el acuerdo simple de 14.18 ya no lo define; se puede agregar como campo del acuerdo);
- el pago al encuestador por encuesta aprobada.

**Pruebas:**
- Backend: 335 pasan, 5 nuevas. Cubren la revisión en dos etapas, lo que ve cada lado, el cupo liberado y la reposición, el acceso completo frente a solo conteos, el aislamiento, las validaciones, la auditoría y el filtro de la lista general de respuestas.
- jsdom: 12 comprobaciones de la lista de revisión.

### 14.22 Pagos al encuestador (implementado)

Cierra la fase 4 según el diseño de 4.4: un libro de solo agregar y la plataforma no mueve dinero.

- **`reward_ledger`:** un asiento por movimiento, con signo, que no se edita ni se borra. Tipos:
  - `accrual`: encuesta aprobada por la reclutadora;
  - `reversal`: el cliente la rechazó después;
  - `payout`: pago registrado;
  - `adjustment`: corrección con motivo.
  El saldo es la suma por moneda. Un índice único (`response_id`, `type`) impide causar o revertir dos veces la misma encuesta.
- **Causación:** al aprobar la reclutadora, en la misma transacción de la revisión. Toma la tarifa del contrato activo de la persona cuya vigencia cubre la fecha de la encuesta, con su moneda. Si no hay contrato vigente, la encuesta no se causa, la respuesta de la revisión trae `withoutContract` y la interfaz avisa para corregirlo con un ajuste.
- **Reversa:** al rechazar el cliente una encuesta ya causada. Por ahora la reversa siempre la asume el encuestador; el diseño deja abierto que el acuerdo defina otra cosa.
- **Pagos:** la reclutadora paga por fuera y registra el pago con valor, moneda, fecha (no futura), método de pago verificado opcional, referencia y nota. El pago no puede superar el saldo. Un bloqueo por persona evita que dos pagos a la vez lo excedan. Se audita en la cuenta.
- **Ajustes:** valor con signo y motivo obligatorio; se auditan.
- **API** (owner/admin con `reclutamiento`): `GET /api/reclutamiento/:tenantId/payouts/balances`, `GET .../profiles/:profileId/ledger`, `POST .../profiles/:profileId/payouts` y `POST .../profiles/:profileId/adjustments`. **Portal:** `GET /recruit-portal/:slug/me/earnings`.
- **Interfaz:**
  - Reclutamiento → **Pagos**: total por pagar y saldo por persona, con enlace a la ficha.
  - Ficha del encuestador → **Saldo y pagos**: saldo, movimientos con estudio y punto, «Registrar pago» y «Ajuste».
  - Portal → **Tus ganancias**: lo que tiene por cobrar y sus movimientos.
  - `formatMoney` pasa a `es-CO` para agrupar miles también en valores de cuatro cifras (por ejemplo «$ 4.000»).

**Pendiente:** solicitudes de retiro desde el portal (`payout_requests`), comprobante adjunto del pago, cuentas por cobrar al cliente (reporte por acuerdo y periodo para facturar) y la aprobación automática al vencer un plazo.

**Pruebas:**
- Backend: 339 pasan, 4 nuevas. Cubren la causación con la tarifa del contrato vigente, la reversa, la idempotencia, el caso sin contrato con su ajuste, el pago sin superar el saldo y con dos pagos simultáneos, los saldos y movimientos de la cuenta y del portal, y el aislamiento.
- jsdom: 11 comprobaciones.

### 14.23 Reporte de facturación por proyecto y periodo (implementado)

Lo que el cliente le debe a la reclutadora, como base para emitir la factura por fuera de la plataforma.

- **Qué cuenta:** encuestas con aprobación final del cliente (`review_status = approved`) cuya fecha de aprobación cae en el periodo. Los días son calendario en hora de Bogotá, porque el módulo opera en Colombia.
- **Cómo se valora:** a la tarifa del acuerdo del proyecto, con su IVA (adicional, incluido o exento) y su plazo de pago.
- **Agrupación y detalle:** se agrupa por estudio y lote, y trae el detalle de hasta 5.000 encuestas (fecha de aprobación y de la encuesta, estudio, lote y punto). Si hay más, lo avisa.
- **Lo que ve la reclutadora además:** su costo, es decir lo causado a sus encuestadores por esas mismas encuestas en `reward_ledger` (neto de reversas), y su margen sin IVA.
- **Periodo:** por defecto, el mes en curso. Máximo 400 días; el inicio no puede ser posterior al fin.
- **API:** `GET /api/reclutamiento/:tenantId/projects/:id/billing?from&to` (reclutadora) y `GET /api/partners/:tenantId/projects/:id/billing?from&to` (cliente, sin costo ni margen).
- **Interfaz:**
  - Pestaña **Facturación** en el proyecto de la reclutadora.
  - Botón **Facturación** en cada socio aceptado del cliente; también en proyectos terminados.
  - Periodo «este mes», «mes anterior» u «otro», totales (encuestas, sin IVA, IVA, total), tabla por estudio y lote, y exportación del detalle a CSV separado por punto y coma, que Excel en español abre bien.

**Pruebas:**
- Backend: 340 pasan, 1 nueva. Cubre totales y agrupación, el costo y el margen solo para la reclutadora, que lo rechazado no cuenta, el filtro por periodo, el periodo por defecto, las validaciones y el aislamiento.
- jsdom: 9 comprobaciones (periodos, totales, lo que ve cada lado, CSV, vacío).

## 15. Proyectos genéricos y prospectos (vigente)
Se despliega por etapas: primero el reclutamiento, después la ejecución de estudios. Por ahora un proyecto **no depende de una cuenta cliente ni de estudios**. Tiene su landing, su formulario de registro y sus prospectos. El concepto de «encuestador» sale de la interfaz: quien se registra puede terminar haciendo cualquier tipo de tarea.

### 15.1 Modelo
**`recruitment_projects`**: `tenantId`, `name`, `slug` (único por cuenta), `description` (interna), `status` (`draft | active | paused | ended`), `publicName`, `registrationOpen`, `landing` (jsonb, mismo modelo que la landing general), `form` (`questions` propias y `fields`: datos personales que se piden), `createdBy`, `endedAt`.
- Estados: `draft → active ↔ paused → ended`. Terminar es definitivo, cierra el registro y bloquea la edición. La dirección solo cambia en borrador. Se elimina solo un proyecto sin prospectos; con prospectos se termina.
- La dirección pública (`/r/<cuenta>/<proyecto>`) solo responde con el proyecto `active`.

**`project_prospects`**: participación de una persona en un proyecto. `tenantId`, `projectId`, `recordId` (**contacto del CRM**), `status` (`new | talking | approved | rejected`), `statusReason` (interno), `decidedBy/At`, `answers` (copia con el texto de cada pregunta), `consentAt`, y los datos con que se registró (`fullName`, `email`, `phone`). Único por proyecto y contacto. Un contacto puede tener prospectos en varios proyectos.

### 15.2 Registro por la landing
1. La persona deja su **nombre**, un **teléfono o correo que se verifica con un código** (el otro dato se pide sin verificar: con el correo verificado el teléfono es obligatorio; con el teléfono verificado el correo es opcional). **Qué canales se verifican lo define cada proyecto** en la pestaña Formulario (`form.verification`): se marca «Verificar con código» en teléfono, correo o ambos (siempre al menos uno; con ambos la persona elige), y para WhatsApp se elige el número y la plantilla aprobada de Meta. El correo usa el mensaje del portal de la cuenta. Mientras el proyecto no defina nada, hereda la verificación del portal de la cuenta, los **datos personales** que el proyecto configuró (catálogo de campos del CRM) y las **preguntas** del proyecto. Todo se valida antes de enviar el código.
2. Al verificarlo queda como **contacto del CRM y como prospecto**. Si ya existe un contacto con ese dato verificado (correo, o teléfono con o sin indicativo) se reutiliza; si hay varios se toma el más antiguo, para que repetir el registro dé siempre lo mismo. Los datos personales solo llenan campos vacíos de un contacto existente. El teléfono sin verificar no se guarda en el contacto si ya es de otro.
3. Si el proyecto dejó de recibir registros entre el envío del código y su verificación, no se guarda nada (`closed`). Quien ya estaba registrado recibe `existing`.
4. Un código de proyecto no sirve para otro proyecto ni para el portal, y viceversa.
5. **Por pantallas.** El registro es un asistente con barra de progreso: la primera pantalla (perfil, nombre, teléfono y correo) es fija; las siguientes agrupan los datos personales y las preguntas según `form.layout` (`steps[].items` con `field:<clave>` o `question:<id>`). Sin diseño (`null`) se organizan solas: identificación, ubicación y otros datos (hasta 5 por pantalla) y las preguntas de a 4. El diseño se reconcilia siempre con el formulario vigente (`form-layout.ts`): lo que ya no existe se descarta y lo nuevo va al final, así ningún campo se pierde ni se repite. Cada pantalla se valida al continuar; el consentimiento y el envío del código van en la última. Lo escrito se conserva en la pestaña (sessionStorage) hasta terminar.
6. **Organizar con IA.** En la pestaña Formulario, «Organizar con IA» envía a OpenRouter (modelo predeterminado de la cuenta) solo los textos y tipos de los campos y propone pantallas con títulos; la propuesta se revisa, se ajusta a mano y se publica al guardar. Cobra los tokens con la tarifa de IA (`form_ai`). Si la IA falla no cambia nada. Las preguntas nuevas reciben su id en el navegador para que el diseño pueda referirse a ellas antes de guardar.

### 15.3 Sesiones
- **Landing de un proyecto:** tras registrarse, o con «Ingresar» (código al teléfono o correo registrados), la persona queda con una sesión **solo para esa landing** (`recruit-project`, ligada al proyecto). Puede tener sesiones en varias landings. Ve su estado y la fecha de registro, nunca el motivo de un rechazo. La sesión deja de valer si el proyecto se pausa o termina, o se elimina el prospecto.
- **Portal principal de la cuenta:** un contacto registrado en algún proyecto entra con un código y ve **todos sus proyectos y el estado de cada uno**. Sin perfil operativo no accede a datos, documentos, contratos ni saldo (403).
- Pedir un código responde igual exista o no el registro.

### 15.4 Perfiles, estados, calificación e historial
- **Perfil por proyecto** (`project_prospects.role`): participante, encuestador o moderador; uno por persona en cada proyecto. El proyecto define los perfiles que acepta (`roles`), con cuál entra quien se registra (`defaultRole`) y si se puede postular como moderador desde el registro (`moderatorSignup`). Si el registro ofrece más de un perfil, la persona elige «¿Cómo quieres participar?». Los moderadores entran como «Nuevo» y el equipo los aprueba pasándolos a «Seleccionado»; también se asignan cambiando el perfil de una persona o desde un chat.
- **Estados** (`prospect-states.ts`): un solo catálogo fijo de 8 estados para todos los perfiles: Nuevo, En contacto, En evaluación, En lista de espera, Seleccionado, Participó, No seleccionado y No participó. El perfil dice qué hace la persona; el estado, en qué punto va. El equipo puede mover a la persona a cualquier estado (también para corregir); «No seleccionado» y «No participó» admiten un motivo interno. Cambiar de perfil vuelve a «Nuevo». La calidad (p. ej. una participación anulada) se registra con la calificación y su nota, no con estados. La persona ve solo una versión pública (Recibido, En proceso, Seleccionado, No seleccionado, Finalizado). La migración `012-simple-prospect-states` convirtió los estados del modelo anterior por perfil.
- **Historial** (`prospect_status_events`): cada entrada, cambio de estado y de perfil, con quién, cuándo y motivo. Se borra con el prospecto.
- **Calificación**: una por proyecto, de 1 a 5 con nota, la pone el equipo. En la cuenta se calculan el promedio, las participaciones (proyectos donde la persona llegó a «Participó») y la última participación. Se ven en la lista de prospectos y en la ficha del contacto.
- **Campos del contacto**: al activar Reclutamiento se crean estrato socioeconómico, ocupación y nivel educativo (si la cuenta no tiene ya un campo con esa clave). Quedan disponibles en los datos personales del formulario.
- La migración `011-prospect-roles` amplía `status` a 20 caracteres (con ALTER TYPE: la sincronización de TypeORM borra y recrea una columna al cambiar su largo), convierte los estados anteriores al embudo de participante y crea los campos en las cuentas con Reclutamiento activo.

### 15.4.1 Acciones de proyecto en los flujos de conversación
Con Reclutamiento activo, el nodo Acción ofrece **Agregar a proyecto** (proyecto, perfil opcional, estado de entrada; por defecto «Nuevo») y **Cambiar estado en proyecto** (proyecto y estado). Actúan sobre el contacto de la conversación y las aplica `ProjectProspectsService.applyFlowActions` desde `ChatsService.applyFlowResult`, después de las actualizaciones del contacto.
- Nunca detienen el flujo: lo que no se puede hacer se omite. Cada resultado (hecho u omitido, con el motivo) queda como nota interna en la conversación.
- Agregar no duplica (si ya está, no cambia nada), no admite proyectos terminados ni perfiles que el proyecto no acepta. Cambiar estado solo actúa si el contacto ya está en el proyecto.
- Se registran en el historial del prospecto con origen «flujo» (`prospect_status_events.via`) y en la auditoría como acciones del sistema.
- Al guardar el flujo, un proyecto que no es de la cuenta se descarta y la acción queda vacía. En el editor solo las ve owner/admin con el módulo activo.
- **Guardar respuestas en proyecto** (`set_project_answers`): valores (con {{variables}}) para preguntas del formulario del proyecto (`question:<id>`, se guardan en las respuestas del prospecto) y para sus datos personales (`field:<clave>`, se guardan en el contacto). Solo si el contacto ya está en el proyecto. Cada valor se valida como en el registro (`answerFromText`): las opciones se reconocen sin mayúsculas ni tildes, «sí/no», números con coma y fechas dd/mm/aaaa; varias opciones van separadas por coma. Con «Solo si está vacío» no reemplaza lo que ya había. La nota interna dice qué se guardó y qué no, y por qué.

### 15.4.2 Condiciones de proyecto en los flujos
Con Reclutamiento activo, el nodo Condición (y la audiencia de los disparadores, que usa las mismas reglas) ofrece: **¿Está en el proyecto?** (Sí está / No está), **Estado en el proyecto** y **Perfil en el proyecto** (es / no es uno o varios). Si el contacto no está en el proyecto, «es» no se cumple y «no es» sí.
- Los proyectos del contacto se cargan al armar el contexto del flujo (`ProjectProspectsService.flowMemberships`, una consulta que también verifica el módulo).
- Una acción de proyecto del mismo turno se refleja ya en las condiciones siguientes. Si al aplicarla algo no se puede hacer, la nota de la conversación lo dice. Tras «Agregar a proyecto» sin perfil elegido, «Perfil en el proyecto» no se conoce hasta el turno siguiente.

### 15.4.3 Proyectos en el nodo «Generación IA»
El nodo Generación IA (genérico de flujos: genera un texto o datos con tipo a partir de instrucciones, mensajes recientes, variables y campos del CRM) puede incluir **Proyectos del contacto**: nombre, estado y perfil legibles de cada proyecto en que está. Usa las mismas membresías del contexto (incluidas las acciones del mismo turno) y los nombres se leen con `ProjectProspectsService.projectNames`, que ignora ids de otra cuenta. La opción solo se muestra con Reclutamiento activo.

### 15.5 Vínculo con contactos
Automático al registrarse. «Buscar coincidencias» y el vínculo manual quedan para los prospectos anteriores a este modelo, que no tienen contacto, y para corregir un contacto duplicado. La ficha del contacto lista sus proyectos.

### 15.6 API (owner/admin con el módulo `reclutamiento`)
`/reclutamiento/:tenantId/projects`: `GET`, `POST`, `GET|PATCH|DELETE :id`, `POST :id/{activate|pause|resume|end}`, `GET|PUT :id/public…` (ajustes, landing, imágenes, formulario), `GET :id/prospects` (filtros `status`, `linked`, `search`), `PUT :id/prospects/:pid/status`, `POST :id/prospects/auto-link`, `GET :id/prospects/:pid/candidates`, `PUT|DELETE :id/prospects/:pid/link`, `DELETE :id/prospects/:pid`, `GET by-record/:recordId`.
Público: `GET recruit-portal/:cuenta/projects/:proyecto`, `POST …/register/{request|verify}`, `POST …/login/{request|verify}`, `GET …/me` (con la sesión de la landing); `GET recruit-portal/:cuenta/me` (con la sesión del portal).

### 15.7 Retirado hasta la etapa de estudios
Cuenta cliente y acuerdo (tarifa, vigencia, acceso a datos), miembros y su aprobación, estudios del cliente, lotes, asignaciones, trabajo de campo desde el portal, revisión de respuestas, causación en el libro de pagos y reporte de facturación. El módulo Estudios y su indicador `estudios` quedan sin pantallas. El código del lado de Encuestas que distingue una encuesta de estudio (`clientStudyId`) se conserva sin uso para esa etapa.
La migración `010-drop-legacy-projects` elimina las tablas del modelo anterior; **ejecutarla antes de iniciar la aplicación** con este código.

