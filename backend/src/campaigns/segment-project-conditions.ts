import { ALL_STATUSES } from '../reclutamiento/prospect-states';

/**
 * Condiciones de segmentación sobre Reclutamiento. El proyecto (y la pregunta)
 * viajan dentro de `field`, así el resto de la segmentación no cambia:
 *
 *  - `project:<projectId>`: ¿el contacto está en el proyecto? Operadores
 *    `in_project` / `not_in_project`. `value` es `any` o un estado del prospecto.
 *  - `project_answer:<projectId>:<questionId>`: respuesta del contacto a una
 *    pregunta del formulario del proyecto.
 *  - `project_answer:<projectId>:field_<clave>`: dato personal que pide el
 *    formulario del proyecto. Vive en el contacto; la condición exige además
 *    que el contacto esté en el proyecto (ver `parseProjectContactField`).
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const QUESTION_ID = /^[\w-]{1,40}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface ProjectConditionSql {
  sql: string;
  params: Record<string, unknown>;
}

export function isProjectField(field: string): boolean {
  return field.startsWith('project:') || field.startsWith('project_answer:');
}

const PROSPECT_OF_CONTACT =
  'pp.record_id = client.id AND pp.tenant_id = client.tenant_id AND pp.project_id = CAST(:{pid} AS uuid)';

const CONTACT_FIELD_KEY = /^[\w-]{1,60}$/;

/** Si la condición es sobre un dato personal del formulario, devuelve el proyecto y la clave del dato. */
export function parseProjectContactField(field: string): { projectId: string; key: string } | null {
  const [kind, projectId, questionId] = field.split(':');
  if (kind !== 'project_answer' || !projectId || !UUID.test(projectId) || !questionId?.startsWith('field_')) return null;
  const key = questionId.slice('field_'.length);
  return CONTACT_FIELD_KEY.test(key) ? { projectId, key } : null;
}

/** SQL «el contacto está en el proyecto» (cualquier estado). */
export function projectMembershipSql(paramKey: string, projectId: string): ProjectConditionSql {
  const pid = `${paramKey}_pid`;
  return {
    sql: `EXISTS (SELECT 1 FROM project_prospects pp WHERE ${PROSPECT_OF_CONTACT.replace('{pid}', pid)})`,
    params: { [pid]: projectId },
  };
}

/** SQL de la condición, o null si es inválida (se ignora, como las condiciones vacías). */
export function buildProjectConditionSql(
  field: string,
  operator: string,
  value: unknown,
  paramKey: string,
): ProjectConditionSql | null {
  const [kind, projectId, questionId] = field.split(':');
  if (!projectId || !UUID.test(projectId)) return null;
  const pid = `${paramKey}_pid`;
  const base = PROSPECT_OF_CONTACT.replace('{pid}', pid);
  const params: Record<string, unknown> = { [pid]: projectId };

  if (kind === 'project') {
    if (operator !== 'in_project' && operator !== 'not_in_project') return null;
    const status = String(value ?? 'any').trim();
    let statusSql = '';
    if (status && status !== 'any') {
      if (!ALL_STATUSES.has(status)) return null;
      statusSql = ` AND pp.status = :${paramKey}_st`;
      params[`${paramKey}_st`] = status;
    }
    const exists = `EXISTS (SELECT 1 FROM project_prospects pp WHERE ${base}${statusSql})`;
    return { sql: operator === 'in_project' ? exists : `NOT ${exists}`, params };
  }

  if (kind !== 'project_answer' || !questionId || questionId.startsWith('field_') || !QUESTION_ID.test(questionId)) return null;
  const text = String(value ?? '').trim();
  if (!text) return null;
  const qid = `${paramKey}_qid`;
  const v = `${paramKey}_v`;
  params[qid] = questionId;
  params[v] = text;

  const raw = `ans->>'value'`;
  const equal = `(${raw} = :${v} OR (jsonb_typeof(ans->'value') = 'array' AND ans->'value' @> to_jsonb(CAST(:${v} AS text))))`;
  let cond: string;
  switch (operator) {
    case 'equals':
      cond = equal;
      break;
    case 'not_equals':
      cond = `NOT ${equal}`;
      break;
    case 'contains':
      cond = `${raw} ILIKE '%' || :${v} || '%'`;
      break;
    case 'greater_than':
    case 'less_than':
    case 'greater_or_equal':
    case 'less_or_equal': {
      const op = { greater_than: '>', less_than: '<', greater_or_equal: '>=', less_or_equal: '<=' }[operator];
      if (ISO_DATE.test(text)) {
        cond = `(jsonb_typeof(ans->'value') = 'string' AND ${raw} ${op} :${v})`;
      } else {
        const n = Number(text);
        if (!Number.isFinite(n)) return null;
        params[v] = n;
        cond = `(CASE WHEN jsonb_typeof(ans->'value') = 'number' THEN (${raw})::numeric END) ${op} CAST(:${v} AS numeric)`;
      }
      break;
    }
    default:
      return null;
  }
  return {
    sql: `EXISTS (SELECT 1 FROM project_prospects pp, jsonb_array_elements(pp.answers) AS ans WHERE ${base} AND ans->>'id' = :${qid} AND ${cond})`,
    params,
  };
}
