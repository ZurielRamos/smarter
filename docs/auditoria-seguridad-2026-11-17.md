# Auditoría de seguridad del backend (2026-11-17)

Alcance: 56 controladores y 518 rutas de `backend/src`. Es una revisión del código y de comportamientos probados en vivo. No es una prueba de penetración sobre el despliegue real.

**Nivel de evidencia** de cada hallazgo:
- **[vivo]** Reproducido ejecutando el código contra un Postgres desechable.
- **[código]** Leí controlador y servicio y la ruta es explotable tal como está escrita.
- **[informe]** Lo reportó una revisión en paralelo y no lo releí línea por línea. Tratar como alta probabilidad, no como confirmado.

## Estado de las correcciones

**Fase A aplicada (2026-11-17).** Verificada con 97 comprobaciones HTTP sobre un Postgres desechable (guards reales; solo el login y el correo simulados). `tsc` y `jest` (69) pasan.

| ID | Qué se hizo |
|---|---|
| K1 | `bots`, `templates`, `email-templates` y `upload` exigen sesión. Nuevo `TenantResourceGuard` (`auth/tenant-resource.guard.ts`): el tenant se toma de la **fila** del recurso (bot, conocimiento, herramienta, plantilla, plantilla de email, mapeo) y el usuario debe pertenecer; si no, 404. Las rutas de listar y crear exigen `tenantId` (400 si falta, 403 si no es suyo, 400 si llega inconsistente). `viewer` es de solo lectura. Las conversaciones de las rutas `flow/*` deben ser de la cuenta del bot. `PUT` de bots y herramientas ignora `id`, `tenantId` y `botId`. `setDefault` de mapeos usa el tenant de la propia plantilla. Subida de conocimiento limitada a 10 MB. |
| K2 | `PUT/PATCH /account/:slug` solo acepta `name`, `slug` (validado y único) y `trackingConfig`. `id`, `isActive`, `isDev`, `maxAgents`, `features` y `tableConfig` se ignoran. |
| K3 | Las tres rutas de miembros devuelven al usuario sin `apiToken`, `password`, `notificationPreferences` ni `tenantRoles` (sus otras cuentas). |
| K4 | Los roles asignables desde `account` son admin, agent y viewer; no se puede asignar, degradar ni quitar al propietario; el correo, el nombre y la contraseña (8 a 128) se validan al crear miembros. |
| A1 | `JwtStrategy` rechaza tokens con `purpose` (invitación, reseteo, portales). |
| A5 (parcial) | Invitar y reenviar invitaciones exige ser admin de la cuenta. |

**No se hizo en la Fase A y queda abierto:**
- Que el enlace de configuración de contraseña valga una sola vez: el mismo endpoint (`setup-password`) sirve al flujo «olvidé mi contraseña», así que no se puede condicionar a `needsPasswordSetup`. Requiere un identificador de uso único (`jti`) guardado.
- `POST /bots/tools/:toolId/test` y las herramientas con webhook siguen haciendo peticiones desde el servidor a la URL configurada (SSRF), ahora solo para usuarios autenticados de la propia cuenta. Se cierra con `safe-fetch` en la Fase D.
- Un administrador puede promover a otro miembro a admin y modificar a otros admins (solo el propietario está protegido).
- Fases B, C y D completas (K5 a K10, A2 a A4, A6 a A8).

## Causa raíz

1. **No hay guard global de autenticación.** El único `APP_GUARD` es `ThrottlerGuard`. Cada controlador debe declarar `JwtAuthGuard`, y varios no lo hacen.
2. **`TenantAccessGuard` solo valida lo que el cliente declara.** Mira `params.tenantId`, `query.tenantId` o `body.tenantId` (en ese orden) y **deja pasar si no hay ninguno**. Casi todas las rutas con `:id` carecen de `tenantId`, así que no se comprueba nada. Tampoco mira el rol.
3. **No hay `ValidationPipe`.** Los DTO son clases sin decoradores, así que un `Object.assign(entity, body)` acepta cualquier campo (`tenantId`, `id`, `isActive`...). Activar un `ValidationPipe` con `whitelist` ahora mismo **borraría todos los campos** de esos DTO; hay que usar listas blancas por servicio.
4. **Los webhooks no autentican al emisor** en varios casos.

Referencia del patrón correcto en el repo: `surveys/survey-access.guard.ts` (Fase 0) y `conversation-flows` (filtra por `{id, tenantId}` en el servicio).

## Hallazgos críticos

| ID | Hallazgo | Quién lo explota | Evidencia |
|---|---|---|---|
| K1 | **`bots`, `templates`, `email-templates` y `upload` no tienen ninguna autenticación** (45 rutas). Se pueden listar, leer, crear, modificar y borrar bots, plantillas y mapeos de cualquier cuenta. `POST /bots/:id/chat` gasta saldo de IA. `POST /bots/tools/:toolId/test` y las herramientas con webhook hacen peticiones desde el servidor a cualquier URL (SSRF). | Cualquiera, sin cuenta | código |
| K2 | **`PUT /account/:slug` permite sobrescribir otra cuenta.** `TenantsService.update` hace `Object.assign(tenant, dto)` y `save`. Enviando `{"id": "<víctima>", "slug": "nuevo", "name": ...}` se modifica y desactiva la cuenta de la víctima. También permite subirse `maxAgents` y activar módulos (`features`). | Admin de cualquier cuenta | **vivo** |
| K3 | **`GET /tenants/:tenantId/members` y `GET /account/:slug/members` devuelven el `apiToken` de todos los miembros**, incluido el owner. Ese token autentica toda la API `v1/*` como ese usuario, no caduca y se guarda en claro. | Cualquier miembro, incluso `viewer` | **vivo** |
| K4 | **Escalada a owner**: `POST /account/:slug/members` acepta cualquier `role` y cualquier `userId`. Un admin puede ascenderse a owner, degradar al owner o borrarlo (`DELETE .../members/:userId`), y crear usuarios con contraseña propia. | Admin | código |
| K5 | **Módulo `conversions` sin `TenantAccessGuard` y sin filtro por tenant**: `GET /conversions/platforms?tenantId=` devuelve los tokens de Meta, Google y TikTok de la cuenta indicada; `PUT/DELETE` por id sin tenant; `POST /conversions/dispatch` envía conversiones al pixel de la víctima. Igual en `woo-hooks` y `contact-events`. | Cualquier usuario autenticado | código |
| K6 | **Records (contactos)**: `GET/PUT/DELETE /records/:id`, notas, actividades y todas las acciones masivas por `ids` (`PUT/DELETE bulk`, `bulk/restore`, `bulk/permanent`) no filtran por tenant. `GET /records` sin `tenantId` lista contactos de **todas** las cuentas (`if (tenantId) qb.where(...)`). Borrado definitivo de contactos ajenos con solo conocer UUIDs. | Cualquier usuario autenticado | código |
| K7 | **Chats / inboxes**: `GET chats/inboxes/:id` devuelve el `accessToken` del canal (WhatsApp/Meta); `PUT`/`DELETE` sobre inboxes y labels sin tenant; todas las rutas `whatsapp/*` reciben `inboxId` sin comprobarlo. Con eso se leen tokens, se editan plantillas y perfil de WhatsApp, o se borra el canal de otra cuenta. `evolution/*` igual. | Cualquier usuario autenticado | código |
| K8 | **Webhooks sin firma**: `POST /webhooks/meta` no verifica `X-Hub-Signature-256` (inyecta mensajes y dispara bots y automatizaciones). `POST /webhooks/evolution/:inboxId` y `POST /webhooks/sendpulse/:inboxId` no tienen secreto: basta conocer un `inboxId`. La validación de firma de WhatsApp Flows es **omitible** (si falta la cabecera, no se valida). Mailgun omite la firma si falta la clave. | Anónimo | código |
| K9 | **OAuth de Google y Meta Ads**: el `state` es el `tenantId` en claro y `callback` es público. Un atacante puede vincular **su** cuenta publicitaria al tenant de la víctima y recibir sus eventos de conversión. `select-account`/`select-pixel` son GET públicos que cambian la cuenta publicitaria por `platformId`. | Anónimo | código |
| K10 | **Cursos (57 rutas), campañas, teams, forms, flows de WhatsApp, record-lists, custom-fields, webhooks de usuario, SendPulse bridge**: todas las rutas `:id` buscan por id sin tenant. Destacan `POST campaigns/:id/send` (envía con el canal y el saldo de otra cuenta) y `PUT user-webhooks/:id` (cambia la `url` y exfiltra los contactos de la víctima). | Cualquier usuario autenticado | código / informe |

## Hallazgos altos

| ID | Hallazgo | Evidencia |
|---|---|---|
| A1 | Los tokens de invitación (`password-setup`) y de reseteo valen como **sesión completa**: `JwtStrategy` no comprueba `purpose` y usan el mismo secreto. El de setup dura 48 h y es reutilizable. | código |
| A2 | `POST /auth/google` acepta cualquier access token de Google sin verificar `aud` (un sitio ajeno con "Iniciar con Google" puede iniciar sesión como un usuario existente). | código |
| A3 | `POST /t/:slug/verify` (público) hace `fetch(body.url)` sin validar: **SSRF anónimo** con oráculo de respuesta. Existe `automatizaciones/utils/safe-fetch.util.ts` y no se usa aquí ni en las herramientas de bots. | código |
| A4 | `api-contact-events.controller.ts` no valida pertenencia al tenant del `:slug` (único de los 8 `api-*` que falla): cualquier API token crea y lee eventos en cualquier cuenta. | informe |
| A5 | `invite-agent.controller.ts`: un `viewer` puede invitar usuarios como `admin` (y ese admin usa K4). `channel-configs`: cualquier miembro lee y reescribe credenciales de canales; `GET/PUT/DELETE :id` por id sin tenant. | código |
| A6 | `JWT_SECRET` tiene un valor por defecto público (`stratecast-super-secret-key`) en 5 lugares; si falta la variable en un entorno se pueden forjar sesiones. Los tokens de baja de email y el cifrado de WhatsApp Flows derivan de `'default-secret'`. En `.env` local sí está definida. | código |
| A7 | Tokens de baja de email: AES-256-CBC **sin autenticación** (maleable, posible oráculo de relleno) y el email se inserta sin escapar en HTML (XSS). | código |
| A8 | Pixel de seguimiento: el `pixelToken` va embebido en `pixel.js` (público), así que cualquiera inyecta eventos falsos de conversión en cualquier cuenta. | informe |

## Medios y bajos (resumen)

- Notificaciones: `?userId=` viene de la query, no de la sesión (cualquiera lee y marca como leídas las de otro). [código]
- `email-config/inbox/:inboxId`: IDOR; permite reconfigurar el remitente de otra cuenta. [informe]
- ETL: `jobs/:id`, `jobs/:id/errors` (con filas de PII), `cancel`, `templates/:id`, sin tenant. [informe]
- Chat widget público: el `visitorId` lo elige el cliente y no se comprueba al escribir en una conversación; `avatar/:inboxId` sin límite de tamaño ni tipo (subida de HTML/SVG). [informe]
- 12 `FileInterceptor` sin `limits` (memoria). [código]
- Login: enumeración de usuarios por mensajes ("Usuario desactivado", "El correo X no está registrado") y por tiempo; límite solo por IP. [código]
- CORS con `origin: true` y `credentials: true`. Hoy no se explota porque la sesión va en cabecera, no en cookie. [código]
- `GET /webhooks/meta`: si falta `META_WEBHOOK_VERIFY_TOKEN`, una petición sin token lo satisface. [código]
- Tokens de OAuth y API tokens guardados en claro en base de datos. [código]

## Descartado tras verificar

- **`find({ where: { x: undefined } })` ya no lista todo**: TypeORM 1.x lanza error ("Undefined value encountered..."). Rutas como `GET /channel-configs` sin `tenantId` devuelven 500, no datos de otras cuentas. Los listados que sí fugan usan condiciones opcionales (`if (tenantId) qb.where(...)`), como `GET /records`, `GET /campaigns` y `GET /etl/templates`.
- **Un token del portal de Cursos no se acepta como sesión**: no tiene `sub`, y la búsqueda de usuario lanza error en vez de resolver a otro. Solo produce un 500 en lugar de un 401.
- **Inyección SQL**: no encontré `.query()` con interpolación. Los filtros dinámicos de `records` usan columnas de una lista blanca (`SYSTEM_COLUMNS`) y claves JSON validadas (`sql-safe.ts`). No revisé exhaustivamente cada condición.
- **Archivos sensibles en git**: no hay `.env` real versionado ni en el historial; los `.env*` rastreados solo traen nombres y valores vacíos. `backend/.env.example` (sin rastrear) sí tiene credenciales reales y **no está ignorado**.

## Lo que está bien

- `users`, `providers` y `audit`: `SuperAdminGuard` a nivel de clase. `tenants.controller`: todas sus rutas de escritura son de superadmin.
- `conversation-flows`: filtra por `{id, tenantId}` en el servicio. Es el mejor ejemplo del repo.
- Conversaciones (`chats/conversations/:id/*`): cubiertas por `ConversationAccessGuard`.
- Siete de los ocho `api-*.controller` validan tenant y rol.
- Firebase: verificación completa (firma, `iss`, `aud`, `exp`, `email_verified`) y no crea cuentas.
- Reseteo de contraseña móvil: código de 6 dígitos con intentos limitados y token de un solo uso.
- Firma de Flows y Mailgun: HMAC correcto cuando se ejecuta.

## Plan de corrección propuesto

Cada fase se puede entregar y verificar sola. Marco lo que **cambia comportamiento** o requiere coordinación.

**Fase A: cierre inmediato (K1, K2, K3, K4, A1).** Sin cambios de interfaz.
- Añadir `JwtAuthGuard` y acceso por tenant a `bots`, `templates`, `email-templates` y `upload`.
- Lista blanca en `TenantsService.update` (solo `name`, `iconPath` para admins; el resto, superadmin) y protección de `id`.
- Excluir `apiToken` de las respuestas de miembros.
- En `account` e `invite-agent`: validar roles permitidos, impedir tocar al owner o asignarse owner y exigir rol admin para invitar.
- `JwtStrategy` rechaza tokens con `purpose`.

**Fase B: aislamiento por tenant (K5, K6, K7, K10, A5).** Guard genérico que resuelve el tenant desde la entidad (como `SurveyAccessGuard`) con un decorador por tipo de recurso, más listas blancas de campos en cada `update`. **Cambia comportamiento**: rutas que hoy funcionan entre cuentas dejarán de hacerlo, y el rol `viewer` pasará a solo lectura.

**Fase C: webhooks y OAuth (K8, K9).** **Requiere coordinación externa:**
- Firma de Meta obligatoria: exige que `META_APP_SECRET` esté definido en producción.
- Secreto por inbox para Evolution y SendPulse: hay que reconfigurar la URL del webhook en cada proveedor.
- OAuth con `state` firmado: el inicio pasa a ser una ruta autenticada, así que el frontend debe pedir la URL con su token en vez de navegar directamente.

**Fase D: endurecimiento (A2, A3, A6, A7, A8 y los medios).** `aud` de Google, `safe-fetch` en bots y verificador de pixel, fallar al arrancar si falta `JWT_SECRET`, cifrado autenticado en la baja de email, límites de subida, mensajes de login uniformes.

**Fuera de código:** rotar las credenciales de `backend/.env.example` y moverlas a un gestor de secretos si ya salieron de tu máquina.
