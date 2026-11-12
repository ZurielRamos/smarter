import { BadRequestException } from '@nestjs/common';

/**
 * Los filtros, segmentos y listas consultan campos personalizados con
 * `custom_data ->> '<clave>'`. La clave llega del cliente y se inserta en el SQL,
 * así que se valida y se escapa antes de usarla.
 *
 * Validación permisiva a propósito (letras con acentos, números, `_`, `-`, espacio y
 * punto) para no romper claves ya creadas, pero sin comillas, punto y coma,
 * paréntesis ni comentarios.
 */
const JSON_KEY_RE = /^[\p{L}\p{N}_\- .]{1,100}$/u;

/** Devuelve la clave como literal SQL entre comillas simples, lista para `->>`. */
export function quoteJsonKey(field: unknown): string {
  if (typeof field !== 'string' || !JSON_KEY_RE.test(field)) {
    throw new BadRequestException('Campo inválido en el filtro');
  }
  // Defensa adicional: la validación ya excluye comillas, pero se duplican por si cambia la regla.
  return `'${field.replace(/'/g, "''")}'`;
}

/** Expresión `<alias>.custom_data ->> '<clave>'` con la clave validada. */
export function customDataText(alias: string, field: unknown): string {
  return `${alias}.custom_data ->> ${quoteJsonKey(field)}`;
}
