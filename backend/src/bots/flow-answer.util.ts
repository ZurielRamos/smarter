/**
 * Shared heuristics for sequential-flow answer handling.
 *
 * IMPORTANT: This logic is used by BOTH the production engine
 * (sequential-flow.engine.ts) and the test-mode simulation inside
 * bots.service.ts. Keep it here as the single source of truth so the two
 * paths never diverge again.
 */

/**
 * Detects when the user's message is not an actual answer to the current
 * question but rather an expression of confusion, refusal, a question of their
 * own, or an off-topic message. Such messages must NOT be stored as the field
 * value.
 */
export function looksLikeNonAnswer(message: string): boolean {
  const raw = (message || '').trim();
  const normalized = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[¿?¡!.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return true;

  // Exact short phrases that are clearly not answers
  const exactPhrases = new Set([
    'no', 'no se', 'no lo se', 'no entiendo', 'no te entiendo', 'no comprendo',
    'no entendi', 'que', 'como', 'como asi', 'que dices', 'que dijiste',
    'a que te refieres', 'no capto', 'ni idea', 'no tengo idea', 'explica',
    'explicame', 'no quiero', 'no gracias', 'paso',
  ]);
  if (exactPhrases.has(normalized)) return true;

  // Phrase fragments that signal confusion / non-answer even within a sentence
  const fragments = [
    'no entiendo', 'no te entiendo', 'no comprendo', 'no entendi',
    'no se a que', 'no se que', 'a que te refieres', 'que quieres decir',
    'no me queda claro', 'puedes explicar', 'podrias explicar', 'explicame',
    'no entiendo la pregunta', 'no entiendo tu pregunta',
  ];
  if (fragments.some((f) => normalized.includes(f))) return true;

  // The user asked a question instead of answering (e.g. "¿dónde están ubicados?").
  if (raw.endsWith('?')) return true;
  const questionWords = [
    'que', 'como', 'cuanto', 'cuanta', 'cuantos', 'cuantas', 'donde', 'cual',
    'cuales', 'quien', 'quienes', 'por que', 'porque', 'para que', 'cuando',
  ];
  if (questionWords.some((w) => normalized === w || normalized.startsWith(w + ' '))) return true;

  return false;
}
