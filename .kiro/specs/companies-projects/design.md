# Diseño — Módulos de Empresas y Proyectos

## Visión general

Se añaden dos entidades nuevas al CRM (`Company`, `Project`) y se generaliza el timeline de actividad para que soporte más de un tipo de entidad. Ambos módulos quedan detrás de feature flags por tenant, de forma que los tenants existentes y los B2C puros no se ven afectados.

El diseño reutiliza los patrones ya establecidos en el módulo `records`:
- Entidad TypeORM con `tenantId` + `@ManyToOne(() => Tenant)` y `onDelete: 'CASCADE'`.
- Módulo NestJS = entidad(es) + service + controller(es) + `TypeOrmModule.forFeature`.
- `customData` jsonb y `tags` para extensibilidad sin migraciones disruptivas.
- Índices compuestos por `tenantId`.

## Arquitectura

```
Tenant (features flag)
  │
  ├── Company (opcional, flag `companies`)
  │     └── 1..N Contactos (ClientRecord.companyId)
  │
  └── Project (opcional, flag `projects`)
        ├── N..1 Contacto cliente  (clientId, requerido)
        ├── N..1 Company           (companyId, opcional)
        └── N..1 owner (User)      (ownerId, opcional)

Activity (generalizada)
  entityType: 'contact' | 'company' | 'project'
  entityId:   uuid
```

### Decisiones de diseño

1. **Feature flags en `Tenant.features` (jsonb).** Se sigue el patrón existente (`tableConfig`, `trackingConfig`). Evita columnas booleanas nuevas y migraciones pesadas; default ausente = apagado. Flags independientes: `companies`, `projects`.

2. **Guard de módulo.** Un `ModuleFeatureGuard` parametrizable (vía decorator `@RequiresFeature('projects')`) lee el tenant del request y responde 403 si el flag está apagado. Reutiliza el patrón de guards de `auth/`.

3. **`companyId` en el contacto, no reemplazo inmediato de `company` string.** Se añade `companyId` nullable y se conserva `company` string durante la transición (Req 4). La migración de datos es un paso aparte y opcional por tenant.

4. **Proyecto como contenedor simple pero extensible.** Campos mínimos ahora; `customData` jsonb presente desde el día 1 para presupuesto/fechas/tareas futuras sin cambio de esquema disruptivo.

5. **Estados de proyecto configurables por tenant.** La lista de estados vive en `tenant.tableConfig` (o `features.projects` como objeto). El default se aplica en el service si el tenant no lo personaliza. El `status` del proyecto es un `varchar` validado contra esa lista.

6. **Activity generalizada con compatibilidad hacia atrás.** Se añaden `entityType` y `entityId`. Se migra `recordId` existente a `entityId` con `entityType='contact'`. Se mantiene `recordId` como columna leída durante la transición para no romper queries actuales.

## Componentes e interfaces

### Entidad `Company` (tabla `companies`)

| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid PK | |
| tenantId | uuid | FK Tenant, cascade |
| name | varchar | requerido |
| documentType | varchar null | NIT/RUT/etc. |
| documentNumber | varchar null | |
| industry | varchar null | |
| website | varchar null | |
| phone | varchar null | |
| email | varchar null | |
| address | varchar null | |
| city | varchar null | |
| region | varchar null | |
| ownerId | uuid null | agente responsable |
| tags | jsonb null | |
| customData | jsonb null | extensible |
| notes | text null | |
| deletedAt | timestamp null | soft delete |
| createdAt / updatedAt | timestamp | |

Índices: `(tenantId)`, `(tenantId, name)`, `(tenantId, documentNumber)`.

### Entidad `Project` (tabla `projects`)

| Campo | Tipo | Notas |
|-------|------|-------|
| id | uuid PK | |
| tenantId | uuid | FK Tenant, cascade |
| name | varchar | requerido |
| clientId | uuid | FK ClientRecord, requerido (cliente) |
| companyId | uuid null | FK Company, opcional |
| ownerId | uuid null | usuario/agente responsable |
| status | varchar | default `propuesta`, validado contra lista del tenant |
| tags | jsonb null | |
| customData | jsonb null | extensible (presupuesto/fechas/tareas futuros) |
| notes | text null | |
| deletedAt | timestamp null | soft delete |
| createdAt / updatedAt | timestamp | |

Índices: `(tenantId)`, `(tenantId, status)`, `(tenantId, clientId)`, `(tenantId, companyId)`, `(tenantId, ownerId)`.

Relación con contacto: `@ManyToOne(() => ClientRecord, { onDelete: 'CASCADE' })` sobre `clientId`.
Relación con empresa: `@ManyToOne(() => Company, { onDelete: 'SET NULL' })` sobre `companyId`.

### Cambios en `ClientRecord`

- Añadir `companyId: uuid null` + `@ManyToOne(() => Company, { onDelete: 'SET NULL' })`.
- Conservar `company: string` (Req 4.1).
- Índice `(tenantId, companyId)`.

Al eliminar una empresa (Req 3.5): `SET NULL` sobre `companyId` de los contactos — se desvinculan sin borrarse.

### Cambios en `Tenant`

```ts
@Column({ name: 'features', type: 'jsonb', nullable: true })
features: {
  companies?: boolean;
  projects?: boolean;
  projectStatuses?: string[]; // ciclo configurable; default aplicado en service
} | null;
```

Endpoint para que super-admin actualice `features` (reutiliza `account.controller` / super-admin guard existente).

### Generalización de `Activity`

- Añadir `entityType: varchar` ('contact' | 'company' | 'project') y `entityId: uuid`.
- Migración: copiar `recordId` → `entityId`, fijar `entityType='contact'`.
- Mantener `recordId` nullable durante transición; nuevas escrituras usan `entityType/entityId`.
- Índice `(tenantId, entityType, entityId)`.

### Guard de feature

```ts
@RequiresFeature('projects')      // decorator que setea metadata
// ModuleFeatureGuard lee tenant.features[flag]; si falsy -> ForbiddenException
```

### Módulos NestJS

- `CompaniesModule`: `Company`, `CompaniesService`, `CompaniesController` (+ API controller si aplica el patrón `api-*`).
- `ProjectsModule`: `Project`, `ProjectsService`, `ProjectsController`.
- Ambos importan `TypeOrmModule.forFeature([...])` y el repositorio de `Activity` (o un `ActivityService` compartido extraído de `records`).

### Endpoints (resumen)

```
# Empresas (guard: companies)
GET    /companies
POST   /companies
GET    /companies/:id
PATCH  /companies/:id
DELETE /companies/:id
GET    /companies/:id/contacts
GET    /companies/:id/activities

# Proyectos (guard: projects)
GET    /projects
POST   /projects
GET    /projects/:id
PATCH  /projects/:id
DELETE /projects/:id
GET    /projects/:id/activities

# Tenant features (super-admin)
PATCH  /tenants/:id/features
```

## Modelo de datos (migraciones)

1. `features` jsonb en `tenants`.
2. tabla `companies`.
3. tabla `projects`.
4. `company_id` + índice en `clients`.
5. `entity_type` + `entity_id` + índice en `activities`; backfill desde `record_id`.
6. (opcional, por tenant) migración de datos `company` string → `companies` + `clients.company_id`.

## Manejo de errores

- Flag apagado → 403 (`ForbiddenException`) vía guard.
- Crear proyecto sin `clientId` o `name` → 400 validación DTO.
- `status` fuera de la lista del tenant → 400.
- Vincular contacto/empresa de otro tenant → 404/403 (validar `tenantId` en el service).
- Eliminar empresa con contactos → `SET NULL`, nunca cascada destructiva sobre contactos.

## Estrategia de pruebas

- Unit tests de services: aislamiento por tenant, validación de estado contra lista del tenant, desvinculación en delete de empresa.
- Guard: 403 con flag apagado, passthrough con flag activo.
- Migración de `activities`: verificar backfill `recordId`→`entityId` y que el timeline de contactos existente sigue devolviendo lo mismo.
- Frontend: render condicionado por flags; uso de `ConfirmModal` en acciones destructivas.

## Impacto en frontend

- Lectura de `features` del tenant (ya se carga el tenant en sesión) para condicionar navegación y rutas de Empresas/Proyectos.
- Vistas: listado + detalle de Empresas, listado + detalle de Proyectos.
- Detalle de contacto: mostrar empresa vinculada y proyectos (solo si flags activos).
- Acciones destructivas (eliminar empresa/proyecto, desvincular) → `@/components/ConfirmModal` con `variant="danger"`. Nunca `confirm()/alert()/prompt()`.
