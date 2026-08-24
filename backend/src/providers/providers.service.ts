import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { ChannelProvider } from './channel-provider.entity';

@Injectable()
export class ProvidersService {
  constructor(
    @InjectRepository(ChannelProvider)
    private readonly repo: Repository<ChannelProvider>,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Retorna el estado de configuración de cada proveedor leyendo las env vars.
   * No expone valores, solo indica si están configuradas.
   */
  getStatus(): { channel: string; provider: string; name: string; configured: boolean; keys: { key: string; label: string; set: boolean }[] }[] {
    return [
      {
        channel: 'sms',
        provider: 'labsmobile',
        name: 'LabsMobile',
        configured: !!this.configService.get('LABSMOBILE_USERNAME') && !!this.configService.get('LABSMOBILE_TOKEN'),
        keys: [
          { key: 'LABSMOBILE_USERNAME', label: 'Usuario', set: !!this.configService.get('LABSMOBILE_USERNAME') },
          { key: 'LABSMOBILE_TOKEN', label: 'API Token', set: !!this.configService.get('LABSMOBILE_TOKEN') },
        ],
      },
      {
        channel: 'llamada',
        provider: 'onurix',
        name: 'Onurix',
        configured: !!this.configService.get('ONURIX_CLIENT') && !!this.configService.get('ONURIX_KEY'),
        keys: [
          { key: 'ONURIX_CLIENT', label: 'Client ID', set: !!this.configService.get('ONURIX_CLIENT') },
          { key: 'ONURIX_KEY', label: 'API Key', set: !!this.configService.get('ONURIX_KEY') },
        ],
      },
      {
        channel: 'email',
        provider: 'mandrill',
        name: 'Mandrill (Mailchimp)',
        configured: !!this.configService.get('MANDRILL_API_KEY'),
        keys: [
          { key: 'MANDRILL_API_KEY', label: 'API Key', set: !!this.configService.get('MANDRILL_API_KEY') },
          { key: 'MANDRILL_FROM_EMAIL', label: 'Email remitente', set: !!this.configService.get('MANDRILL_FROM_EMAIL') },
          { key: 'MANDRILL_FROM_NAME', label: 'Nombre remitente', set: !!this.configService.get('MANDRILL_FROM_NAME') },
        ],
      },
      {
        channel: 'whatsapp',
        provider: 'meta',
        name: 'Meta Platform',
        configured: !!this.configService.get('META_APP_ID') && !!this.configService.get('META_APP_SECRET'),
        keys: [
          { key: 'META_APP_ID', label: 'App ID', set: !!this.configService.get('META_APP_ID') },
          { key: 'META_APP_SECRET', label: 'App Secret', set: !!this.configService.get('META_APP_SECRET') },
          { key: 'META_WEBHOOK_VERIFY_TOKEN', label: 'Webhook Verify Token', set: !!this.configService.get('META_WEBHOOK_VERIFY_TOKEN') },
          { key: 'META_WA_CONFIG_ID', label: 'WhatsApp Config ID', set: !!this.configService.get('META_WA_CONFIG_ID') },
          { key: 'INSTAGRAM_APP_ID', label: 'Instagram App ID', set: !!this.configService.get('INSTAGRAM_APP_ID') },
          { key: 'INSTAGRAM_APP_SECRET', label: 'Instagram App Secret', set: !!this.configService.get('INSTAGRAM_APP_SECRET') },
        ],
      },
      {
        channel: 'ai',
        provider: 'openrouter',
        name: 'OpenRouter',
        configured: !!this.configService.get('OPENROUTER_API_KEY'),
        keys: [
          { key: 'OPENROUTER_API_KEY', label: 'API Key', set: !!this.configService.get('OPENROUTER_API_KEY') },
        ],
      },
      {
        channel: 'email_transaccional',
        provider: 'mailgun',
        name: 'Mailgun',
        configured: !!this.configService.get('MAILGUN_API_KEY'),
        keys: [
          { key: 'MAILGUN_API_KEY', label: 'API Key', set: !!this.configService.get('MAILGUN_API_KEY') },
          { key: 'MAILGUN_WEBHOOK_SIGNING_KEY', label: 'Webhook Signing Key', set: !!this.configService.get('MAILGUN_WEBHOOK_SIGNING_KEY') },
          { key: 'MAILGUN_REGION', label: 'Región (us/eu)', set: !!this.configService.get('MAILGUN_REGION') },
        ],
      },
      {
        channel: 'evolution',
        provider: 'evolution',
        name: 'Evolution API',
        configured: !!this.configService.get('EVOLUTION_API_URL') && !!this.configService.get('EVOLUTION_API_KEY'),
        keys: [
          { key: 'EVOLUTION_API_URL', label: 'URL del servidor', set: !!this.configService.get('EVOLUTION_API_URL') },
          { key: 'EVOLUTION_API_KEY', label: 'API Key (Global)', set: !!this.configService.get('EVOLUTION_API_KEY') },
        ],
      },
    ];
  }

  async findAll(): Promise<ChannelProvider[]> {
    return this.repo.find({ order: { channel: 'ASC', isDefault: 'DESC', name: 'ASC' } });
  }

  async findByChannel(channel: string): Promise<ChannelProvider[]> {
    return this.repo.find({ where: { channel, isActive: true }, order: { isDefault: 'DESC' } });
  }

  async findDefault(channel: string): Promise<ChannelProvider | null> {
    return this.repo.findOne({ where: { channel, isDefault: true, isActive: true } });
  }

  async findOne(id: string): Promise<ChannelProvider> {
    const provider = await this.repo.findOne({ where: { id } });
    if (!provider) throw new NotFoundException(`Proveedor ${id} no encontrado`);
    return provider;
  }

  async create(data: {
    channel: string;
    provider: string;
    name: string;
    credentials: Record<string, string>;
    isDefault?: boolean;
  }): Promise<ChannelProvider> {
    // Si se marca como default, quitar default a los otros del mismo canal
    if (data.isDefault) {
      await this.repo.update({ channel: data.channel }, { isDefault: false });
    }
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      provider: string;
      credentials: Record<string, string>;
      isDefault: boolean;
      isActive: boolean;
    }>,
  ): Promise<ChannelProvider> {
    const entity = await this.findOne(id);

    if (data.isDefault) {
      await this.repo.update({ channel: entity.channel }, { isDefault: false });
    }

    Object.assign(entity, data);
    return this.repo.save(entity);
  }

  async remove(id: string): Promise<{ deleted: boolean }> {
    const entity = await this.findOne(id);
    await this.repo.remove(entity);
    return { deleted: true };
  }
}
