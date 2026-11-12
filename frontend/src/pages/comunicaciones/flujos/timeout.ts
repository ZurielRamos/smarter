import type { FlowNodeData, FlowNodeType, FlowTimeUnit, FlowTimeoutConfig } from "./types";

/** Límites de «Si no responde» (mismos que el servidor). */
export const TIMEOUT_MIN_MS = 60_000;
export const TIMEOUT_MAX_MS = 30 * 86_400_000;
export const MAX_REMINDERS = 3;
export const MAX_TEMPLATE_PARAMS = 10;

const UNIT_MS: Record<FlowTimeUnit, number> = { minutes: 60_000, hours: 3_600_000, days: 86_400_000 };

export function durationMs(amount: number, unit: FlowTimeUnit): number {
  return Math.round((Number(amount) || 0) * (UNIT_MS[unit] ?? UNIT_MS.minutes));
}

/** «30 min», «1 h», «2 días». */
export function shortDuration(amount: number, unit: FlowTimeUnit): string {
  const n = Number(amount) || 0;
  if (unit === "minutes") return `${n} min`;
  if (unit === "hours") return `${n} h`;
  return `${n} ${n === 1 ? "día" : "días"}`;
}

/** ¿El nodo puede tener «Si no responde»? Solo los que esperan al contacto. */
export function supportsTimeout(type: FlowNodeType, data: FlowNodeData): boolean {
  if (type === "user_input" || type === "ai_agent") return true;
  if (type === "message") return (data.buttons || []).some((b) => (b.type ?? "reply") === "reply" && b.title?.trim());
  return false;
}

/** Qué está mal en la configuración (mismas reglas que el servidor al guardar). */
export function timeoutIssue(t: FlowTimeoutConfig | undefined): string | null {
  if (!t?.enabled) return null;
  const total = durationMs(t.after, t.unit);
  if (total < TIMEOUT_MIN_MS || total > TIMEOUT_MAX_MS) return "El plazo debe estar entre 1 minuto y 30 días";
  for (const [i, r] of (t.reminders || []).entries()) {
    const ms = durationMs(r.after, r.unit);
    if (ms < TIMEOUT_MIN_MS || ms >= total) return `El recordatorio ${i + 1} debe ser de al menos 1 minuto y antes del plazo`;
    if (!r.message.trim()) return `Escribe el mensaje del recordatorio ${i + 1}`;
    if (r.template?.name && !/^[a-z0-9_]+$/.test(r.template.name))
      return `El nombre de la plantilla del recordatorio ${i + 1} solo admite minúsculas, números y _`;
  }
  return null;
}
