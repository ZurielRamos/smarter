/**
 * Posición en pantalla de un carácter dentro de un <input> o <textarea>.
 *
 * Los campos de texto no exponen dónde está el cursor, así que se crea un <div>
 * invisible con el mismo estilo y el mismo texto hasta ese carácter, y se mide
 * un marcador al final. Sirve para colocar un menú flotante junto al cursor.
 */

const COPIED_STYLES = [
  "direction",
  "boxSizing",
  "width",
  "height",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderStyle",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "fontStyle",
  "fontVariant",
  "fontWeight",
  "fontStretch",
  "fontSize",
  "fontSizeAdjust",
  "lineHeight",
  "fontFamily",
  "textAlign",
  "textTransform",
  "textIndent",
  "letterSpacing",
  "wordSpacing",
  "tabSize",
] as const;

export interface CaretRect {
  /** Coordenadas de pantalla (viewport) de la esquina superior izquierda del carácter */
  top: number;
  left: number;
  /** Alto de la línea donde está el carácter */
  height: number;
}

export function caretCoordinates(el: HTMLInputElement | HTMLTextAreaElement, index: number): CaretRect {
  const doc = el.ownerDocument;
  const isTextarea = el.tagName === "TEXTAREA";
  const computed = doc.defaultView!.getComputedStyle(el);

  const mirror = doc.createElement("div");
  const style = mirror.style as unknown as Record<string, string>;
  const source = computed as unknown as Record<string, string>;
  for (const prop of COPIED_STYLES) style[prop] = source[prop];
  style.position = "absolute";
  style.visibility = "hidden";
  style.top = "0";
  style.left = "-9999px";
  // Una línea (input) no cambia de renglón; el área de texto sí, igual que el original.
  style.whiteSpace = isTextarea ? "pre-wrap" : "pre";
  style.wordWrap = isTextarea ? "break-word" : "normal";
  // Si el original muestra barra de desplazamiento, el ancho útil es menor.
  style.overflowY = isTextarea && el.scrollHeight > el.clientHeight ? "scroll" : "hidden";
  style.overflowX = "hidden";

  mirror.textContent = el.value.substring(0, index);
  const marker = doc.createElement("span");
  // Un marcador vacío no tiene alto; con texto mide la línea real.
  marker.textContent = el.value.substring(index) || ".";
  mirror.appendChild(marker);
  doc.body.appendChild(mirror);

  try {
    const border = (value: string) => parseFloat(value) || 0;
    const lineHeight = parseFloat(computed.lineHeight);
    const rect = el.getBoundingClientRect();
    return {
      top: rect.top + marker.offsetTop + border(computed.borderTopWidth) - el.scrollTop,
      left: rect.left + marker.offsetLeft + border(computed.borderLeftWidth) - el.scrollLeft,
      // `line-height: normal` no es un número: se usa el alto medido del marcador.
      height: Number.isFinite(lineHeight) ? lineHeight : marker.offsetHeight || 16,
    };
  } finally {
    doc.body.removeChild(mirror);
  }
}
