import { DataSource } from 'typeorm';

/**
 * Migración: disparadores avanzados de flujos conversacionales.
 *
 * - flow_starts: cada inicio de flujo y su origen (frecuencia y estadísticas).
 * - messages.template_name / messages.campaign_id: identifican la plantilla y
 *   la campaña a las que responde el contacto.
 * - campaigns.reply_flow_id: «Flujo al responder» de una campaña.
 * - messages.reply_flow_id / reply_flow_source: flujo pendiente de una
 *   plantilla enviada para iniciarlo con la ventana de 24 h cerrada.
 *
 * Los disparadores existentes (formato antiguo) no se reescriben: el servicio
 * los convierte al leerlos y quedan en el formato nuevo al guardar el flujo.
 *
 * Ejecutar manualmente:
 *   npx ts-node -r tsconfig-paths/register src/migrations/run-migration.ts
 */
export async function addFlowTriggers(dataSource: DataSource): Promise<void> {
  const queryRunner = dataSource.createQueryRunner();
  try {
    await queryRunner.startTransaction();
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS flow_starts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        flow_id uuid NOT NULL,
        conversation_id uuid NOT NULL,
        record_id uuid,
        source varchar(24) NOT NULL,
        source_ref varchar(64),
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_flow_starts_flow_record ON flow_starts (flow_id, record_id, created_at)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_flow_starts_flow_conversation ON flow_starts (flow_id, conversation_id, created_at)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_flow_starts_flow_created ON flow_starts (flow_id, created_at)`,
    );
    await queryRunner.query(
      `ALTER TABLE messages ADD COLUMN IF NOT EXISTS template_name varchar(512)`,
    );
    await queryRunner.query(
      `ALTER TABLE messages ADD COLUMN IF NOT EXISTS campaign_id uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS reply_flow_id uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_flow_id uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_flow_source varchar(24)`,
    );
    console.log(
      '[Migration] flow_starts y columnas de plantilla/campaña agregadas',
    );
    await queryRunner.commitTransaction();
    console.log('[Migration] ✓ Migración 009 completada exitosamente');
  } catch (error) {
    await queryRunner.rollbackTransaction();
    console.error('[Migration] ✗ Error, se hizo rollback:', error);
    throw error;
  } finally {
    await queryRunner.release();
  }
}
