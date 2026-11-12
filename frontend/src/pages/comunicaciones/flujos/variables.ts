/**
 * Variables que el editor ofrece al escribir `{` o `{{` en un campo de texto, y
 * la lógica pura (sin React) para detectar el disparador, filtrar e insertar.
 */

export type VariableGroup = "flow" | "crm" | "custom" | "special";

export interface VariableOption {
  /** Clave usada en el texto: {{key}} */
  key: string;
  label: string;
  group: VariableGroup;
  /** Texto secundario (p. ej. a qué corresponde una variable especial) */
  hint?: string;
  /** Tipo del campo (text, number, date, boolean, select, array) cuando se conoce */
  type?: string;
  /** Valores posibles de un campo de selección */
  options?: string[];
  /** Un nodo Entrada puede guardar la respuesta en este campo del CRM */
  writable?: boolean;
}

/** Respuesta de GET /conversation-flows/variables */
export interface VariableCatalog {
  special: { key: string; label: string; description: string }[];
  crm: { key: string; label: string; group: string; type?: string; options?: string[]; writable?: boolean }[];
  custom: { key: string; label: string; fieldType: string; options?: string[]; writable?: boolean }[];
}

export const VARIABLE_GROUP_LABELS: Record<VariableGroup, string> = {
  flow: "Variables del flujo",
  crm: "Contacto (CRM)",
  custom: "Campos personalizados",
  special: "Especiales",
};

/** Orden de los grupos en el dropdown. */
export const VARIABLE_GROUP_ORDER: VariableGroup[] = ["flow", "crm", "custom", "special"];

/** Variables especiales si el servidor no devuelve el catálogo (p. ej. un backend más antiguo). */
const FALLBACK_SPECIAL: VariableCatalog["special"] = [
  { key: "contact_name", label: "Nombre del contacto", description: "Nombre con el que aparece en el chat" },
  { key: "last_button", label: "Último botón pulsado", description: "Título del último botón de respuesta que eligió" },
  { key: "last_link", label: "Último enlace abierto", description: "Título del último enlace con seguimiento que abrió" },
];

/** Tipo y valores posibles de una variable del flujo o especial, deducidos del propio flujo. */
export interface VariableMeta {
  type?: string;
  options?: string[];
}

/** Tipos de campo personalizado que se comparan como texto. */
const TEXT_LIKE_TYPES = new Set(["url", "email", "phone", "textarea", "text"]);
const normalizeType = (t?: string) => (t && TEXT_LIKE_TYPES.has(t) ? "text" : t);

/**
 * Une las variables definidas en el flujo (respuestas y asignaciones) con el
 * catálogo del servidor. Si una variable del flujo comparte clave con un campo
 * del CRM se muestra una sola vez, como del flujo, porque tiene prioridad al enviar.
 */
export function buildVariableOptions(
  flowVariables: string[],
  catalog: VariableCatalog | null,
  meta: Record<string, VariableMeta> = {},
): VariableOption[] {
  const special = catalog?.special ?? FALLBACK_SPECIAL;
  const reserved = new Set(special.map((s) => s.key));
  const crmKeys = new Set([...(catalog?.crm ?? []), ...(catalog?.custom ?? [])].map((f) => f.key));

  const options: VariableOption[] = [];
  const seen = new Set<string>();
  const add = (o: VariableOption) => {
    if (seen.has(o.key)) return;
    seen.add(o.key);
    options.push(o);
  };

  for (const key of flowVariables) {
    if (reserved.has(key)) continue;
    add({
      key,
      label: key,
      group: "flow",
      hint: crmKeys.has(key) ? "También es un campo del CRM; esta variable tiene prioridad" : undefined,
      ...meta[key],
    });
  }
  for (const f of catalog?.crm ?? []) add({ key: f.key, label: f.label, group: "crm", type: normalizeType(f.type), options: f.options, writable: !!f.writable });
  for (const f of catalog?.custom ?? []) add({
      key: f.key,
      label: f.label,
      group: "custom",
      type: normalizeType(f.fieldType),
      options: f.options,
      writable: f.writable !== false,
    });
  for (const s of special) add({ key: s.key, label: s.label, group: "special", hint: s.description, ...meta[s.key] });
  return options;
}

// ─── Disparador `{` / `{{` ────────────────────────────────────

export interface Trigger {
  /** Posición del primer `{` del disparador */
  start: number;
  /** Fin del texto a reemplazar (incluye `}}` si el cursor está dentro de una variable ya cerrada) */
  end: number;
  /** Lo escrito después de las llaves, para filtrar */
  query: string;
}

/**
 * ¿El cursor está justo después de `{` o `{{` (con lo que se haya escrito
 * después)? Devuelve el rango que se reemplazará al elegir una variable.
 *
 * - Una sola `{` también dispara: es lo que la gente escribe primero.
 * - Dentro de una variable ya cerrada, como `{{fir|stName}}`, se reemplaza
 *   entera para poder cambiarla. Si no está cerrada no se toca lo que sigue al
 *   cursor: `{{|Ana` conserva «Ana».
 */
export function detectTrigger(text: string, caret: number): Trigger | null {
  const before = text.slice(0, caret);
  const m = /\{{1,2}\s*([\w.]*)$/.exec(before);
  if (!m) return null;
  const closing = /^[\w.]*\s*\}\}/.exec(text.slice(caret));
  return { start: m.index, end: caret + (closing ? closing[0].length : 0), query: m[1] };
}

/** Reemplaza el disparador por `{{key}}` y devuelve el texto y dónde queda el cursor. */
export function applyVariable(text: string, trigger: Trigger, key: string): { text: string; caret: number } {
  const insert = `{{${key}}}`;
  return {
    text: text.slice(0, trigger.start) + insert + text.slice(trigger.end),
    caret: trigger.start + insert.length,
  };
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/**
 * Filtra por clave o etiqueta sin distinguir mayúsculas ni tildes. Primero van
 * las que empiezan por lo escrito, y se conserva el orden de grupos.
 */
export function filterOptions(options: VariableOption[], query: string, limit = 80): VariableOption[] {
  const q = normalize(query.trim());
  if (!q) return options.slice(0, limit);
  const scored: { o: VariableOption; rank: number; i: number }[] = [];
  options.forEach((o, i) => {
    const key = normalize(o.key);
    const label = normalize(o.label);
    let rank = -1;
    if (key.startsWith(q) || label.startsWith(q)) rank = 0;
    else if (key.includes(q) || label.includes(q)) rank = 1;
    if (rank >= 0) scored.push({ o, rank, i });
  });
  scored.sort((a, b) => a.rank - b.rank || a.i - b.i);
  return scored.slice(0, limit).map((s) => s.o);
}

/** Agrupa en el orden del dropdown, conservando el orden relativo dentro de cada grupo. */
export function groupOptions(options: VariableOption[]): { group: VariableGroup; items: VariableOption[] }[] {
  return VARIABLE_GROUP_ORDER.map((group) => ({ group, items: options.filter((o) => o.group === group) })).filter(
    (g) => g.items.length > 0,
  );
}
