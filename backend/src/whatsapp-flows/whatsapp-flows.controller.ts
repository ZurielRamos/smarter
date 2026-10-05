import { Controller, Post, Req, Res, Param, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import * as crypto from 'crypto';
import {
  FlowCryptoService,
  FlowKeyMismatchError,
  EncryptedFlowRequest,
} from './flow-crypto.service';
import { FlowDataService, FlowRequestBody } from './flow-data.service';
import { FlowEncryptionKeyService } from './flow-encryption-key.service';

/**
 * Endpoint público del "Punto de conexión" de un WhatsApp Flow.
 *
 * Meta hace POST aquí con el payload cifrado (ping, INIT, data_exchange, BACK).
 *
 * Multi-número: la clave de cifrado es POR NÚMERO. Como el payload cifrado no
 * revela de qué número viene, usamos un endpoint URI distinto por número:
 *   /webhooks/whatsapp-flow/:phoneNumberId
 * y resolvemos la clave privada del inbox correspondiente. La ruta sin id se
 * mantiene por compatibilidad y usa la clave global del .env (fallback).
 *
 * Las rutas quedan fuera del prefijo /api porque main.ts excluye `webhooks/*`.
 */
@SkipThrottle()
@Controller('webhooks')
export class WhatsAppFlowsController {
  private readonly logger = new Logger(WhatsAppFlowsController.name);
  private readonly appSecret: string | undefined;

  constructor(
    private readonly crypto: FlowCryptoService,
    private readonly flowData: FlowDataService,
    private readonly configService: ConfigService,
    private readonly keys: FlowEncryptionKeyService,
  ) {
    this.appSecret = this.configService.get<string>('META_APP_SECRET');
  }

  /** Ruta multi-número (recomendada): resuelve la clave del inbox por el id. */
  @Post('whatsapp-flow/:phoneNumberId')
  async handleFlowByNumber(
    @Param('phoneNumberId') phoneNumberId: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const resolved = await this.keys.resolveByPhoneNumberId(phoneNumberId);
    if (!resolved) {
      this.logger.warn(`[Flow] Sin clave para phone_number_id=${phoneNumberId}`);
      res.status(421).send(); // pide re-registrar clave
      return;
    }
    await this.process(req, res, resolved.privateKey);
  }

  /** Ruta legacy (sin id): usa la clave global del .env como fallback. */
  @Post('whatsapp-flow')
  async handleFlow(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.process(req, res, this.crypto.getEnvPrivateKey());
  }

  /**
   * Lógica común: valida firma (opcional), descifra con la clave dada, procesa
   * y responde cifrado.
   */
  private async process(
    req: Request,
    res: Response,
    privateKey: string | null,
  ): Promise<void> {
    // 1) Validar firma SOLO como capa adicional (la seguridad real es el cifrado
    //    RSA). Nunca bloqueamos por ausencia de firma/raw body para no romper el
    //    health check de Meta.
    const rawBody: Buffer | undefined = (req as any).rawBody;
    const signatureHeader = req.header('x-hub-signature-256');
    if (this.appSecret && signatureHeader && rawBody) {
      if (!this.verifySignature(req, rawBody)) {
        this.logger.warn('[Flow] Firma x-hub-signature-256 presente pero inválida');
        res.status(432).send();
        return;
      }
    }

    const body = req.body as EncryptedFlowRequest;
    if (!body?.encrypted_flow_data || !body?.encrypted_aes_key || !body?.initial_vector) {
      this.logger.warn('[Flow] Payload sin campos cifrados esperados');
      res.status(400).send();
      return;
    }

    // 2) Descifrar con la clave resuelta (del inbox o del .env).
    let decrypted;
    try {
      decrypted = this.crypto.decryptRequest(body, privateKey);
    } catch (err) {
      if (err instanceof FlowKeyMismatchError) {
        this.logger.warn('[Flow] Clave pública no coincide (HTTP 421)');
        res.status(421).send();
        return;
      }
      this.logger.error(`[Flow] Error al descifrar: ${(err as Error).message}`);
      res.status(500).send();
      return;
    }

    const { decryptedBody, aesKeyBuffer, initialVectorBuffer } = decrypted;

    // 3) Lógica de negocio.
    let responseBody;
    try {
      responseBody = await this.flowData.handle(decryptedBody as FlowRequestBody);
    } catch (err) {
      this.logger.error(`[Flow] Error procesando acción: ${(err as Error).message}`);
      res.status(500).send();
      return;
    }

    // 4) Responder cifrado (base64 en texto plano).
    const encryptedResponse = this.crypto.encryptResponse(
      responseBody,
      aesKeyBuffer,
      initialVectorBuffer,
    );
    res.status(200).type('text/plain').send(encryptedResponse);
  }

  /** Valida la firma HMAC-SHA256 de x-hub-signature-256 con el App Secret. */
  private verifySignature(req: Request, rawBody?: Buffer): boolean {
    const header = req.header('x-hub-signature-256');
    if (!header || !rawBody || !this.appSecret) return false;
    const expected =
      'sha256=' +
      crypto.createHmac('sha256', this.appSecret).update(rawBody).digest('hex');
    const a = Buffer.from(header);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }
}
