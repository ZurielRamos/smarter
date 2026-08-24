import { DataSource } from 'typeorm';

/**
 * Migración: Agregar tipo de bot y soporte para flujos secuenciales.
 *
 * Agrega:
 * - bots.type (freeform | sequential | hybrid)
 * - bots.flow_steps (JSONB con los pasos del flujo)
 * - bots.flow_config (JSONB con configuración del flujo)
 * - conversations.bot_flow_state (JSONB con el estado del flujo por conversación)
 *
 * Ejecutar manualmente:
 *   npx ts-node -r tsconfig-paths/register src/migrations/run-migration.ts
 */
export async function addBotTypeAndFlow(dataSource: DataSource): Promise<void> {
  const queryRunner = dataSource.createQueryRunner();

  try {
    await queryRunner.startTransaction();

    // Add type column to bots
    await queryRunner.query(`
      ALTER TABLE bots
        ADD COLUMN IF NOT EXISTS type varchar(20) DEFAULT 'freeform' NOT NULL
    `);
    console.log('[Migration] Columna type agregada a bots');

    // Add flow_steps column to bots
    await queryRunner.query(`
      ALTER TABLE bots
        ADD COLUMN IF NOT EXISTS flow_steps jsonb DEFAULT '[]'
    `);
    console.log('[Migration] Columna flow_steps agregada a bots');

    // Add flow_config column to bots
    await queryRunner.query(`
      ALTER TABLE bots
        ADD COLUMN IF NOT EXISTS flow_config jsonb DEFAULT NULL
    `);
    console.log('[Migration] Columna flow_config agregada a bots');

    // Add bot_flow_state column to conversations
    await queryRunner.query(`
      ALTER TABLE conversations
        ADD COLUMN IF NOT EXISTS bot_flow_state jsonb DEFAULT NULL
    `);
    console.log('[Migration] Columna bot_flow_state agregada a conversations');

    await queryRunner.commitTransaction();
    console.log('[Migration] ✓ Migración 003 completada exitosamente');
  } catch (error) {
    await queryRunner.rollbackTransaction();
    console.error('[Migration] ✗ Error, se hizo rollback:', error);
    throw error;
  } finally {
    await queryRunner.release();
  }
}
