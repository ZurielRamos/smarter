import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Inbox } from '../chats/inbox.entity';
import { Conversation } from '../chats/conversation.entity';
import { Message } from '../chats/message.entity';
import { ClientRecord } from '../records/record.entity';
import { SendPulseService, SendPulseContact } from './sendpulse.service';
import { normalizeMessage, phoneMatchKey, normalizePhoneDigits, isWhatsAppIdentity } from './sendpulse.mapper';
import { getBridgeConfig, SENDPULSE_BRIDGE_KEY, SendPulseBridgeConfig } from './sendpulse-bridge.types';

/**
 * Lógica de sincronización del histórico de SendPulse hacia el CRM.
 *
 * Idempotente:
 *  - Conversation se deduplica por (inboxId, contactId=SendPulse contact_id).
 *  - Message se deduplica por externalId (wamid). Reprocesar no duplica.
 *
 * Esta clase contiene la lógica de negocio; el worker BullMQ la invoca.
 */
@Injectable()
export class SendPulseSyncService {
  private readonly logger = new Logger(SendPulseSyncService.name);

  private readonly CONTACT_PAGE_SIZE = 100;
  private readonly MESSAGE_PAGE_SIZE = 200;

  constructor(
    @InjectRepository(Inbox)
    private readonly inboxRepo: Repository<Inbox>,
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
    @InjectRepository(ClientRecord)
    private readonly clientRecordRepo: Repository<ClientRecord>,
    private readonly sendPulse: SendPulseService,
  ) {}

  /**
   * Ejecuta la sincronización completa del histórico para una bandeja.
   * Guarda progreso y estado en Inbox.metadata.sendpulseBridge.
   */
  async runInitialSync(inboxId: string): Promise<void> {
    const inbox = await this.inboxRepo.findOne({ where: { id: inboxId } });
    if (!inbox) {
      this.logger.warn(`[Sync] Inbox ${inboxId} no encontrado`);
      return;
    }

    const bridge = getBridgeConfig(inbox.metadata);
    const apiKey = inbox.accessToken;
    if (!bridge || !apiKey || !bridge.botId) {
      this.logger.warn(`[Sync] Inbox ${inboxId} sin config de puente/API key/botId`);
      await this.patchBridge(inboxId, { syncStatus: 'failed', syncError: 'Configuración de puente incompleta' });
      return;
    }

    await this.patchBridge(inboxId, { syncStatus: 'running', syncProgress: 0, syncError: undefined });

    const stats = { contacts: 0, messages: 0, conversations: 0 };

    try {
      // 1) Total de contactos para calcular progreso.
      const firstPage = await this.sendPulse.getContacts(apiKey, bridge.botId, this.CONTACT_PAGE_SIZE, 0);
      const total = firstPage.meta?.total ?? firstPage.data.length;

      let skip = 0;
      let page = firstPage;

      while (page.data.length > 0) {
        for (const contact of page.data) {
          await this.syncContact(inbox, bridge, contact, stats);
          stats.contacts += 1;
        }

        // Progreso basado en contactos procesados.
        const progress = total > 0 ? Math.min(99, Math.round((stats.contacts / total) * 100)) : 50;
        await this.patchBridge(inboxId, {
          syncProgress: progress,
          syncStats: { ...stats },
        });

        if (page.data.length < this.CONTACT_PAGE_SIZE) break;
        skip += this.CONTACT_PAGE_SIZE;
        page = await this.sendPulse.getContacts(apiKey, bridge.botId, this.CONTACT_PAGE_SIZE, skip);
      }

      await this.patchBridge(inboxId, {
        syncStatus: 'completed',
        syncProgress: 100,
        syncStats: { ...stats },
        lastSyncAt: new Date().toISOString(),
        syncError: undefined,
      });
      this.logger.log(
        `[Sync] Inbox ${inboxId} completado: ${stats.conversations} conversaciones, ${stats.messages} mensajes`,
      );
    } catch (err: any) {
      this.logger.error(`[Sync] Inbox ${inboxId} falló: ${err.message}`, err.stack);
      await this.patchBridge(inboxId, {
        syncStatus: 'failed',
        syncError: err.message || 'Error desconocido durante la sincronización',
        syncStats: { ...stats },
      });
      throw err;
    }
  }

  /** Sincroniza un contacto: upsert conversación + sus mensajes. */
  private async syncContact(
    inbox: Inbox,
    bridge: SendPulseBridgeConfig,
    contact: SendPulseContact,
    stats: { contacts: number; messages: number; conversations: number },
  ): Promise<void> {
    const contactName = contact.channel_data?.name || contact.channel_data?.username || null;

    // Upsert conversación por (inboxId, contactId=SendPulse contact_id de sendpulse).
    // Guardamos el contact_id de SendPulse en contactId para poder enviar luego.
    const spContactId = contact.id;
    let conversation = await this.conversationRepo.findOne({
      where: { inboxId: inbox.id, contactId: spContactId },
    });

    if (!conversation) {
      const record = await this.findOrCreateRecord(
        inbox.tenantId,
        contact.channel_data?.phone ?? null,
        contact.channel_data?.user_id ?? null,
        contactName,
        inbox.id,
      );
      conversation = this.conversationRepo.create({
        inboxId: inbox.id,
        contactId: spContactId,
        contactName:
          contactName ||
          (contact.channel_data?.phone ? String(contact.channel_data.phone) : spContactId),
        recordId: record?.id ?? null,
        status: 'open',
      });
      conversation = await this.conversationRepo.save(conversation);
      stats.conversations += 1;
    }

    // Traer mensajes del contacto.
    const messages = await this.sendPulse.getMessages(inbox.accessToken!, bridge.botId, spContactId, this.MESSAGE_PAGE_SIZE);

    // Orden cronológico ascendente para preservar el hilo.
    messages.sort((a, b) => {
      const ta = a.data?.timestamp ?? new Date(a.created_at).getTime() / 1000;
      const tb = b.data?.timestamp ?? new Date(b.created_at).getTime() / 1000;
      return ta - tb;
    });

    let lastContent: string | null = null;
    let lastAt: Date | null = null;

    for (const msg of messages) {
      const norm = normalizeMessage(msg);

      // Idempotencia: si ya existe un mensaje con ese externalId, saltar.
      const existing = await this.messageRepo.findOne({ where: { externalId: norm.externalId } });
      if (existing) {
        lastContent = norm.content ?? lastContent;
        lastAt = norm.createdAt;
        continue;
      }

      const entity = this.messageRepo.create({
        conversationId: conversation.id,
        direction: norm.direction,
        messageType: norm.messageType,
        content: norm.content,
        externalId: norm.externalId,
        status: norm.direction === 'inbound' ? 'delivered' : 'sent',
        source: 'api',
        // Preservamos la fecha original de SendPulse.
        createdAt: norm.createdAt as any,
      });
      await this.messageRepo.save(entity);
      stats.messages += 1;

      lastContent = norm.content ?? lastContent;
      lastAt = norm.createdAt;
    }

    // Actualizar snapshot de la conversación con el último mensaje.
    if (lastAt) {
      conversation.lastMessage = lastContent;
      conversation.lastMessageAt = lastAt;
      await this.conversationRepo.save(conversation);
    }
  }

  /**
   * Upsert de ClientRecord tolerante al prefijo de país.
   *
   * Estrategia (Opción A — se crea si no existe):
   *  1. Si el contacto tiene teléfono: match flexible por los últimos 10 dígitos
   *     (tolera diferencias de prefijo 57). Si existe, enlaza; si no, crea con
   *     ese teléfono.
   *  2. Si solo tiene identidad WhatsApp (BSUID 'CO.xxx'): match por whatsappId.
   *     Si no existe, crea con la identidad (sin teléfono).
   *
   * Ver ChatsService.findOrCreateRecordByPhone para el patrón equivalente del
   * canal nativo.
   */
  private async findOrCreateRecord(
    tenantId: string,
    phoneRaw: string | number | null,
    userId: string | null,
    contactName: string | null,
    inboxId: string,
  ): Promise<ClientRecord | null> {
    const phoneDigits = normalizePhoneDigits(phoneRaw);
    const matchKey = phoneMatchKey(phoneRaw); // últimos 10 dígitos
    const identityId = isWhatsAppIdentity(userId)
      ? userId!.startsWith('CO.')
        ? userId!
        : `CO.${userId}`
      : null;

    let record: ClientRecord | null = null;

    // 1) Match flexible por teléfono (últimos 10 dígitos).
    if (matchKey) {
      record = await this.clientRecordRepo
        .createQueryBuilder('client')
        .where('client.tenant_id = :tenantId', { tenantId })
        .andWhere(
          "RIGHT(REGEXP_REPLACE(client.phone, '[^0-9]', '', 'g'), 10) = :matchKey",
          { matchKey },
        )
        .andWhere("COALESCE(client.phone, '') <> ''")
        .getOne();
    }

    // 2) Si no hubo match por teléfono, intentar por identidad WhatsApp.
    if (!record && identityId) {
      record = await this.clientRecordRepo
        .createQueryBuilder('client')
        .where('client.tenant_id = :tenantId', { tenantId })
        .andWhere('client.whatsapp_id = :identityId', { identityId })
        .getOne();
    }

    if (record) {
      // Enriquecer datos faltantes sin sobrescribir lo existente.
      let dirty = false;
      if (!record.phone && phoneDigits) {
        record.phone = phoneDigits;
        dirty = true;
      }
      if (!record.whatsappId && identityId) {
        record.whatsappId = identityId;
        dirty = true;
      }
      record.lastContactAt = new Date();
      if (dirty) await this.clientRecordRepo.save(record);
      else await this.clientRecordRepo.update(record.id, { lastContactAt: new Date() });
      return record;
    }

    // 3) No existe: crear (Opción A).
    const nameParts = (contactName || '').split(' ');
    record = this.clientRecordRepo.create({
      tenantId,
      phone: phoneDigits,
      whatsappId: identityId,
      firstName: nameParts[0] || null,
      lastName: nameParts.slice(1).join(' ') || null,
      channelSource: 'import',
      source: 'sendpulse',
      lastContactAt: new Date(),
    } as Partial<ClientRecord>);
    return this.clientRecordRepo.save(record);
  }

  /** Actualiza campos de la config del puente en el metadata del inbox. */
  private async patchBridge(inboxId: string, patch: Partial<SendPulseBridgeConfig>): Promise<void> {
    const inbox = await this.inboxRepo.findOne({ where: { id: inboxId } });
    if (!inbox) return;
    const current = getBridgeConfig(inbox.metadata) || ({ active: false, botId: '' } as SendPulseBridgeConfig);
    const next = { ...current, ...patch };
    inbox.metadata = { ...(inbox.metadata || {}), [SENDPULSE_BRIDGE_KEY]: next };
    await this.inboxRepo.save(inbox);
  }
}
