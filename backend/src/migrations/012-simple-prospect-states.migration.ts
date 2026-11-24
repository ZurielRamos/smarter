import { DataSource } from 'typeorm';

/**
 * Migración: un solo embudo de 8 estados para todos los perfiles (antes, uno
 * por perfil con etapas). Convierte el estado de los prospectos y su historial.
 *
 *   nuevo           ← registrado, postulado
 *   en_contacto     ← preseleccionado, contactado
 *   en_evaluacion   ← en_filtro, en_capacitacion, en_prueba, en_evaluacion
 *   en_espera       ← en_lista_espera
 *   seleccionado    ← calificado, aprobado, confirmado, asignado, en_campo
 *   participo       ← asistio, completado, valido, en_auditoria, aprobado_calidad
 *   no_seleccionado ← no_califica, rechazado
 *   no_participo    ← no_show, cancelo, abandono, anulado
 *
 * Idempotente. EJECUTAR ANTES de iniciar la aplicación con el código nuevo.
 *   npx ts-node -r tsconfig-paths/register src/migrations/run-migration.ts
 */
export const STATE_MAP: Record<string, string> = {
  registrado: 'nuevo',
  postulado: 'nuevo',
  preseleccionado: 'en_contacto',
  contactado: 'en_contacto',
  en_filtro: 'en_evaluacion',
  en_capacitacion: 'en_evaluacion',
  en_prueba: 'en_evaluacion',
  en_lista_espera: 'en_espera',
  calificado: 'seleccionado',
  aprobado: 'seleccionado',
  confirmado: 'seleccionado',
  asignado: 'seleccionado',
  en_campo: 'seleccionado',
  asistio: 'participo',
  completado: 'participo',
  valido: 'participo',
  en_auditoria: 'participo',
  aprobado_calidad: 'participo',
  no_califica: 'no_seleccionado',
  rechazado: 'no_seleccionado',
  no_show: 'no_participo',
  cancelo: 'no_participo',
  abandono: 'no_participo',
  anulado: 'no_participo',
};

export async function simplifyProspectStates(dataSource: DataSource): Promise<void> {
  const queryRunner = dataSource.createQueryRunner();
  try {
    await queryRunner.startTransaction();
    const keys = Object.keys(STATE_MAP);
    const values = Object.values(STATE_MAP);
    const [{ prospects }] = await queryRunner.query(`SELECT to_regclass('project_prospects') IS NOT NULL AS prospects`);
    if (prospects) {
      // «Anulado» se convierte en «No participó» y deja constancia en el motivo.
      await queryRunner.query(`UPDATE project_prospects SET status_reason = trim(both ' ' from concat('Anulado. ', coalesce(status_reason, ''))) WHERE status = 'anulado'`);
      const res = await queryRunner.query(
        `UPDATE project_prospects p SET status = m.to_s FROM unnest($1::text[], $2::text[]) AS m(from_s, to_s) WHERE p.status = m.from_s`,
        [keys, values],
      );
      console.log(`[Migration] Prospectos convertidos: ${res?.[1] ?? 0}`);
      await queryRunner.query(`ALTER TABLE project_prospects ALTER COLUMN status SET DEFAULT 'nuevo'`);
    }
    const [{ events }] = await queryRunner.query(`SELECT to_regclass('prospect_status_events') IS NOT NULL AS events`);
    if (events) {
      for (const col of ['from_status', 'to_status']) {
        await queryRunner.query(`UPDATE prospect_status_events e SET ${col} = m.to_s FROM unnest($1::text[], $2::text[]) AS m(from_s, to_s) WHERE e.${col} = m.from_s`, [keys, values]);
      }
    }
    await queryRunner.commitTransaction();
    console.log('[Migration] ✓ Migración 012 completada exitosamente');
  } catch (error) {
    await queryRunner.rollbackTransaction();
    console.error('[Migration] ✗ Error, se hizo rollback:', error);
    throw error;
  } finally {
    await queryRunner.release();
  }
}
