import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * Cifrado simétrico en reposo para secretos (p. ej. la clave privada RSA de
 * Flows de cada inbox). Usa AES-256-GCM con una clave de 32 bytes derivada del
 * JWT_SECRET de la app (mismo patrón que email-unsubscribe, pero con GCM).
 *
 * Formato de salida: ivHex:tagHex:cipherHex
 */
@Injectable()
export class SecretCryptoService {
  private readonly key: Buffer;

  constructor(private readonly configService: ConfigService) {
    const secret = this.configService.get<string>('JWT_SECRET', 'default-secret');
    this.key = crypto.createHash('sha256').update(secret).digest(); // 32 bytes
  }

  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
  }

  decrypt(payload: string): string {
    const [ivHex, tagHex, cipherHex] = payload.split(':');
    if (!ivHex || !tagHex || !cipherHex) {
      throw new Error('Formato de secreto cifrado inválido');
    }
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      this.key,
      Buffer.from(ivHex, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([
      decipher.update(Buffer.from(cipherHex, 'hex')),
      decipher.final(),
    ]).toString('utf8');
  }
}
