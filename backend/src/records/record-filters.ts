import { BadRequestException } from '@nestjs/common';
import { ALL_STATUSES } from '../reclutamiento/prospect-states';

/**
 * Filtros avanzados de contactos: validación de lo que llega del cliente y los
 * campos virtuales de Reclutamiento (proyecto y estado en proyecto).
 */
export interface RecordFilter {
  field: string;
  operator: string;
  value: string;
}

export const MAX_RECORD_FILTERS = 30;

export const FILTER_OPERATORS = new Set([
  'equals',
  'not_equals',
  'contains',
  'starts_with',
  'greater_than',
  'less_than',
  'is_empty',
  'is_not_empty',
  // Proyecto de reclutamiento
  'in_project',
  'not_in_project',
]);

/** «Está / no está en el proyecto» (value = id del proyecto). */
export const PROJECT_FILTER = '__project';
/** «Estado en proyecto» (value = `<id del proyecto>:<estado>,<estado>`). */
export const PROJECT_STATUS_FILTER = '__project_status';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIELD_RE = /^[\p{L}\p{N}_\- .]{1,100}$/u;

export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

/**
 * Normaliza los filtros (query string en JSON o cuerpo ya parseado). Rechaza
 * con 400 lo que no se puede evaluar, en lugar de responder 500.
 */
export function parseRecordFilters(raw: unknown): RecordFilter[] | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  let list: unknown = raw;
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw);
    } catch {
      throw new BadRequestException('Filtros inválidos');
    }
  }
  if (!Array.isArray(list)) throw new BadRequestException('Filtros inválidos');
  if (list.length > MAX_RECORD_FILTERS) throw new BadRequestException(`Máximo ${MAX_RECORD_FILTERS} filtros`);
  const out = list.map((f: any) => {
    const field = typeof f?.field === 'string' ? f.field.trim() : '';
    const operator = typeof f?.operator === 'string' ? f.operator : '';
    if (!FIELD_RE.test(field)) throw new BadRequestException('Campo inválido en el filtro');
    if (!FILTER_OPERATORS.has(operator)) throw new BadRequestException('Operador inválido en el filtro');
    const value = f?.value === undefined || f?.value === null ? '' : String(f.value).slice(0, 500);
    return { field, operator, value };
  });
  return out.length ? out : undefined;
}

/** Proyecto y estados de un filtro «Estado en proyecto». */
export function parseProjectStatusValue(value: string): { projectId: string; statuses: string[] } {
  const [projectId, list = ''] = value.split(':');
  const statuses = [...new Set(list.split(',').map((s) => s.trim()).filter(Boolean))];
  if (!isUuid(projectId) || !statuses.length || statuses.some((s) => !ALL_STATUSES.has(s)))
    throw new BadRequestException('Filtro de estado en proyecto inválido');
  return { projectId, statuses };
}

/** `project:<id>` agrupa el tablero por el estado del contacto en ese proyecto. */
export function projectGroupId(groupBy: string): string | null {
  const m = /^project:(.+)$/.exec(groupBy || '');
  if (!m) return null;
  if (!isUuid(m[1])) throw new BadRequestException('Proyecto inválido');
  return m[1];
}

/** La cuenta del contacto tiene Reclutamiento activo (sin módulo, los filtros de proyecto no encuentran nada). */
const RECRUITMENT_ACTIVE = `EXISTS (SELECT 1 FROM tenants rt WHERE rt.id = client.tenant_id AND (rt.features->>'reclutamiento')::boolean IS TRUE)`;

/** Condición «el contacto está en el proyecto :param» (opcionalmente con un estado de la lista :statuses). */
export function projectMembershipSql(projectParam: string, statusesParam?: string): string {
  return `(${RECRUITMENT_ACTIVE} AND EXISTS (SELECT 1 FROM project_prospects pp WHERE pp.record_id = client.id AND pp.tenant_id = client.tenant_id AND pp.project_id = :${projectParam}${
    statusesParam ? ` AND pp.status IN (:...${statusesParam})` : ''
  }))`;
}

/** Estado del contacto en el proyecto :param (NULL si no está o la cuenta no tiene el módulo). */
export function projectStatusSql(projectParam: string): string {
  return `(SELECT pp.status FROM project_prospects pp WHERE pp.record_id = client.id AND pp.tenant_id = client.tenant_id AND pp.project_id = :${projectParam} AND ${RECRUITMENT_ACTIVE})`;
}
