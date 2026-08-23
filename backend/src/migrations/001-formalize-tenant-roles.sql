-- ============================================================
-- Migración: Formalización de roles de tenant
-- Fecha: 2026-08-22
-- Descripción: 
--   1. Normaliza valores existentes de role en user_tenants
--   2. Asigna 'owner' al primer admin de cada tenant
--   3. Agrega CHECK constraint para valores válidos
-- ============================================================

BEGIN;

-- Paso 1: Normalizar valores existentes (por si hay datos inconsistentes)
-- Cualquier valor que no sea admin/agent/owner/viewer se convierte en agent
UPDATE user_tenants
SET role = 'agent'
WHERE role NOT IN ('owner', 'admin', 'agent', 'viewer');

-- Paso 2: Asignar 'owner' al primer admin de cada tenant
-- Se usa la fecha de creación más antigua como criterio
WITH first_admin_per_tenant AS (
  SELECT DISTINCT ON (tenant_id) id
  FROM user_tenants
  WHERE role = 'admin' AND status IN ('active', 'pending')
  ORDER BY tenant_id, created_at ASC
)
UPDATE user_tenants
SET role = 'owner'
WHERE id IN (SELECT id FROM first_admin_per_tenant);

-- Paso 3: Agregar CHECK constraint para validar roles
-- Primero eliminamos si ya existe (idempotente)
ALTER TABLE user_tenants
  DROP CONSTRAINT IF EXISTS chk_user_tenants_role;

ALTER TABLE user_tenants
  ADD CONSTRAINT chk_user_tenants_role
  CHECK (role IN ('owner', 'admin', 'agent', 'viewer'));

-- Paso 4: Actualizar el default de la columna
ALTER TABLE user_tenants
  ALTER COLUMN role SET DEFAULT 'agent';

COMMIT;
