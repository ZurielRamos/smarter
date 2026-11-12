import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

/**
 * Cifrado simétrico AES-256-GCM para las credenciales de las conexiones.
 * La clave sale de AUTOMATION_SECRET (recomendado) o, en su defecto, de
 * JWT_SECRET. Formato: iv(12).tag(16).cifrado, todo en base64url.
 */
function getKey(): Buffer {
  const secret = process.env.AUTOMATION_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      'Falta AUTOMATION_SECRET (o JWT_SECRET) para cifrar las conexiones',
    );
  }
  return createHash('sha256').update(secret).digest();
}

export function encryptJson(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const enc = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64url');
}

export function decryptJson<T = Record<string, string>>(payload: string): T {
  const raw = Buffer.from(payload, 'base64url');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const enc = raw.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return JSON.parse(dec.toString('utf8')) as T;
}

export function generateWebhookToken(): string {
  return randomBytes(24).toString('hex');
}
