import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { Campaign, SegmentGroup } from './campaign.entity';
import { CampaignSend } from './campaign-send.entity';
import { CampaignSendLog } from './campaign-send-log.entity';
import { ClientRecord } from '../records/record.entity';
import { ChannelConfig } from '../tenants/channel-config.entity';
import { RecordList } from '../records/record-list.entity';
import { Inbox } from '../chats/inbox.entity';
import { WhatsAppService } from './whatsapp.service';
import { CallService } from './call.service';
import type { CampaignSendJobData } from './campaign-send.worker';
import { BillingService } from '../billing/billing.service';

@Injectable()
export class CampaignsService {
  constructor(
    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,
    @InjectRepository(CampaignSend)
    private readonly sendRepository: Repository<CampaignSend>,
    @InjectRepository(CampaignSendLog)
    private readonly sendLogRepository: Repository<CampaignSendLog>,
    @InjectRepository(ClientRecord)
    private readonly clientRepository: Repository<ClientRecord>,
    @InjectRepository(ChannelConfig)
    private readonly channelConfigRepo: Repository<ChannelConfig>,
    @InjectRepository(RecordList)
    private readonly recordListRepo: Repository<RecordList>,
    @InjectRepository(Inbox)
    private readonly inboxRepo: Repository<Inbox>,
    @InjectQueue('campaign-send')
    private readonly sendQueue: Queue<CampaignSendJobData>,
    private readonly configService: ConfigService,
    private readonly whatsappService: WhatsAppService,
    private readonly callService: CallService,
    private readonly billingService: BillingService,
  ) {}

  async findAll(tenantId?: string): Promise<Campaign[]> {
    const where: any = {};
    if (tenantId) where.tenantId = tenantId;
    return this.campaignRepository.find({ where, order: { createdAt: 'DESC' } });
  }

  async getInboxById(id: string): Promise<Inbox | null> {
    return this.inboxRepo.findOneBy({ id });
  }

  async findOne(id: string): Promise<Campaign> {
    return this.campaignRepository.findOneByOrFail({ id });
  }

  async create(data: {
    name: string;
    description?: string;
    segments: SegmentGroup[];
    channel?: string;
    inboxId?: string;
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
      emailSubject: string;
      emailTemplateId: string | null;
      inboxId: string | null;
      whatsappTemplateName: string;
      whatsappTemplateLanguage: string;
      whatsappVariableMapping: Record<string, string>;
      whatsappTemplateCategory: string;
      callVoice: string;
      callRetries: string;
      callLeaveVoicemail: boolean;
      callAudioCode: string;
      maxSends: number | null;
      isRecurring: boolean;
      sendDate: string | null;
      sendTime: string | null;
      recurrenceDays: Record<string, string> | null;
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
    if (list.filters) {
      const filters = list.filters;
      if ('conditions' in filters && filters.conditions.length > 0) {
        const segments: SegmentGroup[] = [{
          logic: filters.logic === 'or' ? 'OR' : 'AND',
          conditions: filters.conditions.map((c) => ({
            field: c.field,
            operator: c.operator,
            value: c.value,
          })),
        }];
        return this.countMatches(segments, tenantId || list.tenantId);
      } else if ('groups' in filters && filters.groups.length > 0) {
        const segments: SegmentGroup[] = filters.groups.map((g) => ({
          logic: g.logic === 'or' ? 'OR' : 'AND',
          conditions: g.conditions.map((c) => ({
            field: c.field,
            operator: c.operator,
            value: c.value,
          })),
        }));
        return this.countMatches(segments, tenantId || list.tenantId);
      }
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
    if (list.filters) {
      const filters = list.filters;
      if ('conditions' in filters && filters.conditions.length > 0) {
        const segments: SegmentGroup[] = [{
          logic: filters.logic === 'or' ? 'OR' : 'AND',
          conditions: filters.conditions.map((c) => ({
            field: c.field,
            operator: c.operator,
            value: c.value,
          })),
        }];
        return this.buildSegmentQuery(segments, tenantId || list.tenantId).getMany();
      } else if ('groups' in filters && filters.groups.length > 0) {
        const segments: SegmentGroup[] = filters.groups.map((g) => ({
          logic: g.logic === 'or' ? 'OR' : 'AND',
          conditions: g.conditions.map((c) => ({
            field: c.field,
            operator: c.operator,
            value: c.value,
          })),
        }));
        return this.buildSegmentQuery(segments, tenantId || list.tenantId).getMany();
      }
    }
    return [];
  }

  private buildSegmentQuery(segments: SegmentGroup[], tenantId?: string) {
    const qb = this.clientRepository.createQueryBuilder('client');

    if (tenantId) {
      qb.where('client.tenant_id = :tenantId', { tenantId });
    }
    qb.andWhere('client.deleted_at IS NULL');

    for (let i = 0; i < segments.length; i++) {
      const group = segments[i];
      const groupConditions: string[] = [];
      const params: Record<string, unknown> = {};

      for (let j = 0; j < group.conditions.length; j++) {
        const cond = group.conditions[j];
        const paramKey = `p_${i}_${j}`;
        const col = this.fieldToColumn(cond.field);

        // Skip any condition with empty/null value (except boolean operators)
        if (!['is_true', 'is_false', 'is_null', 'is_not_null'].includes(cond.operator)) {
          if (cond.value === null || cond.value === undefined || String(cond.value).trim() === '') {
            continue;
          }
        }

        const sqlCond = this.buildConditionSql(col, cond.operator, paramKey, cond.field);
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

  private buildConditionSql(col: string, operator: string, paramKey: string, field?: string): string | null {
    const TIMESTAMP_FIELDS = new Set(['lastContactAt', 'lastActivityAt', 'birthDate', 'createdAt', 'updatedAt', 'fechaRegistro', 'fechaUltimaSesion']);
    const isTimestamp = field ? TIMESTAMP_FIELDS.has(field) : false;

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
        if (isTimestamp) return `${col} IS NULL`;
        return `(${col} IS NULL OR ${col} = '')`;
      case 'is_not_null':
      case 'is_not_empty':
        if (isTimestamp) return `${col} IS NOT NULL`;
        return `(${col} IS NOT NULL AND ${col} != '')`;
      case 'in_list':
        return `${col} IN (:...${paramKey})`;
      default:
        return null;
    }
  }

  private fieldToColumn(field: string): string {
    const map: Record<string, string> = {
      // System fields
      firstName: 'client.first_name',
      lastName: 'client.last_name',
      fullName: 'client.full_name',
      phone: 'client.phone',
      email: 'client.email',
      documentType: 'client.document_type',
      documentNumber: 'client.document_number',
      gender: 'client.gender',
      birthDate: 'client.birth_date',
      city: 'client.city',
      region: 'client.region',
      status: 'client.status',
      channelSource: 'client.channel_source',
      source: 'client.source',
      score: 'client.score',
      tags: 'client.tags',
      optInWhatsapp: 'client.opt_in_whatsapp',
      optInEmail: 'client.opt_in_email',
      assignedTo: 'client.assigned_to',
      lastContactAt: 'client.last_contact_at',
      lastActivityAt: 'client.last_activity_at',
      createdAt: 'client.created_at',
      updatedAt: 'client.updated_at',
      // Legacy field names (SuperGiros)
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

    if (campaign.channel === 'whatsapp') {
      if (!campaign.whatsappTemplateName) {
        throw new BadRequestException('La campaña no tiene una plantilla de WhatsApp configurada');
      }
    } else if (campaign.channel === 'sms') {
      if (!campaign.messageTemplate) {
        throw new BadRequestException('La campaña no tiene un mensaje configurado');
      }
    } else if (campaign.channel === 'llamada') {
      if (!campaign.messageTemplate && !campaign.callAudioCode) {
        throw new BadRequestException('La campaña de llamada necesita un mensaje o audio configurado');
      }
    } else if (campaign.channel === 'email') {
      // If using a multi-language template, skip inline content validation
      if (!campaign.emailTemplateId) {
        if (!campaign.messageTemplate) {
          throw new BadRequestException('La campaña de email necesita un contenido HTML configurado o una plantilla asignada');
        }
        if (!campaign.emailSubject) {
          throw new BadRequestException('La campaña de email necesita un asunto configurado o una plantilla asignada');
        }
      }
      // Validate that the inbox has SMTP configured
      if (campaign.inboxId) {
        const inbox = await this.inboxRepo.findOneBy({ id: campaign.inboxId });
        if (!inbox?.metadata?.smtp?.host || !inbox?.metadata?.smtp?.user || !inbox?.metadata?.smtp?.pass) {
          throw new BadRequestException('La bandeja de email no tiene SMTP configurado. Configúralo en Canales > Email > SMTP');
        }
      } else {
        throw new BadRequestException('La campaña de email necesita una bandeja de email asignada');
      }
    } else {
      throw new BadRequestException('Canal no soportado para envío');
    }

    // === SNAPSHOT: resolve audience at this exact moment ===
    const clients = await this.getAudienceClients(campaign);

    if (clients.length === 0) {
      throw new BadRequestException('No hay clientes que cumplan las condiciones');
    }

    // Apply max sends limit
    const maxSends = campaign.maxSends || clients.length;
    const recipientIds = clients.slice(0, maxSends).map((c) => c.id);

    // Create send record with snapshot
    const send = this.sendRepository.create({
      campaignId,
      status: 'queued',
      totalRecipients: recipientIds.length,
      recipientIds,
    });
    const savedSend = await this.sendRepository.save(send);

    // Reserve credits for the full audience before sending
    if (campaign.tenantId) {
      const costAction = this.getCostActionForChannel(campaign.channel, campaign.whatsappTemplateCategory);
      const unitCost = await this.billingService.getActionCost(costAction);
      if (unitCost !== null) {
        const totalToReserve = recipientIds.length * unitCost;
        await this.billingService.reserve(campaign.tenantId, totalToReserve, savedSend.id);
      }
    }

    // Enqueue the job to BullMQ
    await this.sendQueue.add(
      'send-campaign',
      { sendId: savedSend.id, campaignId },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    );

    return savedSend;
  }

  private getCostActionForChannel(channel: string | null, templateCategory?: string | null): string {
    if (channel === 'whatsapp') {
      switch (templateCategory?.toUpperCase()) {
        case 'UTILITY': return 'whatsapp_utility';
        case 'AUTHENTICATION': return 'whatsapp_authentication';
        case 'MARKETING':
        default: return 'whatsapp_marketing';
      }
    }
    switch (channel) {
      case 'sms': return 'sms';
      case 'llamada': return 'call';
      case 'email': return 'email';
      default: return 'whatsapp_marketing';
    }
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

    let totalSent = 0;
    let totalFailed = 0;

    const batchSize = 10;
    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);
      const logs: Partial<CampaignSendLog>[] = [];

      for (const client of batch) {
        if (!client.phone) {
          console.log(`[SMS] Skipping client ${client.id}: no phone number`);
          totalFailed++;
          logs.push({
            sendId,
            campaignId: campaign.id,
            tenantId: campaign.tenantId,
            recordId: client.id,
            phone: '',
            channel: 'sms',
            status: 'failed',
            errorCode: 'no_phone',
          });
          continue;
        }

        const message = this.renderMessage(campaign.messageTemplate, client);
        let success = false;
        let providerMessageId: string | null = null;
        let errorCode: string | null = null;

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
              errorCode = 'unsupported_provider';
              success = false;
          }
        } catch (err) {
          errorCode = 'exception';
          success = false;
        }

        if (success) totalSent++;
        else totalFailed++;

        logs.push({
          sendId,
          campaignId: campaign.id,
          tenantId: campaign.tenantId,
          recordId: client.id,
          phone: client.phone,
          channel: 'sms',
          status: success ? 'sent' : 'failed',
          providerMessageId,
          errorCode,
          sentAt: success ? new Date() : null,
        });
      }

      // Batch insert logs (mucho más eficiente que uno a uno)
      await this.sendLogRepository.insert(logs);
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
    // Get inbox credentials for WhatsApp
    let inbox: Inbox | null = null;
    if (campaign.inboxId) {
      inbox = await this.inboxRepo.findOneBy({ id: campaign.inboxId });
    }

    if (!inbox || !inbox.accessToken || !inbox.phoneNumberId) {
      await this.sendRepository.update(sendId, {
        status: 'failed',
        errorMessage: 'La bandeja de WhatsApp no tiene credenciales configuradas (accessToken o phoneNumberId).',
        completedAt: new Date(),
      });
      return;
    }

    const accessToken = inbox.accessToken;
    const phoneNumberId = inbox.phoneNumberId;

    console.log(`[WhatsAppSend] Starting send ${sendId} via Meta Cloud API to ${recipients.length} recipients`);

    let totalSent = 0;
    let totalFailed = 0;

    try {
      const batchSize = 10;
      for (let i = 0; i < recipients.length; i += batchSize) {
        const batch = recipients.slice(i, i + batchSize);
        const logs: Partial<CampaignSendLog>[] = [];

        for (const client of batch) {
          if (!client.phone) {
            totalFailed++;
            logs.push({
              sendId,
              campaignId: campaign.id,
              tenantId: campaign.tenantId,
              recordId: client.id,
              phone: '',
              channel: 'whatsapp',
              status: 'failed',
              errorCode: 'no_phone',
            });
            continue;
          }

          // Build variables from mapping
          const variables: Record<string, string> = {};
          if (campaign.whatsappVariableMapping) {
            for (const [position, field] of Object.entries(campaign.whatsappVariableMapping)) {
              variables[position] = this.getClientField(client, field);
            }
          }

          // Build Meta Cloud API request body
          const phone = client.phone.startsWith('+') ? client.phone.slice(1) : client.phone;
          const components: any[] = [];

          // Body parameters
          const bodyParams = Object.entries(variables)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([, value]) => ({ type: 'text', text: value }));

          if (bodyParams.length > 0) {
            components.push({ type: 'body', parameters: bodyParams });
          }

          const requestBody = {
            messaging_product: 'whatsapp',
            to: phone,
            type: 'template',
            template: {
              name: campaign.whatsappTemplateName,
              language: { code: campaign.whatsappTemplateLanguage || 'es' },
              components,
            },
          };

          try {
            const response = await fetch(
              `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
              },
            );

            const result = await response.json();

            if (response.ok && result.messages?.[0]?.id) {
              totalSent++;
              logs.push({
                sendId,
                campaignId: campaign.id,
                tenantId: campaign.tenantId,
                recordId: client.id,
                phone: client.phone,
                channel: 'whatsapp',
                status: 'sent',
                providerMessageId: result.messages[0].id,
                sentAt: new Date(),
              });
            } else {
              totalFailed++;
              const errorMsg = result.error?.message || JSON.stringify(result).substring(0, 50);
              console.error(`[WhatsAppSend] Failed for ${phone}:`, result.error || result);
              logs.push({
                sendId,
                campaignId: campaign.id,
                tenantId: campaign.tenantId,
                recordId: client.id,
                phone: client.phone,
                channel: 'whatsapp',
                status: 'failed',
                errorCode: errorMsg.substring(0, 50),
              });
            }
          } catch (error) {
            totalFailed++;
            console.error(`[WhatsAppSend] Exception for ${phone}:`, error);
            logs.push({
              sendId,
              campaignId: campaign.id,
              tenantId: campaign.tenantId,
              recordId: client.id,
              phone: client.phone,
              channel: 'whatsapp',
              status: 'failed',
              errorCode: String(error).substring(0, 50),
            });
          }
        }

        await this.sendLogRepository.insert(logs);
        await this.sendRepository.update(sendId, { totalSent, totalFailed });
      }

      await this.sendRepository.update(sendId, {
        status: 'completed',
        totalSent,
        totalDelivered: totalSent,
        totalFailed,
        completedAt: new Date(),
      });
    } catch (error) {
      console.error(`[WhatsAppSend] Fatal error in send ${sendId}:`, error);
      await this.sendRepository.update(sendId, {
        status: 'failed',
        totalSent,
        totalFailed,
        errorMessage: String(error).substring(0, 200),
        completedAt: new Date(),
      });
    }
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
      const logs: Partial<CampaignSendLog>[] = [];

      for (const client of batch) {
        if (!client.phone) {
          totalFailed++;
          logs.push({
            sendId,
            campaignId: campaign.id,
            tenantId: campaign.tenantId,
            recordId: client.id,
            phone: '',
            channel: 'llamada',
            status: 'failed',
            errorCode: 'no_phone',
          });
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
          logs.push({
            sendId,
            campaignId: campaign.id,
            tenantId: campaign.tenantId,
            recordId: client.id,
            phone: client.phone,
            channel: 'llamada',
            status: 'sent',
            providerMessageId: result.messageId ?? null,
            sentAt: new Date(),
          });
        } else {
          totalFailed++;
          logs.push({
            sendId,
            campaignId: campaign.id,
            tenantId: campaign.tenantId,
            recordId: client.id,
            phone: client.phone,
            channel: 'llamada',
            status: 'failed',
            errorCode: result.error?.substring(0, 50) ?? 'unknown',
          });
        }
      }

      await this.sendLogRepository.insert(logs);
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
