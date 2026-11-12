import * as vm from 'vm';
import type {
  FlowConditionBranch,
  FlowConditionOperator,
  FlowConditionRule,
  FlowConditionSource,
} from './conversation-flow.entity';

/**
 * Evaluación de las condiciones de un flujo. Es una función pura: no consulta la
 * base de datos ni la red; todo lo que necesita llega en `ConditionEnv`.
 */

/** Zona horaria de las reglas de hora, día y fecha (la misma que usan los horarios del bot). */
export const CONDITION_TIMEZONE = 'America/Bogota';

export interface ConditionEnv {
  now: Date;
  /** Texto del último mensaje del contacto (el título del botón si pulsó uno). */
  lastMessage: string;
  channel: string;
  inboxId: string;
  labelIds: string[];
  conversationStatus: string;
  /** Cuántos mensajes ha enviado el contacto en la conversación. */
  inboundCount: number;
  hasContact: boolean;
  /** Valor de una variable: primero las del flujo y luego los campos del CRM. */
  lookup(key: string): string;
  /** Sustituye {{variables}} en un texto. */
  interpolate(text: string): string;
  /** Número aleatorio en [0, 1); inyectable para poder probar el reparto. */
  random(): number;
}

// ─── Listas de operadores y fuentes válidos (los usa el saneado del servicio) ──

export const CONDITION_SOURCES: ReadonlySet<FlowConditionSource> = new Set([
  'variable',
  'message',
  'channel',
  'inbox',
  'label',
  'new_conversation',
  'has_contact',
  'inbound_count',
  'conversation_status',
  'time_of_day',
  'weekday',
  'date',
  'random',
]);

export const CONDITION_OPERATORS: ReadonlySet<FlowConditionOperator> = new Set([
  'equals',
  'not_equals',
  'contains',
  'not_contains',
  'starts_with',
  'ends_with',
  'in_list',
  'not_in_list',
  'regex',
  'is_set',
  'is_not_set',
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'between',
  'date_before',
  'date_after',
  'date_on',
  'date_between',
  'within_last_days',
  'older_than_days',
  'is_true',
  'is_false',
  'percent',
  'greater_than',
  'less_than',
]);

/** Límites de las expresiones regulares (las escribe un usuario y se ejecutan sobre texto del contacto). */
export const REGEX_MAX_PATTERN = 200;
const REGEX_MAX_INPUT = 1000;
const REGEX_TIMEOUT_MS = 50;

// ─── Utilidades de interpretación ─────────────────────────────

/** Minúsculas, sin tildes y sin espacios de los bordes. */
export function normalizeText(s: string): string {
  return (s ?? '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Número desde un texto. Entiende `1234`, `1234.5`, `1234,5`, `1.234,56`,
 * `1,234.56` y espacios o símbolos de moneda alrededor. NaN si no es un número.
 */
export function parseNumber(raw: string): number {
  let s = (raw ?? '').toString().replace(/[\s$€£]/g, '');
  if (!/^[-+]?[\d.,]+$/.test(s)) return NaN;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    // El separador que aparece último es el decimal; el otro agrupa miles.
    s =
      lastComma > lastDot
        ? s.replace(/\./g, '').replace(',', '.')
        : s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    // Una sola coma como decimal («12,5»); varias son miles («1,234,567»).
    s =
      s.indexOf(',') === lastComma ? s.replace(',', '.') : s.replace(/,/g, '');
  } else if (lastDot >= 0 && s.indexOf('.') !== lastDot) {
    s = s.replace(/\./g, ''); // «1.234.567»
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function parseList(raw: string): string[] {
  return (raw ?? '')
    .split(/[,;\n]/)
    .map((x) => normalizeText(x))
    .filter(Boolean);
}

const DAY_MS = 86_400_000;

/** Día (número de días desde 1970, en UTC) de una fecha escrita; null si no es una fecha válida. */
export function parseDay(raw: string): number | null {
  const s = (raw ?? '').toString().trim();
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|[T\s])/.exec(s);
  if (match) {
    y = +match[1];
    m = +match[2];
    d = +match[3];
  } else if ((match = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(s))) {
    // Día/mes/año, como se escribe en Colombia.
    d = +match[1];
    m = +match[2];
    y = +match[3];
  } else {
    return null;
  }
  const t = Date.UTC(y, m - 1, d);
  const check = new Date(t);
  // Rechaza fechas imposibles como el 31 de febrero.
  if (
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() !== m - 1 ||
    check.getUTCDate() !== d
  ) {
    return null;
  }
  return Math.floor(t / DAY_MS);
}

function zonedParts(now: Date): {
  day: number;
  minutes: number;
  weekday: number;
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CONDITION_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return {
    day: Math.floor(
      Date.UTC(+get('year'), +get('month') - 1, +get('day')) / DAY_MS,
    ),
    minutes: +get('hour') * 60 + +get('minute'),
    weekday: weekdays.indexOf(get('weekday')),
  };
}

/** «HH:mm» a minutos desde la medianoche; NaN si no es una hora válida. */
export function parseClock(raw: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec((raw ?? '').trim());
  if (!m) return NaN;
  const h = +m[1];
  const min = +m[2];
  return h <= 23 && min <= 59 ? h * 60 + min : NaN;
}

const WEEKDAY_NAMES: Record<string, number> = {
  domingo: 0,
  dom: 0,
  lunes: 1,
  lun: 1,
  martes: 2,
  mar: 2,
  miercoles: 3,
  mie: 3,
  jueves: 4,
  jue: 4,
  viernes: 5,
  vie: 5,
  sabado: 6,
  sab: 6,
};

function parseWeekdays(raw: string): Set<number> {
  const out = new Set<number>();
  for (const token of parseList(raw)) {
    if (/^[0-6]$/.test(token)) out.add(+token);
    else if (token in WEEKDAY_NAMES) out.add(WEEKDAY_NAMES[token]);
  }
  return out;
}

const TRUTHY = new Set(['si', 'yes', 'true', '1', 'verdadero', 'y', 's']);
function isTruthy(raw: string): boolean {
  return TRUTHY.has(normalizeText(raw));
}

/**
 * Prueba una expresión regular sin dejar que bloquee el servidor. Una
 * expresión mal escrita puede tardar minutos en una entrada corta (backtracking
 * catastrófico), así que se ejecuta en un contexto aislado con límite de tiempo.
 * Inválida, demasiado larga o que se pasa de tiempo: no coincide.
 */
export function safeRegexTest(pattern: string, text: string): boolean {
  if (!pattern || pattern.length > REGEX_MAX_PATTERN) return false;
  let re: RegExp;
  try {
    re = new RegExp(pattern, 'i');
  } catch {
    return false;
  }
  try {
    const ctx = vm.createContext({
      re,
      text: (text ?? '').slice(0, REGEX_MAX_INPUT),
    });
    return vm.runInContext('re.test(text)', ctx, {
      timeout: REGEX_TIMEOUT_MS,
    }) as boolean;
  } catch {
    return false;
  }
}

/** ¿Es una expresión regular válida y de tamaño admitido? (para avisar al guardar) */
export function isValidRegex(pattern: string): boolean {
  if (!pattern || pattern.length > REGEX_MAX_PATTERN) return false;
  try {
    new RegExp(pattern, 'i');
    return true;
  } catch {
    return false;
  }
}

// ─── Evaluación ───────────────────────────────────────────────

function compareNumbers(
  op: FlowConditionOperator,
  actual: number,
  a: number,
  b: number,
): boolean {
  // Un valor que no es número nunca cumple una comparación, salvo «distinto de».
  if (op === 'neq') return !(actual === a);
  if (Number.isNaN(actual) || Number.isNaN(a)) return false;
  switch (op) {
    case 'eq':
      return actual === a;
    case 'gt':
    case 'greater_than':
      return actual > a;
    case 'gte':
      return actual >= a;
    case 'lt':
    case 'less_than':
      return actual < a;
    case 'lte':
      return actual <= a;
    case 'between': {
      if (Number.isNaN(b)) return false;
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      return actual >= lo && actual <= hi;
    }
    default:
      return false;
  }
}

/** Compara una hora del día (en minutos). Admite rangos que cruzan la medianoche (22:00–06:00). */
function compareClock(
  op: FlowConditionOperator,
  actual: number,
  a: number,
  b: number,
): boolean {
  if (op === 'between') {
    if (Number.isNaN(a) || Number.isNaN(b)) return false;
    return a <= b ? actual >= a && actual <= b : actual >= a || actual <= b;
  }
  return compareNumbers(op, actual, a, b);
}

function compareDays(
  op: FlowConditionOperator,
  actual: number | null,
  a: number | null,
  b: number | null,
): boolean {
  if (actual === null) return false;
  switch (op) {
    case 'date_before':
      return a !== null && actual < a;
    case 'date_after':
      return a !== null && actual > a;
    case 'date_on':
      return a !== null && actual === a;
    case 'date_between': {
      if (a === null || b === null) return false;
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      return actual >= lo && actual <= hi;
    }
    default:
      return false;
  }
}

/** Aplica un operador de texto, número, fecha o sí/no sobre un valor ya leído. */
function applyOperator(
  op: FlowConditionOperator,
  actualRaw: string,
  expectedRaw: string,
  expected2Raw: string,
  patternRaw: string,
  today: number,
): boolean {
  const actual = (actualRaw ?? '').toString();
  const n = normalizeText;
  switch (op) {
    // ── Texto ──
    case 'equals':
      return n(actual) === n(expectedRaw);
    case 'not_equals':
      return n(actual) !== n(expectedRaw);
    // Un valor vacío no coincide con nada: una regla a medio escribir no debe
    // enviar a todo el mundo por esa rama.
    case 'contains':
      return n(expectedRaw) !== '' && n(actual).includes(n(expectedRaw));
    case 'not_contains':
      return n(expectedRaw) !== '' && !n(actual).includes(n(expectedRaw));
    case 'starts_with':
      return n(expectedRaw) !== '' && n(actual).startsWith(n(expectedRaw));
    case 'ends_with':
      return n(expectedRaw) !== '' && n(actual).endsWith(n(expectedRaw));
    case 'in_list':
      return parseList(expectedRaw).includes(n(actual));
    case 'not_in_list':
      return !parseList(expectedRaw).includes(n(actual));
    case 'regex':
      return safeRegexTest(patternRaw, actual);

    // ── Presencia ──
    case 'is_set':
      return actual.trim() !== '';
    case 'is_not_set':
      return actual.trim() === '';

    // ── Número ──
    case 'eq':
    case 'neq':
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte':
    case 'between':
    case 'greater_than':
    case 'less_than':
      return compareNumbers(
        op,
        parseNumber(actual),
        parseNumber(expectedRaw),
        parseNumber(expected2Raw),
      );

    // ── Fecha ──
    case 'date_before':
    case 'date_after':
    case 'date_on':
    case 'date_between':
      return compareDays(
        op,
        parseDay(actual),
        parseDay(expectedRaw),
        parseDay(expected2Raw),
      );
    case 'within_last_days': {
      const d = parseDay(actual);
      const days = parseNumber(expectedRaw);
      return (
        d !== null && !Number.isNaN(days) && today - d >= 0 && today - d <= days
      );
    }
    case 'older_than_days': {
      const d = parseDay(actual);
      const days = parseNumber(expectedRaw);
      return d !== null && !Number.isNaN(days) && today - d > days;
    }

    // ── Sí / No ──
    case 'is_true':
      return isTruthy(actual);
    case 'is_false':
      return !isTruthy(actual);

    default:
      return false;
  }
}

export function evaluateRule(
  rule: FlowConditionRule,
  env: ConditionEnv,
): boolean {
  const op = rule.operator;
  const expected = env.interpolate(rule.value ?? '');
  const expected2 = env.interpolate(rule.value2 ?? '');
  // La expresión regular se usa tal cual: sustituir variables dentro de ella
  // dejaría que el texto de un contacto altere el patrón.
  const pattern = rule.value ?? '';
  const parts = zonedParts(env.now);
  const apply = (actual: string) =>
    applyOperator(op, actual, expected, expected2, pattern, parts.day);

  switch (rule.source) {
    case 'variable':
      return apply(env.lookup(rule.field ?? ''));
    case 'message':
      return apply(env.lastMessage);
    case 'channel':
      return apply(env.channel);
    case 'inbox':
      return apply(env.inboxId);
    case 'conversation_status':
      // 'closed' es el nombre antiguo de 'resolved'.
      return apply(
        env.conversationStatus === 'closed'
          ? 'resolved'
          : env.conversationStatus,
      );
    case 'inbound_count':
      return apply(String(env.inboundCount));
    case 'label':
      return apply(env.labelIds.includes(rule.field ?? '') ? 'true' : 'false');
    case 'new_conversation':
      return apply(env.inboundCount <= 1 ? 'true' : 'false');
    case 'has_contact':
      return apply(env.hasContact ? 'true' : 'false');
    case 'date':
      return compareDays(
        op,
        parts.day,
        parseDay(expected),
        parseDay(expected2),
      );
    case 'time_of_day':
      return compareClock(
        op,
        parts.minutes,
        parseClock(expected),
        parseClock(expected2),
      );
    case 'weekday': {
      const days = parseWeekdays(rule.value ?? '');
      const hit = days.has(parts.weekday);
      return op === 'not_in_list' ? !hit : hit;
    }
    case 'random': {
      const pct = parseNumber(expected);
      return !Number.isNaN(pct) && env.random() * 100 < pct;
    }
    default:
      return false;
  }
}

/** Una rama se cumple si lo hacen todas sus reglas (o alguna, según `match`). Sin reglas, nunca. */
export function evaluateBranch(
  branch: FlowConditionBranch,
  env: ConditionEnv,
): boolean {
  const rules = branch.rules ?? [];
  if (rules.length === 0) return false;
  const run = (rule: FlowConditionRule) => {
    try {
      return evaluateRule(rule, env);
    } catch {
      return false;
    }
  };
  return branch.match === 'any' ? rules.some(run) : rules.every(run);
}
