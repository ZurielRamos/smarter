import type { FlowTrigger, FlowTriggers, FlowTriggerType } from "./types";
import { shortId } from "./types";

/**
 * Disparadores del flujo en el formato 2. Un backend antiguo (o un flujo
 * guardado antes) puede devolver { keywords, matchType, onNewConversation,
 * inboxIds }: se convierte igual que en el servidor.
 */
export function normalizeTriggers(raw: unknown): FlowTriggers {
  const t = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const inboxIds: string[] = Array.isArray(t.inboxIds) ? t.inboxIds.map(String) : [];
  if (t.version === 2) {
    return { ...(t as FlowTriggers), items: Array.isArray(t.items) ? t.items : [], inboxIds };
  }
  const items: FlowTrigger[] = [];
  const keywords: string[] = Array.isArray(t.keywords) ? t.keywords.filter(Boolean) : [];
  if (keywords.length)
    items.push({ id: "kw", type: "keyword", keywords, matchType: t.matchType === "contains" ? "contains" : "exact" });
  if (t.onNewConversation === true) items.push({ id: "new", type: "new_conversation" });
  return { version: 2, items, inboxIds };
}

export const EMPTY_TRIGGERS: FlowTriggers = { version: 2, items: [], inboxIds: [] };

/** ¿Algún disparador lo inicia solo? (sin contar campañas ni «Iniciar flujo»). */
export function hasAutoTriggers(t: FlowTriggers): boolean {
  if (t.subflowOnly) return false;
  return t.items.some((i) => i.type !== "keyword" || (i.keywords?.length ?? 0) > 0);
}

export function newTrigger(type: FlowTriggerType): FlowTrigger {
  const id = shortId("t");
  switch (type) {
    case "keyword":
      return { id, type, keywords: [], matchType: "exact" };
    case "template_reply":
      return { id, type, templateName: "", buttons: [], withinHours: 72 };
    case "ad_click":
      return { id, type, adIds: [] };
    default:
      return { id, type };
  }
}

/** Problema que impide que el disparador funcione; null si está bien. */
export function triggerIssue(t: FlowTrigger): string | null {
  if (t.type === "keyword") {
    if (!t.keywords?.length) return "Agrega al menos una palabra clave";
    if (t.matchType === "regex") {
      const bad = t.keywords.find((k) => {
        try {
          new RegExp(k, "i");
          return k.length > 200;
        } catch {
          return true;
        }
      });
      if (bad) return `«${bad}» no es una expresión regular válida`;
    }
  }
  return null;
}

/** Resumen corto para la lista de flujos. */
export function describeTriggers(t: FlowTriggers): string | null {
  if (t.subflowOnly) return "solo como subflujo";
  const parts: string[] = [];
  for (const i of t.items) {
    if (i.type === "keyword" && i.keywords?.length)
      parts.push(i.keywords.slice(0, 3).join(", ") + (i.keywords.length > 3 ? "…" : ""));
    else if (i.type === "new_conversation") parts.push("conversación nueva");
    else if (i.type === "template_reply") parts.push(i.templateName ? `plantilla ${i.templateName}` : "respuesta a plantilla");
    else if (i.type === "ad_click") parts.push("anuncio de Meta");
  }
  return parts.length ? parts.join(" · ") : null;
}
