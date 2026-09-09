import { Controller, Post, Param, Body, Res, Logger } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Response } from 'express';
import { Public } from '../auth/public.decorator';
import { Inbox } from '../chats/inbox.entity';
import { Conversation } from '../chats/conversation.entity';
import { Message } from '../chats/message.entity';
import { ClientRecord } from '../records/record.entity';
import { ChatsGateway } from '../chats/chats.gateway';
import { isBridgeActive } from './sendpulse-bridge.types';
import { mapMessageType, phoneMatchKey, normalizePhoneDigits, isWhatsAppIdentity } from './sendpulse.mapper';

/**
 * Webhook entrante de SendPulse para el "Modo Puente".
 *
 * SendPulse NO permite registrar webhooks por API: el usuario pega esta URL
 * manualmente en Bot Settings > Webhooks y selecciona el evento
 * "Incoming messages" (title: "incoming_message").
 *
 * URL a configurar en SendPulse (sin prefijo /api porque main.ts excluye
 * `webhooks/(.*)` del global prefix):
 *   https://smarter.strategee.us/webhooks/sendpulse/{inboxId}
 *
 * El payload llega como un array de eventos. Ver estructura en la doc oficial
 * (sección "Incoming messages event").
 */
@SkipThrottle()
@Controller('webhooks/sendpulse')
export class SendPulseWebhookController {
  private readonly logger = new Logger(SendPulseWebhookController.name);

  constructor(
    @InjectRepository(Inbox)
    private readonly inboxRepo: Repository<Inbox>,
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
    @InjectRepository(ClientRecord)
    private readonly clientRecordRepo: Repository<ClientRecord>,
    private readonly chatsGateway: ChatsGateway,
  ) {}

  @Public()
  @Post(':inboxId')
  async handleWebhook(
    @Param('inboxId') inboxId: string,
    @Body() body: any,
    @Res() res: Response,
  ) {
    // Responder de inmediato para evitar reintentos de SendPulse.
    res.status(200).send('ok');

    // Log del payload crudo para diagnóstico (temporal).
    this.logger.log(
      `[SendPulse webhook] RECIBIDO inbox=${inboxId} payload=${JSON.stringify(body)?.slice(0, 2000)}`,
    );

    try {
      const events = Array.isArray(body) ? body : [body];
      for (const event of events) {
        await this.processEvent(inboxId, event);
      }
    } catch (err: any) {
      this.logger.error(`Error procesando webhook de SendPulse: ${err.message}`, err.stack);
    }
  }

  private async processEvent(inboxId: string, event: any): Promise<void> {
    const title = event?.title;
    // Procesamos mensajes entrantes y salientes del puente.
    const isIncoming = title === 'incoming_message';
    const isOutgoing = title === 'outgoing_message';
    if (!isIncoming && !isOutgoing) {
      this.logger.log(`[SendPulse webhook] evento ignorado (title=${title})`);
      return;
    }

    const inbox = await this.inboxRepo.findOne({ where: { id: inboxId } });
    if (!inbox) {
      this.logger.warn(`[SendPulse webhook] inbox ${inboxId} no encontrado`);
      return;
    }

    // Si el puente no está activo, ignoramos (evita duplicar con el canal normal).
    if (!isBridgeActive(inbox.metadata)) {
      this.logger.warn(`[SendPulse webhook] puente INACTIVO para inbox ${inboxId}, ignorado`);
      return;
    }

    const spContactId: string | undefined = event?.contact?.id;
    if (!spContactId) {
      this.logger.warn(`[SendPulse webhook] evento sin contact.id: ${JSON.stringify(event?.contact)}`);
      return;
    }

    const direction: 'inbound' | 'outbound' = isIncoming ? 'inbound' : 'outbound';
    const channelMessage = event?.info?.message?.channel_data?.message || {};
    const wamid: string =
      event?.info?.message?.channel_data?.message_id ||
      channelMessage.id ||
      `sp_${direction}_${Date.now()}`;

    // El texto del mensaje varía de forma entre entrante y saliente:
    //  - entrante: channel_data.message.text.body
    //  - saliente (WhatsApp): channel_data.message.text puede ser string u objeto
    const rawText = channelMessage.text;
    const textBody: string | null =
      typeof rawText === 'string' ? rawText : rawText?.body || null;

    const spType: string = channelMessage.type || 'text';
    const messageType = mapMessageType(spType);
    const content: string | null =
      textBody ||
      (isIncoming ? event?.contact?.last_message : null) ||
      (messageType === 'text' ? null : `[${messageType}]`);
    const timestamp: number | undefined = channelMessage.timestamp;
    const createdAt = timestamp ? new Date(timestamp * 1000) : new Date();
    const contactName: string | null = event?.contact?.name || null;

    // Idempotencia: no duplicar si ya guardamos este wamid. Esto es clave para
    // los salientes: cuando un agente envía desde NUESTRO CRM, sendMessage() ya
    // guardó el mensaje con externalId=wamid, así que el webhook outgoing del
    // mismo mensaje se ignora aquí. Solo se guardan los salientes originados en
    // SendPulse (bot/agente en el panel de SendPulse).
    const existing = await this.messageRepo.findOne({ where: { externalId: wamid } });
    if (existing) {
      this.logger.debug(`[SendPulse webhook] mensaje ${wamid} (${direction}) ya existe, ignorado`);
      return;
    }

    // Upsert conversación por (inboxId, contactId=SendPulse contact_id).
    let conversation = await this.conversationRepo.findOne({
      where: { inboxId: inbox.id, contactId: spContactId },
    });

    if (!conversation) {
      const record = await this.findOrCreateRecord(inbox.tenantId, event, inbox.id);
      conversation = this.conversationRepo.create({
        inboxId: inbox.id,
        contactId: spContactId,
        contactName: contactName || spContactId,
        recordId: record?.id ?? null,
        status: 'open',
      });
      conversation = await this.conversationRepo.save(conversation);
    }

    // Guardar mensaje (entrante o saliente).
    const message = this.messageRepo.create({
      conversationId: conversation.id,
      direction,
      messageType,
      content,
      externalId: wamid,
      // Entrante llega como 'delivered'; saliente ya fue enviado por SendPulse.
      status: isIncoming ? 'delivered' : 'sent',
      source: 'api',
      createdAt: createdAt as any,
    });
    const saved = await this.messageRepo.save(message);

    // Actualizar snapshot de la conversación.
    conversation.lastMessage = content || `[${messageType}]`;
    conversation.lastMessageAt = createdAt;
    conversation.lastMessageSource = isIncoming ? null : 'api';
    // Solo los entrantes incrementan no leídos.
    if (isIncoming) {
      conversation.unreadCount = (conversation.unreadCount || 0) + 1;
    }
    if (contactName && !conversation.contactName) conversation.contactName = contactName;
    await this.conversationRepo.save(conversation);

    // Emitir en tiempo real a los agentes del tenant.
    this.chatsGateway.emitNewMessage(inbox.tenantId, conversation.id, saved);
    this.chatsGateway.emitConversationUpdate(inbox.tenantId, conversation);

    this.logger.debug(
      `[SendPulse webhook] mensaje ${wamid} (${direction}) guardado en conversación ${conversation.id}`,
    );
  }

  /**
   * Upsert de ClientRecord a partir del contacto del webhook.
   * Mismo criterio que el sync inicial: match flexible por últimos 10 dígitos
   * (tolerante al prefijo 57) y, en su defecto, por identidad WhatsApp.
   */
  private async findOrCreateRecord(
    tenantId: string,
    event: any,
    _inboxId: string,
  ): Promise<ClientRecord | null> {
    const phoneRaw = event?.contact?.phone ?? null;
    const userId: string | null =
      event?.info?.message?.channel_data?.message?.from_user_id ||
      event?.contact?.user_id ||
      null;
    const name: string | null = event?.contact?.name || null;

    const phoneDigits = normalizePhoneDigits(phoneRaw);
    const matchKey = phoneMatchKey(phoneRaw);
    const identityId = isWhatsAppIdentity(userId)
      ? userId!.startsWith('CO.')
        ? userId!
        : `CO.${userId}`
      : null;

    let record: ClientRecord | null = null;

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

    if (!record && identityId) {
      record = await this.clientRecordRepo
        .createQueryBuilder('client')
        .where('client.tenant_id = :tenantId', { tenantId })
        .andWhere('client.whatsapp_id = :identityId', { identityId })
        .getOne();
    }

    if (record) {
      let dirty = false;
      if (!record.phone && phoneDigits) {
        record.phone = phoneDigits;
        dirty = true;
      }
      if (!record.whatsappId && identityId) {
        record.whatsappId = identityId;
        dirty = true;
      }
      if (dirty) await this.clientRecordRepo.save(record);
      return record;
    }

    const nameParts = (name || '').split(' ');
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
}
