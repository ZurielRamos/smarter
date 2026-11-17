import { Injectable, InternalServerErrorException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const VERSION = 'v1';

/**
 * Cifrado AES-256-GCM de los datos de pago.
 *
 * La clave de 32 bytes se toma de PAYMENT_DATA_KEY (64 caracteres hex o base64).
 * Si falta o es inválida, el servicio falla cerrado: no se guarda ni se lee
 * ningún dato de pago.
 *
 * `aad` (datos autenticados adicionales) liga el cifrado a un contexto
 * (tenant + perfil), de modo que un texto cifrado copiado a otra fila no se
 * puede descifrar.
 *
 * Formato: v1.<iv base64>.<tag base64>.<ciphertext base64>. El prefijo de
 * versión permite rotar la clave o el algoritmo más adelante.
 */
@Injectable()
export class PaymentCryptoService {
  constructor(private readonly config: ConfigService) {}

  private getKey(): Buffer {
    const raw = this.config.get<string>('PAYMENT_DATA_KEY');
    if (!raw) {
      throw new ServiceUnavailableException(
        'El cifrado de datos de pago no está configurado (PAYMENT_DATA_KEY)',
      );
    }
    const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
    if (key.length !== 32) {
      throw new ServiceUnavailableException(
        'PAYMENT_DATA_KEY inválida: debe ser de 32 bytes (64 hex o base64)',
      );
    }
    return key;
  }

  encrypt(payload: Record<string, string>, aad: string): string {
    const key = this.getKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(aad, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [VERSION, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join('.');
  }

  decrypt(stored: string, aad: string): Record<string, string> {
    const key = this.getKey();
    const parts = stored.split('.');
    if (parts.length !== 4 || parts[0] !== VERSION) {
      throw new InternalServerErrorException('Formato de datos de pago no reconocido');
    }
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(parts[1], 'base64'));
      decipher.setAAD(Buffer.from(aad, 'utf8'));
      decipher.setAuthTag(Buffer.from(parts[2], 'base64'));
      const plain = Buffer.concat([decipher.update(Buffer.from(parts[3], 'base64')), decipher.final()]);
      return JSON.parse(plain.toString('utf8'));
    } catch {
      // Clave incorrecta, datos alterados o contexto (aad) distinto.
      throw new InternalServerErrorException('No se pudieron descifrar los datos de pago');
    }
  }
}
