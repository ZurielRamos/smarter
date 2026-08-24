import { DataSource } from 'typeorm';

/**
 * Migración: Agregar configuración de consentimiento a bots.
 *
 * Agrega:
 * - bots.consent_config (JSONB con la configuración de consentimiento)
 * - conversations.bot_consent_given (boolean para trackear si el usuario dio consentimiento)
 */
export async function addBotConsentConfig(dataSource: DataSource): Promise<void> {
  const queryRunner = dataSource.createQueryRunner();

  try {
    await queryRunner.startTransaction();

    await queryRunner.query(`
      ALTER TABLE bots
        ADD COLUMN IF NOT EXISTS consent_config jsonb DEFAULT NULL
    `);
    console.log('[Migration] Columna consent_config agregada a bots');

    await queryRunner.query(`
      ALTER TABLE conversations
        ADD COLUMN IF NOT EXISTS bot_consent_given boolean DEFAULT false
    `);
    console.log('[Migration] Columna bot_consent_given agregada a conversations');

    await queryRunner.commitTransaction();
    console.log('[Migration] ✓ Migración 004 completada exitosamente');
  } catch (error) {
    await queryRunner.rollbackTransaction();
    console.error('[Migration] ✗ Error, se hizo rollback:', error);
    throw error;
  } finally {
    await queryRunner.release();
  }
}
