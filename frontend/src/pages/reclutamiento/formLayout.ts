import type { FormLayout, FormStep } from "@/services/reclutamiento";

/**
 * Pantallas del formulario de registro (espejo de backend/src/reclutamiento/form-layout.ts).
 * El editor las usa para mostrar el diseño reconciliado con lo que se está editando.
 */
export const MAX_STEPS = 8;
export const MAX_STEP_ITEMS = 12;
const DEFAULT_CHUNK = 4;

export const fieldItem = (key: string) => `field:${key}`;
export const questionItem = (id: string) => `question:${id}`;

export function formItems(fields: Array<{ key: string }>, questionIds: string[]): string[] {
  return [...fields.map((f) => fieldItem(f.key)), ...questionIds.map(questionItem)];
}

/** Datos personales por pantalla en la organización automática. */
const FIELDS_PER_STEP = 5;
const IDENTITY = new Set(["nombre_completo", "nombre", "apellido", "tipo_documento", "numero_documento", "fecha_nacimiento", "genero"]);
const LOCATION = new Set(["direccion", "ciudad", "departamento"]);

/**
 * Datos personales agrupados por tema (identificación, ubicación, otros). Un
 * dato suelto de identificación o ubicación se une al otro tema para no dejar
 * pantallas casi vacías.
 */
function groupFields(fields: string[]): Array<{ title: string; description: string; items: string[] }> {
  const key = (it: string) => it.slice("field:".length);
  const groups = [
    { title: "Sobre ti", description: "Estos datos se guardan en tu perfil.", items: fields.filter((f) => IDENTITY.has(key(f))) },
    { title: "¿Dónde vives?", description: "Nos ayuda a saber si puedes participar en tu zona.", items: fields.filter((f) => LOCATION.has(key(f))) },
    { title: "Otros datos", description: "", items: fields.filter((f) => !IDENTITY.has(key(f)) && !LOCATION.has(key(f))) },
  ].filter((g) => g.items.length > 0);
  const merged: typeof groups = [];
  for (const g of groups) {
    const prev = merged[merged.length - 1];
    // «Otros datos» no se mezcla con un tema: un campo personalizado no es de identificación ni de ubicación.
    const themed = prev && prev.title !== "Otros datos" && g.title !== "Otros datos";
    if (prev && themed && (g.items.length === 1 || prev.items.length === 1) && prev.items.length + g.items.length <= FIELDS_PER_STEP) prev.items.push(...g.items);
    else merged.push({ ...g, items: [...g.items] });
  }
  return merged;
}

export function defaultSteps(items: string[]): FormStep[] {
  if (items.length === 0) return [];
  if (items.length <= DEFAULT_CHUNK) return [{ id: "s1", title: "Unos datos más", description: "Nos ayudan a saber si el proyecto es para ti.", items }];
  const fields = items.filter((i) => i.startsWith("field:"));
  const questions = items.filter((i) => i.startsWith("question:"));
  const steps: FormStep[] = [];
  for (const g of groupFields(fields)) {
    for (let i = 0; i < g.items.length; i += FIELDS_PER_STEP) {
      steps.push({ id: `s${steps.length + 1}`, title: g.title, description: i === 0 ? g.description : "", items: g.items.slice(i, i + FIELDS_PER_STEP) });
    }
  }
  for (let i = 0; i < questions.length; i += DEFAULT_CHUNK) {
    const first = i === 0;
    steps.push({
      id: `s${steps.length + 1}`,
      title: first ? "Cuéntanos un poco más" : "Unas preguntas más",
      description: first ? "Tus respuestas nos ayudan a elegir a los participantes." : "",
      items: questions.slice(i, i + DEFAULT_CHUNK),
    });
  }
  return steps.slice(0, MAX_STEPS);
}

/** Diseño reconciliado: sin elementos inexistentes ni repetidos, y lo nuevo al final. */
export function resolveSteps(layout: FormLayout | null | undefined, items: string[], keepEmpty = false): FormStep[] {
  if (!layout || layout.steps.length === 0) return defaultSteps(items);
  const known = new Set(items);
  const seen = new Set<string>();
  const steps = layout.steps.map((s) => ({
    ...s,
    items: s.items.filter((it) => known.has(it) && !seen.has(it) && (seen.add(it), true)).slice(0, MAX_STEP_ITEMS),
  }));
  for (const s of steps) s.items.forEach((it) => seen.add(it));
  let last = steps.filter((s) => s.items.length > 0).pop();
  for (const it of items.filter((x) => !seen.has(x))) {
    if (!last || last.items.length >= MAX_STEP_ITEMS) {
      let n = steps.length + 1;
      while (steps.some((s) => s.id === `s${n}`)) n++;
      last = { id: `s${n}`, title: "Otras preguntas", description: "", items: [] };
      steps.push(last);
    }
    last.items.push(it);
  }
  // El editor conserva las pantallas vacías mientras se arman; al guardar se descartan.
  const result = keepEmpty ? steps : steps.filter((s) => s.items.length > 0);
  if (result.length > MAX_STEPS) {
    const extra = result.splice(MAX_STEPS - 1);
    result.push({ ...extra[0], items: extra.flatMap((s) => s.items) });
  }
  return result.length ? result : defaultSteps(items);
}
