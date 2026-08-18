import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Job } from 'bullmq';
import { CampaignSend } from './campaign-send.entity';
import { CampaignSendLog } from './campaign-send-log.entity';
import { Campaign } from './campaign.entity';
import { ClientRecord } from '../records/record.entity';
import { Activity } from '../records/activity.entity';
import { Inbox } from '../chats/inbox.entity';
import { Conversation } from '../chats/conversation.entity';
import { Message } from '../chats/message.entity';
import { CampaignsGateway } from './campaigns.gateway';
import { BillingService } from '../billing/billing.service';
import { SmsService } from './sms.service';
import { CallService } from './call.service';
import { EmailService } from './email.service';
import { ConfigService } from '@nestjs/config';
import { WebhooksService } from '../webhooks/webhooks.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TemplatesService } from '../templates/templates.service';

export interface CampaignSendJobData {
  sendId: string;
  campaignId: string;
}

@Processor('campaign-send', {
  concurrency: 1, // Process one campaign send at a time
  limiter: {
    max: 80, // Meta tier 1: 80 msgs/sec
    duration: 1000,
  },
})
export class CampaignSendWorker extends WorkerHost {
  private readonly logger = new Logger(CampaignSendWorker.name);

  constructor(
    @InjectRepository(CampaignSend)
    private readonly sendRepo: Repository<CampaignSend>,
    @InjectRepository(CampaignSendLog)
    private readonly sendLogRepo: Repository<CampaignSendLog>,
    @InjectRepository(Campaign)
    private readonly campaignRepo: Repository<Campaign>,
    @InjectRepository(ClientRecord)
    private readonly clientRepo: Repository<ClientRecord>,
    @InjectRepository(Inbox)
    private readonly inboxRepo: Repository<Inbox>,
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
    @InjectRepository(Activity)
    private readonly activityRepo: Repository<Activity>,
    private readonly gateway: CampaignsGateway,
    private readonly billingService: BillingService,
    private readonly smsService: SmsService,
    private readonly callService: CallService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
    private readonly webhooksService: WebhooksService,
    private readonly notificationsService: NotificationsService,
    private readonly templatesService: TemplatesService,
  ) {
    super();
  }

  async process(job: Job<CampaignSendJobData>): Promise<void> {
    const { sendId, campaignId } = job.data;
    this.logger.log(`[Worker] Processing send ${sendId} for campaign ${campaignId}`);

    const send = await this.sendRepo.findOneBy({ id: sendId });
    if (!send) {
      this.logger.error(`[Worker] Send ${sendId} not found`);
      return;
    }

    const campaign = await this.campaignRepo.findOneBy({ id: campaignId });
    if (!campaign) {
      await this.failSend(sendId, 'Campaña no encontrada');
      return;
    }

    // Get inbox credentials
    if (!campaign.inboxId) {
      await this.failSend(sendId, 'La campaña no tiene una bandeja asignada');
      return;
    }

    const inbox = await this.inboxRepo.findOneBy({ id: campaign.inboxId });
    if (!inbox) {
      await this.failSend(sendId, 'La bandeja no existe');
      return;
    }
    // WhatsApp requires inbox credentials; SMS and calls use platform-level services
    if (campaign.channel === 'whatsapp' && (!inbox.accessToken || !inbox.phoneNumberId)) {
      await this.failSend(sendId, 'La bandeja no tiene credenciales configuradas');
      return;
    }
    // Email requires SMTP configuration in inbox metadata
    if (campaign.channel === 'email') {
      const smtpConfig = inbox.metadata?.smtp;
      if (!smtpConfig?.host || !smtpConfig?.user || !smtpConfig?.pass) {
        await this.failSend(sendId, 'La bandeja de email no tiene SMTP configurado');
        return;
      }
    }

    const recipientIds = send.recipientIds;
    if (!recipientIds || recipientIds.length === 0) {
      await this.failSend(sendId, 'No hay destinatarios en el snapshot');
      return;
    }

    // Mark as sending
    await this.sendRepo.update(sendId, { status: 'sending', startedAt: new Date() });
    this.gateway.emitSendProgress(sendId, campaign.tenantId, {
      status: 'sending',
      totalRecipients: recipientIds.length,
      totalSent: 0,
      totalFailed: 0,
    });

    // Dispatch webhook: campaign started
    this.webhooksService.dispatch(campaign.tenantId, 'campaign_started', {
      campaignId: campaign.id,
      campaignName: campaign.name,
      channel: campaign.channel,
      sendId,
      totalRecipients: recipientIds.length,
    }).catch(() => {});

    // Fetch template components from Meta for proper message rendering
    let templateComponents: any[] | null = null;
    if (campaign.whatsappTemplateName && inbox.wabaId && inbox.accessToken) {
      try {
        const tplRes = await fetch(
          `https://graph.facebook.com/v21.0/${inbox.wabaId}/message_templates?fields=name,language,components&name=${campaign.whatsappTemplateName}&limit=1`,
          { headers: { Authorization: `Bearer ${inbox.accessToken}` } },
        );
        const tplData = await tplRes.json();
        const tpl = (tplData.data || []).find((t: any) => t.name === campaign.whatsappTemplateName);
        if (tpl?.components) {
          templateComponents = tpl.components;
        }
      } catch (err) {
        this.logger.warn('[Worker] Could not fetch template components for rendering:', err);
      }
    }

    let totalSent = 0;
    let totalFailed = 0;
    const batchSize = 50;
    const totalRecipients = recipientIds.length;

    try {
      for (let offset = 0; offset < totalRecipients; offset += batchSize) {
        const batchIds = recipientIds.slice(offset, offset + batchSize);

        // Load client records for this batch
        const clients = await this.clientRepo.find({ where: { id: In(batchIds) } });
        const logs: Partial<CampaignSendLog>[] = [];

        for (const client of clients) {
          if (campaign.channel === 'email') {
            // Email channel: validate email instead of phone
            if (!client.email) {
              totalFailed++;
              logs.push({
                sendId,
                campaignId,
                tenantId: campaign.tenantId,
                recordId: client.id,
                phone: client.phone || '',
                channel: 'email',
                status: 'failed',
                errorCode: 'no_email',
              });
              continue;
            }
          } else if (!client.phone) {
            totalFailed++;
            logs.push({
              sendId,
              campaignId,
              tenantId: campaign.tenantId,
              recordId: client.id,
              phone: '',
              channel: campaign.channel || 'whatsapp',
              status: 'failed',
              errorCode: 'no_phone',
            });
            continue;
          }

          if (campaign.channel === 'sms') {
            // === SMS via LabsMobile ===
            const smsBody = await this.resolveTextContent(campaign, client);
            const smsMessage = this.interpolateMessage(smsBody, client);
            const result = await this.smsService.sendSms(client.phone, smsMessage);

            if (result.success) {
              totalSent++;
              logs.push({
                sendId,
                campaignId,
                tenantId: campaign.tenantId,
                recordId: client.id,
                phone: client.phone,
                channel: 'sms',
                status: 'sent',
                providerMessageId: result.subId ?? null,
                sentAt: new Date(),
              });
            } else {
              totalFailed++;
              logs.push({
                sendId,
                campaignId,
                tenantId: campaign.tenantId,
                recordId: client.id,
                phone: client.phone,
                channel: 'sms',
                status: 'failed',
                errorCode: (result.error || 'unknown').substring(0, 50),
              });
            }
          } else if (campaign.channel === 'llamada') {
            // === Voice call via Onurix ===
            const callBody = await this.resolveTextContent(campaign, client);
            const callMessage = this.interpolateMessage(callBody, client);
            const voice = inbox.metadata?.voice || campaign.callVoice || 'Mariana';
            const result = await this.callService.sendCall({
              phone: client.phone,
              message: callMessage,
              credentials: {
                client: this.configService.get<string>('ONURIX_CLIENT', ''),
                key: this.configService.get<string>('ONURIX_KEY', ''),
              },
              voice,
              retries: campaign.callRetries || '1',
              leaveVoicemail: campaign.callLeaveVoicemail ?? true,
              audioCode: campaign.callAudioCode || undefined,
            });

            if (result.success) {
              totalSent++;
              logs.push({
                sendId,
                campaignId,
                tenantId: campaign.tenantId,
                recordId: client.id,
                phone: client.phone,
                channel: 'llamada',
                status: 'sent',
                providerMessageId: result.messageId ? result.messageId.substring(0, 100) : null,
                sentAt: new Date(),
              });
            } else {
              totalFailed++;
              logs.push({
                sendId,
                campaignId,
                tenantId: campaign.tenantId,
                recordId: client.id,
                phone: client.phone,
                channel: 'llamada',
                status: 'failed',
                errorCode: (result.error || 'unknown').substring(0, 50),
              });
            }
          } else if (campaign.channel === 'email') {
            // === Email via SMTP ===
            const emailAddress = client.email;
            if (!emailAddress) {
              totalFailed++;
              logs.push({
                sendId,
                campaignId,
                tenantId: campaign.tenantId,
                recordId: client.id,
                phone: client.phone || '',
                channel: 'email',
                status: 'failed',
                errorCode: 'no_email',
              });
              continue;
            }

            const smtpConfig = inbox.metadata?.smtp;
            if (!smtpConfig?.host || !smtpConfig?.user || !smtpConfig?.pass) {
              totalFailed++;
              logs.push({
                sendId,
                campaignId,
                tenantId: campaign.tenantId,
                recordId: client.id,
                phone: client.phone || '',
                channel: 'email',
                status: 'failed',
                errorCode: 'smtp_not_configured',
              });
              continue;
            }

            const emailContent = await this.resolveEmailContent(campaign, client);
            const emailSubject = this.interpolateMessage(emailContent.subject, client);
            const emailHtml = this.interpolateMessage(emailContent.html, client);

            const result = await this.emailService.sendEmail({
              to: emailAddress,
              subject: emailSubject,
              html: emailHtml.replace(/\n/g, '<br>'),
              text: emailHtml,
              smtpConfig,
            });

            if (result.success) {
              totalSent++;
              logs.push({
                sendId,
                campaignId,
                tenantId: campaign.tenantId,
                recordId: client.id,
                phone: client.phone || '',
                channel: 'email',
                status: 'sent',
                providerMessageId: result.messageId?.substring(0, 100) ?? null,
                sentAt: new Date(),
              });
            } else {
              totalFailed++;
              logs.push({
                sendId,
                campaignId,
                tenantId: campaign.tenantId,
                recordId: client.id,
                phone: client.phone || '',
                channel: 'email',
                status: 'failed',
                errorCode: (result.error || 'unknown').substring(0, 50),
              });
            }
          } else {
            // === WhatsApp via Meta Cloud API ===
            // Build variables from mapping
            const variables: Record<string, string> = {};
            if (campaign.whatsappVariableMapping) {
              for (const [position, field] of Object.entries(campaign.whatsappVariableMapping)) {
                variables[position] = this.getClientField(client, field);
              }
            }

            // Send via Meta Cloud API
            const result = await this.sendWhatsAppMessage(
              inbox.accessToken!,
              inbox.phoneNumberId!,
              client.phone,
              campaign.whatsappTemplateName,
              campaign.whatsappTemplateLanguage || 'es',
              variables,
            );

            if (result.success) {
              totalSent++;
              logs.push({
                sendId,
                campaignId,
                tenantId: campaign.tenantId,
                recordId: client.id,
                phone: client.phone,
                channel: 'whatsapp',
                status: 'sent',
                providerMessageId: result.messageId ?? null,
                sentAt: new Date(),
              });
            } else {
              totalFailed++;
              logs.push({
                sendId,
                campaignId,
                tenantId: campaign.tenantId,
                recordId: client.id,
                phone: client.phone,
                channel: 'whatsapp',
                status: 'failed',
                errorCode: (result.error || 'unknown').substring(0, 50),
              });
            }
          }
        }

        // Batch insert logs
        if (logs.length > 0) {
          await this.sendLogRepo.insert(logs);
        }

        // Batch insert conversations & messages for successful sends
        const successfulSends = logs.filter((l) => l.status === 'sent');
        if (successfulSends.length > 0) {
          await this.insertConversationsAndMessages(
            successfulSends,
            campaign,
            inbox,
            clients,
            templateComponents,
          );

          // Log activity to contact timeline
          await this.logCampaignActivities(successfulSends, campaign, clients);
        }

        // Update progress
        await this.sendRepo.update(sendId, { totalSent, totalFailed });

        // Emit real-time progress
        this.gateway.emitSendProgress(sendId, campaign.tenantId, {
          status: 'sending',
          totalRecipients,
          totalSent,
          totalFailed,
        });

        // Update job progress for BullMQ dashboard
        const processed = offset + batchIds.length;
        await job.updateProgress(Math.round((processed / totalRecipients) * 100));
      }

      // Complete
      await this.sendRepo.update(sendId, {
        status: 'completed',
        totalSent,
        totalDelivered: totalSent,
        totalFailed,
        completedAt: new Date(),
      });

      // If manual send (not recurring, no scheduled date), mark campaign as completed
      if (!campaign.isRecurring && !campaign.sendDate) {
        await this.campaignRepo.update(campaignId, { status: 'completed' });
      }

      this.gateway.emitSendProgress(sendId, campaign.tenantId, {
        status: 'completed',
        totalRecipients,
        totalSent,
        totalFailed,
      });

      // Dispatch webhook: campaign completed
      this.webhooksService.dispatch(campaign.tenantId, 'campaign_completed', {
        campaignId: campaign.id,
        campaignName: campaign.name,
        channel: campaign.channel,
        sendId,
        totalRecipients,
        totalSent,
        totalFailed,
      }).catch(() => {});

      // Notify campaign creator about completion
      if (campaign.tenantId) {
        this.notificationsService.getTenantAdminUserIds(campaign.tenantId).then((adminIds) => {
          for (const uid of adminIds) {
            this.notificationsService.notify({
              tenantId: campaign.tenantId,
              userId: uid,
              type: 'campaign_completed',
              title: `Campaña "${campaign.name}" completada`,
              body: `${totalSent} enviados, ${totalFailed} fallidos de ${totalRecipients} destinatarios`,
              link: `/${campaign.tenantId}/comunicaciones/campaigns/${campaign.id}`,
              metadata: { campaignId: campaign.id, sendId, totalSent, totalFailed, totalRecipients },
            }).catch(() => {});
          }
        }).catch(() => {});
      }

      // Settle credit reservation: charge only successful sends, release the rest
      if (totalSent >= 0 && campaign.tenantId) {
        try {
          const costAction = this.getCostAction(campaign.channel, campaign.whatsappTemplateCategory);
          const unitCost = await this.billingService.getEffectiveActionCost(campaign.tenantId, costAction);
          if (unitCost !== null) {
            const reservedAmount = recipientIds.length * unitCost;
            const usedAmount = totalSent * unitCost;
            await this.billingService.settleReservation(
              campaign.tenantId,
              reservedAmount,
              usedAmount,
              `campaign_${campaign.channel}`,
              sendId,
              `Campaña "${campaign.name}" — ${totalSent} envíos × ${unitCost} créditos`,
            );
            this.logger.log(`[Worker] Settled reservation: charged ${usedAmount}, released ${reservedAmount - usedAmount} credits for send ${sendId}`);
          }
        } catch (billingError) {
          this.logger.warn(`[Worker] Could not settle credits for send ${sendId}:`, billingError);
        }
      }

      this.logger.log(`[Worker] Send ${sendId} completed: ${totalSent} sent, ${totalFailed} failed`);
    } catch (error) {
      this.logger.error(`[Worker] Fatal error in send ${sendId}:`, error);
      await this.sendRepo.update(sendId, {
        status: 'failed',
        totalSent,
        totalFailed,
        errorMessage: String(error).substring(0, 200),
        completedAt: new Date(),
      });

      this.gateway.emitSendProgress(sendId, campaign.tenantId, {
        status: 'failed',
        totalRecipients,
        totalSent,
        totalFailed,
        error: String(error).substring(0, 100),
      });

      // Settle reservation on failure (charge only what was sent)
      if (campaign.tenantId) {
        try {
          const costAction = this.getCostAction(campaign.channel, campaign.whatsappTemplateCategory);
          const unitCost = await this.billingService.getEffectiveActionCost(campaign.tenantId, costAction);
          if (unitCost !== null) {
            const reservedAmount = recipientIds.length * unitCost;
            const usedAmount = totalSent * unitCost;
            await this.billingService.settleReservation(
              campaign.tenantId,
              reservedAmount,
              usedAmount,
              `campaign_${campaign.channel}`,
              sendId,
              `Campaña "${campaign.name}" (fallida) — ${totalSent} envíos × ${unitCost} créditos`,
            );
          }
        } catch (billingError) {
          this.logger.warn(`[Worker] Could not settle credits on failure for send ${sendId}:`, billingError);
        }
      }
    }
  }

  private async sendWhatsAppMessage(
    accessToken: string,
    phoneNumberId: string,
    phone: string,
    templateName: string,
    languageCode: string,
    variables: Record<string, string>,
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const cleanPhone = phone.startsWith('+') ? phone.slice(1) : phone;
    const components: any[] = [];

    const bodyParams = Object.entries(variables)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([, value]) => ({ type: 'text', text: value }));

    if (bodyParams.length > 0) {
      components.push({ type: 'body', parameters: bodyParams });
    }

    const requestBody = {
      messaging_product: 'whatsapp',
      to: cleanPhone,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
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
        return { success: true, messageId: result.messages[0].id };
      } else {
        const errorMsg = result.error?.message || 'Error desconocido';
        return { success: false, error: errorMsg };
      }
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  private getClientField(client: ClientRecord, field: string): string {
    // System fields
    const systemFields: Record<string, () => string> = {
      firstName: () => client.firstName || '',
      lastName: () => client.lastName || '',
      fullName: () => client.fullName || [client.firstName, client.lastName].filter(Boolean).join(' '),
      phone: () => client.phone || '',
      email: () => client.email || '',
      documentType: () => client.documentType || '',
      documentNumber: () => client.documentNumber || '',
      gender: () => client.gender || '',
      city: () => client.city || '',
      region: () => client.region || '',
      status: () => (client as any).status || '',
      channelSource: () => (client as any).channelSource || '',
      source: () => (client as any).source || '',
      score: () => String((client as any).score || 0),
      countryCode: () => client.countryCode || '',
    };

    if (systemFields[field]) return systemFields[field]();

    // Custom fields from JSONB
    const custom = (client as any).customData || {};
    return String(custom[field] ?? '');
  }

  /**
   * Replace {{fieldName}} variables in a message template with actual client data.
   */
  private interpolateMessage(template: string, client: ClientRecord): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, field) => {
      return this.getClientField(client, field);
    });
  }

  /**
   * Resolve email content (subject + html) for a campaign and client.
   * If the campaign uses an EmailTemplate (multi-language), resolves by client language.
   * Otherwise falls back to the inline messageTemplate/emailSubject fields.
   */
  private async resolveEmailContent(
    campaign: Campaign,
    client: ClientRecord,
  ): Promise<{ subject: string; html: string }> {
    if (campaign.emailTemplateId) {
      try {
        const translation = await this.templatesService.resolveTranslation(
          campaign.emailTemplateId,
          client.language || 'es',
        );
        return { subject: translation.subject || '', html: translation.html || '' };
      } catch {
        // If template resolution fails, fall back to inline content
        this.logger.warn(`[Worker] Failed to resolve email template ${campaign.emailTemplateId}, using inline content`);
      }
    }
    // Fallback: use inline campaign fields
    return {
      subject: campaign.emailSubject || 'Mensaje',
      html: campaign.messageTemplate || '',
    };
  }

  /**
   * Resolve text content (body) for SMS/Call campaigns.
   * Uses template if emailTemplateId is set, otherwise falls back to messageTemplate.
   */
  private async resolveTextContent(
    campaign: Campaign,
    client: ClientRecord,
  ): Promise<string> {
    this.logger.log(`[resolveTextContent] emailTemplateId=${campaign.emailTemplateId}, messageTemplate=${(campaign.messageTemplate || '').substring(0, 30)}`);
    if (campaign.emailTemplateId) {
      try {
        const translation = await this.templatesService.resolveTranslation(
          campaign.emailTemplateId,
          client.language || 'es',
        );
        this.logger.log(`[resolveTextContent] Resolved template body: ${(translation.body || '').substring(0, 50)}`);
        return translation.body || '';
      } catch (err) {
        this.logger.warn(`[Worker] Failed to resolve template ${campaign.emailTemplateId}: ${err}`);
      }
    }
    this.logger.log(`[resolveTextContent] Falling back to messageTemplate`);
    return campaign.messageTemplate || '';
  }

  /**
   * For each successful send, find or create the conversation in the inbox,
   * then insert an outbound template message. Done in batch for efficiency.
   */
  private async insertConversationsAndMessages(
    successfulLogs: Partial<CampaignSendLog>[],
    campaign: Campaign,
    inbox: Inbox,
    clients: ClientRecord[],
    templateComponents: any[] | null,
  ): Promise<void> {
    try {
      // For email campaigns, use email as contact identifier; otherwise use phone
      const isEmail = campaign.channel === 'email';
      const contactIdentifiers = isEmail
        ? successfulLogs.map((l) => {
            const client = clients.find((c) => c.id === l.recordId);
            return client?.email || '';
          }).filter(Boolean)
        : successfulLogs.map((l) => l.phone!).filter(Boolean);

      if (contactIdentifiers.length === 0) return;

      // Find existing conversations for these contacts in this inbox
      const existingConvs = await this.conversationRepo
        .createQueryBuilder('c')
        .where('c.inbox_id = :inboxId', { inboxId: inbox.id })
        .andWhere('c.contact_id IN (:...contactIdentifiers)', { contactIdentifiers })
        .getMany();

      const convByContact = new Map(existingConvs.map((c) => [c.contactId, c]));
      const now = new Date();
      let lastMessageText: string;
      if (campaign.channel === 'email') {
        lastMessageText = `📧 ${campaign.emailSubject || 'Email'}`.substring(0, 100);
      } else if (campaign.channel === 'sms') {
        lastMessageText = (campaign.messageTemplate || 'SMS').substring(0, 100);
      } else {
        lastMessageText = `📋 ${campaign.whatsappTemplateName || ''}`;
      }

      // Create missing conversations
      const newConversations: Partial<Conversation>[] = [];
      for (const log of successfulLogs) {
        const client = clients.find((c) => c.id === log.recordId);
        const contactId = isEmail ? (client?.email || '') : log.phone!;
        if (!contactId || convByContact.has(contactId)) continue;

        const contactName = client ? [client.firstName, client.lastName].filter(Boolean).join(' ') || contactId : contactId;
        const renderedPreview = client
          ? this.interpolateMessage((campaign.messageTemplate || campaign.whatsappTemplateName || ''), client).substring(0, 100)
          : lastMessageText;

        newConversations.push({
          inboxId: inbox.id,
          contactId,
          contactName,
          recordId: log.recordId,
          status: 'open',
          lastMessage: renderedPreview,
          lastMessageAt: now,
          lastMessageSource: 'campaign',
          unreadCount: 0,
        });
        // Prevent duplicates within the same batch
        convByContact.set(contactId, null as any);
      }

      // Bulk insert new conversations
      if (newConversations.length > 0) {
        const inserted = await this.conversationRepo.save(
          this.conversationRepo.create(newConversations),
        );
        for (const conv of inserted) {
          convByContact.set(conv.contactId, conv);
        }
      }

      // Build messages for all successful sends
      const messages: Partial<Message>[] = [];
      for (const log of successfulLogs) {
        const client = clients.find((c) => c.id === log.recordId);
        const contactId = isEmail ? (client?.email || '') : log.phone!;
        const conv = convByContact.get(contactId);
        if (!conv) continue;

        let renderedContent: string;
        let messageType: string;
        let templateMeta: string | null = null;

        if (campaign.channel === 'email') {
          // Email: resolve from template or inline
          const emailContent = await this.resolveEmailContent(campaign, client!);
          renderedContent = this.interpolateMessage(emailContent.html, client!);
          messageType = 'text';
        } else if (campaign.channel === 'sms') {
          // SMS: resolve from template or inline messageTemplate
          const smsBody = await this.resolveTextContent(campaign, client!);
          renderedContent = this.interpolateMessage(smsBody, client!);
          messageType = 'text';
        } else if (campaign.channel === 'llamada') {
          // Call: resolve from template or inline
          const callBody = await this.resolveTextContent(campaign, client!);
          renderedContent = this.interpolateMessage(callBody, client!);
          messageType = 'text';
        } else {
          // WhatsApp: render template
          messageType = 'template';
          const templateName = campaign.whatsappTemplateName || '';
          renderedContent = `[Plantilla: ${templateName}]`;
          if (templateComponents) {
            const bodyComp = templateComponents.find((c: any) => c.type === 'BODY');
            if (bodyComp?.text) {
              renderedContent = bodyComp.text;
              if (campaign.whatsappVariableMapping && client) {
                for (const [pos, field] of Object.entries(campaign.whatsappVariableMapping)) {
                  renderedContent = renderedContent.replace(`{{${pos}}}`, this.getClientField(client, field));
                }
              }
            }
          }
          templateMeta = templateComponents
            ? JSON.stringify({ name: templateName, language: campaign.whatsappTemplateLanguage || 'es', components: templateComponents })
            : null;
        }

        messages.push({
          conversationId: conv.id,
          direction: 'outbound',
          messageType,
          content: renderedContent,
          mediaUrl: templateMeta,
          externalId: log.providerMessageId || undefined,
          status: 'sent',
          source: 'campaign',
        });
      }

      // Bulk insert messages
      if (messages.length > 0) {
        await this.messageRepo.insert(messages);

        // Update lastMessage on all conversations with the actual rendered content
        for (const msg of messages) {
          if (msg.conversationId && msg.content) {
            await this.conversationRepo.update(msg.conversationId, {
              lastMessage: (msg.content as string).substring(0, 100),
              lastMessageAt: now,
              lastMessageSource: 'campaign',
            });
          }
        }
      }
    } catch (error) {
      this.logger.error('[Worker] Error inserting conversations/messages:', error);
      // Non-fatal: don't fail the send because of this
    }
  }

  /**
   * Log a 'campaign_sent' activity to each contact's timeline.
   */
  private async logCampaignActivities(
    successfulLogs: Partial<CampaignSendLog>[],
    campaign: Campaign,
    clients: ClientRecord[],
  ): Promise<void> {
    try {
      const channelLabels: Record<string, string> = {
        sms: 'SMS',
        whatsapp: 'WhatsApp',
        email: 'Email',
        llamada: 'Llamada',
      };
      const channelLabel = channelLabels[campaign.channel || ''] || campaign.channel || '';

      const activities = successfulLogs
        .filter((l) => l.recordId)
        .map((l) => ({
          tenantId: campaign.tenantId,
          recordId: l.recordId!,
          type: 'campaign_sent',
          description: `Campaña "${campaign.name}" enviada por ${channelLabel}`,
          metadata: {
            campaignId: campaign.id,
            campaignName: campaign.name,
            channel: campaign.channel,
            sendId: l.sendId,
          },
        }));

      if (activities.length > 0) {
        await this.activityRepo.save(
          this.activityRepo.create(activities),
        );
      }
    } catch (error) {
      this.logger.error('[Worker] Error logging campaign activities:', error);
    }
  }

  private getCostAction(channel: string | null, templateCategory?: string | null): string {
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

  private async failSend(sendId: string, message: string): Promise<void> {
    await this.sendRepo.update(sendId, {
      status: 'failed',
      errorMessage: message,
      completedAt: new Date(),
    });
  }
}
