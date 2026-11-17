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
`recruitment_agreements`, `survey_assignments`, aceptación por el cliente, vista del encuestador limitada a lo asignado.

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
| 1 | Flag `encuestas` sin aplicar | `TenantFeature` incluye `encuestas`. El flag es **activo por defecto** (solo `false` lo apaga) porque las cuentas existentes no lo tienen definido; `DEFAULT_ON_FEATURES` e `isFeatureEnabled` en `requires-feature.decorator.ts` deben coincidir con `defaultOn` de `frontend/src/config/modules.ts`. Se aplica en el controlador y en el enlace público. |
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

Cada cuenta con el módulo `reclutamiento` activo tiene un portal público en **`/encuestador/<slug-de-la-cuenta>`**. El encuestador invitado completa los datos que faltan en su ficha, sube sus documentos y firma sus contratos. No hay registro abierto: solo entra quien ya es encuestador de la cuenta (perfil `candidate` o `active`).

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
