/**
 * Validador y normalizador de teléfonos.
 * Soporta formatos colombianos, de EE.UU., México y genéricos internacionales.
 */
export class PhoneValidator {
  // Patrones de país
  private static readonly COUNTRY_PATTERNS: Record<string, { code: string; regex: RegExp; digits: number[] }> = {
    CO: { code: '57', regex: /^(?:\+?57)?(\d{10})$/, digits: [10] },
    MX: { code: '52', regex: /^(?:\+?52)?(\d{10})$/, digits: [10] },
    US: { code: '1', regex: /^(?:\+?1)?(\d{10})$/, digits: [10] },
    DEFAULT: { code: '', regex: /^\+?(\d{7,15})$/, digits: [7, 8, 9, 10, 11, 12, 13, 14, 15] },
  };

  /**
   * Valida si un valor de teléfono es válido.
   * Si country es 'AUTO', intenta detectar automáticamente.
   */
  static isValid(phone: string, country = 'AUTO'): boolean {
    if (!phone) return false;
    const cleaned = phone.replace(/[\s\-\(\)\.]/g, '');

    if (country === 'AUTO') {
      return this.detectAndValidate(cleaned) !== null;
    }

    const pattern = this.COUNTRY_PATTERNS[country] || this.COUNTRY_PATTERNS.DEFAULT;
    return pattern.regex.test(cleaned);
  }

  /**
   * Normaliza un teléfono agregando código de país si no lo tiene.
   */
  static normalize(phone: string, country = 'AUTO'): string | null {
    if (!phone) return null;
    const cleaned = phone.replace(/[\s\-\(\)\.]/g, '');

    if (country === 'AUTO') {
      const detected = this.detectAndValidate(cleaned);
      if (!detected) return null;
      return detected.normalized;
    }

    const pattern = this.COUNTRY_PATTERNS[country] || this.COUNTRY_PATTERNS.DEFAULT;
    const match = cleaned.match(pattern.regex);
    if (!match) return null;

    const digits = match[1];
    if (pattern.code) {
      return `${pattern.code}${digits}`;
    }
    return digits;
  }

  /**
   * Intenta detectar el país y validar el número automáticamente.
   * Acepta cualquier número de 7-15 dígitos (estándar E.164).
   * Retorna el resultado de detección o null si no es válido.
   */
  private static detectAndValidate(cleaned: string): { country: string; normalized: string } | null {
    // Si empieza con +, quitar el prefijo
    if (cleaned.startsWith('+') || cleaned.startsWith('00')) {
      const withoutPrefix = cleaned.replace(/^\+|^00/, '');
      if (/^\d{7,15}$/.test(withoutPrefix)) {
        return { country: 'INTL', normalized: withoutPrefix };
      }
      return null;
    }

    // Solo dígitos: aceptar 7-15 dígitos como válidos
    if (/^\d{7,15}$/.test(cleaned)) {
      return { country: 'INTL', normalized: cleaned };
    }

    return null;
  }

  /**
   * Detecta si ya tiene código de país.
   */
  static hasCountryCode(phone: string): boolean {
    const cleaned = phone.replace(/[\s\-\(\)\.]/g, '');
    return cleaned.startsWith('+') || cleaned.length > 10;
  }

  /**
   * Analiza un teléfono para normalización agregando el prefijo del país por
   * defecto cuando falta. No usa 'AUTO': asume que los números locales (sin
   * prefijo) pertenecen al país indicado.
   *
   * Clasificación:
   * - 'empty'      : sin teléfono
   * - 'ok'         : ya tiene el prefijo correcto del país (no requiere cambios)
   * - 'needs_prefix': número local válido (longitud nacional) al que se le
   *                   agrega el prefijo del país
   * - 'ambiguous'  : no encaja limpiamente; se reporta y NO se modifica
   *
   * `cleaned` refleja la limpieza de formato (quita espacios, guiones, (), +, 00).
   */
  static analyze(
    phone: string | null | undefined,
    country = 'CO',
    custom?: { code: string; digits: number[] },
  ): {
    status: 'empty' | 'ok' | 'needs_prefix' | 'ambiguous';
    original: string;
    cleaned: string;
    normalized: string | null;
    reason?: string;
  } {
    const original = phone ?? '';
    if (!original || original.trim() === '') {
      return { status: 'empty', original, cleaned: '', normalized: null };
    }

    // Limpieza de formato: quita separadores comunes y prefijos de marcado.
    const cleaned = original.replace(/[\s\-\(\)\.]/g, '').replace(/^00/, '').replace(/^\+/, '');

    // Debe ser solo dígitos tras la limpieza.
    if (!/^\d+$/.test(cleaned)) {
      return { status: 'ambiguous', original, cleaned, normalized: null, reason: 'Contiene caracteres no numéricos' };
    }

    // Si se provee un patrón personalizado (prefijo + longitudes nacionales)
    // tiene prioridad sobre los patrones de país predefinidos.
    const pattern = custom
      ? { code: custom.code, digits: custom.digits, regex: /.*/ }
      : this.COUNTRY_PATTERNS[country] || this.COUNTRY_PATTERNS.DEFAULT;
    const code = pattern.code;
    const nationalLengths = pattern.digits;
    const label = custom ? `+${custom.code}` : country;

    // Ya tiene el prefijo del país (code + longitud nacional válida).
    if (code) {
      for (const len of nationalLengths) {
        if (cleaned.length === code.length + len && cleaned.startsWith(code)) {
          return { status: 'ok', original, cleaned, normalized: cleaned };
        }
      }
    }

    // Número local sin prefijo (longitud nacional exacta): se le agrega el code.
    if (nationalLengths.includes(cleaned.length)) {
      const normalized = code ? `${code}${cleaned}` : cleaned;
      return { status: 'needs_prefix', original, cleaned, normalized };
    }

    // Cualquier otra longitud es ambigua: no se toca, solo se reporta.
    return {
      status: 'ambiguous',
      original,
      cleaned,
      normalized: null,
      reason: `Longitud inesperada (${cleaned.length} dígitos) para ${label}`,
    };
  }

  /**
   * Retorna un mensaje de error descriptivo.
   */
  static getErrorMessage(phone: string, country = 'AUTO'): string {
    if (!phone || phone.trim() === '') return 'El teléfono está vacío';
    const cleaned = phone.replace(/[\s\-\(\)\.]/g, '');
    if (!/^\+?\d+$/.test(cleaned)) return `El teléfono contiene caracteres inválidos: "${phone}"`;
    if (cleaned.length < 7) return `El teléfono "${phone}" es demasiado corto (mínimo 7 dígitos)`;
    if (cleaned.length > 15) return `El teléfono "${phone}" es demasiado largo (máximo 15 dígitos)`;

    if (country !== 'AUTO') {
      const pattern = this.COUNTRY_PATTERNS[country] || this.COUNTRY_PATTERNS.DEFAULT;
      const expectedDigits = pattern.digits.join(' o ');
      return `El teléfono "${phone}" no tiene la cantidad correcta de dígitos para ${country} (se esperan ${expectedDigits})`;
    }

    return `El teléfono "${phone}" no pudo ser reconocido como un número válido`;
  }
}
