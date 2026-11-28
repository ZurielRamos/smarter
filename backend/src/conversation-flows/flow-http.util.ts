import { safeFetch } from '../automatizaciones/utils/safe-fetch.util';
import { getPath } from '../automatizaciones/utils/template.util';
import type {
  FlowHttpConfig,
  FlowHttpMapping,
  FlowHttpPair,
} from './conversation-flow.entity';

/**
 * Lógica HTTP del nodo «Petición API». Sin dependencias de Nest: la usan el
 * motor (al ejecutar el flujo) y el endpoint de prueba del editor, así ambos
 * arman exactamente la misma petición.
 */

/** Variables que el nodo escribe siempre; no se pueden usar en un mapeo. */
export const HTTP_RESERVED_VARIABLES = ['http_status', 'http_error'];
/** Presupuesto de tiempo de todas las peticiones de un mismo turno. */
export const HTTP_MAX_TURN_MS = 30_000;
export const HTTP_MAX_TIMEOUT_SEC = 15;
export const HTTP_DEFAULT_TIMEOUT_SEC = 10;
/** Máximo de caracteres que se guardan por variable. */
export const HTTP_MAX_VALUE_CHARS = 4000;
/** Marca que reemplaza el valor de un encabezado sensible en las respuestas de la API. */
export const MASKED_HEADER_VALUE = '__saved__';

/** Sustituye {{x}} en texto. El motor pasa su interpolate; la prueba, un mapa de valores. */
export type Resolve = (text: string) => string;

export interface HttpOutcome {
  /** Respuesta 2xx */
  ok: boolean;
  /** 0 si no hubo respuesta */
  status: number;
  durationMs: number;
  /** JSON ya parseado o texto */
  body?: unknown;
  /** Mensaje corto en español */
  error?: string;
}

const TOKEN = /\{\{[^{}]+\}\}/g;
const SENSITIVE_EXACT = ['authorization', 'cookie', 'proxy-authorization'];
const SENSITIVE_PARTS = ['token', 'key', 'secret', 'auth'];

/** Un encabezado es sensible si su nombre indica credenciales (sin distinguir mayúsculas). */
export function isSensitiveHeader(name: string): boolean {
  const n = String(name ?? '')
    .trim()
    .toLowerCase();
  if (!n) return false;
  return SENSITIVE_EXACT.includes(n) || SENSITIVE_PARTS.some((p) => n.includes(p));
}

/** Convierte un valor de la respuesta a texto (las variables del flujo son texto). */
function toText(value: unknown): string {
  const text =
    typeof value === 'string'
      ? value
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value);
  return text.length > HTTP_MAX_VALUE_CHARS
    ? text.slice(0, HTTP_MAX_VALUE_CHARS)
    : text;
}

/**
 * Aplica los mapeos a la respuesta. Devuelve los valores (texto, máx. 4000
 * caracteres) y las rutas que no existieron (también las de valor null).
 * La ruta `$` es la respuesta completa.
 */
export function applyMappings(
  mappings: FlowHttpMapping[],
  body: unknown,
): { values: Record<string, string>; missing: string[] } {
  const values: Record<string, string> = {};
  const missing: string[] = [];
  for (const m of mappings ?? []) {
    const variable = String(m?.variable ?? '');
    if (!variable || variable === '__proto__') continue;
    const path = String(m?.path ?? '').trim();
    let found: unknown;
    if (path === '$') found = body;
    else if (path) found = getPath(body, path);
    if (found === undefined || found === null) {
      missing.push(path);
      continue;
    }
    values[variable] = toText(found);
  }
  return { values, missing };
}

/** Sustituye {{x}} en los textos de un JSON ya parseado (así un valor con comillas no lo rompe). */
function resolveJsonStrings(node: unknown, resolve: Resolve): unknown {
  if (typeof node === 'string') return resolve(node);
  if (Array.isArray(node)) return node.map((n) => resolveJsonStrings(n, resolve));
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === '__proto__') continue;
      out[k] = resolveJsonStrings(v, resolve);
    }
    return out;
  }
  return node;
}

/** Resuelve los pares y descarta los de clave vacía. */
function resolvePairs(
  pairs: FlowHttpPair[] | undefined,
  resolve: Resolve,
): [string, string][] {
  const out: [string, string][] = [];
  for (const p of pairs ?? []) {
    const key = resolve(String(p?.key ?? '')).trim();
    if (!key) continue;
    out.push([key, resolve(String(p?.value ?? ''))]);
  }
  return out;
}

/** Traduce el error de safeFetch a un mensaje corto. */
function translateError(err: unknown): string {
  const e = err as { name?: string; message?: string };
  const msg = String(e?.message ?? '');
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
    return 'Tiempo agotado';
  }
  if (/URL inválida|Solo se permiten URLs|No se permiten destinos/i.test(msg)) {
    return 'URL no permitida';
  }
  return 'No se pudo conectar';
}

function failure(error: string, started: number): HttpOutcome {
  return { ok: false, status: 0, durationMs: Date.now() - started, error };
}

/**
 * Ejecuta la petición del nodo. Nunca lanza: cualquier problema vuelve como
 * `{ ok: false, error }`. `budgetMs` es lo que queda del presupuesto del turno.
 */
export async function executeFlowHttp(
  cfg: FlowHttpConfig,
  resolve: Resolve,
  opts?: { fetcher?: typeof safeFetch; budgetMs?: number },
): Promise<HttpOutcome> {
  const started = Date.now();
  try {
    const fetcher = opts?.fetcher ?? safeFetch;
    const budget = opts?.budgetMs;
    if (budget !== undefined && budget <= 0) {
      return failure('Tiempo total del turno agotado', started);
    }

    const rawUrl = String(cfg?.url ?? '').trim();
    if (!rawUrl) return failure('El nodo no tiene URL', started);

    // URL: cada {{x}} se codifica por separado para que no rompa la ruta.
    let url = rawUrl.replace(TOKEN, (m) => encodeURIComponent(resolve(m)));
    const query = resolvePairs(cfg.query, resolve);
    if (query.length) {
      const hashAt = url.indexOf('#');
      const hash = hashAt >= 0 ? url.slice(hashAt) : '';
      if (hashAt >= 0) url = url.slice(0, hashAt);
      const qs = new URLSearchParams(query).toString();
      url += (url.includes('?') ? (/[?&]$/.test(url) ? '' : '&') : '?') + qs + hash;
    }

    // Encabezados: no se codifican, pero no pueden llevar saltos de línea.
    const headers: Record<string, string> = {};
    for (const [name, value] of resolvePairs(cfg.headers, resolve)) {
      if (/[\r\n]/.test(name) || /[\r\n]/.test(value)) {
        return failure('Encabezado no válido', started);
      }
      headers[name] = value;
    }
    const hasHeader = (n: string) =>
      Object.keys(headers).some((h) => h.toLowerCase() === n);

    // Cuerpo (GET no lleva).
    const method = String(cfg.method || 'GET').toUpperCase();
    let body: string | undefined;
    if (method !== 'GET') {
      const type = cfg.bodyType ?? 'none';
      if (type === 'json') {
        const tpl = String(cfg.body ?? '');
        if (tpl.trim()) {
          try {
            body = JSON.stringify(resolveJsonStrings(JSON.parse(tpl), resolve));
          } catch {
            body = resolve(tpl); // no es JSON válido: se sustituye como texto
          }
          if (!hasHeader('content-type')) {
            headers['Content-Type'] = 'application/json';
          }
        }
      } else if (type === 'form') {
        body = new URLSearchParams(resolvePairs(cfg.formFields, resolve)).toString();
        if (!hasHeader('content-type')) {
          headers['Content-Type'] = 'application/x-www-form-urlencoded';
        }
      } else if (type === 'text') {
        body = resolve(String(cfg.body ?? ''));
      }
    }

    // Tiempo: tope por nodo, recortado por lo que queda del turno.
    const sec = Number(cfg.timeoutSec);
    const secs = Number.isFinite(sec) && sec >= 1 ? sec : HTTP_DEFAULT_TIMEOUT_SEC;
    let timeoutMs = Math.min(secs, HTTP_MAX_TIMEOUT_SEC) * 1000;
    if (budget !== undefined) timeoutMs = Math.min(timeoutMs, budget);

    try {
      const res = await fetcher(url, { method, headers, body, timeoutMs });
      const durationMs = Date.now() - started;
      const ok = res.status >= 200 && res.status < 300;
      return {
        ok,
        status: res.status,
        durationMs,
        body: res.body,
        ...(ok ? {} : { error: `HTTP ${res.status}` }),
      };
    } catch (err) {
      return failure(translateError(err), started);
    }
  } catch {
    return failure('No se pudo conectar', started);
  }
}
