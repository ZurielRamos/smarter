/**
 * Agrupa los errores que devuelve Meta para contar PROBLEMAS distintos, no
 * reglas. Meta a veces reporta varias reglas para el mismo campo (p. ej. un
 * label vacío dispara MIN_CHARS_REQUIRED y PATTERN_MISMATCH a la vez). Para el
 * usuario eso es UN problema (ese campo), así que agrupamos por ruta (pointer).
 */

export interface MetaError {
  code?: string;
  type?: string;
  message: string;
  pointer?: string;
}

export interface GroupedMetaError {
  pointer?: string;
  type?: string; // 'WARNING' si todas las reglas del grupo son warnings
  messages: string[]; // mensajes de todas las reglas que afectan a esta ruta
  codes: string[]; // códigos Meta del grupo
}

/**
 * Agrupa por `pointer`. Los errores sin pointer no se agrupan (cada uno cuenta
 * como su propio problema). Un grupo es "WARNING" solo si TODAS sus reglas lo
 * son (si al menos una bloquea, el grupo bloquea).
 */
export function groupMetaErrors(errors: MetaError[]): GroupedMetaError[] {
  const byPointer = new Map<string, GroupedMetaError>();
  const out: GroupedMetaError[] = [];

  for (const e of errors) {
    const key = e.pointer;
    if (!key) {
      out.push({
        pointer: undefined,
        type: e.type,
        messages: [e.message],
        codes: e.code ? [e.code] : [],
      });
      continue;
    }
    const existing = byPointer.get(key);
    if (existing) {
      existing.messages.push(e.message);
      if (e.code) existing.codes.push(e.code);
      // El grupo deja de ser WARNING si aparece una regla bloqueante.
      if (e.type !== "WARNING") existing.type = e.type;
    } else {
      const g: GroupedMetaError = {
        pointer: key,
        type: e.type,
        messages: [e.message],
        codes: e.code ? [e.code] : [],
      };
      byPointer.set(key, g);
      out.push(g);
    }
  }
  return out;
}

/** Nº de problemas distintos (grupos) bloqueantes de Meta. */
export function countMetaBlocking(errors: MetaError[]): number {
  return groupMetaErrors(errors).filter((g) => g.type !== "WARNING").length;
}

/** Nº de problemas distintos (grupos) de aviso de Meta. */
export function countMetaWarnings(errors: MetaError[]): number {
  return groupMetaErrors(errors).filter((g) => g.type === "WARNING").length;
}
