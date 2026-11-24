import { DataSource } from 'typeorm';
import { ensureRecruitmentFields } from '../reclutamiento/recruitment-fields';

/**
 * Migración: perfiles por proyecto (participante, encuestador, moderador) con su
 * embudo de estados, y campos del contacto de Reclutamiento.
 *
 * - `project_prospects.status` pasa de 10 a 20 caracteres. Se hace aquí con
 *   ALTER TYPE porque la sincronización de TypeORM, al cambiar el largo, borra
 *   y vuelve a crear la columna (perdería los estados).
 * - Los estados anteriores se convierten al embudo de participante:
 *   new → registrado, talking → contactado, approved → calificado, rejected → no_califica.
 * - `project_prospects.role` (todos los anteriores quedan como participantes).
 * - Crea los campos estrato, ocupación y nivel educativo en las cuentas con
 *   Reclutamiento activo (no toca los que ya existan).
 *
 * EJECUTAR ANTES de iniciar la aplicación con el código nuevo. Es idempotente.
 *   npx ts-node -r tsconfig-paths/register src/migrations/run-migration.ts
 */
export async function addProspectRoles(dataSource: DataSource): Promise<void> {
  const queryRunner = dataSource.createQueryRunner();
  try {
    await queryRunner.startTransaction();
    const [{ exists }] = await queryRunner.query(`SELECT to_regclass('project_prospects') IS NOT NULL AS exists`);
    if (exists) {
      await queryRunner.query(`ALTER TABLE project_prospects ALTER COLUMN status TYPE varchar(20)`);
      await queryRunner.query(`ALTER TABLE project_prospects ALTER COLUMN status SET DEFAULT 'registrado'`);
      const res = await queryRunner.query(`
        UPDATE project_prospects SET status = CASE status
          WHEN 'new' THEN 'registrado' WHEN 'talking' THEN 'contactado'
          WHEN 'approved' THEN 'calificado' WHEN 'rejected' THEN 'no_califica' END
        WHERE status IN ('new', 'talking', 'approved', 'rejected')`);
      console.log(`[Migration] Estados convertidos: ${res?.[1] ?? 0}`);
      await queryRunner.query(`ALTER TABLE project_prospects ADD COLUMN IF NOT EXISTS role varchar(12) NOT NULL DEFAULT 'participant'`);
    }
    const tenants: Array<{ id: string }> = await queryRunner.query(`SELECT id FROM tenants WHERE (features->>'reclutamiento')::boolean IS TRUE`);
    for (const t of tenants) {
      const created = await ensureRecruitmentFields(queryRunner.manager, t.id);
      if (created) console.log(`[Migration] ${created} campos de Reclutamiento creados en la cuenta ${t.id}`);
    }
    await queryRunner.commitTransaction();
    console.log('[Migration] ✓ Migración 011 completada exitosamente');
  } catch (error) {
    await queryRunner.rollbackTransaction();
    console.error('[Migration] ✗ Error, se hizo rollback:', error);
    throw error;
  } finally {
    await queryRunner.release();
  }
}
