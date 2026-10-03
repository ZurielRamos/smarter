import { Controller, Post, Req, Res, Logger } from '@nestjs/common';
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

/**
 * Endpoint público del "Punto de conexión" de un WhatsApp Flow.
 *
 * Meta hace POST aquí con el payload cifrado cada vez que el Flow necesita
 * intercambiar datos (ping/health check, INIT, data_exchange, BACK).
 *
 * La ruta queda fuera del prefijo /api porque main.ts excluye `webhooks/*`.
 * URL resultante: https://<host>/webhooks/whatsapp-flow
 *
 * Requiere que el middleware de raw body esté activo para esta ruta
 * (ver whatsapp-flows.module.ts) para poder validar x-hub-signature-256.
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
  ) {
    this.appSecret = this.configService.get<string>('META_APP_SECRET');
  }

  @Post('whatsapp-flow')
  async handleFlow(@Req() req: Request, @Res() res: Response): Promise<void> {
    // 1) Validar firma si tenemos el app secret y el raw body.
    const rawBody: Buffer | undefined = (req as any).rawBody;
    if (this.appSecret) {
      if (!this.verifySignature(req, rawBody)) {
        this.logger.warn('[Flow] Firma x-hub-signature-256 inválida');
        res.status(432).send(); // 432: firma incorrecta (Meta reintenta)
        return;
      }
    }

    const body = req.body as EncryptedFlowRequest;
    if (
      !body?.encrypted_flow_data ||
      !body?.encrypted_aes_key ||
      !body?.initial_vector
    ) {
      this.logger.warn('[Flow] Payload sin campos cifrados esperados');
      res.status(400).send();
      return;
    }

    // 2) Descifrar la petición.
    let decrypted;
    try {
      decrypted = this.crypto.decryptRequest(body);
    } catch (err) {
      if (err instanceof FlowKeyMismatchError) {
        // 421: pide al cliente volver a obtener la clave pública.
        this.logger.warn('[Flow] Clave pública no coincide (HTTP 421)');
        res.status(421).send();
        return;
      }
      this.logger.error(`[Flow] Error al descifrar: ${(err as Error).message}`);
      res.status(500).send();
      return;
    }

    const { decryptedBody, aesKeyBuffer, initialVectorBuffer } = decrypted;

    // 3) Procesar la lógica de negocio.
    let responseBody;
    try {
      responseBody = await this.flowData.handle(decryptedBody as FlowRequestBody);
    } catch (err) {
      this.logger.error(
        `[Flow] Error procesando acción: ${(err as Error).message}`,
      );
      res.status(500).send();
      return;
    }

    // 4) Cifrar la respuesta y devolverla como base64 en texto plano.
    const encryptedResponse = this.crypto.encryptResponse(
      responseBody,
      aesKeyBuffer,
      initialVectorBuffer,
    );

    res.status(200).type('text/plain').send(encryptedResponse);
  }

  /**
   * Valida la firma HMAC-SHA256 que Meta envía en x-hub-signature-256
   * usando el App Secret y el cuerpo crudo de la petición.
   */
  private verifySignature(req: Request, rawBody?: Buffer): boolean {
    const header = req.header('x-hub-signature-256');
    if (!header || !rawBody || !this.appSecret) {
      return false;
    }

    const expected =
      'sha256=' +
      crypto
        .createHmac('sha256', this.appSecret)
        .update(rawBody)
        .digest('hex');

    // Comparación en tiempo constante para evitar timing attacks.
    const a = Buffer.from(header);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }
}
