/** Campos configurables de una plantilla de WhatsApp (definición de Meta). */
export const countVars = (text?: string): number => (text ? (text.match(/\{\{\d+\}\}/g) || []).length : 0);

export interface TemplateField {
  key: string;        // clave en templateVariables (body_1, header_1, button_0, header_media)
  label: string;      // etiqueta legible
  kind: "text" | "media";
  format?: string;    // IMAGE | VIDEO | DOCUMENT (solo media)
  example?: string;   // valor de ejemplo de la plantilla
}

/**
 * Analiza la definición de una plantilla (components de Meta) y devuelve la lista
 * de campos configurables (variables de header/body/botones y media del header).
 */
export function getTemplateFields(components?: any[]): TemplateField[] {
  if (!Array.isArray(components)) return [];
  const fields: TemplateField[] = [];
  for (const comp of components) {
    const type = String(comp?.type || "").toUpperCase();
    if (type === "HEADER") {
      const format = String(comp?.format || "TEXT").toUpperCase();
      if (["IMAGE", "VIDEO", "DOCUMENT"].includes(format)) {
        fields.push({
          key: "header_media",
          label: format === "IMAGE" ? "Imagen del encabezado" : format === "VIDEO" ? "Video del encabezado" : "Documento del encabezado",
          kind: "media",
          format,
          example: comp?.example?.header_handle?.[0],
        });
      } else {
        const n = countVars(comp?.text);
        const ex: string[] = comp?.example?.header_text || [];
        for (let i = 0; i < n; i++) {
          fields.push({ key: `header_${i + 1}`, label: `Encabezado · variable {{${i + 1}}}`, kind: "text", example: ex[i] });
        }
      }
    } else if (type === "BODY") {
      const n = countVars(comp?.text);
      const ex: string[] = comp?.example?.body_text?.[0] || [];
      for (let i = 0; i < n; i++) {
        fields.push({ key: `body_${i + 1}`, label: `Cuerpo · variable {{${i + 1}}}`, kind: "text", example: ex[i] });
      }
    } else if (type === "BUTTONS") {
      const buttons: any[] = Array.isArray(comp?.buttons) ? comp.buttons : [];
      buttons.forEach((btn, idx) => {
        const btnType = String(btn?.type || "").toUpperCase();
        if (btnType === "URL" && countVars(btn?.url) > 0) {
          const ex = Array.isArray(btn?.example) ? btn.example[0] : btn?.example;
          fields.push({ key: `button_${idx}`, label: `Botón "${btn?.text || idx + 1}" · URL dinámica`, kind: "text", example: ex });
        } else if (btnType === "COPY_CODE") {
          const ex = Array.isArray(btn?.example) ? btn.example[0] : btn?.example;
          fields.push({ key: `button_${idx}`, label: `Botón "${btn?.text || idx + 1}" · código`, kind: "text", example: ex });
        }
      });
    }
  }
  return fields;
}
