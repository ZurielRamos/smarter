import { DataSource } from 'typeorm';

/**
 * Migración: seguimiento de clics en enlaces de flujos conversacionales.
 *
 * Agrega la tabla flow_links (un enlace corto por cada botón de enlace rastreado
 * enviado) con su contador de clics.
 *
 * Ejecutar manualmente:
 *   npx ts-node -r tsconfig-paths/register src/migrations/run-migration.ts
 */
export async function addFlowLinks(dataSource: DataSource): Promise<void> {
  const queryRunner = dataSource.createQueryRunner();

  try {
    await queryRunner.startTransaction();

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS flow_links (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        code varchar(16) NOT NULL,
        tenant_id uuid NOT NULL,
        conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        flow_id uuid NOT NULL,
        node_id varchar(64) NOT NULL,
        button_id varchar(64) NOT NULL,
        title varchar(64) NOT NULL,
        url text NOT NULL,
        click_count int NOT NULL DEFAULT 0,
        first_click_at timestamptz,
        last_click_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_flow_links_code ON flow_links (code)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_flow_links_conversation ON flow_links (conversation_id)`,
    );
    console.log('[Migration] Tabla flow_links creada');

    await queryRunner.commitTransaction();
    console.log('[Migration] ✓ Migración 007 completada exitosamente');
  } catch (error) {
    await queryRunner.rollbackTransaction();
    console.error('[Migration] ✗ Error, se hizo rollback:', error);
    throw error;
  } finally {
    await queryRunner.release();
  }
}
