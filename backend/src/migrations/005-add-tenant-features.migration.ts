import { DataSource } from 'typeorm';

/**
 * Migración: Agregar feature flags por tenant.
 *
 * Agrega:
 * - tenants.features (JSONB) para activar módulos opcionales del CRM
 *   (companies, projects) y configurar el ciclo de estados de proyecto.
 *
 * Default NULL = módulos apagados. No afecta a tenants existentes.
 */
export async function addTenantFeatures(dataSource: DataSource): Promise<void> {
  const queryRunner = dataSource.createQueryRunner();

  try {
    await queryRunner.startTransaction();

    await queryRunner.query(`
      ALTER TABLE tenants
        ADD COLUMN IF NOT EXISTS features jsonb DEFAULT NULL
    `);
    console.log('[Migration] Columna features agregada a tenants');

    await queryRunner.commitTransaction();
    console.log('[Migration] ✓ Migración 005 completada exitosamente');
  } catch (error) {
    await queryRunner.rollbackTransaction();
    console.error('[Migration] ✗ Error, se hizo rollback:', error);
    throw error;
  } finally {
    await queryRunner.release();
  }
}
