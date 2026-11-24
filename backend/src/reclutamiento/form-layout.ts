import { BadRequestException } from '@nestjs/common';

/**
 * Pantallas del formulario de registro. La primera pantalla (perfil, nombre,
 * teléfono y correo) es fija y no forma parte del diseño; aquí se organizan los
 * datos personales y las preguntas del proyecto en pasos.
 *
 * El diseño guardado se reconcilia siempre con el formulario vigente: lo que ya
 * no existe se descarta y lo nuevo se agrega al final, así nunca se pierde un
 * campo ni aparece dos veces.
 */

export const MAX_STEPS = 8;
export const MAX_STEP_ITEMS = 12;
const TITLE_MAX = 60;
const DESCRIPTION_MAX = 160;
/** Por defecto, preguntas por pantalla. */
const DEFAULT_CHUNK = 4;
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;
const ITEM_RE = /^(field|question):[a-z][a-z0-9_]{0,38}$/;
const STEP_ID_RE = /^[a-z0-9_-]{1,24}$/;

export interface FormStep {
  id: string;
  title: string;
  description: string;
  /** `field:<clave>` (dato personal) o `question:<id>` (pregunta del proyecto). */
  items: string[];
}

export interface FormLayout {
  steps: FormStep[];
  /** Quién lo organizó por última vez. */
  source: 'ai' | 'manual';
}

export const fieldItem = (key: string) => `field:${key}`;
export const questionItem = (id: string) => `question:${id}`;

const clean = (v: unknown, max: number): string => {
  if (typeof v !== 'string') return '';
  const t = v.replace(/\s+/g, ' ').trim();
  return CONTROL_CHARS.test(t) ? '' : t.slice(0, max);
};

/**
 * Forma del diseño enviado por el editor (o propuesto por la IA). Con
 * `strict` rechaza lo inválido con un mensaje; sin él (IA) lo descarta.
 */
export function parseLayout(raw: unknown, strict = true): FormLayout | null {
  if (raw === undefined || raw === null) return null;
  const fail = (msg: string) => {
    if (strict) throw new BadRequestException(msg);
  };
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    fail('Las pantallas del formulario son inválidas');
    return null;
  }
  const r = raw as { steps?: unknown; source?: unknown };
  const list = Array.isArray(r.steps) ? r.steps : [];
  if (list.length > MAX_STEPS) fail(`El formulario admite máximo ${MAX_STEPS} pantallas`);
  const ids = new Set<string>();
  const steps: FormStep[] = [];
  list.slice(0, MAX_STEPS).forEach((s, i) => {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return fail(`La pantalla ${i + 1} es inválida`);
    const x = s as Record<string, unknown>;
    const title = clean(x.title, TITLE_MAX);
    if (!title) return fail(`La pantalla ${i + 1} necesita un título`);
    let id = typeof x.id === 'string' && STEP_ID_RE.test(x.id) ? x.id : '';
    if (!id || ids.has(id)) {
      let n = i + 1;
      while (ids.has(`s${n}`)) n++;
      id = `s${n}`;
    }
    ids.add(id);
    const items = (Array.isArray(x.items) ? x.items : []).filter((it): it is string => typeof it === 'string' && ITEM_RE.test(it));
    steps.push({ id, title, description: clean(x.description, DESCRIPTION_MAX), items });
  });
  return { steps, source: r.source === 'ai' ? 'ai' : 'manual' };
}

/** Elementos del formulario, en su orden natural: datos personales y luego preguntas. */
export function formItems(form: { fields: Array<{ key: string }>; questions: Array<{ id: string }> }): string[] {
  return [...form.fields.map((f) => fieldItem(f.key)), ...form.questions.map((q) => questionItem(q.id))];
}

/** Datos personales por pantalla en la organización automática. */
const FIELDS_PER_STEP = 5;
const IDENTITY = new Set(['nombre_completo', 'nombre', 'apellido', 'tipo_documento', 'numero_documento', 'fecha_nacimiento', 'genero']);
const LOCATION = new Set(['direccion', 'ciudad', 'departamento']);

/**
 * Datos personales agrupados por tema (identificación, ubicación, otros). Un
 * dato suelto de identificación o ubicación se une al otro tema para no dejar
 * pantallas casi vacías.
 */
function groupFields(fields: string[]): Array<{ title: string; description: string; items: string[] }> {
  const key = (it: string) => it.slice('field:'.length);
  const groups = [
    { title: 'Sobre ti', description: 'Estos datos se guardan en tu perfil.', items: fields.filter((f) => IDENTITY.has(key(f))) },
    { title: '¿Dónde vives?', description: 'Nos ayuda a saber si puedes participar en tu zona.', items: fields.filter((f) => LOCATION.has(key(f))) },
    { title: 'Otros datos', description: '', items: fields.filter((f) => !IDENTITY.has(key(f)) && !LOCATION.has(key(f))) },
  ].filter((g) => g.items.length > 0);
  const merged: typeof groups = [];
  for (const g of groups) {
    const prev = merged[merged.length - 1];
    // «Otros datos» no se mezcla con un tema: un campo personalizado no es de identificación ni de ubicación.
    const themed = prev && prev.title !== 'Otros datos' && g.title !== 'Otros datos';
    if (prev && themed && (g.items.length === 1 || prev.items.length === 1) && prev.items.length + g.items.length <= FIELDS_PER_STEP) prev.items.push(...g.items);
    else merged.push({ ...g, items: [...g.items] });
  }
  return merged;
}

/** Pantallas sin diseño propio: datos personales en una y preguntas de a 4. */
export function defaultSteps(items: string[]): FormStep[] {
  if (items.length === 0) return [];
  if (items.length <= DEFAULT_CHUNK) return [{ id: 's1', title: 'Unos datos más', description: 'Nos ayudan a saber si el proyecto es para ti.', items }];
  const fields = items.filter((i) => i.startsWith('field:'));
  const questions = items.filter((i) => i.startsWith('question:'));
  const steps: FormStep[] = [];
  for (const g of groupFields(fields)) {
    for (let i = 0; i < g.items.length; i += FIELDS_PER_STEP) {
      steps.push({ id: `s${steps.length + 1}`, title: g.title, description: i === 0 ? g.description : '', items: g.items.slice(i, i + FIELDS_PER_STEP) });
    }
  }
  for (let i = 0; i < questions.length; i += DEFAULT_CHUNK) {
    const first = i === 0;
    steps.push({
      id: `s${steps.length + 1}`,
      title: first ? 'Cuéntanos un poco más' : 'Unas preguntas más',
      description: first ? 'Tus respuestas nos ayudan a elegir a los participantes.' : '',
      items: questions.slice(i, i + DEFAULT_CHUNK),
    });
  }
  return steps.slice(0, MAX_STEPS);
}

/**
 * Pantallas efectivas: el diseño guardado reconciliado con los elementos
 * vigentes, o las predeterminadas si no hay diseño o queda vacío.
 */
export function resolveSteps(layout: FormLayout | null, items: string[]): FormStep[] {
  if (!layout || layout.steps.length === 0) return defaultSteps(items);
  const known = new Set(items);
  const seen = new Set<string>();
  const steps = layout.steps.map((s) => ({
    ...s,
    items: s.items.filter((it) => known.has(it) && !seen.has(it) && (seen.add(it), true)).slice(0, MAX_STEP_ITEMS),
  }));
  for (const s of steps) s.items.forEach((it) => seen.add(it));
  const missing = items.filter((it) => !seen.has(it));
  // Lo nuevo va al final: en la última pantalla si cabe; si no, en pantallas nuevas.
  let last = steps.filter((s) => s.items.length > 0).pop();
  for (const it of missing) {
    if (!last || last.items.length >= MAX_STEP_ITEMS) {
      let n = steps.length + 1;
      while (steps.some((s) => s.id === `s${n}`)) n++;
      last = { id: `s${n}`, title: 'Otras preguntas', description: '', items: [] };
      steps.push(last);
    }
    last.items.push(it);
  }
  const result = steps.filter((s) => s.items.length > 0);
  if (result.length > MAX_STEPS) {
    // Si sobran pantallas, las últimas se juntan en una sola.
    const extra = result.splice(MAX_STEPS - 1);
    result.push({ ...extra[0], items: extra.flatMap((s) => s.items) });
  }
  return result.length ? result : defaultSteps(items);
}
