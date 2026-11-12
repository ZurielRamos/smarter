import { normalizeText } from './flow-conditions.util';

/**
 * Reconoce qué opción eligió el contacto cuando escribe en lugar de pulsar un
 * botón. De más estricta a más tolerante, y siempre exigiendo que la respuesta
 * apunte a UNA sola opción (si duda entre dos, no elige ninguna):
 *   1. título exacto (sin mayúsculas, tildes ni puntuación final) o sinónimo;
 *   2. número u ordinal: «2», «opción 2», «la segunda», «2°»;
 *   3. la respuesta menciona una sola opción o uno de sus sinónimos
 *      («quiero la primera opción por favor»);
 *   4. errores de tipeo pequeños en el título o un sinónimo («Primra opcion»).
 */

export interface ReplyOption {
  title: string;
  keywords?: string[];
}

export const MAX_BUTTON_KEYWORDS = 10;
export const MAX_KEYWORD_LENGTH = 40;
export const DEFAULT_NO_MATCH_RETRIES = 2;
export const MAX_NO_MATCH_RETRIES = 5;

const ORDINALS: Record<string, number> = {
  primera: 1,
  primero: 1,
  primer: 1,
  uno: 1,
  segunda: 2,
  segundo: 2,
  dos: 2,
  tercera: 3,
  tercero: 3,
  tercer: 3,
  tres: 3,
  cuarta: 4,
  cuarto: 4,
  cuatro: 4,
  quinta: 5,
  quinto: 5,
  cinco: 5,
  sexta: 6,
  sexto: 6,
  seis: 6,
  septima: 7,
  septimo: 7,
  siete: 7,
  octava: 8,
  octavo: 8,
  ocho: 8,
  novena: 9,
  noveno: 9,
  nueve: 9,
  decima: 10,
  decimo: 10,
  diez: 10,
  ultima: -1,
  ultimo: -1,
};

/** Minúsculas, sin tildes, sin emojis ni puntuación, espacios simples. */
function clean(s: string): string {
  return normalizeText(s)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mentions(text: string, phrase: string): boolean {
  if (!phrase) return false;
  return new RegExp(`(^| )${escapeRe(phrase)}($| )`).test(text);
}

/** Distancia de edición (Levenshtein) con corte temprano. */
function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      cur.push(v);
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Errores de tipeo admitidos según el largo de la palabra. */
function typoBudget(len: number): number {
  if (len < 4) return 0;
  if (len < 8) return 1;
  return 2;
}

/** Número de opción («2», «opción 2», «la segunda», «2°»); null si no lo es. */
function optionNumber(text: string, count: number): number | null {
  const m =
    /^(?:(?:la|el|opcion|numero|n|nro)\s*)*(\d{1,2})(?:\s*(?:ra|da|ta|ma|va|na|o|a|°|º))?$/.exec(
      text,
    );
  if (m) return +m[1];
  const words = text
    .split(' ')
    .filter(
      (w) =>
        !['la', 'el', 'opcion', 'quiero', 'elijo', 'me', 'gusta'].includes(w),
    );
  if (words.length === 1 && words[0] in ORDINALS) {
    const n = ORDINALS[words[0]];
    return n === -1 ? count : n;
  }
  return null;
}

/** Índice de la opción elegida o -1 si no se reconoce con seguridad. */
export function matchReplyOption(options: ReplyOption[], raw: string): number {
  const text = clean(raw || '');
  if (!text || !options.length) return -1;
  const phrases = options.map((o) =>
    [o.title, ...(o.keywords || [])].map(clean).filter(Boolean),
  );

  // 1. Exacto
  const exact = phrases.findIndex((ps) => ps.includes(text));
  if (exact >= 0) return exact;

  // 2. Número u ordinal
  const n = optionNumber(text, options.length);
  if (n !== null) return n >= 1 && n <= options.length ? n - 1 : -1;

  // 3. Menciona una sola opción (la frase más larga gana si una contiene a otra:
  //    «plan premium» frente a «plan»)
  const hits = phrases
    .map((ps, i) => ({
      i,
      len: Math.max(
        0,
        ...ps.filter((p) => mentions(text, p)).map((p) => p.length),
      ),
    }))
    .filter((h) => h.len > 0)
    .sort((a, b) => b.len - a.len);
  if (hits.length === 1) return hits[0].i;
  if (hits.length > 1 && hits[0].len > hits[1].len) {
    // Solo si la más larga contiene a las demás (no son opciones distintas mencionadas a la vez).
    const best = phrases[hits[0].i].find(
      (p) => mentions(text, p) && p.length === hits[0].len,
    )!;
    const othersInside = hits
      .slice(1)
      .every((h) =>
        phrases[h.i].some((p) => mentions(text, p) && best.includes(p)),
      );
    if (othersInside) return hits[0].i;
  }
  if (hits.length > 1) return -1;

  // 4. Errores de tipeo sobre la respuesta completa
  let best = -1;
  let bestDist = Infinity;
  let tie = false;
  phrases.forEach((ps, i) => {
    for (const p of ps) {
      const budget = typoBudget(p.length);
      if (!budget) continue;
      const d = distance(text, p, budget);
      if (d > budget) continue;
      if (d < bestDist) {
        bestDist = d;
        best = i;
        tie = false;
      } else if (d === bestDist && best !== i) {
        tie = true;
      }
    }
  });
  return best >= 0 && !tie ? best : -1;
}
