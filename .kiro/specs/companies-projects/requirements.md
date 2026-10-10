# Requisitos — Módulos de Empresas y Proyectos

## Introducción

El CRM actual se centra en una única entidad: el contacto (`ClientRecord`, tabla `clients`), con multi-tenancy, actividades, notas, listas y campos personalizados. Hoy "empresa" solo existe como un campo de texto plano (`company: string`) en el contacto y no hay concepto de proyecto.

Este spec añade dos módulos nuevos — **Empresas** y **Proyectos** — que amplían el CRM de un modelo centrado en persona a un modelo que soporta trabajo B2B y gestión de proyectos por cliente.

Requisito transversal clave: ambos módulos son **opcionales por tenant** mediante feature flags. Un tenant B2C puro no los ve ni puede usarlos; un tenant de agencia los activa según su necesidad. Los tenants existentes no deben verse afectados (default: apagado).

Alcance de esta primera versión: Proyecto es un **contenedor simple** (nombre, cliente, empresa opcional, estado, owner, actividad/notas). Sin presupuesto, fechas ni tareas internas todavía, pero el modelo debe permitir agregarlos luego sin cambios disruptivos.

## Glosario

- **Tenant**: cuenta/organización que usa el CRM (multi-tenancy existente).
- **Contacto**: `ClientRecord`, la persona/cliente actual del CRM.
- **Empresa (Company)**: organización que agrupa a uno o varios contactos.
- **Proyecto (Project)**: contenedor de trabajo asociado a un contacto (cliente) y opcionalmente a una empresa.
- **Feature flag**: toggle en la configuración del tenant que activa/desactiva un módulo.

## Requisitos

### Requisito 1 — Feature flags por tenant

**Historia de usuario:** Como super-admin, quiero activar o desactivar los módulos de Empresas y Proyectos por tenant, para que cada cuenta solo vea las funciones que corresponden a su modelo de negocio.

#### Criterios de aceptación

1. CUANDO se consulta la configuración de un tenant ENTONCES el sistema DEBERÁ exponer flags independientes para `companies` y `projects`.
2. CUANDO un tenant no tiene configurados los flags ENTONCES el sistema DEBERÁ tratarlos como desactivados (`false`).
3. CUANDO un super-admin cambia un flag ENTONCES el sistema DEBERÁ persistir el cambio y aplicarlo en las siguientes peticiones.
4. CUANDO un tenant tiene `projects` activo y `companies` inactivo ENTONCES el sistema DEBERÁ permitir usar Proyectos sin exigir Empresas.
5. CUANDO los flags de un tenant existente no se han tocado ENTONCES el comportamiento del CRM DEBERÁ ser idéntico al actual.

### Requisito 2 — Control de acceso por módulo (backend)

**Historia de usuario:** Como operador del sistema, quiero que los endpoints de Empresas y Proyectos se bloqueen cuando el módulo está apagado para ese tenant, para evitar uso o fuga de datos no autorizados.

#### Criterios de aceptación

1. CUANDO se llama a un endpoint de Empresas y el flag `companies` del tenant está apagado ENTONCES el sistema DEBERÁ responder 403.
2. CUANDO se llama a un endpoint de Proyectos y el flag `projects` del tenant está apagado ENTONCES el sistema DEBERÁ responder 403.
3. CUANDO el flag correspondiente está activo ENTONCES el sistema DEBERÁ permitir la operación respetando el aislamiento por `tenantId`.
4. CUANDO cualquier operación de Empresas o Proyectos se ejecuta ENTONCES el sistema DEBERÁ aislar los datos por `tenantId` igual que el resto del CRM.

### Requisito 3 — Gestión de Empresas

**Historia de usuario:** Como agente de un tenant B2B, quiero crear y administrar empresas y vincularles contactos, para organizar mis clientes por organización.

#### Criterios de aceptación

1. CUANDO creo una empresa ENTONCES el sistema DEBERÁ guardar al menos nombre y asociarla al `tenantId` actual.
2. CUANDO edito, listo, consulto o elimino una empresa ENTONCES el sistema DEBERÁ ofrecer operaciones CRUD completas con aislamiento por tenant.
3. CUANDO vinculo un contacto a una empresa ENTONCES el sistema DEBERÁ asociar el contacto mediante una referencia (`companyId`) y permitir varios contactos por empresa.
4. CUANDO una empresa tiene datos adicionales ENTONCES el sistema DEBERÁ soportar un campo `customData` (jsonb) y `tags`.
5. CUANDO se elimina una empresa que tiene contactos vinculados ENTONCES el sistema DEBERÁ desvincular los contactos sin borrarlos (no cascada destructiva sobre contactos).

### Requisito 4 — Migración del campo `company`

**Historia de usuario:** Como responsable de datos, quiero que los valores existentes del campo de texto `company` puedan convertirse en empresas reales, para no perder información al adoptar el módulo.

#### Criterios de aceptación

1. CUANDO se introduce la entidad Empresa ENTONCES el sistema DEBERÁ conservar el campo `company` string en el contacto durante la transición.
2. CUANDO se ejecuta la migración de datos ENTONCES el sistema DEBERÁ poder crear empresas a partir de valores distintos de `company` por tenant y vincular los contactos correspondientes vía `companyId`.
3. CUANDO un contacto no tiene valor en `company` ENTONCES la migración NO DEBERÁ crear ninguna empresa para él.

### Requisito 5 — Gestión de Proyectos

**Historia de usuario:** Como agente de una agencia, quiero crear proyectos asociados a un cliente (contacto) y opcionalmente a una empresa, para seguir el trabajo que hacemos por cada cliente.

#### Criterios de aceptación

1. CUANDO creo un proyecto ENTONCES el sistema DEBERÁ requerir nombre y un contacto cliente asociado, y asociarlo al `tenantId` actual.
2. CUANDO creo o edito un proyecto ENTONCES el sistema DEBERÁ permitir asociar opcionalmente una empresa (`companyId` nullable).
3. CUANDO edito, listo, consulto o elimino un proyecto ENTONCES el sistema DEBERÁ ofrecer operaciones CRUD completas con aislamiento por tenant.
4. CUANDO asigno un responsable a un proyecto ENTONCES el sistema DEBERÁ permitir un `ownerId` (usuario/agente).
5. CUANDO un proyecto tiene datos adicionales ENTONCES el sistema DEBERÁ soportar `customData` (jsonb) y `notes`, para permitir ampliar campos (presupuesto, fechas, tareas) sin cambio de esquema disruptivo.

### Requisito 6 — Ciclo de estados de proyecto configurable

**Historia de usuario:** Como administrador de un tenant, quiero definir el ciclo de estados por el que pasan los proyectos, para adaptarlo a mi forma de trabajar.

#### Criterios de aceptación

1. CUANDO se crea un proyecto sin estado explícito ENTONCES el sistema DEBERÁ asignar un estado inicial por defecto.
2. CUANDO el tenant no ha personalizado los estados ENTONCES el sistema DEBERÁ ofrecer un ciclo por defecto (p. ej. propuesta → en curso → entregado → cerrado).
3. CUANDO el tenant personaliza la lista de estados ENTONCES el sistema DEBERÁ usar esa lista para validar el estado de los proyectos de ese tenant.
4. CUANDO cambia el estado de un proyecto ENTONCES el sistema DEBERÁ registrar el cambio en el timeline de actividad del proyecto.

### Requisito 7 — Timeline de actividad de Empresas y Proyectos

**Historia de usuario:** Como agente, quiero ver el historial de actividad de una empresa o un proyecto, igual que lo veo en un contacto, para tener trazabilidad.

#### Criterios de aceptación

1. CUANDO ocurre un evento relevante en un proyecto o empresa (creación, cambio de estado, nota) ENTONCES el sistema DEBERÁ registrar una actividad asociada a esa entidad.
2. CUANDO consulto una empresa o proyecto ENTONCES el sistema DEBERÁ devolver su timeline de actividades.
3. CUANDO se generaliza el registro de actividad ENTONCES el sistema NO DEBERÁ romper el timeline existente de contactos.

### Requisito 8 — Interfaz condicionada por flags (frontend)

**Historia de usuario:** Como usuario de un tenant, quiero ver en el menú solo los módulos que mi tenant tiene activos, para no toparme con funciones que no me aplican.

#### Criterios de aceptación

1. CUANDO el flag `companies` está activo ENTONCES el frontend DEBERÁ mostrar la navegación y vistas de Empresas; si está inactivo, NO DEBERÁ mostrarlas.
2. CUANDO el flag `projects` está activo ENTONCES el frontend DEBERÁ mostrar la navegación y vistas de Proyectos; si está inactivo, NO DEBERÁ mostrarlas.
3. CUANDO el detalle de un contacto se abre en un tenant con los módulos activos ENTONCES el frontend DEBERÁ mostrar la empresa vinculada y los proyectos del contacto.
4. CUANDO una acción destructiva se dispara desde la UI (p. ej. eliminar empresa o proyecto) ENTONCES el frontend DEBERÁ usar el componente `ConfirmModal` y nunca los diálogos nativos del navegador.
