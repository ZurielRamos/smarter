import { EntityManager } from 'typeorm';
import { CustomField } from '../records/custom-field.entity';

/**
 * Campos del contacto que se crean al activar Reclutamiento: datos estables de
 * la persona que sirven para decidir a quién convocar. Quedan disponibles en el
 * catálogo de datos personales del formulario de cada proyecto.
 */
export const RECRUITMENT_FIELDS: Array<Pick<CustomField, 'fieldKey' | 'fieldLabel' | 'fieldType' | 'options'>> = [
  { fieldKey: 'estrato', fieldLabel: 'Estrato socioeconómico', fieldType: 'select', options: ['1', '2', '3', '4', '5', '6'] },
  { fieldKey: 'ocupacion', fieldLabel: 'Ocupación', fieldType: 'text', options: null },
  {
    fieldKey: 'nivel_educativo',
    fieldLabel: 'Nivel educativo',
    fieldType: 'select',
    options: ['Primaria', 'Bachillerato', 'Técnico o tecnológico', 'Universitario', 'Posgrado', 'Ninguno'],
  },
];

/**
 * Crea los campos que falten. Si la cuenta ya tiene un campo con esa clave (lo
 * creó o lo renombró el equipo) no se toca. Devuelve cuántos creó.
 */
export async function ensureRecruitmentFields(em: EntityManager, tenantId: string): Promise<number> {
  const repo = em.getRepository(CustomField);
  const existing = await repo.find({ where: { tenantId }, select: { fieldKey: true, sortOrder: true } });
  const keys = new Set(existing.map((f) => f.fieldKey));
  let order = existing.reduce((max, f) => Math.max(max, f.sortOrder ?? 0), 0);
  let created = 0;
  for (const f of RECRUITMENT_FIELDS) {
    if (keys.has(f.fieldKey)) continue;
    await repo.save(repo.create({ tenantId, ...f, fieldGroup: 'segmentacion', sortOrder: ++order, isSystem: false, isRequired: false }));
    created++;
  }
  return created;
}
