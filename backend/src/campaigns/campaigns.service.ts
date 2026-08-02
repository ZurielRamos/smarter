import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Campaign, SegmentGroup } from './campaign.entity';
import { CampaignSend } from './campaign-send.entity';
import { ClientRecord } from '../records/record.entity';
import { ChannelConfig } from '../tenants/channel-config.entity';
import { RecordList } from '../records/record-list.entity';
import { WhatsAppService } from './whatsapp.service';
import { CallService } from './call.service';

@Injectable()
export class CampaignsService {
  constructor(
    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,
    @InjectRepository(CampaignSend)
    private readonly sendRepository: Repository<CampaignSend>,
    @InjectRepository(ClientRecord)
    private readonly clientRepository: Repository<ClientRecord>,
    @InjectRepository(ChannelConfig)
    private readonly channelConfigRepo: Repository<ChannelConfig>,
    @InjectRepository(RecordList)
    private readonly recordListRepo: Repository<RecordList>,
    private readonly configService: ConfigService,
    private readonly whatsappService: WhatsAppService,
    private readonly callService: CallService,
  ) {}

  async findAll(tenantId?: string): Promise<Campaign[]> {
    const where: any = {};
    if (tenantId) where.tenantId = tenantId;
    return this.campaignRepository.find({ where, order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<Campaign> {
    return this.campaignRepository.findOneByOrFail({ id });
  }

  async create(data: {
    name: string;
    description?: string;
    segments: SegmentGroup[];
    channel?: string;
    tenantId?: string;
    listId?: string;
  }): Promise<Campaign> {
    const campaign = this.campaignRepository.create(data);
    const saved = await this.campaignRepository.save(campaign);

    // Calcular cuántos clientes matchean
    const count = await this.getAudienceCount(saved);
    saved.matchedCount = count;
    return this.campaignRepository.save(saved);
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      description: string;
      segments: SegmentGroup[];
      channel: string;
      status: string;
      listId: string | null;
      messageTemplate: string;
      whatsappTemplateName: string;
      whatsappTemplateLanguage: string;
      whatsappVariableMapping: Record<string, string>;
      callVoice: string;
      callRetries: string;
      callLeaveVoicemail: boolean;
      callAudioCode: string;
      maxSends: number | null;
      isRecurring: boolean;
      sendDate: string | null;
      sendTime: string | null;
      recurrenceDays: string[] | null;
    }>,
  ): Promise<Campaign> {
    await this.campaignRepository.update(id, data as any);
    const campaign = await this.findOne(id);

    if (data.segments || data.listId !== undefined) {
      campaign.matchedCount = await this.getAudienceCount(campaign);
      await this.campaignRepository.save(campaign);
    }

    return campaign;
  }

  async delete(id: string): Promise<{ deleted: boolean }> {
    await this.campaignRepository.delete(id);
    return { deleted: true };
  }

  async preview(segments: SegmentGroup[], tenantId?: string): Promise<{ count: number; sample: ClientRecord[] }> {
    const qb = this.buildSegmentQuery(segments, tenantId);
    const count = await qb.getCount();
    const sample = await qb.limit(10).getMany();
    return { count, sample };
  }

  private async countMatches(segments: SegmentGroup[], tenantId?: string): Promise<number> {
    const qb = this.buildSegmentQuery(segments, tenantId);
    return qb.getCount();
  }

  /** Get audience count — from list or segments */
  private async getAudienceCount(campaign: Campaign): Promise<number> {
    if (campaign.listId) {
      return this.getListRecordCount(campaign.listId, campaign.tenantId);
    }
    return this.countMatches(campaign.segments || [], campaign.tenantId);
  }

  /** Get audience clients — from list or segments */
  private async getAudienceClients(campaign: Campaign): Promise<ClientRecord[]> {
    if (campaign.listId) {
      return this.getListRecords(campaign.listId, campaign.tenantId);
    }
    return this.buildSegmentQuery(campaign.segments || [], campaign.tenantId).getMany();
  }

  private async getListRecordCount(listId: string, tenantId?: string): Promise<number> {
    const list = await this.recordListRepo.findOne({ where: { id: listId } });
    if (!list) return 0;

    if (list.type === 'static') {
      const ids = list.recordIds || [];
      return ids.length;
    }

    // Dynamic list — use same filter logic
    if (list.filters && list.filters.conditions.length > 0) {
      const segments: SegmentGroup[] = [{
        logic: list.filters.logic === 'or' ? 'OR' : 'AND',
        conditions: list.filters.conditions.map((c) => ({
          field: c.field,
          operator: c.operator,
          value: c.value,
        })),
      }];
      return this.countMatches(segments, tenantId || list.tenantId);
    }
    return 0;
  }

  private async getListRecords(listId: string, tenantId?: string): Promise<ClientRecord[]> {
    const list = await this.recordListRepo.findOne({ where: { id: listId } });
    if (!list) return [];

    if (list.type === 'static') {
      const ids = list.recordIds || [];
      if (ids.length === 0) return [];
      return this.clientRepository.find({ where: ids.map((id) => ({ id })) });
    }

    // Dynamic list
    if (list.filters && list.filters.conditions.length > 0) {
      const segments: SegmentGroup[] = [{
        logic: list.filters.logic === 'or' ? 'OR' : 'AND',
        conditions: list.filters.conditions.map((c) => ({
          field: c.field,
          operator: c.operator,
          value: c.value,
        })),
      }];
      return this.buildSegmentQuery(segments, tenantId || list.tenantId).getMany();
    }
    return [];
  }

  private buildSegmentQuery(segments: SegmentGroup[], tenantId?: string) {
    const qb = this.clientRepository.createQueryBuilder('client');

    if (tenantId) {
      qb.where('client.tenant_id = :tenantId', { tenantId });
    }

    for (let i = 0; i < segments.length; i++) {
      const group = segments[i];
      const groupConditions: string[] = [];
      const params: Record<string, unknown> = {};

      for (let j = 0; j < group.conditions.length; j++) {
        const cond = group.conditions[j];
        const paramKey = `p_${i}_${j}`;
        const col = this.fieldToColumn(cond.field);

        const sqlCond = this.buildConditionSql(col, cond.operator, paramKey);
        if (sqlCond) {
          groupConditions.push(sqlCond);
          params[paramKey] = cond.value;
        }
      }

      if (groupConditions.length > 0) {
        const joined =
          group.logic === 'OR'
            ? `(${groupConditions.join(' OR ')})`
            : `(${groupConditions.join(' AND ')})`;

        qb.andWhere(joined, params);
      }
    }

    return qb;
  }

  private buildConditionSql(col: string, operator: string, paramKey: string): string | null {
    switch (operator) {
      case 'equals':
        return `${col} = :${paramKey}`;
      case 'not_equals':
        return `${col} != :${paramKey}`;
      case 'contains':
        return `${col} ILIKE '%' || :${paramKey} || '%'`;
      case 'starts_with':
        return `${col} ILIKE :${paramKey} || '%'`;
      case 'ends_with':
        return `${col} ILIKE '%' || :${paramKey}`;
      case 'greater_than':
        return `${col} > :${paramKey}`;
      case 'less_than':
        return `${col} < :${paramKey}`;
      case 'greater_or_equal':
        return `${col} >= :${paramKey}`;
      case 'less_or_equal':
        return `${col} <= :${paramKey}`;
      case 'is_true':
        return `${col} = true`;
      case 'is_false':
        return `${col} = false`;
      case 'is_null':
      case 'is_empty':
        return `(${col} IS NULL OR ${col} = '')`;
      case 'is_not_null':
      case 'is_not_empty':
        return `(${col} IS NOT NULL AND ${col} != '')`;
      case 'in_list':
        return `${col} IN (:...${paramKey})`;
      default:
        return null;
    }
  }

  private fieldToColumn(field: string): string {
    const map: Record<string, string> = {
      // New field names
      firstName: 'client.first_name',
      lastName: 'client.last_name',
      phone: 'client.phone',
      email: 'client.email',
      status: 'client.status',
      channelSource: 'client.channel_source',
      tags: 'client.tags',
      // Legacy field names
      idCliente: 'client.id',
      nombreCompleto: "client.first_name || ' ' || client.last_name",
      telefono: 'client.phone',
      estado: 'client.status',
      fechaRegistro: 'client.created_at',
      fechaUltimaSesion: 'client.last_contact_at',
    };
    // If not in map, assume it's a custom field in jsonb
    return map[field] || `client.custom_data->>'${field}'`;
  }

  // === Campaign Sends ===

  async getSends(campaignId: string): Promise<CampaignSend[]> {
    return this.sendRepository.find({
      where: { campaignId },
      order: { createdAt: 'DESC' },
    });
  }

  async sendCampaign(campaignId: string): Promise<CampaignSend> {
    const campaign = await this.findOne(campaignId);

    if (campaign.channel === 'sms') {
      if (!campaign.messageTemplate) {
        throw new BadRequestException('La campaña no tiene un mensaje configurado');
      }
    } else if (campaign.channel === 'whatsapp') {
      if (!campaign.whatsappTemplateName) {
        throw new BadRequestException('La campaña no tiene una plantilla de WhatsApp configurada');
      }
    } else if (campaign.channel === 'llamada') {
      if (!campaign.messageTemplate && !campaign.callAudioCode) {
        throw new BadRequestException('La campaña de llamada necesita un mensaje o un audio-code configurado');
      }
    } else {
      throw new BadRequestException('Canal no soportado para envío');
    }

    // Get matching clients
    const clients = await this.getAudienceClients(campaign);

    if (clients.length === 0) {
      throw new BadRequestException('No hay clientes que cumplan las condiciones');
    }

    // Apply max sends limit
    const maxSends = campaign.maxSends || clients.length;
    const recipients = clients.slice(0, maxSends);

    // Create send record
    const send = this.sendRepository.create({
      campaignId,
      status: 'sending',
      totalRecipients: recipients.length,
      startedAt: new Date(),
    });
    const savedSend = await this.sendRepository.save(send);

    // Send messages async (non-blocking)
    if (campaign.channel === 'whatsapp') {
      this.processWhatsAppSend(savedSend.id, campaign, recipients).catch((err) => {
        console.error('Error processing WhatsApp send:', err);
      });
    } else if (campaign.channel === 'llamada') {
      this.processCallSend(savedSend.id, campaign, recipients).catch((err) => {
        console.error('Error processing Call send:', err);
      });
    } else {
      this.processSend(savedSend.id, campaign, recipients).catch((err) => {
        console.error('Error processing send:', err);
      });
    }

    return savedSend;
  }

  private async processSend(
    sendId: string,
    campaign: Campaign,
    recipients: ClientRecord[],
  ): Promise<void> {
    // Get channel config for this tenant
    const channelConfig = await this.channelConfigRepo.findOne({
      where: { tenantId: campaign.tenantId, channel: 'sms' },
    });

    if (!channelConfig) {
      await this.sendRepository.update(sendId, {
        status: 'failed',
        errorMessage: 'No hay configuración de SMS para esta cuenta. Configúrala en Ajustes > Canales.',
        completedAt: new Date(),
      });
      return;
    }

    const { provider, credentials } = channelConfig;

    console.log(`[CampaignSend] Starting SMS send ${sendId} via ${provider} to ${recipients.length} recipients`);
    console.log(`[CampaignSend] Credentials keys: ${Object.keys(credentials).join(', ')}`);

    let totalSent = 0;
    let totalFailed = 0;

    const batchSize = 10;
    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);

      for (const client of batch) {
        if (!client.phone) {
          console.log(`[SMS] Skipping client ${client.id}: no phone number`);
          totalFailed++;
          continue;
        }

        const message = this.renderMessage(campaign.messageTemplate, client);
        console.log(`[SMS] Sending to ${client.phone} via ${provider} | message length: ${message.length}`);
        let success = false;

        try {
          switch (provider) {
            case 'onurix':
              success = await this.sendViaOnurix(client.phone, message, credentials);
              break;
            case 'twilio':
              success = await this.sendViaTwilio(client.phone, message, credentials);
              break;
            case 'brevo':
              success = await this.sendViaBrevo(client.phone, message, credentials);
              break;
            default:
              console.error(`[SMS] Proveedor no soportado: ${provider}`);
              success = false;
          }
        } catch (err) {
          console.error(`[SMS] Exception for ${client.phone}:`, err);
          success = false;
        }

        if (success) totalSent++;
        else totalFailed++;
      }

      await this.sendRepository.update(sendId, { totalSent, totalFailed });
    }

    await this.sendRepository.update(sendId, {
      status: 'completed',
      totalSent,
      totalDelivered: totalSent,
      totalFailed,
      completedAt: new Date(),
    });
  }

  private async sendViaOnurix(phone: string, message: string, credentials: Record<string, string>): Promise<boolean> {
    const response = await fetch('https://www.onurix.com/api/v1/sms/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client: credentials.client,
        key: credentials.key,
        phone,
        sms: message,
      }),
    });
    const body = await response.text();
    console.log(`[Onurix] SMS to ${phone}: status=${response.status} body=${body}`);
    return response.ok;
  }

  private async sendViaTwilio(phone: string, message: string, credentials: Record<string, string>): Promise<boolean> {
    const { accountSid, authToken, fromNumber } = credentials;
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        To: phone,
        From: fromNumber,
        Body: message,
      }),
    });
    const body = await response.text();
    console.log(`[Twilio] SMS to ${phone}: status=${response.status}`);
    return response.ok;
  }

  private async sendViaBrevo(phone: string, message: string, credentials: Record<string, string>): Promise<boolean> {
    const { apiKey, sender } = credentials;
    console.log(`[Brevo] Sending SMS to ${phone} | sender=${sender} | apiKey=${apiKey ? 'SET' : 'MISSING'}`);
    const response = await fetch('https://api.brevo.com/v3/transactionalSMS/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        sender,
        recipient: phone,
        content: message,
        type: 'transactional',
      }),
    });
    const body = await response.text();
    console.log(`[Brevo] SMS to ${phone}: status=${response.status} body=${body}`);
    return response.ok;
  }

  private renderMessage(template: string, client: ClientRecord): string {
    let msg = template;
    // Replace all {{fieldName}} with actual values using getClientField
    const matches = msg.match(/\{\{(\w+)\}\}/g);
    if (matches) {
      for (const match of matches) {
        const field = match.replace(/\{\{|\}\}/g, '');
        const value = this.getClientField(client, field);
        msg = msg.replaceAll(match, value);
      }
    }
    return msg;
  }

  private async processWhatsAppSend(
    sendId: string,
    campaign: Campaign,
    recipients: ClientRecord[],
  ): Promise<void> {
    // Get channel config for WhatsApp
    const channelConfig = await this.channelConfigRepo.findOne({
      where: { tenantId: campaign.tenantId, channel: 'whatsapp' },
    });

    if (!channelConfig) {
      await this.sendRepository.update(sendId, {
        status: 'failed',
        errorMessage: 'No hay configuración de WhatsApp para esta cuenta. Configúrala en Ajustes > Canales.',
        completedAt: new Date(),
      });
      return;
    }

    console.log(`[WhatsAppSend] Starting send ${sendId} via ${channelConfig.provider} to ${recipients.length} recipients`);

    let totalSent = 0;
    let totalFailed = 0;

    const batchSize = 10;
    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);

      for (const client of batch) {
        if (!client.phone) {
          totalFailed++;
          continue;
        }

        // Build variables from mapping
        const variables: Record<string, string> = {};
        if (campaign.whatsappVariableMapping) {
          for (const [position, field] of Object.entries(campaign.whatsappVariableMapping)) {
            variables[position] = this.getClientField(client, field);
          }
        }

        const result = await this.whatsappService.sendTemplate(
          client.phone,
          campaign.whatsappTemplateName,
          campaign.whatsappTemplateLanguage || 'es',
          variables,
          channelConfig.credentials,
          channelConfig.provider,
        );

        if (result.success) {
          totalSent++;
        } else {
          console.error(`[WhatsApp] Failed for ${client.phone}: ${result.error}`);
          totalFailed++;
        }
      }

      await this.sendRepository.update(sendId, { totalSent, totalFailed });
    }

    await this.sendRepository.update(sendId, {
      status: 'completed',
      totalSent,
      totalDelivered: totalSent,
      totalFailed,
      completedAt: new Date(),
    });
  }

  private getClientField(client: ClientRecord, field: string): string {
    // System fields - direct access
    const systemMap: Record<string, () => string> = {
      firstName: () => client.firstName || '',
      lastName: () => client.lastName || '',
      phone: () => client.phone || '',
      email: () => client.email || '',
      status: () => client.status || '',
      channelSource: () => client.channelSource || '',
      // Legacy field names for backward compatibility
      nombreCompleto: () => [client.firstName, client.lastName].filter(Boolean).join(' ') || '',
      idCliente: () => client.id || '',
      telefono: () => client.phone || '',
      estado: () => client.status || '',
    };

    if (systemMap[field]) return systemMap[field]();

    // Custom data fields
    if (client.customData && field in client.customData) {
      const val = client.customData[field];
      return val != null ? String(val) : '';
    }

    return '';
  }

  // === CALL SEND ===

  private async processCallSend(
    sendId: string,
    campaign: Campaign,
    recipients: ClientRecord[],
  ): Promise<void> {
    // Get channel config for llamada
    const channelConfig = await this.channelConfigRepo.findOne({
      where: { tenantId: campaign.tenantId, channel: 'llamada' },
    });

    if (!channelConfig) {
      await this.sendRepository.update(sendId, {
        status: 'failed',
        errorMessage: 'No hay configuración de Llamada para esta cuenta. Configúrala en Ajustes > Canales.',
        completedAt: new Date(),
      });
      return;
    }

    console.log(`[CallSend] Starting send ${sendId} via ${channelConfig.provider} to ${recipients.length} recipients`);

    let totalSent = 0;
    let totalFailed = 0;

    const batchSize = 10;
    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);

      for (const client of batch) {
        if (!client.phone) {
          console.log(`[Call] Skipping client ${client.id}: no phone number`);
          totalFailed++;
          continue;
        }

        // Render message with client variables (if not using audio-code)
        const message = campaign.messageTemplate
          ? this.renderMessage(campaign.messageTemplate, client)
          : '';

        const result = await this.callService.sendCall({
          phone: client.phone,
          message,
          credentials: channelConfig.credentials,
          voice: campaign.callVoice || undefined,
          retries: campaign.callRetries || undefined,
          leaveVoicemail: campaign.callLeaveVoicemail ?? true,
          audioCode: campaign.callAudioCode || undefined,
        });

        if (result.success) {
          totalSent++;
        } else {
          console.error(`[Call] Failed for ${client.phone}: ${result.error}`);
          totalFailed++;
        }
      }

      await this.sendRepository.update(sendId, { totalSent, totalFailed });
    }

    await this.sendRepository.update(sendId, {
      status: 'completed',
      totalSent,
      totalDelivered: totalSent,
      totalFailed,
      completedAt: new Date(),
    });
  }
}
