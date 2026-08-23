import { DataSource } from 'typeorm';

/**
 * Migración: Formalización de roles de tenant.
 *
 * - Normaliza valores existentes en user_tenants.role
 * - Asigna 'owner' al primer admin (por fecha de creación) de cada tenant
 * - Agrega CHECK constraint para valores válidos: owner | admin | agent | viewer
 *
 * Ejecutar manualmente:
 *   npx ts-node -r tsconfig-paths/register src/migrations/run-migration.ts
 *
 * O usar el SQL directamente:
 *   psql -d supergiros -f src/migrations/001-formalize-tenant-roles.sql
 */
export async function formalizeTenantRoles(dataSource: DataSource): Promise<void> {
  const queryRunner = dataSource.createQueryRunner();

  try {
    await queryRunner.startTransaction();

    // Paso 1: Normalizar valores inconsistentes
    const normalized = await queryRunner.query(`
      UPDATE user_tenants
      SET role = 'agent'
      WHERE role NOT IN ('owner', 'admin', 'agent', 'viewer')
    `);
    console.log(`[Migration] Roles normalizados: ${normalized[1]} filas`);

    // Paso 2: Asignar 'owner' al primer admin de cada tenant
    const promoted = await queryRunner.query(`
      WITH first_admin_per_tenant AS (
        SELECT DISTINCT ON (tenant_id) id
        FROM user_tenants
        WHERE role = 'admin' AND status IN ('active', 'pending')
        ORDER BY tenant_id, created_at ASC
      )
      UPDATE user_tenants
      SET role = 'owner'
      WHERE id IN (SELECT id FROM first_admin_per_tenant)
    `);
    console.log(`[Migration] Owners asignados: ${promoted[1]} tenants`);

    // Paso 3: CHECK constraint
    await queryRunner.query(`
      ALTER TABLE user_tenants
        DROP CONSTRAINT IF EXISTS chk_user_tenants_role
    `);
    await queryRunner.query(`
      ALTER TABLE user_tenants
        ADD CONSTRAINT chk_user_tenants_role
        CHECK (role IN ('owner', 'admin', 'agent', 'viewer'))
    `);
    console.log('[Migration] CHECK constraint agregado');

    // Paso 4: Default
    await queryRunner.query(`
      ALTER TABLE user_tenants
        ALTER COLUMN role SET DEFAULT 'agent'
    `);

    await queryRunner.commitTransaction();
    console.log('[Migration] ✓ Migración completada exitosamente');
  } catch (error) {
    await queryRunner.rollbackTransaction();
    console.error('[Migration] ✗ Error, se hizo rollback:', error);
    throw error;
  } finally {
    await queryRunner.release();
  }
}
