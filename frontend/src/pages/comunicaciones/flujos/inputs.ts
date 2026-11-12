import type { FlowAiMode, FlowNodeData } from "./types";

/** Utilidades del nodo Entrada compartidas por el inspector y el lienzo. */

export const REGEX_MAX = 200;

/** Modos de la IA: mismas opciones que la «Velocidad de respuesta» de los bots. */
export const AI_MODE_OPTIONS: { value: "" | FlowAiMode; label: string; description: string }[] = [
  { value: "", label: "Balanceado", description: "Buen equilibrio" },
  { value: "nitro", label: "Rápido", description: "Responde más rápido" },
  { value: "exacto", label: "Preciso", description: "Mejor calidad" },
  { value: "floor", label: "Económico", description: "Menor costo" },
];

/** Problemas que impiden que el nodo funcione bien (se muestran también en el lienzo). */
export function inputIssue(data: FlowNodeData): string | null {
  const type = data.validation || "any";
  if (!data.variable && !data.saveToField) return "Elige dónde guardar la respuesta";
  if (type === "choice" && !(data.choices || []).some((c) => c.trim())) return "Agrega las opciones válidas";
  if (type === "regex") {
    if (!data.pattern?.trim()) return "Escribe el patrón";
    if (!isValidPattern(data.pattern)) return "El patrón no es válido";
  }
  if (type === "number" && data.minValue != null && data.maxValue != null && data.minValue > data.maxValue)
    return "El mínimo es mayor que el máximo";
  if (type === "any" && data.minLength && data.maxLength && data.minLength > data.maxLength)
    return "La longitud mínima es mayor que la máxima";
  return null;
}

export function isValidPattern(p: string): boolean {
  if (p.length > REGEX_MAX) return false;
  try {
    new RegExp(p, "i");
    return true;
  } catch {
    return false;
  }
}

