import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'crypto';
import { MediaStorageService } from '../../media/media-storage.service';

/**
 * Archivos privados del encuestador (documentos de identidad, etc.).
 *
 * El bucket de medios es público por URL, así que estos archivos se guardan
 * CIFRADOS (AES-256-GCM) bajo una clave de objeto aleatoria y solo se entregan
 * por la API, tras comprobar quién los pide. Con la URL pública no se puede leer
 * nada. La clave se toma de RECRUIT_DOCS_KEY o, si no existe, de
 * PAYMENT_DATA_KEY (64 hex o base64 de 32 bytes). Falla cerrado si falta.
 *
 * Formato del objeto: iv (12 bytes) | tag (16 bytes) | texto cifrado.
 */
@Injectable()
export class PrivateFileService {
  constructor(
    private readonly config: ConfigService,
    private readonly media: MediaStorageService,
  ) {}

  private getKey(): Buffer {
    const raw = this.config.get<string>('RECRUIT_DOCS_KEY') || this.config.get<string>('PAYMENT_DATA_KEY');
    if (!raw) throw new ServiceUnavailableException('El cifrado de documentos no está configurado (RECRUIT_DOCS_KEY o PAYMENT_DATA_KEY)');
    const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
    if (key.length !== 32) throw new ServiceUnavailableException('La clave de cifrado de documentos es inválida: debe ser de 32 bytes');
    return key;
  }

  /** Cifra y guarda. `aad` liga el cifrado a su dueño (tenant + perfil). */
  async save(tenantId: string, profileId: string, data: Buffer): Promise<{ storageKey: string; sha256: string }> {
    const key = this.getKey();
    if (!this.media.isEnabled()) throw new ServiceUnavailableException('El almacenamiento de archivos no está disponible');
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(`${tenantId}:${profileId}`));
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    const body = Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
    const storageKey = `recruit-docs/${tenantId}/${profileId}/${randomUUID()}.bin`;
    try {
      await this.media.putObject(storageKey, body);
    } catch {
      throw new ServiceUnavailableException('No se pudo guardar el archivo');
    }
    return { storageKey, sha256: createHash('sha256').update(data).digest('hex') };
  }

  async read(tenantId: string, profileId: string, storageKey: string): Promise<Buffer> {
    const key = this.getKey();
    let body: Buffer;
    try {
      body = await this.media.getObject(storageKey);
    } catch {
      throw new ServiceUnavailableException('No se pudo leer el archivo');
    }
    if (body.length < 29) throw new ServiceUnavailableException('El archivo está dañado');
    const decipher = createDecipheriv('aes-256-gcm', key, body.subarray(0, 12));
    decipher.setAAD(Buffer.from(`${tenantId}:${profileId}`));
    decipher.setAuthTag(body.subarray(12, 28));
    try {
      return Buffer.concat([decipher.update(body.subarray(28)), decipher.final()]);
    } catch {
      throw new ServiceUnavailableException('El archivo no se pudo descifrar');
    }
  }

  async remove(storageKey: string | null | undefined): Promise<void> {
    if (storageKey) await this.media.deleteObject(storageKey);
  }
}
