import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntitySubscriberInterface, InsertEvent } from 'typeorm';
import { ClientRecord } from '../records/record.entity';
import { Conversation } from '../chats/conversation.entity';
import { Message } from '../chats/message.entity';
import { Inbox } from '../chats/inbox.entity';
import { AutomationDispatcher } from './automation-dispatcher.service';
import { automationContext } from './utils/automation-context';

/** Espera antes de ejecutar: da tiempo a que el chat vincule el contacto. */
const CHAT_EVENT_DELAY_MS = 2000;

interface ConvInfo {
  tenantId: string;
  inboxId: string;
  channel: string;
  contactId: string;
  contactName: string | null;
}

/**
 * Escucha los inserts de contactos, conversaciones y mensajes entrantes y los
 * convierte en eventos de automatización. Al enganchar la capa de datos no se
 * toca el código de Chats ni de Records y se cubren todos los canales
 * (WhatsApp, Evolution, Messenger, Instagram, widget, importaciones, API…).
 */
@Injectable()
export class AutomationEventsSubscriber implements EntitySubscriberInterface, OnModuleInit {
  private readonly logger = new Logger(AutomationEventsSubscriber.name);
  private readonly convCache = new Map<string, ConvInfo>();

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly dispatcher: AutomationDispatcher,
  ) {}

  onModuleInit() {
    if (process.env.AUTOMATION_EVENTS_ENABLED === 'false') return;
    if (!this.dataSource.subscribers.includes(this)) {
      this.dataSource.subscribers.push(this);
    }
  }

  afterInsert(event: InsertEvent<unknown>) {
    // Lo que provoca una automatización no la vuelve a disparar (anti-bucle).
    if (automationContext.getStore()) return;
    const entity = event.entity;
    if (!entity) return;

    if (entity instanceof ClientRecord) {
      if (!entity.tenantId) return;
      void this.dispatcher
        .dispatchEvent(entity.tenantId, 'contact_created', { contactId: entity.id })
        .catch((e) => this.logger.warn(`contact_created: ${(e as Error).message}`));
    } else if (entity instanceof Conversation) {
      void this.onConversation(entity).catch((e) =>
        this.logger.warn(`conversation_created: ${(e as Error).message}`),
      );
    } else if (entity instanceof Message) {
      if (entity.direction !== 'inbound') return;
      void this.onInboundMessage(entity).catch((e) =>
        this.logger.warn(`message_received: ${(e as Error).message}`),
      );
    }
  }

  private async inboxInfo(inboxId: string): Promise<{ tenantId: string; channel: string } | null> {
    const inbox = await this.dataSource.getRepository(Inbox).findOne({
      where: { id: inboxId },
      select: { id: true, tenantId: true, channel: true },
    });
    return inbox ? { tenantId: inbox.tenantId, channel: inbox.channel } : null;
  }

  private async onConversation(conv: Conversation) {
    const inbox = await this.inboxInfo(conv.inboxId);
    if (!inbox) return;
    this.remember(conv.id, {
      ...inbox,
      inboxId: conv.inboxId,
      contactId: conv.contactId,
      contactName: conv.contactName,
    });
    await this.dispatcher.dispatchEvent(
      inbox.tenantId,
      'conversation_created',
      {
        conversationId: conv.id,
        inboxId: conv.inboxId,
        channel: inbox.channel,
        contactId: conv.contactId,
        contactName: conv.contactName,
      },
      CHAT_EVENT_DELAY_MS,
    );
  }

  private async onInboundMessage(msg: Message) {
    let info = this.convCache.get(msg.conversationId);
    if (!info) {
      const conv = await this.dataSource
        .getRepository(Conversation)
        .findOne({ where: { id: msg.conversationId } });
      if (!conv) return;
      const inbox = await this.inboxInfo(conv.inboxId);
      if (!inbox) return;
      info = {
        ...inbox,
        inboxId: conv.inboxId,
        contactId: conv.contactId,
        contactName: conv.contactName,
      };
      this.remember(conv.id, info);
    }
    await this.dispatcher.dispatchEvent(
      info.tenantId,
      'message_received',
      {
        messageId: msg.id,
        conversationId: msg.conversationId,
        inboxId: info.inboxId,
        channel: info.channel,
        contactId: info.contactId,
        contactName: info.contactName,
        content: msg.content ?? '',
        messageType: msg.messageType,
        mediaUrl: msg.mediaUrl ?? null,
      },
      CHAT_EVENT_DELAY_MS,
    );
  }

  private remember(id: string, info: ConvInfo) {
    if (this.convCache.size > 5000) this.convCache.clear();
    this.convCache.set(id, info);
  }
}
