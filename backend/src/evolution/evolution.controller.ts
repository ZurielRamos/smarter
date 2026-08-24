import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantAccessGuard } from '../auth/tenant-access.guard';
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
    const webhookUrl = `${baseUrl}/webhooks/evolution/${inbox.id}`;

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
