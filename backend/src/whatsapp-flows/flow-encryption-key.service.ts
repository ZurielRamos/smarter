import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { Inbox } from '../chats/inbox.entity';
import { SecretCryptoService } from './secret-crypto.service';

const GRAPH_VERSION = 'v21.0';

export interface EncryptionStatus {
  inboxId: string;
  hasKey: boolean;
  status: string; // none | registered | error | pending
  metaStatus?: string | null; // VALID | MISMATCH | ... (consultado en Meta)
}

/**
 * Gestiona el par de claves RSA del endpoint de WhatsApp Flows POR INBOX
 * (por número). Genera el par, guarda la privada cifrada en reposo, y registra
 * la pública en el phone_number_id del inbox en Meta. Todo desde la app, sin
 * tocar el .env ni usar curl manual.
 *
 * La clave es por número: Meta exige registrar la pública en cada
 * phone_number_id (ver whatsapp_business_encryption).
 */
@Injectable()
export class FlowEncryptionKeyService {
  private readonly logger = new Logger(FlowEncryptionKeyService.name);

  constructor(
    @InjectRepository(Inbox)
    private readonly inboxRepo: Repository<Inbox>,
    private readonly secrets: SecretCryptoService,
  ) {}

  /**
   * Devuelve la clave privada PEM descifrada de un inbox, o null si no tiene.
   */
  getPrivateKeyForInbox(inbox: Inbox): string | null {
    if (!inbox.flowPrivateKey) return null;
    try {
      return this.secrets.decrypt(inbox.flowPrivateKey);
    } catch (err) {
      this.logger.error(`No se pudo descifrar la clave del inbox ${inbox.id}: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Resuelve la clave privada a partir del phone_number_id (lo que llega en la
   * ruta del endpoint). Devuelve el inbox y la clave en claro.
   */
  async resolveByPhoneNumberId(
    phoneNumberId: string,
  ): Promise<{ inbox: Inbox; privateKey: string } | null> {
    const inbox = await this.inboxRepo.findOne({ where: { phoneNumberId } });
    if (!inbox) return null;
    const privateKey = this.getPrivateKeyForInbox(inbox);
    if (!privateKey) return null;
    return { inbox, privateKey };
  }

  /**
   * Genera un par RSA-2048 para el inbox, lo guarda (privada cifrada) y registra
   * la pública en Meta. Idempotente: si ya tiene clave registrada y no se fuerza,
   * no la regenera (regenerar invalidaría los Flows en curso).
   */
  async setupForInbox(inboxId: string, force = false): Promise<EncryptionStatus> {
    const inbox = await this.inboxRepo.findOne({ where: { id: inboxId } });
    if (!inbox) throw new BadRequestException('Inbox no encontrado');
    if (inbox.channel !== 'whatsapp' || !inbox.accessToken || !inbox.phoneNumberId) {
      throw new BadRequestException('El inbox no es de WhatsApp o no está conectado');
    }

    if (inbox.flowPrivateKey && inbox.flowKeyStatus === 'registered' && !force) {
      return { inboxId, hasKey: true, status: 'registered' };
    }

    // 1) Generar par RSA-2048.
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    // 2) Registrar la pública en Meta para este número.
    const registered = await this.registerPublicKey(
      inbox.phoneNumberId,
      inbox.accessToken,
      publicKey,
    );

    // 3) Guardar (privada cifrada) y estado.
    inbox.flowPrivateKey = this.secrets.encrypt(privateKey);
    inbox.flowPublicKey = publicKey;
    inbox.flowKeyStatus = registered ? 'registered' : 'error';
    await this.inboxRepo.save(inbox);

    if (!registered) {
      throw new BadRequestException(
        'La clave se generó pero Meta rechazó el registro. Verifica permisos del token.',
      );
    }

    this.logger.log(`[FlowKey] Clave registrada para inbox ${inboxId} (${inbox.phoneNumberId})`);
    return { inboxId, hasKey: true, status: 'registered' };
  }

  /**
   * Importa una clave existente (p. ej. la que estaba en el .env) para un inbox,
   * sin regenerar. Útil para migrar sin romper los Flows ya registrados en Meta.
   */
  async importExistingKey(
    inboxId: string,
    privateKeyPem: string,
    publicKeyPem?: string,
  ): Promise<EncryptionStatus> {
    const inbox = await this.inboxRepo.findOne({ where: { id: inboxId } });
    if (!inbox) throw new BadRequestException('Inbox no encontrado');

    // Validar que la clave privada es válida.
    try {
      crypto.createPrivateKey(privateKeyPem);
    } catch {
      throw new BadRequestException('La clave privada PEM no es válida');
    }

    inbox.flowPrivateKey = this.secrets.encrypt(privateKeyPem);
    if (publicKeyPem) inbox.flowPublicKey = publicKeyPem;
    inbox.flowKeyStatus = 'registered';
    await this.inboxRepo.save(inbox);
    this.logger.log(`[FlowKey] Clave importada para inbox ${inboxId}`);
    return { inboxId, hasKey: true, status: 'registered' };
  }

  /**
   * Consulta el estado de la clave: local + lo que Meta reporta (VALID, etc.).
   */
  async getStatus(inboxId: string): Promise<EncryptionStatus> {
    const inbox = await this.inboxRepo.findOne({ where: { id: inboxId } });
    if (!inbox) throw new BadRequestException('Inbox no encontrado');

    const hasKey = !!inbox.flowPrivateKey;
    let metaStatus: string | null = null;

    if (hasKey && inbox.accessToken && inbox.phoneNumberId) {
      metaStatus = await this.fetchMetaKeyStatus(inbox.phoneNumberId, inbox.accessToken);
    }

    return {
      inboxId,
      hasKey,
      status: inbox.flowKeyStatus || (hasKey ? 'registered' : 'none'),
      metaStatus,
    };
  }

  // ---- Helpers Meta ----

  private async registerPublicKey(
    phoneNumberId: string,
    accessToken: string,
    publicKeyPem: string,
  ): Promise<boolean> {
    try {
      const body = new URLSearchParams();
      body.set('business_public_key', publicKeyPem);
      const res = await fetch(
        `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/whatsapp_business_encryption`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Bearer ${accessToken}`,
          },
          body: body.toString(),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success === false) {
        this.logger.warn(`[FlowKey] Registro rechazado: ${JSON.stringify(data?.error || data)}`);
        return false;
      }
      return true;
    } catch (err: any) {
      this.logger.error(`[FlowKey] Error registrando clave: ${err.message}`);
      return false;
    }
  }

  private async fetchMetaKeyStatus(
    phoneNumberId: string,
    accessToken: string,
  ): Promise<string | null> {
    try {
      const res = await fetch(
        `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/whatsapp_business_encryption`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const data = await res.json().catch(() => ({}));
      return data?.data?.[0]?.business_public_key_signature_status || null;
    } catch {
      return null;
    }
  }
}
