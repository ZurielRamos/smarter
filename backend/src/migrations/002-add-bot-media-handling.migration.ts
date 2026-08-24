import { DataSource } from 'typeorm';

/**
 * Migración: Agregar columna media_handling a la tabla bots.
 *
 * Permite configurar el comportamiento del bot cuando recibe imágenes, audio o documentos.
 *
 * Ejecutar manualmente:
 *   npx ts-node -r tsconfig-paths/register src/migrations/run-migration.ts
 *
 * O usar el SQL directamente:
 *   ALTER TABLE bots ADD COLUMN IF NOT EXISTS media_handling jsonb DEFAULT NULL;
 */
export async function addBotMediaHandling(dataSource: DataSource): Promise<void> {
  const queryRunner = dataSource.createQueryRunner();

  try {
    await queryRunner.startTransaction();

    // Add media_handling column
    await queryRunner.query(`
      ALTER TABLE bots
        ADD COLUMN IF NOT EXISTS media_handling jsonb DEFAULT NULL
    `);
    console.log('[Migration] Columna media_handling agregada a bots');

    await queryRunner.commitTransaction();
    console.log('[Migration] ✓ Migración 002 completada exitosamente');
  } catch (error) {
    await queryRunner.rollbackTransaction();
    console.error('[Migration] ✗ Error, se hizo rollback:', error);
    throw error;
  } finally {
    await queryRunner.release();
  }
}
