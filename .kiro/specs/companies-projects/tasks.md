# Plan de implementación — Empresas y Proyectos

- [ ] 1. Feature flags por tenant
  - Añadir columna `features` (jsonb) a la entidad `Tenant` con `companies`, `projects`, `projectStatuses`.
  - Crear migración para la columna `features`.
  - Añadir endpoint `PATCH /tenants/:id/features` protegido por super-admin guard.
  - _Requisitos: 1.1, 1.2, 1.3, 1.4, 1.5_

- [ ] 2. Guard de feature por módulo
  - Crear decorator `@RequiresFeature(flag)` y `ModuleFeatureGuard` que lee `tenant.features[flag]` y lanza 403 si está apagado.
  - Pruebas del guard: 403 con flag apagado, passthrough con flag activo.
  - _Requisitos: 2.1, 2.2, 2.3_

- [ ] 3. Entidad y módulo de Empresas
  - [ ] 3.1 Crear entidad `Company` (tabla `companies`) con campos e índices del diseño.
    - _Requisitos: 3.1, 3.4_
  - [ ] 3.2 Crear migración de la tabla `companies`.
    - _Requisitos: 3.1_
  - [ ] 3.3 Implementar `CompaniesService` con CRUD, aislamiento por `tenantId` y validación de pertenencia.
    - _Requisitos: 3.2, 3.3, 2.4_
  - [ ] 3.4 Implementar `CompaniesController` con guard `@RequiresFeature('companies')` y endpoints CRUD + `/:id/contacts` + `/:id/activities`.
    - _Requisitos: 2.1, 3.2, 7.2_
  - [ ] 3.5 Registrar `CompaniesModule` en `app.module`.
    - _Requisitos: 3.2_

- [ ] 4. Vínculo contacto–empresa
  - Añadir `companyId` (nullable, FK `SET NULL`) e índice `(tenantId, companyId)` a `ClientRecord`, conservando `company` string.
  - Crear migración para `company_id` en `clients`.
  - Soportar vincular/desvincular contacto a empresa en el service; delete de empresa hace `SET NULL` sin borrar contactos.
  - _Requisitos: 3.3, 3.5, 4.1_

- [ ] 5. Entidad y módulo de Proyectos
  - [ ] 5.1 Crear entidad `Project` (tabla `projects`) con relaciones a `ClientRecord` (requerida) y `Company` (opcional) e índices del diseño.
    - _Requisitos: 5.1, 5.2, 5.4, 5.5_
  - [ ] 5.2 Crear migración de la tabla `projects`.
    - _Requisitos: 5.1_
  - [ ] 5.3 Implementar `ProjectsService` con CRUD, aislamiento por tenant, validación de `clientId`/`companyId` del mismo tenant.
    - _Requisitos: 5.1, 5.2, 5.3, 2.4_
  - [ ] 5.4 Implementar estado configurable: default del ciclo, lectura de `tenant.features.projectStatuses`, validación del `status`, registro de cambio en timeline.
    - _Requisitos: 6.1, 6.2, 6.3, 6.4_
  - [ ] 5.5 Implementar `ProjectsController` con guard `@RequiresFeature('projects')` y endpoints CRUD + `/:id/activities`.
    - _Requisitos: 2.2, 5.3, 7.2_
  - [ ] 5.6 Registrar `ProjectsModule` en `app.module`.
    - _Requisitos: 5.3_

- [ ] 6. Generalización del timeline de actividad
  - [ ] 6.1 Añadir `entityType` y `entityId` a `Activity` con índice `(tenantId, entityType, entityId)`; mantener `recordId` nullable.
    - _Requisitos: 7.1, 7.3_
  - [ ] 6.2 Migración: backfill `recordId` → `entityId` con `entityType='contact'`.
    - _Requisitos: 7.3_
  - [ ] 6.3 Extraer/compartir la escritura de actividades para contacto, empresa y proyecto (eventos: creación, cambio de estado, nota).
    - _Requisitos: 7.1, 6.4_
  - [ ] 6.4 Verificar que el timeline de contactos existente sigue devolviendo los mismos datos.
    - _Requisitos: 7.3_

- [ ] 7. Migración opcional de datos `company` string → Empresas
  - Script/migración que agrupa valores distintos de `clients.company` por tenant, crea `companies` y vincula `clients.company_id`; no crea empresa si `company` está vacío.
  - _Requisitos: 4.2, 4.3_

- [ ] 8. Frontend — navegación y vistas condicionadas por flags
  - [ ] 8.1 Leer `features` del tenant y condicionar ítems de menú/rutas de Empresas y Proyectos.
    - _Requisitos: 8.1, 8.2_
  - [ ] 8.2 Vistas de Empresas: listado y detalle (con contactos y timeline).
    - _Requisitos: 8.1, 7.2_
  - [ ] 8.3 Vistas de Proyectos: listado y detalle (con cliente, empresa, estado y timeline).
    - _Requisitos: 8.2, 7.2_
  - [ ] 8.4 Detalle de contacto: mostrar empresa vinculada y proyectos cuando los flags están activos.
    - _Requisitos: 8.3_
  - [ ] 8.5 Usar `@/components/ConfirmModal` (variant `danger`) en todas las acciones destructivas; prohibido `confirm/alert/prompt`.
    - _Requisitos: 8.4_
