import type { FormQuestion, QuestionType } from "@/services/reclutamiento";

/** Límites del formulario (los mismos que valida el servidor en project-form.ts). */
export const MAX_QUESTIONS = 15;
export const MAX_OPTIONS = 20;
export const SCALE_MAX = 10;

/** Opción en edición; la clave local mantiene el foco y el orden estables. */
export interface DraftOption {
  key: string;
  text: string;
}

/** Pregunta en edición (los números viajan como texto mientras se escriben). */
export interface Draft {
  key: string;
  id: string;
  type: QuestionType;
  label: string;
  help: string;
  required: boolean;
  options: DraftOption[];
  allowOther: boolean;
  min: string;
  max: string;
  minLabel: string;
  maxLabel: string;
  placeholder: string;
}

let seq = 0;
export const newKey = (prefix = "k") => `${prefix}${++seq}`;
export const option = (text = ""): DraftOption => ({ key: newKey("o"), text });
/**
 * Id estable para una pregunta nueva, asignado en el navegador para que las
 * pantallas del formulario puedan referirse a ella antes de guardar.
 */
export const newQuestionId = () => `q${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 6)}`;

export const isChoice = (t: QuestionType) => t === "single" || t === "multi";
const hasPlaceholder = (t: QuestionType) => t === "short" || t === "long" || t === "number";

export function emptyDraft(type: QuestionType = "short"): Draft {
  return withType(
    { key: newKey(), id: newQuestionId(), type: "short", label: "", help: "", required: false, options: [], allowOther: false, min: "", max: "", minLabel: "", maxLabel: "", placeholder: "" },
    type,
  );
}

/** Cambia el tipo dejando datos coherentes (p. ej. una escala siempre tiene extremos válidos). */
export function withType(d: Draft, type: QuestionType): Draft {
  const next: Draft = { ...d, type };
  if (isChoice(type) && next.options.length < 2) next.options = [...next.options, ...Array.from({ length: 2 - next.options.length }, () => option())];
  if (type === "scale") {
    const min = Number(d.type === "scale" ? d.min : NaN);
    const max = Number(d.type === "scale" ? d.max : NaN);
    next.min = min === 0 || min === 1 ? String(min) : "1";
    next.max = Number.isInteger(max) && max >= 2 && max <= SCALE_MAX ? String(max) : "5";
  } else if (d.type === "scale") {
    next.min = "";
    next.max = "";
  }
  return next;
}

export const toDraft = (q: FormQuestion): Draft => ({
  key: newKey(),
  id: q.id,
  type: q.type,
  label: q.label,
  help: q.help,
  required: q.required,
  options: q.options.map((t) => option(t)),
  allowOther: !!q.allowOther,
  min: q.min === null ? "" : String(q.min),
  max: q.max === null ? "" : String(q.max),
  minLabel: q.minLabel ?? "",
  maxLabel: q.maxLabel ?? "",
  placeholder: q.placeholder ?? "",
});

const num = (v: string) => (v.trim() === "" ? null : Number(v));

/** Cuerpo para la API: solo lo que aplica al tipo. Las preguntas nuevas viajan sin id. */
export const toPayload = (d: Draft): FormQuestion => ({
  id: d.id,
  type: d.type,
  label: d.label.trim(),
  help: d.help.trim(),
  required: d.required,
  options: isChoice(d.type) ? d.options.map((o) => o.text.trim()).filter(Boolean) : [],
  allowOther: isChoice(d.type) ? d.allowOther : false,
  min: d.type === "number" || d.type === "scale" ? num(d.min) : null,
  max: d.type === "number" || d.type === "scale" ? num(d.max) : null,
  minLabel: d.type === "scale" ? d.minLabel.trim() : "",
  maxLabel: d.type === "scale" ? d.maxLabel.trim() : "",
  placeholder: hasPlaceholder(d.type) ? d.placeholder.trim() : "",
});

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

/** Misma guarda del servidor: temas de datos sensibles que no se piden en el registro. */
const SENSITIVE: Array<[RegExp, string]> = [
  [/\b(salud|enfermedad(es)?|diagnostico|discapacidad|embarazo|medicacion|medicamentos?)\b/, "salud"],
  [/\b(religion|religios[oa]s?|creencias?)\b/, "religión"],
  [/\b(etnia|etnic[oa]s?|raza|racial|indigena|afrodescendiente)\b/, "origen étnico o racial"],
  [/\b(orientacion sexual|preferencia sexual|identidad de genero)\b/, "orientación sexual"],
  [/\b(afiliacion politica|partido politico|ideologia politica|voto|sindicat[oa]s?|sindical)\b/, "opiniones políticas o sindicales"],
  [/\b(biometric[oa]s?|huella dactilar|reconocimiento facial)\b/, "datos biométricos"],
  [/\b(antecedentes? (penal(es)?|judicial(es)?|disciplinari[oa]s?)|condena|delito)\b/, "antecedentes judiciales"],
];

export function sensitiveTopic(text: string): string | null {
  const t = normalize(text);
  for (const [re, topic] of SENSITIVE) if (re.test(t)) return topic;
  return null;
}

/** Qué impide guardar la pregunta, en el orden en que conviene corregirlo. */
export function draftIssues(d: Draft): string[] {
  const issues: string[] = [];
  const label = d.label.trim();
  if (label.length < 3) issues.push("Escribe la pregunta (mínimo 3 caracteres).");
  if (isChoice(d.type)) {
    const opts = d.options.map((o) => o.text.trim()).filter(Boolean);
    if (opts.length < 2) issues.push("Agrega al menos 2 opciones.");
    if (opts.length > MAX_OPTIONS) issues.push(`Máximo ${MAX_OPTIONS} opciones.`);
    const seen = new Set<string>();
    const repeated = opts.find((o) => (seen.has(normalize(o)) ? true : (seen.add(normalize(o)), false)));
    if (repeated) issues.push(`La opción «${repeated}» está repetida.`);
  }
  if (d.type === "number") {
    const min = num(d.min);
    const max = num(d.max);
    if ((min !== null && !Number.isFinite(min)) || (max !== null && !Number.isFinite(max))) issues.push("El rango debe ser numérico.");
    else if (min !== null && max !== null && max < min) issues.push("El máximo no puede ser menor que el mínimo.");
  }
  const texts = [label, d.help, d.placeholder, d.minLabel, d.maxLabel, ...(isChoice(d.type) ? d.options.map((o) => o.text) : [])];
  const topic = texts.map(sensitiveTopic).find(Boolean);
  if (topic) issues.push(`Parece pedir datos sensibles (${topic}); el servidor no lo permitirá.`);
  return issues;
}

/** Preguntas frecuentes en convocatorias, listas para ajustar. */
export const SUGGESTED: Array<{ title: string; build: () => Draft }> = [
  {
    title: "¿Cómo te enteraste de esta convocatoria?",
    build: () => ({ ...emptyDraft("single"), label: "¿Cómo te enteraste de esta convocatoria?", options: ["Redes sociales", "Un amigo o familiar", "Correo o WhatsApp"].map(option), allowOther: true }),
  },
  {
    title: "Disponibilidad de horario",
    build: () => ({ ...emptyDraft("multi"), label: "¿En qué horarios puedes participar?", options: ["Mañana", "Tarde", "Noche", "Fines de semana"].map(option), required: true }),
  },
  {
    title: "Experiencia en estudios",
    build: () => ({ ...emptyDraft("yesno"), label: "¿Has participado antes en estudios de mercado o focus groups?" }),
  },
  {
    title: "Interés en participar (escala)",
    build: () => ({ ...emptyDraft("scale"), label: "¿Qué tan interesado estás en participar?", minLabel: "Poco", maxLabel: "Mucho" }),
  },
  {
    title: "Fecha disponible",
    build: () => ({ ...emptyDraft("date"), label: "¿Desde qué fecha puedes participar?" }),
  },
];
