import { randomUUID } from 'crypto';
import type {
  ConversationFlow,
  FlowHttpConfig,
  FlowHttpMapping,
  FlowHttpMethod,
  FlowHttpPair,
  FlowNode,
} from './conversation-flow.entity';
import {
  HTTP_DEFAULT_TIMEOUT_SEC,
  HTTP_MAX_TIMEOUT_SEC,
  HTTP_RESERVED_VARIABLES,
  MASKED_HEADER_VALUE,
  isSensitiveHeader,
} from './flow-http.util';

/**
 * Saneado puro (sin Nest ni BD) de la configuración del nodo «Petición API» y
 * máscara de los encabezados sensibles al leer. El servicio solo añade la
 * validación de `saveToField`, que necesita los campos del tenant.
 */

const METHODS = new Set<FlowHttpMethod>([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
]);
const BODY_TYPES = new Set(['none', 'json', 'form', 'text']);
const HEADER_NAME_RE = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;
const FORBIDDEN_HEADERS = new Set([
  'host',
  'content-length',
  'transfer-encoding',
  'connection',
]);
const VARIABLE_NAME_RE = /^\w{1,50}$/;

export const HTTP_MAX_PAIRS = 20;
export const HTTP_MAX_KEY = 100;
export const HTTP_MAX_PAIR_VALUE = 2000;
export const HTTP_MAX_URL = 2000;
export const HTTP_MAX_BODY = 10_000;
export const HTTP_MAX_MAPPINGS = 30;
export const HTTP_MAX_PATH = 200;

/** Lista de pares sin los de clave vacía, con los límites de cantidad y largo. */
function cleanPairs(raw: unknown): FlowHttpPair[] {
  const out: FlowHttpPair[] = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    const key = String(item?.key ?? '')
      .trim()
      .slice(0, HTTP_MAX_KEY);
    if (!key) continue;
    out.push({
      key,
      value: String(item?.value ?? '').slice(0, HTTP_MAX_PAIR_VALUE),
    });
    if (out.length >= HTTP_MAX_PAIRS) break;
  }
  return out;
}

/** Valor guardado de un encabezado en la configuración anterior (sin distinguir mayúsculas). */
function previousHeaderValue(
  previous: FlowHttpConfig | undefined,
  name: string,
): string | undefined {
  const lower = name.toLowerCase();
  const found = (previous?.headers ?? []).find(
    (h) => String(h?.key ?? '').toLowerCase() === lower,
  );
  return found ? String(found.value ?? '') : undefined;
}

/**
 * Lista blanca de la configuración. `previous` es la configuración ya guardada
 * del mismo nodo: de ahí se recupera el valor de los encabezados sensibles que
 * el editor devuelve como `__saved__`.
 * `saveToField` queda sin validar (solo texto recortado): lo valida el servicio.
 */
export function sanitizeHttpConfig(
  raw: unknown,
  previous?: FlowHttpConfig,
): FlowHttpConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >;
  const method = String(r.method ?? '').toUpperCase() as FlowHttpMethod;
  const out: FlowHttpConfig = {
    method: METHODS.has(method) ? method : 'GET',
    url: String(r.url ?? '')
      .trim()
      .slice(0, HTTP_MAX_URL),
  };

  const query = cleanPairs(r.query);
  if (query.length) out.query = query;

  const headers: FlowHttpPair[] = [];
  for (const h of cleanPairs(r.headers)) {
    if (!HEADER_NAME_RE.test(h.key)) continue;
    if (FORBIDDEN_HEADERS.has(h.key.toLowerCase())) continue;
    if (isSensitiveHeader(h.key) && h.value === MASKED_HEADER_VALUE) {
      const saved = previousHeaderValue(previous, h.key);
      if (saved === undefined) continue;
      headers.push({ key: h.key, value: saved });
      continue;
    }
    headers.push(h);
  }
  if (headers.length) out.headers = headers;

  const bodyType = BODY_TYPES.has(String(r.bodyType))
    ? (r.bodyType as FlowHttpConfig['bodyType'])
    : 'none';
  if (out.method === 'GET' || bodyType === 'none') {
    out.bodyType = 'none';
  } else {
    out.bodyType = bodyType;
    if (bodyType === 'form') {
      const formFields = cleanPairs(r.formFields);
      if (formFields.length) out.formFields = formFields;
    } else {
      const body = String(r.body ?? '').slice(0, HTTP_MAX_BODY);
      if (body) out.body = body;
    }
  }

  const sec = Math.floor(Number(r.timeoutSec));
  out.timeoutSec = Number.isFinite(sec)
    ? Math.min(Math.max(sec, 1), HTTP_MAX_TIMEOUT_SEC)
    : HTTP_DEFAULT_TIMEOUT_SEC;

  const mappings: FlowHttpMapping[] = [];
  const usedVars = new Set<string>();
  const usedIds = new Set<string>();
  for (const item of (Array.isArray(r.mappings) ? r.mappings : []).slice(
    0,
    HTTP_MAX_MAPPINGS,
  )) {
    const m = (item ?? {}) as Record<string, unknown>;
    const path = String(m.path ?? '')
      .trim()
      .slice(0, HTTP_MAX_PATH);
    const variable = String(m.variable ?? '').trim();
    if (!path || !VARIABLE_NAME_RE.test(variable)) continue;
    if (HTTP_RESERVED_VARIABLES.includes(variable) || usedVars.has(variable))
      continue;
    usedVars.add(variable);
    let id = String(m.id ?? '')
      .trim()
      .slice(0, 64);
    if (!id || usedIds.has(id)) id = randomUUID();
    usedIds.add(id);
    const saveToField = String(m.saveToField ?? '').trim();
    mappings.push({
      id,
      path,
      variable,
      ...(saveToField ? { saveToField } : {}),
      ...(saveToField && m.keepExisting === true ? { keepExisting: true } : {}),
    });
  }
  if (mappings.length) out.mappings = mappings;
  return out;
}

/**
 * Copia del flujo con el valor de los encabezados sensibles de los nodos
 * `http_request` reemplazado por `__saved__` (solo si no está vacío). No toca
 * el original: lo que se guarda y lee el motor nunca se enmascara.
 */
export function maskFlow<T extends Pick<ConversationFlow, 'nodes'>>(
  flow: T,
): T {
  if (!Array.isArray(flow?.nodes)) return flow;
  const nodes = flow.nodes.map((node: FlowNode): FlowNode => {
    const headers = node?.data?.http?.headers;
    if (node?.type !== 'http_request' || !Array.isArray(headers)) return node;
    return {
      ...node,
      data: {
        ...node.data,
        http: {
          ...node.data.http!,
          headers: headers.map((h) =>
            isSensitiveHeader(h.key) && String(h.value ?? '') !== ''
              ? { ...h, value: MASKED_HEADER_VALUE }
              : h,
          ),
        },
      },
    };
  });
  // Instancia nueva con los mismos campos: no se muta la entidad original.
  return Object.assign(
    Object.create(Object.getPrototypeOf(flow)),
    flow,
    { nodes },
  ) as T;
}
