import { DataSource } from 'typeorm';

/**
 * Migración: temporizadores de flujos conversacionales («Si no responde»).
 *
 * Agrega la tabla flow_timers: recordatorios y vencimientos de los nodos que
 * esperan respuesta. El índice parcial sobre los pendientes mantiene barata la
 * consulta del worker aunque la tabla crezca con el historial.
 *
 * Ejecutar manualmente:
 *   npx ts-node -r tsconfig-paths/register src/migrations/run-migration.ts
 */
export async function addFlowTimers(dataSource: DataSource): Promise<void> {
  const queryRunner = dataSource.createQueryRunner();
  try {
    await queryRunner.startTransaction();
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS flow_timers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        flow_id uuid NOT NULL,
        node_id varchar(64) NOT NULL,
        kind varchar(16) NOT NULL,
        step int NOT NULL DEFAULT 0,
        token varchar(40) NOT NULL,
        fire_at timestamptz NOT NULL,
        status varchar(16) NOT NULL DEFAULT 'pending',
        locked_until timestamptz,
        attempts int NOT NULL DEFAULT 0,
        error text,
        created_at timestamptz NOT NULL DEFAULT now(),
        fired_at timestamptz
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_flow_timers_conversation ON flow_timers (conversation_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_flow_timers_due ON flow_timers (fire_at) WHERE status IN ('pending', 'running')`,
    );
    console.log('[Migration] Tabla flow_timers creada');
    await queryRunner.commitTransaction();
    console.log('[Migration] ✓ Migración 008 completada exitosamente');
  } catch (error) {
    await queryRunner.rollbackTransaction();
    console.error('[Migration] ✗ Error, se hizo rollback:', error);
    throw error;
  } finally {
    await queryRunner.release();
  }
}
