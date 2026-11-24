import { BadRequestException } from '@nestjs/common';

/**
 * Formulario de inscripción de un proyecto: preguntas de selección propias, además
 * de los datos y documentos generales del portal. Las respuestas las ve solo la
 * reclutadora. Se guardan como una copia (con el texto de la pregunta de ese
 * momento), así que editar el formulario después no desfigura lo ya recibido.
 */

export const QUESTION_TYPES = ['short', 'long', 'single', 'multi', 'yesno', 'number'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const MAX_QUESTIONS = 15;
const MAX_OPTIONS = 12;
const MAX_ANSWERS_BYTES = 8 * 1024;
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export interface FormQuestion {
  id: string;
  type: QuestionType;
  label: string;
  help: string;
  required: boolean;
  /** Solo para `single` y `multi`. */
  options: string[];
  /** Solo para `number`. */
  min: number | null;
  max: number | null;
}

/** Dato personal del contacto que se pide al registrarse (clave del catálogo del portal). */
export interface PersonalField {
  key: string;
  required: boolean;
}

export const MAX_PERSONAL_FIELDS = 15;

export type VerifyChannel = 'email' | 'phone';

/** Cómo se verifica a quien se registra o ingresa en el proyecto. */
export interface ProjectVerification {
  /** Canales que se verifican con un código (al menos uno). La persona elige uno si hay dos. */
  channels: VerifyChannel[];
  /** Número de WhatsApp y plantilla del código; solo se usan si `phone` está en `channels`. */
  whatsapp: { inboxId: string | null; templateName: string; language: string };
}

export interface ProjectForm {
  questions: FormQuestion[];
  /** Datos personales que se piden además del nombre y del teléfono o correo verificado. Se guardan en el contacto. */
  fields: PersonalField[];
  /** Nulo: hereda la verificación del portal de la cuenta. */
  verification: ProjectVerification | null;
}

export type AnswerValue = string | number | boolean | string[];

export interface AnswerSnapshot {
  id: string;
  label: string;
  type: QuestionType;
  value: AnswerValue;
}

export const EMPTY_FORM: ProjectForm = { questions: [], fields: [], verification: null };

const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/**
 * Temas de datos sensibles que no se piden en el formulario. Es una guarda
 * por palabras clave, no una garantía: ayuda a evitar el caso obvio.
 */
const SENSITIVE: Array<[RegExp, string]> = [
  [/\b(salud|enfermedad(es)?|diagnostico|discapacidad|embarazo|medicacion|medicamentos?)\b/, 'salud'],
  [/\b(religion|religios[oa]s?|creencias?)\b/, 'religión'],
  [/\b(etnia|etnic[oa]s?|raza|racial|indigena|afrodescendiente)\b/, 'origen étnico o racial'],
  [/\b(orientacion sexual|preferencia sexual|identidad de genero)\b/, 'orientación sexual'],
  [/\b(afiliacion politica|partido politico|ideologia politica|voto|sindicat[oa]s?|sindical)\b/, 'opiniones políticas o sindicales'],
  [/\b(biometric[oa]s?|huella dactilar|reconocimiento facial)\b/, 'datos biométricos'],
  [/\b(antecedentes? (penal(es)?|judicial(es)?|disciplinari[oa]s?)|condena|delito)\b/, 'antecedentes judiciales'],
];

/** Devuelve el tema sensible que parece pedir un texto, o null. */
export function findSensitiveTopic(text: string): string | null {
  const t = normalize(text);
  for (const [re, topic] of SENSITIVE) if (re.test(t)) return topic;
  return null;
}

function str(v: unknown, field: string, min: number, max: number): string {
  if (typeof v !== 'string') throw new BadRequestException(`${field} es requerido`);
  const t = v.replace(/\s+/g, ' ').trim();
  if (CONTROL_CHARS.test(t) || t.length < min || t.length > max) {
    throw new BadRequestException(`${field} debe tener entre ${min} y ${max} caracteres`);
  }
  return t;
}

function optionalNumber(v: unknown, field: string): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > 1e12) throw new BadRequestException(`${field} no es un número válido`);
  return n;
}

/** Valida y normaliza las preguntas que envía el editor. Asigna un id estable a las que no lo traen. */
export function parseForm(raw: unknown): ProjectForm {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new BadRequestException('El formulario es inválido');
  const list = (raw as { questions?: unknown }).questions;
  if (!Array.isArray(list)) throw new BadRequestException('Las preguntas son inválidas');
  if (list.length > MAX_QUESTIONS) throw new BadRequestException(`El formulario admite máximo ${MAX_QUESTIONS} preguntas`);

  const seen = new Set<string>();
  const used = new Set(list.map((q) => (q && typeof q === 'object' ? String((q as any).id ?? '') : '')).filter(Boolean));
  let counter = 0;
  const nextId = () => {
    let id: string;
    do id = `q${++counter}`;
    while (used.has(id) || seen.has(id));
    return id;
  };

  const questions = list.map((item, i) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) throw new BadRequestException(`La pregunta ${i + 1} es inválida`);
    const q = item as Record<string, unknown>;
    const where = `La pregunta ${i + 1}`;
    const type = String(q.type ?? '') as QuestionType;
    if (!(QUESTION_TYPES as readonly string[]).includes(type)) throw new BadRequestException(`${where} tiene un tipo inválido`);

    let id = typeof q.id === 'string' ? q.id.trim() : '';
    if (id && !/^[a-z][a-z0-9_]{0,23}$/.test(id)) throw new BadRequestException(`${where} tiene un identificador inválido`);
    if (!id) id = nextId();
    if (seen.has(id)) throw new BadRequestException(`${where} repite el identificador «${id}»`);
    seen.add(id);

    const label = str(q.label, `El texto de la pregunta ${i + 1}`, 3, 200);
    const help = q.help === undefined || q.help === null || q.help === '' ? '' : str(q.help, `La ayuda de la pregunta ${i + 1}`, 1, 300);
    for (const text of [label, help]) {
      const topic = text ? findSensitiveTopic(text) : null;
      if (topic) {
        throw new BadRequestException(
          `${where} parece pedir datos sensibles (${topic}). Esos datos no se piden en el formulario de inscripción; si son imprescindibles, consúltalo con asesoría legal.`,
        );
      }
    }

    let options: string[] = [];
    if (type === 'single' || type === 'multi') {
      const rawOptions = Array.isArray(q.options) ? q.options : [];
      options = rawOptions.map((o, j) => str(o, `La opción ${j + 1} de la pregunta ${i + 1}`, 1, 80));
      if (new Set(options.map(normalize)).size !== options.length) throw new BadRequestException(`${where} tiene opciones repetidas`);
      if (options.length < 2 || options.length > MAX_OPTIONS) throw new BadRequestException(`${where} necesita de 2 a ${MAX_OPTIONS} opciones`);
      for (const o of options) {
        const topic = findSensitiveTopic(o);
        if (topic) throw new BadRequestException(`${where} parece pedir datos sensibles (${topic}) en sus opciones.`);
      }
    }

    let min: number | null = null;
    let max: number | null = null;
    if (type === 'number') {
      min = optionalNumber(q.min, `El mínimo de la pregunta ${i + 1}`);
      max = optionalNumber(q.max, `El máximo de la pregunta ${i + 1}`);
      if (min !== null && max !== null && max < min) throw new BadRequestException(`${where}: el máximo no puede ser menor que el mínimo`);
    }

    return { id, type, label, help, required: q.required === true, options, min, max } satisfies FormQuestion;
  });

  return { questions, fields: parsePersonalFields((raw as { fields?: unknown }).fields), verification: parseVerification((raw as { verification?: unknown }).verification) };
}

/** Valida la forma de la verificación; que el número y la plantilla sean de la cuenta lo comprueba quien los guarda. */
export function parseVerification(raw: unknown): ProjectVerification | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new BadRequestException('La verificación es inválida');
  const v = raw as { channels?: unknown; whatsapp?: unknown };
  const list = Array.isArray(v.channels) ? v.channels : [];
  if (list.length === 0 || list.some((c) => c !== 'email' && c !== 'phone')) throw new BadRequestException('Elige al menos un canal de verificación: teléfono o correo');
  const channels = Array.from(new Set(list as VerifyChannel[]));
  const w = v.whatsapp && typeof v.whatsapp === 'object' && !Array.isArray(v.whatsapp) ? (v.whatsapp as Record<string, unknown>) : {};
  const text = (x: unknown, max: number) => (typeof x === 'string' ? x.trim().slice(0, max) : '');
  return {
    channels,
    whatsapp: { inboxId: text(w.inboxId, 40) || null, templateName: text(w.templateName, 100), language: text(w.language, 10) || 'es' },
  };
}

/**
 * Canal y plantilla con que se verifica en el proyecto: los suyos, o los del
 * portal de la cuenta mientras no haya definido los propios.
 */
export function effectiveVerification(
  form: ProjectForm,
  tenant: { channel: 'email' | 'phone' | 'both'; whatsapp: ProjectVerification['whatsapp'] },
): { channel: 'email' | 'phone' | 'both'; whatsapp: ProjectVerification['whatsapp'] } {
  if (!form.verification) return tenant;
  const { channels, whatsapp } = form.verification;
  return { channel: channels.length === 2 ? 'both' : channels[0], whatsapp };
}

/** Valida la forma de los datos personales; que existan en el catálogo de la cuenta lo comprueba quien los guarda. */
export function parsePersonalFields(raw: unknown): PersonalField[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > MAX_PERSONAL_FIELDS) throw new BadRequestException(`Los datos personales son inválidos (máximo ${MAX_PERSONAL_FIELDS})`);
  const seen = new Set<string>();
  return raw.map((item, i) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) throw new BadRequestException(`El dato personal ${i + 1} es inválido`);
    const key = String((item as { key?: unknown }).key ?? '');
    if (!/^[a-z][a-z0-9_]{0,38}$/.test(key)) throw new BadRequestException(`El dato personal ${i + 1} tiene una clave inválida`);
    if (seen.has(key)) throw new BadRequestException(`El dato personal «${key}» está repetido`);
    seen.add(key);
    return { key, required: (item as { required?: unknown }).required === true };
  });
}

/** Lectura tolerante de lo guardado. */
export function readForm(saved: unknown): ProjectForm {
  try {
    return parseForm(saved);
  } catch {
    return { questions: [], fields: [], verification: null };
  }
}

/**
 * Valida las respuestas contra las preguntas vigentes y devuelve la copia que se
 * guarda. Las respuestas a preguntas que no existen se descartan. Todo error
 * nombra la pregunta para que la persona sepa qué corregir.
 */
export function validateAnswers(form: ProjectForm, raw: unknown): AnswerSnapshot[] {
  if (raw !== undefined && raw !== null && (typeof raw !== 'object' || Array.isArray(raw))) {
    throw new BadRequestException('Las respuestas son inválidas');
  }
  const given = (raw ?? {}) as Record<string, unknown>;
  const out: AnswerSnapshot[] = [];
  for (const q of form.questions) {
    const v = Object.prototype.hasOwnProperty.call(given, q.id) ? given[q.id] : undefined;
    const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
    if (empty) {
      if (q.required) throw new BadRequestException(`Responde: «${q.label}»`);
      continue;
    }
    const bad = () => new BadRequestException(`La respuesta a «${q.label}» no es válida`);
    let value: AnswerValue;
    switch (q.type) {
      case 'short':
      case 'long': {
        if (typeof v !== 'string') throw bad();
        const t = v.trim();
        const max = q.type === 'short' ? 200 : 1000;
        if (!t || t.length > max || CONTROL_CHARS.test(t)) throw bad();
        value = t;
        break;
      }
      case 'single':
        if (typeof v !== 'string' || !q.options.includes(v)) throw bad();
        value = v;
        break;
      case 'multi': {
        if (!Array.isArray(v) || v.some((x) => typeof x !== 'string' || !q.options.includes(x))) throw bad();
        value = Array.from(new Set(v as string[]));
        break;
      }
      case 'yesno':
        if (typeof v !== 'boolean') throw bad();
        value = v;
        break;
      case 'number': {
        const n = typeof v === 'string' ? Number(v) : v;
        if (typeof n !== 'number' || !Number.isFinite(n)) throw bad();
        if ((q.min !== null && n < q.min) || (q.max !== null && n > q.max)) {
          const range = [q.min !== null ? `mínimo ${q.min}` : '', q.max !== null ? `máximo ${q.max}` : ''].filter(Boolean).join(', ');
          throw new BadRequestException(`La respuesta a «${q.label}» debe respetar ${range}`);
        }
        value = n;
        break;
      }
    }
    out.push({ id: q.id, label: q.label, type: q.type, value });
  }
  if (Buffer.byteLength(JSON.stringify(out)) > MAX_ANSWERS_BYTES) throw new BadRequestException('Las respuestas son demasiado largas');
  return out;
}
