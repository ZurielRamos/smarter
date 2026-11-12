import { randomBytes } from 'crypto';
import type {
  FlowTimeUnit,
  FlowTimeoutConfig,
} from './conversation-flow.entity';
import type { FlowTimerKind } from './flow-timer.entity';

/** Límites de «Si no responde». */
export const TIMEOUT_MIN_MS = 60_000; // 1 minuto
export const TIMEOUT_MAX_MS = 30 * 86_400_000; // 30 días
export const MAX_REMINDERS = 3;
export const MAX_TEMPLATE_PARAMS = 10;
export const TIME_UNITS: ReadonlySet<FlowTimeUnit> = new Set([
  'minutes',
  'hours',
  'days',
]);

const UNIT_MS: Record<FlowTimeUnit, number> = {
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
};

export function durationMs(amount: number, unit: FlowTimeUnit): number {
  return Math.round(amount * (UNIT_MS[unit] ?? UNIT_MS.minutes));
}

/** Ficha nueva para una espera (24 caracteres hex). */
export function newWaitToken(): string {
  return randomBytes(12).toString('hex');
}

export interface PlannedTimer {
  kind: FlowTimerKind;
  step: number;
  fireAt: Date;
}

/**
 * Temporizadores de un nodo que empieza a esperar en `from`: los
 * recordatorios (que vencen antes del plazo) y el «Sin respuesta».
 */
export function planTimers(
  config: FlowTimeoutConfig | undefined,
  from: Date,
): PlannedTimer[] {
  if (!config?.enabled) return [];
  const total = durationMs(config.after, config.unit);
  if (!(total >= TIMEOUT_MIN_MS && total <= TIMEOUT_MAX_MS)) return [];
  const out: PlannedTimer[] = [];
  (config.reminders || []).forEach((r, step) => {
    const ms = durationMs(r.after, r.unit);
    if (ms >= TIMEOUT_MIN_MS && ms < total && r.message?.trim())
      out.push({
        kind: 'reminder',
        step,
        fireAt: new Date(from.getTime() + ms),
      });
  });
  out.push({
    kind: 'timeout',
    step: 0,
    fireAt: new Date(from.getTime() + total),
  });
  return out;
}

/** «30 minutos», «1 hora», «2 días». */
export function describeDuration(amount: number, unit: FlowTimeUnit): string {
  const n = Number(amount);
  const names: Record<FlowTimeUnit, [string, string]> = {
    minutes: ['minuto', 'minutos'],
    hours: ['hora', 'horas'],
    days: ['día', 'días'],
  };
  const [one, many] = names[unit] ?? names.minutes;
  return `${n} ${n === 1 ? one : many}`;
}
