/**
 * Motor de plantillas `{{ruta.al.valor}}` de las automatizaciones.
 *
 * Raíces disponibles en el contexto:
 *  - trigger   → datos del disparador (p. ej. trigger.body.email)
 *  - vars      → variables definidas con «Definir variables» y el bucle (vars.item)
 *  - steps     → salida de cada nodo por id (steps.<nodeId>.output.campo)
 *  - now       → fecha/hora ISO actual
 */
export type TemplateContext = Record<string, unknown>;

const TOKEN = /\{\{\s*([^{}]+?)\s*\}\}/g;
const SINGLE_TOKEN = /^\s*\{\{\s*([^{}]+?)\s*\}\}\s*$/;

/** Resuelve una ruta con notación de puntos y corchetes (a.b[0].c). */
export function getPath(source: unknown, path: string): unknown {
  const parts = path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean);
  let cur: unknown = source;
  for (const part of parts) {
    if (cur === null || cur === undefined) return undefined;
    if (typeof cur !== 'object') return undefined;
    // Evita recorrer prototipos (p. ej. {{trigger.__proto__.x}}).
    if (part === '__proto__' || part === 'constructor' || part === 'prototype') {
      return undefined;
    }
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function stringify(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Sustituye las variables en un string. Un único token devuelve el valor tipado. */
export function renderString(tpl: string, ctx: TemplateContext): unknown {
  const single = SINGLE_TOKEN.exec(tpl);
  if (single) {
    const v = getPath(ctx, single[1]);
    return v === undefined ? '' : v;
  }
  return tpl.replace(TOKEN, (_m, path: string) => stringify(getPath(ctx, path)));
}

/** Sustituye recursivamente en strings, arrays y objetos. */
export function renderDeep<T = unknown>(value: T, ctx: TemplateContext): T {
  if (typeof value === 'string') return renderString(value, ctx) as T;
  if (Array.isArray(value)) return value.map((v) => renderDeep(v, ctx)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = renderDeep(v, ctx);
    return out as T;
  }
  return value;
}

/** Texto plano (siempre string) con las variables sustituidas. */
export function renderText(tpl: unknown, ctx: TemplateContext): string {
  if (tpl === undefined || tpl === null) return '';
  return stringify(renderString(String(tpl), ctx));
}
