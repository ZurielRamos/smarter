import { DataSource } from 'typeorm';

/**
 * Migración: Flujos conversacionales (Comunicaciones → Flujos).
 *
 * Agrega:
 * - tabla conversation_flows (grafo de nodos/conexiones + disparadores)
 * - conversations.flow_state (nodo del flujo que espera respuesta)
 * - conversations.flow_variables (variables recogidas por los flujos)
 * - messages.interactive (botones enviados con el mensaje)
 *
 * Ejecutar manualmente:
 *   npx ts-node -r tsconfig-paths/register src/migrations/run-migration.ts
 */
export async function addConversationFlows(
  dataSource: DataSource,
): Promise<void> {
  const queryRunner = dataSource.createQueryRunner();

  try {
    await queryRunner.startTransaction();

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS conversation_flows (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name varchar(255) NOT NULL,
        description text,
        status varchar(20) NOT NULL DEFAULT 'draft',
        nodes jsonb NOT NULL DEFAULT '[]',
        edges jsonb NOT NULL DEFAULT '[]',
        triggers jsonb,
        run_count int NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_conversation_flows_tenant ON conversation_flows (tenant_id)
    `);
    console.log('[Migration] Tabla conversation_flows creada');

    await queryRunner.query(`
      ALTER TABLE conversations
        ADD COLUMN IF NOT EXISTS flow_state jsonb DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS flow_variables jsonb DEFAULT NULL
    `);
    console.log(
      '[Migration] Columnas flow_state y flow_variables agregadas a conversations',
    );

    await queryRunner.query(`
      ALTER TABLE messages
        ADD COLUMN IF NOT EXISTS interactive jsonb DEFAULT NULL
    `);
    console.log('[Migration] Columna interactive agregada a messages');

    await queryRunner.commitTransaction();
    console.log('[Migration] ✓ Migración 006 completada exitosamente');
  } catch (error) {
    await queryRunner.rollbackTransaction();
    console.error('[Migration] ✗ Error, se hizo rollback:', error);
    throw error;
  } finally {
    await queryRunner.release();
  }
}
