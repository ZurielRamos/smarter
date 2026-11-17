/**
 * Motor de plantillas de contratos.
 *
 * Es un lenguaje deliberadamente pequeño y SIN ejecución de código: solo
 * sustituye variables y evalúa condicionales sencillos. Una plantilla la
 * escribe un usuario de la cuenta, así que el motor nunca debe poder leer
 * propiedades heredadas (`constructor`, `__proto__`) ni ejecutar nada.
 *
 * Sintaxis:
 *   {{ company.legalName }}                    variable
 *   {{ contract.rate | money }}                variable con filtro (se pueden encadenar)
 *   {{#if legal.confidentiality.enabled}} … {{else}} … {{/if}}
 *   {{#if legal.payment.frequency == 'monthly'}} … {{/if}}      igualdad ( == / != )
 *   {{#unless contract.endDate}} … {{/unless}}
 *
 * Filtros: date, money, number, pct, words, upper, lower, label.
 * Es "falsy": undefined, null, '', false, 0 y [] (el 0 cuenta como "no definido",
 * útil para porcentajes y plazos opcionales).
 */

export type Language = 'es' | 'en';

export class TemplateSyntaxError extends Error {}

const PATH_RE = /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*){0,5}$/;
const FILTER_RE = /^[a-z]+$/;
const COND_RE = /^([a-zA-Z_][a-zA-Z0-9_.]*)\s*(==|!=)\s*'([^']{0,100})'$/;
const MAX_DEPTH = 6;
const MAX_NODES = 3000;

export const FILTERS = ['date', 'money', 'number', 'pct', 'words', 'upper', 'lower', 'label'] as const;
type FilterName = (typeof FILTERS)[number];

interface Cond {
  path: string;
  op?: '==' | '!=';
  literal?: string;
}

type Node =
  | { t: 'text'; v: string }
  | { t: 'var'; path: string; filters: FilterName[] }
  | { t: 'if'; cond: Cond; negate: boolean; then: Node[]; otherwise: Node[] };

// ───────────────────────────── Parser ─────────────────────────────

export function parseTemplate(source: string): Node[] {
  const root: Node[] = [];
  // Pila de bloques abiertos: lista actual, tipo y si ya se vio {{else}}.
  const stack: Array<{ kind: 'if' | 'unless'; node: Extract<Node, { t: 'if' }>; inElse: boolean }> = [];
  let current = root;
  let count = 0;

  const push = (n: Node) => {
    if (++count > MAX_NODES) throw new TemplateSyntaxError('La plantilla es demasiado compleja');
    current.push(n);
  };

  const re = /\{\{([\s\S]*?)\}\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    if (m.index > last) push({ t: 'text', v: source.slice(last, m.index) });
    last = m.index + m[0].length;
    const tag = m[1].trim();

    if (tag.startsWith('#if ') || tag.startsWith('#unless ')) {
      const kind = tag.startsWith('#if ') ? 'if' : 'unless';
      const cond = parseCond(tag.slice(kind === 'if' ? 4 : 8).trim());
      const node: Extract<Node, { t: 'if' }> = { t: 'if', cond, negate: kind === 'unless', then: [], otherwise: [] };
      push(node);
      if (stack.length >= MAX_DEPTH) throw new TemplateSyntaxError('Condicionales anidados en exceso');
      stack.push({ kind, node, inElse: false });
      current = node.then;
    } else if (tag === 'else') {
      const top = stack[stack.length - 1];
      if (!top) throw new TemplateSyntaxError('«{{else}}» sin un «{{#if}}» abierto');
      if (top.inElse) throw new TemplateSyntaxError('«{{else}}» repetido en el mismo bloque');
      top.inElse = true;
      current = top.node.otherwise;
    } else if (tag === '/if' || tag === '/unless') {
      const top = stack.pop();
      const expected = tag === '/if' ? 'if' : 'unless';
      if (!top) throw new TemplateSyntaxError(`«{{${tag}}}» sin bloque abierto`);
      if (top.kind !== expected) {
        throw new TemplateSyntaxError(`Se esperaba «{{/${top.kind}}}» y se encontró «{{${tag}}}»`);
      }
      current = stack.length ? (stack[stack.length - 1].inElse ? stack[stack.length - 1].node.otherwise : stack[stack.length - 1].node.then) : root;
    } else if (tag.startsWith('#') || tag.startsWith('/')) {
      throw new TemplateSyntaxError(`Instrucción desconocida: «{{${tag}}}»`);
    } else {
      push(parseVar(tag));
    }
  }
  if (last < source.length) push({ t: 'text', v: source.slice(last) });
  if (stack.length) throw new TemplateSyntaxError(`Falta cerrar «{{/${stack[stack.length - 1].kind}}}»`);
  if (/\{\{|\}\}/.test(source.replace(re, ''))) {
    throw new TemplateSyntaxError('Hay llaves «{{» o «}}» sin cerrar');
  }
  return root;
}

function parseCond(expr: string): Cond {
  const eq = COND_RE.exec(expr);
  if (eq) {
    assertPath(eq[1]);
    return { path: eq[1], op: eq[2] as '==' | '!=', literal: eq[3] };
  }
  assertPath(expr);
  return { path: expr };
}

function parseVar(tag: string): Node {
  if (!tag) throw new TemplateSyntaxError('Variable vacía «{{ }}»');
  const [rawPath, ...rawFilters] = tag.split('|').map((s) => s.trim());
  assertPath(rawPath);
  const filters = rawFilters.map((f) => {
    if (!FILTER_RE.test(f) || !(FILTERS as readonly string[]).includes(f)) {
      throw new TemplateSyntaxError(`Filtro desconocido «${f}». Disponibles: ${FILTERS.join(', ')}`);
    }
    return f as FilterName;
  });
  return { t: 'var', path: rawPath, filters };
}

function assertPath(path: string): void {
  if (!PATH_RE.test(path)) throw new TemplateSyntaxError(`Variable no válida: «${path}»`);
}

/** Todas las rutas de variables que usa una plantilla (interpolaciones y condiciones). */
export function collectPaths(nodes: Node[], out = new Set<string>()): Set<string> {
  for (const n of nodes) {
    if (n.t === 'var') out.add(n.path);
    else if (n.t === 'if') {
      out.add(n.cond.path);
      collectPaths(n.then, out);
      collectPaths(n.otherwise, out);
    }
  }
  return out;
}

// ───────────────────────────── Render ─────────────────────────────

export interface RenderOptions {
  language: Language;
  /** Moneda del filtro `money`. */
  currency?: string | null;
  /** Diccionario del filtro `label`: valor técnico → texto legible. */
  labels?: Record<string, string>;
}

export interface RenderResult {
  text: string;
  /** Variables que se usaron en el texto y no tienen valor. */
  missing: string[];
}

export function renderTemplate(source: string, ctx: Record<string, any>, opts: RenderOptions): RenderResult {
  const missing = new Set<string>();
  const ast = parseTemplate(source);
  const text = renderNodes(ast, ctx, opts, missing);
  return { text, missing: [...missing] };
}

// ─────────────────── Renderizado parcial (modelos de partida) ───────────────────

export interface PartialOptions extends RenderOptions {
  /** Raíces que se resuelven ahora; cualquier otra se conserva como variable del contrato. */
  resolveRoots: ReadonlySet<string>;
  /** Traduce la ruta de una variable que se conserva (p. ej. contractor.city → contacto.ciudad). */
  rename: (path: string) => string;
  /** Texto que se escribe cuando una variable que se resuelve ahora no tiene valor. */
  placeholder: (path: string) => string;
}

/**
 * Resuelve solo una parte de la plantilla y deja el resto como plantilla. Sirve
 * para generar el texto inicial de un modelo: los parámetros del país se
 * sustituyen por su valor y las variables del contacto y del contrato se
 * conservan (con su nombre nuevo, filtros y condicionales) para resolverse al
 * generar cada contrato.
 */
export function renderPartial(source: string, ctx: Record<string, any>, opts: PartialOptions): string {
  return partialNodes(parseTemplate(source), ctx, opts);
}

function partialNodes(nodes: Node[], ctx: Record<string, any>, opts: PartialOptions): string {
  let out = '';
  for (const n of nodes) {
    if (n.t === 'text') {
      out += n.v;
    } else if (n.t === 'var') {
      if (opts.resolveRoots.has(n.path.split('.')[0])) {
        const value = formatValue(resolvePath(ctx, n.path), n.filters, opts);
        out += value !== '' ? value : opts.placeholder(n.path);
      } else {
        out += `{{${opts.rename(n.path)}${n.filters.map((f) => ` | ${f}`).join('')}}}`;
      }
    } else if (opts.resolveRoots.has(n.cond.path.split('.')[0])) {
      const value = resolvePath(ctx, n.cond.path);
      let truthy = n.cond.op ? (String(value ?? '') === n.cond.literal) === (n.cond.op === '==') : !isEmpty(value);
      if (n.negate) truthy = !truthy;
      out += partialNodes(truthy ? n.then : n.otherwise, ctx, opts);
    } else {
      const tag = n.negate ? 'unless' : 'if';
      const cond = `${opts.rename(n.cond.path)}${n.cond.op ? ` ${n.cond.op} '${n.cond.literal}'` : ''}`;
      out += `{{#${tag} ${cond}}}${partialNodes(n.then, ctx, opts)}`;
      if (n.otherwise.length) out += `{{else}}${partialNodes(n.otherwise, ctx, opts)}`;
      out += `{{/${tag}}}`;
    }
  }
  return out;
}

export function resolvePath(ctx: Record<string, any>, path: string): unknown {
  let cur: any = ctx;
  for (const seg of path.split('.')) {
    // Solo propiedades propias de objetos planos: nunca prototipos.
    if (cur === null || typeof cur !== 'object' || !Object.prototype.hasOwnProperty.call(cur, seg)) return undefined;
    cur = cur[seg];
  }
  return cur;
}

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === '' || v === false || v === 0 || (Array.isArray(v) && v.length === 0);
}

function renderNodes(nodes: Node[], ctx: Record<string, any>, opts: RenderOptions, missing: Set<string>): string {
  let out = '';
  for (const n of nodes) {
    if (n.t === 'text') {
      out += n.v;
    } else if (n.t === 'var') {
      const raw = resolvePath(ctx, n.path);
      const formatted = formatValue(raw, n.filters, opts);
      if (formatted === '') missing.add(n.path);
      out += formatted;
    } else {
      const value = resolvePath(ctx, n.cond.path);
      let truthy: boolean;
      if (n.cond.op) {
        const same = String(value ?? '') === n.cond.literal;
        truthy = n.cond.op === '==' ? same : !same;
      } else {
        truthy = !isEmpty(value);
      }
      if (n.negate) truthy = !truthy;
      out += renderNodes(truthy ? n.then : n.otherwise, ctx, opts, missing);
    }
  }
  return out;
}

function formatValue(raw: unknown, filters: FilterName[], opts: RenderOptions): string {
  if (raw === undefined || raw === null || raw === '') return '';
  let value: unknown = raw;
  for (const f of filters) value = applyFilter(f, value, opts);

  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? (opts.language === 'es' ? 'Sí' : 'Yes') : opts.language === 'es' ? 'No' : 'No';
  if (Array.isArray(value)) return value.map((v) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '')).filter(Boolean).join(', ');
  return ''; // objetos: no se interpolan
}

function applyFilter(name: FilterName, value: unknown, opts: RenderOptions): unknown {
  const locale = opts.language;
  switch (name) {
    case 'upper':
      return String(value).toUpperCase();
    case 'lower':
      return String(value).toLowerCase();
    case 'label': {
      const key = String(value);
      return opts.labels && Object.prototype.hasOwnProperty.call(opts.labels, key) ? opts.labels[key] : key;
    }
    case 'date': {
      const s = String(value);
      if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return s;
      const d = new Date(`${s.slice(0, 10)}T00:00:00Z`);
      if (Number.isNaN(d.getTime())) return s;
      return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(d);
    }
    case 'number': {
      const n = Number(value);
      return Number.isFinite(n) ? new Intl.NumberFormat(locale, { useGrouping: 'always' as any, maximumFractionDigits: 2 }).format(n) : '';
    }
    case 'pct': {
      const n = Number(value);
      return Number.isFinite(n) ? `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(n)} %` : '';
    }
    case 'money': {
      const n = Number(value);
      if (!Number.isFinite(n)) return '';
      const currency = opts.currency && /^[A-Z]{3}$/.test(opts.currency) ? opts.currency : undefined;
      // Siempre con separador de miles; sin decimales si es entero y con 2 si no
      // (un contrato debe decir «1.500,50», no «1500,5»).
      const digits = Number.isInteger(n) ? 0 : 2;
      const base = { useGrouping: 'always' as any, minimumFractionDigits: digits, maximumFractionDigits: digits };
      try {
        return currency
          ? new Intl.NumberFormat(locale, { style: 'currency', currency, ...base }).format(n)
          : new Intl.NumberFormat(locale, base).format(n);
      } catch {
        return String(n);
      }
    }
    case 'words': {
      const n = Number(value);
      return Number.isFinite(n) && n >= 0 ? amountInWords(n, locale) : '';
    }
  }
}

// ─────────────────────── Números en letras (es / en) ───────────────────────

const ES_UNITS = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const ES_TENS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const ES_HUNDREDS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

function esBelow100(n: number): string {
  if (n < 30) return ES_UNITS[n];
  const d = Math.floor(n / 10);
  const u = n % 10;
  return u ? `${ES_TENS[d]} y ${ES_UNITS[u]}` : ES_TENS[d];
}

function esBelow1000(n: number): string {
  if (n === 100) return 'cien';
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? ES_HUNDREDS[h] : '', r ? esBelow100(r) : ''].filter(Boolean).join(' ');
}

/** «uno» → «un», «veintiuno» → «veintiún» cuando precede a «mil» o «millones». */
function esApocope(s: string): string {
  return s.replace(/veintiuno$/, 'veintiún').replace(/uno$/, 'un');
}

function esInteger(n: number): string {
  if (n === 0) return 'cero';
  const parts: string[] = [];
  const millions = Math.floor(n / 1_000_000);
  const rest = n % 1_000_000;
  if (millions) parts.push(millions === 1 ? 'un millón' : `${esApocope(esInteger(millions))} millones`);
  const thousands = Math.floor(rest / 1000);
  const units = rest % 1000;
  if (thousands) parts.push(thousands === 1 ? 'mil' : `${esApocope(esBelow1000(thousands))} mil`);
  if (units) parts.push(esBelow1000(units));
  return parts.join(' ');
}

const EN_UNITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const EN_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function enBelow1000(n: number): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (h) parts.push(`${EN_UNITS[h]} hundred`);
  if (r) {
    if (r < 20) parts.push(EN_UNITS[r]);
    else parts.push(r % 10 ? `${EN_TENS[Math.floor(r / 10)]}-${EN_UNITS[r % 10]}` : EN_TENS[Math.floor(r / 10)]);
  }
  return parts.join(' ');
}

function enInteger(n: number): string {
  if (n === 0) return 'zero';
  const scales = ['', ' thousand', ' million', ' billion', ' trillion'];
  const parts: string[] = [];
  let i = 0;
  let rest = n;
  while (rest > 0 && i < scales.length) {
    const chunk = rest % 1000;
    if (chunk) parts.unshift(`${enBelow1000(chunk)}${scales[i]}`);
    rest = Math.floor(rest / 1000);
    i++;
  }
  return parts.join(' ');
}

/** 1500.5 → «mil quinientos con 50/100» (es) / «one thousand five hundred and 50/100» (en). */
export function amountInWords(amount: number, lang: Language): string {
  const cents = Math.round(amount * 100);
  const whole = Math.floor(cents / 100);
  const frac = cents % 100;
  if (whole > 999_999_999_999) return '';
  const fracText = frac ? ` ${lang === 'es' ? 'con' : 'and'} ${String(frac).padStart(2, '0')}/100` : '';
  return `${lang === 'es' ? esInteger(whole) : enInteger(whole)}${fracText}`;
}
