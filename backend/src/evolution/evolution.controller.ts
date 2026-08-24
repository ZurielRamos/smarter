import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantAccessGuard } from '../auth/tenant-access.guard';
import { Public } from '../auth/public.decorator';
import { EvolutionService } from './evolution.service';
import { ChatsService } from '../chats/chats.service';

/**
 * Controlador para gestión de instancias Evolution API
 * y recepción de webhooks de mensajes entrantes.
 */
@Controller('evolution')
@UseGuards(JwtAuthGuard, TenantAccessGuard)
export class EvolutionController {
  private readonly logger = new Logger(EvolutionController.name);

  constructor(
    private readonly evolutionService: EvolutionService,
    private readonly chatsService: ChatsService,
    private readonly configService: ConfigService,
  ) {}

  // === INSTANCE MANAGEMENT ===

  /**
   * Crea una instancia de Evolution y la asocia al inbox.
   * El frontend debe llamar esto después de crear el inbox con channel='evolution'.
   */
  @Post('instances')
  async createInstance(@Body() body: { inboxId: string }) {
    const inbox = await this.chatsService.findInboxById(body.inboxId);
    const baseUrl = this.configService.get<string>('META_BASE_URL') || 'http://localhost:3001';
    const instanceName = `inbox_${inbox.id.replace(/-/g, '')}`;
    const webhookUrl = `${baseUrl}/api/evolution/webhook/${inbox.id}`;

    const result = await this.evolutionService.createInstance(instanceName, webhookUrl);

    // Guardar datos en el inbox
    await this.chatsService.updateInbox(inbox.id, {
      accessToken: result.hash,
      status: 'pending',
      metadata: {
        ...inbox.metadata,
        evolutionInstanceName: instanceName,
        evolutionApiUrl: this.configService.get<string>('EVOLUTION_API_URL'),
      },
    });

    return { instanceName, status: 'created' };
  }

  /**
   * Obtiene el QR code para conectar WhatsApp a la instancia.
   */
  @Get('instances/:inboxId/qr')
  async getQrCode(@Param('inboxId') inboxId: string) {
    const inbox = await this.chatsService.findInboxById(inboxId);
    const instanceName = inbox.metadata?.evolutionInstanceName;
    if (!instanceName) {
      return { error: 'No Evolution instance configured for this inbox' };
    }

    try {
      const qr = await this.evolutionService.getQrCode(instanceName);
      return qr;
    } catch (err: any) {
      // Si la instancia ya está conectada, no hay QR
      if (err.message?.includes('already connected') || err.message?.includes('open')) {
        return { connected: true };
      }
      throw err;
    }
  }

  /**
   * Obtiene el estado actual de conexión de la instancia.
   */
  @Get('instances/:inboxId/status')
  async getStatus(@Param('inboxId') inboxId: string) {
    const inbox = await this.chatsService.findInboxById(inboxId);
    const instanceName = inbox.metadata?.evolutionInstanceName;
    if (!instanceName) {
      return { status: 'not_configured' };
    }

    const info = await this.evolutionService.getInstanceStatus(instanceName);

    // Sincronizar el status del inbox si cambió
    const mappedStatus = info.status === 'open' ? 'connected' : info.status === 'connecting' ? 'pending' : 'disconnected';
    if (inbox.status !== mappedStatus) {
      await this.chatsService.updateInbox(inboxId, {
        status: mappedStatus,
        channelName: info.ownerJid ? this.evolutionService.parseRemoteJid(info.ownerJid) : inbox.channelName,
      });
    }

    return {
      status: info.status,
      ownerJid: info.ownerJid,
      phoneNumber: info.ownerJid ? this.evolutionService.parseRemoteJid(info.ownerJid) : null,
    };
  }

  /**
   * Reinicia la instancia (útil para reconexión).
   */
  @Post('instances/:inboxId/restart')
  async restartInstance(@Param('inboxId') inboxId: string) {
    const inbox = await this.chatsService.findInboxById(inboxId);
    const instanceName = inbox.metadata?.evolutionInstanceName;
    if (!instanceName) {
      return { error: 'No Evolution instance configured' };
    }

    await this.evolutionService.restartInstance(instanceName);
    await this.chatsService.updateInbox(inboxId, { status: 'pending' });
    return { status: 'restarting' };
  }

  /**
   * Desconecta la instancia (logout de WhatsApp).
   */
  @Post('instances/:inboxId/logout')
  async logout(@Param('inboxId') inboxId: string) {
    const inbox = await this.chatsService.findInboxById(inboxId);
    const instanceName = inbox.metadata?.evolutionInstanceName;
    if (!instanceName) {
      return { error: 'No Evolution instance configured' };
    }

    await this.evolutionService.logout(instanceName);
    await this.chatsService.updateInbox(inboxId, {
      status: 'disconnected',
      channelName: null,
    });
    return { status: 'disconnected' };
  }

  /**
   * Elimina la instancia de Evolution y limpia el inbox.
   */
  @Delete('instances/:inboxId')
  async deleteInstance(@Param('inboxId') inboxId: string) {
    const inbox = await this.chatsService.findInboxById(inboxId);
    const instanceName = inbox.metadata?.evolutionInstanceName;

    if (instanceName) {
      try {
        await this.evolutionService.deleteInstance(instanceName);
      } catch (err: any) {
        this.logger.warn(`Failed to delete Evolution instance ${instanceName}: ${err.message}`);
      }
    }

    // Limpiar datos de conexión del inbox
    const { evolutionInstanceName, evolutionApiUrl, ...restMetadata } = inbox.metadata || {};
    await this.chatsService.updateInbox(inboxId, {
      status: 'disconnected',
      accessToken: null,
      channelName: null,
      metadata: restMetadata,
    });

    return { deleted: true };
  }

  /**
   * Health check de la conexión con Evolution API.
   */
  @Get('health')
  async health() {
    const ok = await this.evolutionService.healthCheck();
    return { evolution: ok ? 'ok' : 'unreachable' };
  }
}

// === WEBHOOK CONTROLLER (separado, público, sin throttle) ===

@Public()
@SkipThrottle()
@Controller('evolution/webhook')
export class EvolutionWebhookController {
  private readonly logger = new Logger(EvolutionWebhookController.name);

  constructor(
    private readonly chatsService: ChatsService,
    private readonly evolutionService: EvolutionService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Recibe webhooks de Evolution API para un inbox específico.
   * URL: POST /api/evolution/webhook/:inboxId
   */
  @Post(':inboxId')
  async handleWebhook(
    @Param('inboxId') inboxId: string,
    @Body() body: any,
    @Res() res: Response,
  ) {
    // Responder 200 inmediatamente
    res.status(200).send('OK');

    try {
      await this.processWebhookEvent(inboxId, body);
    } catch (err: any) {
      this.logger.error(`[Evolution Webhook] Error processing event for inbox ${inboxId}: ${err.message}`);
    }
  }

  private async processWebhookEvent(inboxId: string, event: any): Promise<void> {
    const eventType = event.event;

    this.logger.debug(`[Evolution Webhook] Event: ${eventType} for inbox: ${inboxId}`);

    switch (eventType) {
      case 'connection.update':
        await this.handleConnectionUpdate(inboxId, event);
        break;
      case 'messages.upsert':
        await this.handleMessagesUpsert(inboxId, event);
        break;
      case 'messages.update':
        await this.handleMessagesUpdate(inboxId, event);
        break;
      case 'qrcode.updated':
        // QR code actualizado — el frontend hace polling, no necesitamos hacer nada aquí
        this.logger.debug(`[Evolution Webhook] QR code updated for inbox ${inboxId}`);
        break;
      default:
        this.logger.debug(`[Evolution Webhook] Unhandled event: ${eventType}`);
    }
  }

  /**
   * Maneja cambios de estado de conexión de la instancia.
   */
  private async handleConnectionUpdate(inboxId: string, event: any): Promise<void> {
    const state = event.data?.state || event.data?.instance?.state;
    if (!state) return;

    const mappedStatus = state === 'open' ? 'connected' : state === 'connecting' ? 'pending' : 'disconnected';

    const updateData: Record<string, any> = { status: mappedStatus };

    // Si se conectó, guardar el número de teléfono
    if (state === 'open' && event.data?.instance?.ownerJid) {
      updateData.channelName = this.evolutionService.parseRemoteJid(event.data.instance.ownerJid);
    }

    await this.chatsService.updateInbox(inboxId, updateData);
    this.logger.log(`[Evolution Webhook] Connection state for inbox ${inboxId}: ${state}`);
  }

  /**
   * Maneja mensajes entrantes (nuevos mensajes recibidos).
   */
  private async handleMessagesUpsert(inboxId: string, event: any): Promise<void> {
    const messages = event.data || [];

    for (const msgData of Array.isArray(messages) ? messages : [messages]) {
      const key = msgData.key;
      if (!key) continue;

      // Ignorar mensajes propios (outbound)
      if (key.fromMe) continue;

      // Ignorar mensajes de status/broadcast
      const remoteJid = key.remoteJid || '';
      if (remoteJid === 'status@broadcast' || remoteJid.endsWith('@g.us')) {
        // Ignorar estados y grupos por ahora
        continue;
      }

      const contactPhone = this.evolutionService.parseRemoteJid(remoteJid);
      if (!contactPhone) continue;

      const message = msgData.message;
      if (!message) continue;

      // Extraer nombre del contacto
      const contactName = msgData.pushName || contactPhone;

      // Determinar tipo y contenido del mensaje
      let messageType = 'text';
      let content: string | null = null;
      let mediaUrl: string | null = null;
      let mediaMimeType: string | null = null;

      if (message.conversation) {
        content = message.conversation;
      } else if (message.extendedTextMessage) {
        content = message.extendedTextMessage.text || '';
      } else if (message.imageMessage) {
        messageType = 'image';
        content = message.imageMessage.caption || null;
        mediaMimeType = message.imageMessage.mimetype || 'image/jpeg';
        // Si Evolution envía la URL directa o base64
        mediaUrl = message.imageMessage.url || null;
        if (!mediaUrl && msgData.base64) {
          // Se puede guardar el base64 como media — delegar al servicio de chats
          mediaUrl = `data:${mediaMimeType};base64,${msgData.base64}`;
        }
      } else if (message.videoMessage) {
        messageType = 'video';
        content = message.videoMessage.caption || null;
        mediaMimeType = message.videoMessage.mimetype || 'video/mp4';
        mediaUrl = message.videoMessage.url || null;
        if (!mediaUrl && msgData.base64) {
          mediaUrl = `data:${mediaMimeType};base64,${msgData.base64}`;
        }
      } else if (message.audioMessage) {
        messageType = 'audio';
        mediaMimeType = message.audioMessage.mimetype || 'audio/ogg';
        mediaUrl = message.audioMessage.url || null;
        if (!mediaUrl && msgData.base64) {
          mediaUrl = `data:${mediaMimeType};base64,${msgData.base64}`;
        }
      } else if (message.documentMessage) {
        messageType = 'document';
        content = message.documentMessage.fileName || null;
        mediaMimeType = message.documentMessage.mimetype || 'application/octet-stream';
        mediaUrl = message.documentMessage.url || null;
        if (!mediaUrl && msgData.base64) {
          mediaUrl = `data:${mediaMimeType};base64,${msgData.base64}`;
        }
      } else if (message.stickerMessage) {
        messageType = 'sticker';
        mediaMimeType = message.stickerMessage.mimetype || 'image/webp';
        mediaUrl = message.stickerMessage.url || null;
      } else if (message.locationMessage) {
        messageType = 'text';
        content = `📍 ${message.locationMessage.degreesLatitude}, ${message.locationMessage.degreesLongitude}`;
      } else if (message.contactMessage) {
        messageType = 'text';
        content = `👤 ${message.contactMessage.displayName || 'Contacto'}`;
      } else if (message.buttonsResponseMessage) {
        content = message.buttonsResponseMessage.selectedDisplayText || '[button]';
      } else if (message.listResponseMessage) {
        content = message.listResponseMessage.title || '[list]';
      } else {
        // Tipo no soportado
        content = '[mensaje no soportado]';
      }

      // Delegar la creación de conversación y mensaje al ChatsService
      await this.chatsService.handleEvolutionInboundMessage(inboxId, {
        contactPhone,
        contactName,
        messageType,
        content,
        mediaUrl,
        mediaMimeType,
        externalId: key.id || null,
        replyToExternalId: msgData.contextInfo?.stanzaId || message.extendedTextMessage?.contextInfo?.stanzaId || null,
      });
    }
  }

  /**
   * Maneja actualizaciones de estado de mensajes (entregado, leído).
   */
  private async handleMessagesUpdate(inboxId: string, event: any): Promise<void> {
    const updates = event.data || [];
    for (const update of Array.isArray(updates) ? updates : [updates]) {
      const messageId = update.key?.id;
      const status = update.update?.status;

      if (!messageId || !status) continue;

      // Mapear status de Evolution a nuestro formato
      let mappedStatus: string | null = null;
      switch (status) {
        case 'DELIVERY_ACK':
        case 3:
          mappedStatus = 'delivered';
          break;
        case 'READ':
        case 4:
          mappedStatus = 'read';
          break;
        case 'PLAYED':
        case 5:
          mappedStatus = 'read';
          break;
      }

      if (mappedStatus) {
        await this.chatsService.updateMessageStatus(messageId, mappedStatus);
      }
    }
  }
}
