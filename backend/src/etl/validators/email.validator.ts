/**
 * Validador de emails con detección de errores comunes.
 */
export class EmailValidator {
  private static readonly EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

  private static readonly COMMON_DOMAINS = [
    'gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com',
    'live.com', 'icloud.com', 'mail.com', 'protonmail.com',
    'hotmail.es', 'outlook.es', 'yahoo.es',
  ];

  private static readonly DOMAIN_TYPOS: Record<string, string> = {
    'gmial.com': 'gmail.com',
    'gmai.com': 'gmail.com',
    'gamil.com': 'gmail.com',
    'gmail.co': 'gmail.com',
    'gmal.com': 'gmail.com',
    'hotmal.com': 'hotmail.com',
    'hotmial.com': 'hotmail.com',
    'hotmail.co': 'hotmail.com',
    'outook.com': 'outlook.com',
    'outlok.com': 'outlook.com',
    'yaho.com': 'yahoo.com',
    'yahooo.com': 'yahoo.com',
  };

  /**
   * Valida si un email tiene formato correcto.
   */
  static isValid(email: string): boolean {
    if (!email) return false;
    const trimmed = email.trim().toLowerCase();
    return this.EMAIL_REGEX.test(trimmed);
  }

  /**
   * Normaliza un email (lowercase, trim).
   */
  static normalize(email: string): string {
    return email.trim().toLowerCase();
  }

  /**
   * Intenta corregir errores comunes de dominio.
   * Retorna null si no puede sugerir corrección.
   */
  static suggestCorrection(email: string): string | null {
    if (!email || !email.includes('@')) return null;
    const [localPart, domain] = email.trim().toLowerCase().split('@');
    if (!domain) return null;

    const correctedDomain = this.DOMAIN_TYPOS[domain];
    if (correctedDomain) {
      return `${localPart}@${correctedDomain}`;
    }
    return null;
  }

  /**
   * Retorna mensaje de error descriptivo.
   */
  static getErrorMessage(email: string): string {
    if (!email || email.trim() === '') return 'El email está vacío';
    if (!email.includes('@')) return `El email "${email}" no contiene @`;
    const [, domain] = email.split('@');
    if (!domain || domain.length === 0) return `El email "${email}" no tiene dominio`;
    if (!domain.includes('.')) return `El dominio "${domain}" no es válido (falta el punto)`;
    return `El email "${email}" tiene un formato inválido`;
  }
}
