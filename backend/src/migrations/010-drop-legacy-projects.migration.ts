import { DataSource } from 'typeorm';

/**
 * Migración: elimina el modelo anterior de proyectos (acuerdo reclutadora ↔
 * cliente con miembros, estudios, lotes y asignaciones). El proyecto ahora es
 * genérico (landing y prospectos) y el trabajo con estudios llega después.
 *
 * Las tablas nuevas (`recruitment_projects` con `tenant_id` y `project_prospects`)
 * las crea la sincronización de TypeORM. EJECUTAR ESTA MIGRACIÓN ANTES de iniciar
 * la aplicación con el código nuevo: la tabla `recruitment_projects` anterior tiene
 * otras columnas obligatorias y la sincronización no puede convertirla.
 *
 * Es destructiva. Se niega a correr si alguna tabla anterior tiene filas, salvo
 * que se indique ALLOW_DROP_LEGACY_PROJECTS=1.
 *
 * Ejecutar manualmente:
 *   npx ts-node -r tsconfig-paths/register src/migrations/run-migration.ts
 */
const LEGACY_TABLES = ['project_memberships', 'study_assignments', 'project_studies', 'study_batches', 'client_studies', 'recruitment_projects'];

export async function dropLegacyProjects(dataSource: DataSource): Promise<void> {
  const queryRunner = dataSource.createQueryRunner();
  try {
    await queryRunner.startTransaction();
    // `recruitment_projects` solo es del modelo anterior si todavía tiene la columna del reclutador.
    const legacyProjects: Array<{ ok: number }> = await queryRunner.query(
      `SELECT 1 AS ok FROM information_schema.columns WHERE table_name = 'recruitment_projects' AND column_name = 'recruiter_tenant_id'`,
    );
    const tables = LEGACY_TABLES.filter((t) => t !== 'recruitment_projects' || legacyProjects.length > 0);
    const existing: Array<{ table_name: string }> = await queryRunner.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = ANY($1)`,
      [tables],
    );
    const withRows: string[] = [];
    for (const { table_name } of existing) {
      const [{ n }] = await queryRunner.query(`SELECT count(*)::int AS n FROM "${table_name}"`);
      if (n > 0) withRows.push(`${table_name} (${n})`);
    }
    if (withRows.length > 0 && process.env.ALLOW_DROP_LEGACY_PROJECTS !== '1') {
      throw new Error(`Hay datos en el modelo anterior de proyectos: ${withRows.join(', ')}. Revísalos o ejecuta con ALLOW_DROP_LEGACY_PROJECTS=1.`);
    }
    for (const { table_name } of existing) {
      await queryRunner.query(`DROP TABLE IF EXISTS "${table_name}" CASCADE`);
      console.log(`[Migration] Tabla ${table_name} eliminada`);
    }
    await queryRunner.commitTransaction();
    console.log('[Migration] ✓ Migración 010 completada exitosamente');
  } catch (error) {
    await queryRunner.rollbackTransaction();
    console.error('[Migration] ✗ Error, se hizo rollback:', error);
    throw error;
  } finally {
    await queryRunner.release();
  }
}
