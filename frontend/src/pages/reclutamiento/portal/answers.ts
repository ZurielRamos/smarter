import type { FormQuestion } from "@/services/reclutamiento";

export type Answers = Record<string, unknown>;

/** ¿La respuesta está vacía? (Para validar las obligatorias antes de enviar.) */
export function isEmptyAnswer(v: unknown): boolean {
  return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
}

/** Primera pregunta obligatoria sin responder, o null. */
export function firstMissing(questions: FormQuestion[], answers: Answers): FormQuestion | null {
  return questions.find((q) => q.required && isEmptyAnswer(answers[q.id])) ?? null;
}
