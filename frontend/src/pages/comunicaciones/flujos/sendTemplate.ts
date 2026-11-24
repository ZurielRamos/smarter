import { getTemplateFields } from "@/lib/templateFields";
import type { FlowAction } from "./types";

/** Lo que falta en una acción «Enviar plantilla»; null si está lista. */
export function sendTemplateIssue(a: FlowAction): string | null {
  if (!a.inboxId) return "Elige el canal de WhatsApp";
  if (!a.templateName) return "Elige la plantilla";
  const missing = getTemplateFields(a.templateComponents).some((f) => f.kind === "text" && !a.templateVariables?.[f.key]?.trim());
  if (missing) return "Completa las variables de la plantilla";
  const r = a.recipients ?? { mode: "current" as const };
  if (r.mode === "contacts" && !(r.recordIds ?? []).length) return "Elige al menos un contacto";
  if (r.mode === "list" && !r.listId) return "Elige una lista";
  return null;
}
