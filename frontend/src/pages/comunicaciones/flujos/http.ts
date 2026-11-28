import type { FlowHttpConfig, FlowHttpPair } from "./types";
import type { VariableMeta } from "./variables";

/** Lógica del nodo «Petición API» en el editor (espejo de backend/src/conversation-flows/flow-http.util.ts). */

/** Marca que el servidor devuelve en lugar del valor de un encabezado sensible ya guardado. */
export const MASKED_HEADER_VALUE = "__saved__";
export const HTTP_MAX_TIMEOUT_SEC = 15;
export const HTTP_DEFAULT_TIMEOUT_SEC = 10;
export const HTTP_MAX_VALUE_CHARS = 4000;
export const HTTP_MAX_PAIRS = 20;
export const HTTP_MAX_MAPPINGS = 30;
export const HTTP_STATUS_VARIABLE = "http_status";
export const HTTP_ERROR_VARIABLE = "http_error";

const SENSITIVE_EXACT = ["authorization", "cookie", "proxy-authorization"];
const SENSITIVE_PARTS = ["token", "key", "secret", "auth"];

/** Un encabezado es sensible si su nombre indica credenciales (sin distinguir mayúsculas). */
export function isSensitiveHeader(name: string): boolean {
  const n = String(name ?? "").trim().toLowerCase();
  if (!n) return false;
  return SENSITIVE_EXACT.includes(n) || SENSITIVE_PARTS.some((p) => n.includes(p));
}

export function defaultHttpConfig(): FlowHttpConfig {
  return {
    method: "GET",
    url: "",
    query: [],
    headers: [],
    bodyType: "none",
    body: "",
    formFields: [],
    timeoutSec: HTTP_DEFAULT_TIMEOUT_SEC,
    mappings: [],
  };
}

/** Qué le falta al nodo para funcionar (se muestra en el lienzo). */
export function httpIssue(cfg: FlowHttpConfig | undefined): string | null {
  const url = cfg?.url?.trim();
  if (!url) return "Escribe la URL";
  if (!/^(https?:\/\/|\{\{)/i.test(url)) return "La URL debe empezar por http:// o https://";
  if ((cfg?.mappings ?? []).some((m) => !m.variable || !m.path.trim())) return "Completa los datos a guardar";
  return null;
}

/** Variables que guarda el nodo, con su tipo para las condiciones. */
export function httpVariables(cfg: FlowHttpConfig | undefined): Record<string, VariableMeta> {
  if (!cfg) return {};
  const out: Record<string, VariableMeta> = {};
  for (const m of cfg.mappings ?? []) if (m.variable) out[m.variable] = { type: "text" };
  out[HTTP_STATUS_VARIABLE] = { type: "number" };
  out[HTTP_ERROR_VARIABLE] = { type: "text" };
  return out;
}

const PLACEHOLDER = /\{\{\s*([^{}\s]+)\s*\}\}/g;

function collect(text: string | undefined, into: Set<string>) {
  if (!text) return;
  for (const m of text.matchAll(PLACEHOLDER)) into.add(m[1]);
}

function collectPairs(pairs: FlowHttpPair[] | undefined, into: Set<string>, skipSaved = false) {
  for (const p of pairs ?? []) {
    collect(p.key, into);
    if (skipSaved && p.value === MASKED_HEADER_VALUE) continue;
    collect(p.value, into);
  }
}

/** `{{x}}` únicos que usa la configuración (url, parámetros, encabezados, cuerpo y formulario). */
export function extractPlaceholders(cfg: FlowHttpConfig | undefined): string[] {
  const found = new Set<string>();
  if (!cfg) return [];
  collect(cfg.url, found);
  collectPairs(cfg.query, found);
  collectPairs(cfg.headers, found, true);
  if (cfg.method !== "GET") {
    if (cfg.bodyType === "json" || cfg.bodyType === "text") collect(cfg.body, found);
    if (cfg.bodyType === "form") collectPairs(cfg.formFields, found);
  }
  return [...found];
}

/** Nombre de variable sugerido para una ruta: última clave no numérica, único entre `existing`. */
export function suggestVariableName(path: string, existing: string[]): string {
  let base = "respuesta";
  if (path.trim() !== "$") {
    const keys = path
      .split(/[.[\]]/)
      .map((k) => k.trim())
      .filter((k) => k && !/^\d+$/.test(k) && k !== "$");
    const last = keys[keys.length - 1];
    if (last) {
      const clean = last.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 50);
      if (clean) base = clean;
    }
  }
  const taken = new Set(existing);
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) {
    const suffix = `_${i}`;
    const candidate = base.slice(0, 50 - suffix.length) + suffix;
    if (!taken.has(candidate)) return candidate;
  }
}

const BLOCKED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** Lee `a.b[0].c` (o `$` = todo). Devuelve undefined si la ruta no existe. */
export function getPath(source: unknown, path: string): unknown {
  const p = String(path ?? "").trim();
  if (p === "$") return source;
  const tokens: string[] = [];
  for (const m of p.replace(/^\$\.?/, "").matchAll(/[^.[\]]+/g)) tokens.push(m[0]);
  if (!tokens.length) return undefined;
  let cur: unknown = source;
  for (const t of tokens) {
    if (BLOCKED_KEYS.has(t) || cur === null || typeof cur !== "object") return undefined;
    if (Array.isArray(cur)) {
      if (!/^\d+$/.test(t)) return undefined;
      cur = cur[Number(t)];
    } else {
      if (!Object.prototype.hasOwnProperty.call(cur, t)) return undefined;
      cur = (cur as Record<string, unknown>)[t];
    }
  }
  return cur;
}

/** Valor como lo guardaría el nodo: texto, objetos en JSON, máx. 4000 caracteres. */
export function previewValue(v: unknown): string {
  const text = typeof v === "string" ? v : typeof v === "object" && v !== null ? JSON.stringify(v) : String(v);
  return text.length > HTTP_MAX_VALUE_CHARS ? text.slice(0, HTTP_MAX_VALUE_CHARS) : text;
}

// ─── Valores de ejemplo de la prueba ───
// Viven en memoria del módulo (no en el flujo) para sobrevivir al cambio de nodo seleccionado.
// El editor los borra al cerrarse con `clearHttpSamples`.
const samples = new Map<string, Record<string, string>>();

export function getHttpSamples(flowId: string): Record<string, string> {
  return samples.get(flowId) ?? {};
}

export function setHttpSample(flowId: string, name: string, value: string) {
  samples.set(flowId, { ...getHttpSamples(flowId), [name]: value });
}

export function clearHttpSamples() {
  samples.clear();
}
