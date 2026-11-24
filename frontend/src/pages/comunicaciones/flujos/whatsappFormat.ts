/**
 * Formato de texto de WhatsApp (el mismo de las plantillas):
 *   *negrita*  _cursiva_  ~tachado~  ```monoespaciado```
 *   - viñetas   1. numeradas   > cita
 * Funciones puras: reciben el texto y la selección, devuelven el texto y la nueva selección.
 */
export interface Edit {
  value: string;
  start: number;
  end: number;
}

export type InlineFormat = "bold" | "italic" | "strike" | "mono";
export type LineFormat = "bullet" | "numbered" | "quote";

export const INLINE_MARKERS: Record<InlineFormat, string> = {
  bold: "*",
  italic: "_",
  strike: "~",
  mono: "```",
};

/** Pone o quita el marcador alrededor de la selección (sin espacios pegados al marcador, como exige WhatsApp). */
export function toggleInline(value: string, start: number, end: number, format: InlineFormat): Edit {
  const m = INLINE_MARKERS[format];
  let s = start;
  let e = end;
  while (s < e && /\s/.test(value[s])) s++;
  while (e > s && /\s/.test(value[e - 1])) e--;

  // Sin selección: marcadores vacíos con el cursor en medio.
  if (s === e) {
    return { value: value.slice(0, start) + m + m + value.slice(end), start: start + m.length, end: start + m.length };
  }
  // La selección ya incluye los marcadores: se quitan.
  if (e - s >= 2 * m.length && value.startsWith(m, s) && value.slice(0, e).endsWith(m)) {
    const inner = value.slice(s + m.length, e - m.length);
    return { value: value.slice(0, s) + inner + value.slice(e), start: s, end: s + inner.length };
  }
  // Los marcadores quedan justo fuera de la selección: se quitan.
  if (value.slice(0, s).endsWith(m) && value.startsWith(m, e)) {
    return { value: value.slice(0, s - m.length) + value.slice(s, e) + value.slice(e + m.length), start: s - m.length, end: e - m.length };
  }
  return { value: value.slice(0, s) + m + value.slice(s, e) + m + value.slice(e), start: s + m.length, end: e + m.length };
}

const PREFIX: Record<LineFormat, RegExp> = {
  bullet: /^[-*] /,
  numbered: /^\d+\. /,
  quote: /^> /,
};
const ANY_PREFIX = /^(?:[-*] |\d+\. |> )/;

/** Convierte las líneas tocadas por la selección en lista o cita; si ya lo son, las deja como texto. */
export function toggleLines(value: string, start: number, end: number, format: LineFormat): Edit {
  const from = value.lastIndexOf("\n", start - 1) + 1;
  // Una selección que termina justo después de un salto de línea no incluye la línea siguiente.
  const last = end > start && value[end - 1] === "\n" ? end - 1 : end;
  const nl = value.indexOf("\n", last);
  const to = nl === -1 ? value.length : nl;
  const lines = value.slice(from, to).split("\n");
  const filled = lines.filter((l) => l.trim() !== "");
  const allOn = filled.length > 0 && filled.every((l) => PREFIX[format].test(l));

  let n = 0;
  const next = lines.map((l) => {
    if (l.trim() === "") return l;
    const bare = l.replace(ANY_PREFIX, "");
    if (allOn) return bare;
    n++;
    return (format === "bullet" ? "- " : format === "quote" ? "> " : `${n}. `) + bare;
  });
  const block = next.join("\n");
  return { value: value.slice(0, from) + block + value.slice(to), start: from, end: from + block.length };
}
