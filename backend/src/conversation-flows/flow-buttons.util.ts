/** Utilidades de validación de botones de enlace y llamada (compartidas por servicio y motor). */

const PLACEHOLDER_RE = /\{\{\s*[\w.]+\s*\}\}/g;
const MAX_URL_LENGTH = 2000;

/** true si es una URL http(s) bien formada y de longitud razonable. */
export function isHttpUrl(value: string): boolean {
  if (!value || value.length > MAX_URL_LENGTH || /\s/.test(value)) return false;
  try {
    const u = new URL(value);
    return (u.protocol === 'http:' || u.protocol === 'https:') && !!u.hostname;
  } catch {
    return false;
  }
}

/**
 * Valida la URL configurada en el editor. Admite {{variables}} (por ejemplo en
 * la query), pero el esquema y el dominio deben ser literales.
 */
export function isValidButtonUrl(value: string): boolean {
  return isHttpUrl(value.replace(PLACEHOLDER_RE, 'x'));
}

/**
 * Normaliza un teléfono a formato internacional (+ y dígitos). Devuelve null si
 * no parece un número válido (7 a 15 dígitos, estándar E.164).
 *
 * Exige el prefijo «+»: sin él no se puede saber el país, y un número local
 * como «300 123 4567» acabaría marcando un número equivocado.
 */
export function normalizePhone(value: string): string | null {
  const raw = (value || '').trim();
  if (!raw) return null;
  if (!/^\+[\d\s\-().]+$/.test(raw)) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return null;
  return `+${digits}`;
}
