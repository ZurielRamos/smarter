import { SelectQueryBuilder } from 'typeorm';
import { ALL_STATUSES } from '../reclutamiento/prospect-states';

/** Contactos que están en alguno de estos proyectos; con `statuses`, solo en esos estados (vacío = todos). */
export interface ProjectFilter {
  projectIds: string[];
  statuses: string[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PROJECTS = 20;

/**
 * Lee el filtro de los parámetros `projectIds` y `projectStatuses` (CSV).
 * Ignora ids que no son UUID y estados que no existen. Sin proyectos válidos no filtra.
 */
export function parseProjectFilter(projectIds?: string, projectStatuses?: string): ProjectFilter | undefined {
  const ids = Array.from(new Set((projectIds ?? '').split(',').map((s) => s.trim()).filter((s) => UUID_RE.test(s)))).slice(0, MAX_PROJECTS);
  if (ids.length === 0) return undefined;
  const statuses = Array.from(new Set((projectStatuses ?? '').split(',').map((s) => s.trim()).filter((s) => ALL_STATUSES.has(s))));
  return { projectIds: ids, statuses };
}

/**
 * Aplica el filtro sobre la lista de conversaciones (con `conv.inbox` unido como
 * `inbox` y `conv.record` como `record`). El prospecto debe ser de la misma
 * cuenta que el contacto y el canal: un proyecto de otra cuenta no encuentra nada.
 */
export function applyProjectFilter(qb: SelectQueryBuilder<any>, filter: ProjectFilter | undefined): void {
  if (!filter || filter.projectIds.length === 0) return;
  const withStatus = filter.statuses.length > 0;
  qb.andWhere(
    `EXISTS (
      SELECT 1 FROM project_prospects pp
       WHERE pp.record_id = conv.record_id
         AND pp.tenant_id = record.tenant_id
         AND pp.tenant_id = inbox.tenant_id
         AND pp.project_id IN (:...pfProjectIds)
         ${withStatus ? 'AND pp.status IN (:...pfStatuses)' : ''}
    )`,
    withStatus ? { pfProjectIds: filter.projectIds, pfStatuses: filter.statuses } : { pfProjectIds: filter.projectIds },
  );
}
