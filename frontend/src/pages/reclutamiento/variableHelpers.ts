import type { Trigger } from "@/pages/comunicaciones/flujos/variables";
import type { VariableDef } from "@/services/reclutamiento";

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/** Filtra por nombre o ruta sin distinguir mayúsculas ni tildes; primero las que empiezan por lo escrito. */
export function filterVariables(options: VariableDef[], query: string): VariableDef[] {
  const q = normalize(query.trim());
  if (!q) return options;
  const scored: Array<{ o: VariableDef; rank: number; i: number }> = [];
  options.forEach((o, i) => {
    const path = normalize(o.path);
    const bare = path.replace(/^[a-z]+\./, "");
    const label = normalize(o.label);
    let rank = -1;
    if (path.startsWith(q) || bare.startsWith(q) || label.startsWith(q)) rank = 0;
    else if (path.includes(q) || label.includes(q)) rank = 1;
    if (rank >= 0) scored.push({ o, rank, i });
  });
  scored.sort((a, b) => a.rank - b.rank || a.i - b.i);
  return scored.map((s) => s.o);
}

/** Reemplaza el disparador por `{{insert}}` y devuelve el texto y la posición del cursor. */
export function insertVariable(text: string, trigger: Trigger, option: VariableDef): { text: string; caret: number } {
  const snippet = `{{${option.insert}}}`;
  return {
    text: text.slice(0, trigger.start) + snippet + text.slice(trigger.end),
    caret: trigger.start + snippet.length - (option.caretBack ?? 0),
  };
}

