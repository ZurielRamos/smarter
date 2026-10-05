import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * Payload cifrado que Meta envía al endpoint del Flow.
 * Los tres campos vienen en base64.
 */
export interface EncryptedFlowRequest {
  encrypted_flow_data: string;
  encrypted_aes_key: string;
  initial_vector: string;
}

/**
 * Resultado de descifrar la petición: el cuerpo en claro más los
 * materiales (clave AES e IV) necesarios para cifrar la respuesta.
 */
export interface DecryptedFlowRequest {
  decryptedBody: Record<string, any>;
  aesKeyBuffer: Buffer;
  initialVectorBuffer: Buffer;
}

/**
 * Error que debe traducirse a HTTP 421 para que Meta pida al cliente
 * que vuelva a obtener la clave pública. Se usa cuando el descifrado
 * con la clave privada falla (clave rotada / no coincide).
 */
export class FlowKeyMismatchError extends Error {
  constructor(message = 'Flow public key mismatch') {
    super(message);
    this.name = 'FlowKeyMismatchError';
  }
}

/**
 * Implementa el protocolo de cifrado del endpoint de WhatsApp Flows:
 *   - RSA-OAEP (SHA-256) para descifrar la clave AES de 128 bits.
 *   - AES-128-GCM para des/cifrar el cuerpo. El tag de autenticación
 *     son los últimos 16 bytes del ciphertext.
 *   - La respuesta se cifra con la MISMA clave AES pero con el IV
 *     invertido bit a bit (bitwise NOT).
 *
 * Docs: https://developers.facebook.com/docs/whatsapp/flows/guides/implementingyourflowendpoint
 */
@Injectable()
export class FlowCryptoService {
  private readonly logger = new Logger(FlowCryptoService.name);
  private readonly privateKey: string | null;
  private readonly passphrase: string | undefined;

  constructor(private readonly configService: ConfigService) {
    // La clave privada se guarda en una env var. Puede venir con saltos de
    // línea reales o escapados como "\n" (típico en paneles de hosting).
    const raw = this.configService.get<string>('WHATSAPP_FLOW_PRIVATE_KEY');
    this.privateKey = raw ? raw.replace(/\\n/g, '\n') : null;
    this.passphrase = this.configService.get<string>(
      'WHATSAPP_FLOW_PRIVATE_KEY_PASSPHRASE',
    );

    if (!this.privateKey) {
      this.logger.warn(
        'WHATSAPP_FLOW_PRIVATE_KEY no está configurada; el endpoint de Flows no podrá descifrar peticiones.',
      );
    }
  }

  isConfigured(): boolean {
    return !!this.privateKey;
  }

  /** Clave privada global del .env (fallback de compatibilidad). */
  getEnvPrivateKey(): string | null {
    return this.privateKey;
  }

  /**
   * Descifra la petición entrante de Meta.
   *
   * @param body payload cifrado de Meta.
   * @param privateKeyOverride clave privada PEM a usar (la del inbox del número).
   *        Si se omite, cae a la clave global del .env (compatibilidad).
   * @param passphraseOverride passphrase de la clave override (opcional).
   */
  decryptRequest(
    body: EncryptedFlowRequest,
    privateKeyOverride?: string | null,
    passphraseOverride?: string,
  ): DecryptedFlowRequest {
    const privateKey = privateKeyOverride || this.privateKey;
    const passphrase = privateKeyOverride ? passphraseOverride : this.passphrase;
    if (!privateKey) {
      throw new Error('No hay clave privada disponible para descifrar el Flow');
    }

    const { encrypted_flow_data, encrypted_aes_key, initial_vector } = body;

    // 1) Descifrar la clave AES con la clave privada RSA (OAEP + SHA-256).
    let aesKeyBuffer: Buffer;
    try {
      aesKeyBuffer = crypto.privateDecrypt(
        {
          key: privateKey,
          passphrase,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256',
        },
        Buffer.from(encrypted_aes_key, 'base64'),
      );
    } catch (err) {
      // Clave privada que no corresponde a la pública registrada en Meta.
      this.logger.warn(`Fallo al descifrar la clave AES: ${(err as Error).message}`);
      throw new FlowKeyMismatchError();
    }

    // 2) Descifrar el cuerpo con AES-128-GCM.
    const initialVectorBuffer = Buffer.from(initial_vector, 'base64');
    const flowDataBuffer = Buffer.from(encrypted_flow_data, 'base64');

    const TAG_LENGTH = 16;
    const encryptedBody = flowDataBuffer.subarray(0, -TAG_LENGTH);
    const authTag = flowDataBuffer.subarray(-TAG_LENGTH);

    const decipher = crypto.createDecipheriv(
      'aes-128-gcm',
      aesKeyBuffer,
      initialVectorBuffer,
    );
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encryptedBody),
      decipher.final(),
    ]).toString('utf-8');

    return {
      decryptedBody: JSON.parse(decrypted),
      aesKeyBuffer,
      initialVectorBuffer,
    };
  }

  /**
   * Cifra la respuesta hacia Meta. Devuelve un string base64 que debe
   * enviarse tal cual como cuerpo de la respuesta (Content-Type texto).
   *
   * Reutiliza la clave AES de la petición y usa el IV invertido bit a bit.
   */
  encryptResponse(
    response: Record<string, any>,
    aesKeyBuffer: Buffer,
    initialVectorBuffer: Buffer,
  ): string {
    // IV invertido: NOT bit a bit de cada byte.
    const flippedIv = Buffer.from(
      initialVectorBuffer.map((byte) => ~byte & 0xff),
    );

    const cipher = crypto.createCipheriv('aes-128-gcm', aesKeyBuffer, flippedIv);

    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(response), 'utf-8'),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    // El ciphertext final concatena el tag de autenticación al final.
    return Buffer.concat([encrypted, authTag]).toString('base64');
  }
}
