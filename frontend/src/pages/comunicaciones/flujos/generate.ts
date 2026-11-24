import type { FlowAiFieldType, FlowAiGenerateConfig } from "./types";
import type { VariableMeta } from "./variables";

/** Límites del nodo «Generación IA» (mismos que el servidor). */
export const GENERATE_MAX_FIELDS = 15;
export const GENERATE_MAX_KEYS = 30;
export const GENERATE_MAX_MESSAGES = 50;
export const GENERATE_DEFAULT_MESSAGES = 10;
export const GENERATE_MAX_INSTRUCTIONS = 4000;
export const GENERATE_MAX_OPTIONS = 30;
export const GENERATE_DEFAULT_VARIABLE = "ai_text";

export const FIELD_TYPE_LABELS: Record<FlowAiFieldType, string> = {
  text: "Texto",
  number: "Número",
  date: "Fecha",
  boolean: "Sí / No",
  choice: "Una opción de una lista",
  email: "Correo electrónico",
  phone: "Teléfono",
};

export const CREATIVITY_OPTIONS: { value: NonNullable<FlowAiGenerateConfig["creativity"]>; label: string; description: string }[] = [
  { value: "precise", label: "Precisa", description: "Siempre igual" },
  { value: "balanced", label: "Equilibrada", description: "Natural" },
  { value: "creative", label: "Creativa", description: "Más variada" },
];

export const LENGTH_OPTIONS: { value: NonNullable<FlowAiGenerateConfig["length"]>; label: string }[] = [
  { value: "short", label: "Corta" },
  { value: "medium", label: "Media" },
  { value: "long", label: "Larga" },
];

export function defaultGenerateConfig(): FlowAiGenerateConfig {
  return { instructions: "", output: "text", context: { messages: GENERATE_DEFAULT_MESSAGES } };
}

/** Qué le falta al nodo para funcionar (se muestra en el lienzo). */
export function generateIssue(g: FlowAiGenerateConfig | undefined): string | null {
  if (!g?.instructions?.trim()) return "Escribe las instrucciones";
  if (g.output === "structured") {
    const fields = g.fields || [];
    if (!fields.length) return "Agrega al menos un dato";
    if (fields.some((f) => !f.variable || !f.description.trim())) return "Completa los datos a generar";
    if (fields.some((f) => f.type === "choice" && !(f.options || []).length)) return "Agrega las opciones de la lista";
    const names = fields.map((f) => f.variable);
    if (new Set(names).size !== names.length) return "Hay variables repetidas";
  }
  return null;
}

/** Variables que guarda el nodo, con su tipo para las condiciones. */
export function generatedVariables(g: FlowAiGenerateConfig | undefined): Record<string, VariableMeta> {
  if (!g) return {};
  if (g.output !== "structured") return { [g.variable || GENERATE_DEFAULT_VARIABLE]: { type: "text" } };
  const out: Record<string, VariableMeta> = {};
  for (const f of g.fields || []) {
    if (!f.variable) continue;
    out[f.variable] =
      f.type === "number"
        ? { type: "number" }
        : f.type === "date"
          ? { type: "date" }
          : f.type === "boolean"
            ? { type: "select", options: ["sí", "no"] }
            : f.type === "choice" && f.options?.length
              ? { type: "select", options: f.options }
              : { type: "text" };
  }
  return out;
}

/** Resumen de la información que recibe la IA (para el lienzo). */
export function describeGenerateContext(g: FlowAiGenerateConfig | undefined): string {
  const c = g?.context ?? {};
  const parts: string[] = [];
  if (c.messages) parts.push(`${c.messages} mensajes`);
  if (c.allContact) parts.push("contacto");
  if (c.allVariables) parts.push("variables");
  if (c.keys?.length) parts.push(c.keys.length === 1 ? "1 dato" : `${c.keys.length} datos`);
  if (c.projects) parts.push("proyectos");
  return parts.length ? `Usa: ${parts.join(", ")}` : "Solo las instrucciones";
}
