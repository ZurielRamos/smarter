import {
  FlowKeywordMatch,
  FlowTrigger,
  FlowTriggerFrequency,
  FlowTriggerSchedule,
  FlowTriggers,
  FlowTriggerType,
} from './conversation-flow.entity';
import {
  CONDITION_TIMEZONE,
  normalizeText,
  parseClock,
  safeRegexTest,
} from './flow-conditions.util';

/**
 * Disparadores de los flujos: conversión desde el formato antiguo, limpieza y
 * la lógica pura de coincidencia (sin BD). ConversationFlowsService elige el
 * flujo y ChatsService aplica las reglas que necesitan datos (audiencia,
 * frecuencia, flujo en curso).
 */

export const TRIGGER_TYPES: ReadonlySet<FlowTriggerType> = new Set([
  'keyword',
  'new_conversation',
  'template_reply',
  'ad_click',
]);
const KEYWORD_MATCHES: ReadonlySet<FlowKeywordMatch> = new Set([
  'exact',
  'contains',
  'starts_with',
  'regex',
]);

export const MAX_TRIGGERS = 20;
export const MAX_KEYWORDS = 50;
export const MAX_AUDIENCE_RULES = 10;
export const DEFAULT_TEMPLATE_WINDOW_HOURS = 72;
const MAX_TEMPLATE_WINDOW_HOURS = 720;

export const EMPTY_TRIGGERS: FlowTriggers = {
  version: 2,
  items: [],
  inboxIds: [],
};

/** Origen con el que arrancó un flujo (se guarda en flow_starts y en {{trigger_type}}). */
export type FlowStartSource =
  FlowTriggerType | 'campaign' | 'subflow' | FlowDirectStartSource;

/** Orígenes de un inicio explícito: desde el chat, una automatización o la API. */
export type FlowDirectStartSource = 'manual' | 'automation' | 'api';

const str = (v: unknown, max: number) =>
  String(v ?? '')
    .trim()
    .slice(0, max);

const strList = (v: unknown, maxItems: number, maxLen: number): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of Array.isArray(v) ? v : []) {
    const s = str(item, maxLen);
    const key = s.toLowerCase();
    if (!s || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= maxItems) break;
  }
  return out;
};

const cleanId = (v: unknown, fallback: string) =>
  String(v ?? '')
    .replace(/[^\w-]/g, '')
    .slice(0, 32) || fallback;

function cleanTrigger(raw: unknown, index: number): FlowTrigger | null {
  const t = (raw ?? {}) as Record<string, unknown>;
  const type = t.type as FlowTriggerType;
  if (!TRIGGER_TYPES.has(type)) return null;
  const id = cleanId(t.id, `t${index + 1}`);
  switch (type) {
    case 'keyword':
      return {
        id,
        type,
        keywords: strList(t.keywords, MAX_KEYWORDS, 200),
        matchType: KEYWORD_MATCHES.has(t.matchType as FlowKeywordMatch)
          ? (t.matchType as FlowKeywordMatch)
          : 'exact',
        ...(Array.isArray(t.exclude) && t.exclude.length
          ? { exclude: strList(t.exclude, MAX_KEYWORDS, 100) }
          : {}),
      };
    case 'new_conversation':
      return { id, type };
    case 'template_reply': {
      const hours = Math.floor(Number(t.withinHours));
      return {
        id,
        type,
        ...(str(t.templateName, 512)
          ? { templateName: str(t.templateName, 512) }
          : {}),
        buttons: strList(t.buttons, 10, 25),
        ...(t.anyReply === true ? { anyReply: true } : {}),
        withinHours:
          Number.isFinite(hours) && hours >= 1
            ? Math.min(hours, MAX_TEMPLATE_WINDOW_HOURS)
            : DEFAULT_TEMPLATE_WINDOW_HOURS,
      };
    }
    case 'ad_click':
      return {
        id,
        type,
        adIds: strList(t.adIds, 50, 64),
        ...(str(t.headlineContains, 200)
          ? { headlineContains: str(t.headlineContains, 200) }
          : {}),
      };
  }
}

function cleanSchedule(raw: unknown): FlowTriggerSchedule | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  const days = [
    ...new Set(
      (Array.isArray(s.days) ? s.days : [])
        .map(Number)
        .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6),
    ),
  ].sort();
  const from = str(s.from, 5);
  const to = str(s.to, 5);
  if (!days.length || isNaN(parseClock(from)) || isNaN(parseClock(to)))
    return null;
  return { mode: s.mode === 'outside' ? 'outside' : 'inside', days, from, to };
}

function cleanFrequency(raw: unknown): FlowTriggerFrequency | null {
  if (!raw || typeof raw !== 'object') return null;
  const f = raw as Record<string, unknown>;
  if (f.mode === 'once') return { mode: 'once' };
  if (f.mode !== 'cooldown') return null;
  const unit = f.unit === 'hours' ? 'hours' : 'days';
  const after = Math.floor(Number(f.after));
  if (!Number.isFinite(after) || after < 1) return null;
  return {
    mode: 'cooldown',
    after: Math.min(after, unit === 'hours' ? 24 * 365 : 365),
    unit,
  };
}

/**
 * Lleva cualquier valor guardado (formato antiguo o nuevo) al formato 2 y
 * descarta lo que no se reconoce. Las reglas de audiencia se devuelven tal
 * cual: las valida el servicio con el mismo saneado del nodo Condición.
 */
export function normalizeTriggers(raw: unknown): FlowTriggers {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_TRIGGERS, items: [] };
  const t = raw as Record<string, unknown>;
  const inboxIds = (Array.isArray(t.inboxIds) ? t.inboxIds : [])
    .map(String)
    .filter(Boolean);

  // Formato antiguo: { keywords, matchType, onNewConversation, inboxIds }.
  if (t.version !== 2) {
    const items: FlowTrigger[] = [];
    const keywords = strList(t.keywords, MAX_KEYWORDS, 200);
    if (keywords.length)
      items.push({
        id: 'kw',
        type: 'keyword',
        keywords,
        matchType: t.matchType === 'contains' ? 'contains' : 'exact',
      });
    if (t.onNewConversation === true)
      items.push({ id: 'new', type: 'new_conversation' });
    return { version: 2, items, inboxIds };
  }

  const items: FlowTrigger[] = [];
  const seen = new Set<string>();
  for (const [i, item] of (Array.isArray(t.items) ? t.items : [])
    .slice(0, MAX_TRIGGERS)
    .entries()) {
    const clean = cleanTrigger(item, i);
    if (!clean) continue;
    if (seen.has(clean.id)) clean.id = `${clean.id}_${i + 1}`;
    seen.add(clean.id);
    items.push(clean);
  }
  const audience =
    t.audience && typeof t.audience === 'object'
      ? (t.audience as Record<string, unknown>)
      : null;
  const rules = Array.isArray(audience?.rules) ? audience!.rules : [];
  const priority = Math.floor(Number(t.priority));
  const schedule = cleanSchedule(t.schedule);
  const frequency = cleanFrequency(t.frequency);
  return {
    version: 2,
    items,
    inboxIds,
    ...(t.subflowOnly === true ? { subflowOnly: true } : {}),
    ...(schedule ? { schedule } : {}),
    ...(rules.length
      ? {
          audience: {
            match: audience!.match === 'any' ? 'any' : 'all',
            rules: rules as never,
          },
        }
      : {}),
    ...(frequency ? { frequency } : {}),
    ...(t.ifRunning === 'skip' ? { ifRunning: 'skip' } : {}),
    ...(Number.isFinite(priority) && priority > 0
      ? { priority: Math.min(priority, 100) }
      : {}),
  };
}

/** ¿Tiene algún disparador que lo inicie solo? */
export function hasAutoTriggers(t: FlowTriggers): boolean {
  if (t.subflowOnly) return false;
  return t.items.some(
    (i) => i.type !== 'keyword' || (i.keywords?.length ?? 0) > 0,
  );
}

// ─── Coincidencia ─────────────────────────────────────────────

/** Minúsculas, sin tildes y con los espacios repetidos colapsados. */
function norm(s: string): string {
  return normalizeText(s).replace(/\s+/g, ' ');
}

/** Palabra clave que coincide con el mensaje; null si ninguna (o si hay una exclusión). */
export function matchKeyword(
  trigger: FlowTrigger,
  text: string,
): string | null {
  const msg = norm(text);
  if (!msg) return null;
  if (trigger.exclude?.some((x) => norm(x) && msg.includes(norm(x))))
    return null;
  for (const k of trigger.keywords ?? []) {
    if (trigger.matchType === 'regex') {
      if (safeRegexTest(k, text)) return k;
      continue;
    }
    const kw = norm(k);
    if (!kw) continue;
    const hit =
      trigger.matchType === 'contains'
        ? msg.includes(kw)
        : trigger.matchType === 'starts_with'
          ? msg.startsWith(kw) && !/[a-z0-9ñ]/.test(msg[kw.length] ?? '')
          : msg === kw;
    if (hit) return k;
  }
  return null;
}

/** Respuesta del contacto a una plantilla enviada antes. */
export interface TemplateReplyInfo {
  templateName: string | null;
  /** Título del botón pulsado; null si respondió con texto */
  button: string | null;
  sentAt: Date;
}

export function matchTemplateReply(
  trigger: FlowTrigger,
  reply: TemplateReplyInfo,
  now: Date,
): boolean {
  const hours = trigger.withinHours ?? DEFAULT_TEMPLATE_WINDOW_HOURS;
  if (now.getTime() - reply.sentAt.getTime() > hours * 3_600_000) return false;
  if (
    trigger.templateName &&
    (reply.templateName ?? '').toLowerCase() !==
      trigger.templateName.toLowerCase()
  )
    return false;
  if (reply.button === null) return trigger.anyReply === true;
  const buttons = trigger.buttons ?? [];
  return (
    !buttons.length || buttons.some((b) => norm(b) === norm(reply.button!))
  );
}

/** Datos del anuncio Click-to-WhatsApp (referral de Meta). */
export interface AdReferralInfo {
  sourceId: string | null;
  headline: string | null;
}

export function matchAdClick(
  trigger: FlowTrigger,
  ad: AdReferralInfo,
): boolean {
  const ids = trigger.adIds ?? [];
  if (ids.length && !ids.includes(ad.sourceId ?? '')) return false;
  if (
    trigger.headlineContains &&
    !norm(ad.headline ?? '').includes(norm(trigger.headlineContains))
  )
    return false;
  return true;
}

// ─── Horario y frecuencia ─────────────────────────────────────

function clockNow(now: Date): { minutes: number; weekday: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CONDITION_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    minutes: +get('hour') * 60 + +get('minute'),
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(
      get('weekday'),
    ),
  };
}

/**
 * ¿Se puede iniciar ahora según el horario? Un horario que cruza la
 * medianoche (22:00 a 06:00) cuenta desde el día en que empieza.
 */
export function inSchedule(
  schedule: FlowTriggerSchedule | null | undefined,
  now: Date,
): boolean {
  if (!schedule) return true;
  const from = parseClock(schedule.from);
  const to = parseClock(schedule.to);
  const { minutes, weekday } = clockNow(now);
  const days = new Set(schedule.days);
  let inside: boolean;
  if (from <= to) {
    inside = days.has(weekday) && minutes >= from && minutes < to;
  } else {
    const yesterday = (weekday + 6) % 7;
    inside =
      (days.has(weekday) && minutes >= from) ||
      (days.has(yesterday) && minutes < to);
  }
  return schedule.mode === 'outside' ? !inside : inside;
}

/**
 * Desde cuándo cuenta un inicio anterior para la frecuencia: null = no hay
 * límite; epoch = cualquier inicio previo lo impide («una sola vez»).
 */
export function frequencySince(
  frequency: FlowTriggerFrequency | null | undefined,
  now: Date,
): Date | null {
  if (!frequency) return null;
  if (frequency.mode === 'once') return new Date(0);
  const ms =
    (frequency.after ?? 1) *
    (frequency.unit === 'hours' ? 3_600_000 : 86_400_000);
  return new Date(now.getTime() - ms);
}
