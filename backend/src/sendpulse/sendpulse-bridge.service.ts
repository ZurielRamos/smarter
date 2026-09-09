import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { Inbox } from '../chats/inbox.entity';
import { SendPulseService } from './sendpulse.service';
import { SENDPULSE_QUEUE } from './sendpulse-sync.worker';
import {
  getBridgeConfig,
  isBridgeActive,
  SENDPULSE_BRIDGE_KEY,
  SendPulseBridgeConfig,
} from './sendpulse-bridge.types';

/**
 * Orquesta la activación/desactivación del Modo Puente por bandeja.
 */
@Injectable()
export class SendPulseBridgeService {
  private readonly logger = new Logger(SendPulseBridgeService.name);

  constructor(
    @InjectRepository(Inbox)
    private readonly inboxRepo: Repository<Inbox>,
    private readonly sendPulse: SendPulseService,
    private readonly configService: ConfigService,
    @InjectQueue(SENDPULSE_QUEUE)
    private readonly syncQueue: Queue,
  ) {}

  /** URL pública del webhook que el usuario debe pegar en SendPulse. */
  getWebhookUrl(inboxId: string): string {
    const base =
      this.configService.get<string>('PUBLIC_BASE_URL') ||
      this.configService.get<string>('API_BASE_URL') ||
      'https://smarter.strategee.us';
    // Sin /api: main.ts excluye webhooks/(.*) del global prefix.
    return `${base.replace(/\/$/, '')}/webhooks/sendpulse/${inboxId}`;
  }

  /** Estado actual del puente para una bandeja. */
  async getStatus(inboxId: string): Promise<{
    bridge: SendPulseBridgeConfig | null;
    webhookUrl: string;
    hasApiKey: boolean;
  }> {
    const inbox = await this.inboxRepo.findOne({ where: { id: inboxId } });
    if (!inbox) throw new NotFoundException('Bandeja no encontrada');
    return {
      bridge: getBridgeConfig(inbox.metadata),
      webhookUrl: this.getWebhookUrl(inboxId),
      hasApiKey: !!inbox.accessToken,
    };
  }

  /**
   * Activa el modo puente:
   *  1. Valida la API key contra SendPulse.
   *  2. Resuelve el bot (usa el provisto o el primero de la cuenta).
   *  3. Guarda credenciales + config y encola la sincronización inicial.
   */
  async activate(
    inboxId: string,
    apiKey: string,
    botId?: string,
  ): Promise<{ bridge: SendPulseBridgeConfig; webhookUrl: string }> {
    const inbox = await this.inboxRepo.findOne({ where: { id: inboxId } });
    if (!inbox) throw new NotFoundException('Bandeja no encontrada');
    if (!apiKey) throw new BadRequestException('Se requiere la API key de SendPulse');

    // 1) Validar credenciales.
    let bots;
    try {
      await this.sendPulse.getAccount(apiKey);
      bots = await this.sendPulse.getBots(apiKey);
    } catch (err: any) {
      throw new BadRequestException(`API key de SendPulse inválida: ${err.message}`);
    }

    // 2) Resolver bot.
    if (botId && !bots.some((b) => b.id === botId)) {
      throw new BadRequestException('El bot indicado no existe en esta cuenta de SendPulse');
    }
    if (!botId && (!bots || bots.length === 0)) {
      throw new BadRequestException('La cuenta de SendPulse no tiene bots');
    }
    const resolvedBotId: string = botId || bots[0].id;

    // 3) Guardar API key en el inbox (texto plano, consistente con otros canales).
    inbox.accessToken = apiKey;

    const bridge: SendPulseBridgeConfig = {
      ...(getBridgeConfig(inbox.metadata) || {}),
      active: true,
      botId: resolvedBotId,
      syncStatus: 'queued',
      syncProgress: 0,
      syncError: undefined,
      activatedAt: new Date().toISOString(),
    };
    inbox.metadata = { ...(inbox.metadata || {}), [SENDPULSE_BRIDGE_KEY]: bridge };
    await this.inboxRepo.save(inbox);

    // Encolar sync inicial del histórico.
    const job = await this.syncQueue.add(
      'initial-sync',
      { inboxId },
      { attempts: 1, removeOnComplete: true, removeOnFail: false },
    );

    bridge.syncJobId = String(job.id);
    inbox.metadata = { ...(inbox.metadata || {}), [SENDPULSE_BRIDGE_KEY]: bridge };
    await this.inboxRepo.save(inbox);

    this.logger.log(`Modo puente activado para inbox ${inboxId}, bot ${resolvedBotId}, sync job ${job.id}`);

    return { bridge, webhookUrl: this.getWebhookUrl(inboxId) };
  }

  /**
   * Desactiva el modo puente. Mantiene los datos ya sincronizados; solo corta
   * el envío/recepción vía SendPulse. El corte del número en Meta es un paso
   * de infraestructura aparte (documentado para el usuario).
   */
  async deactivate(inboxId: string): Promise<{ bridge: SendPulseBridgeConfig }> {
    const inbox = await this.inboxRepo.findOne({ where: { id: inboxId } });
    if (!inbox) throw new NotFoundException('Bandeja no encontrada');
    if (!isBridgeActive(inbox.metadata)) {
      throw new BadRequestException('El modo puente no está activo en esta bandeja');
    }

    const bridge: SendPulseBridgeConfig = {
      ...(getBridgeConfig(inbox.metadata) as SendPulseBridgeConfig),
      active: false,
    };
    inbox.metadata = { ...(inbox.metadata || {}), [SENDPULSE_BRIDGE_KEY]: bridge };
    await this.inboxRepo.save(inbox);

    this.logger.log(`Modo puente desactivado para inbox ${inboxId}`);
    return { bridge };
  }
}
