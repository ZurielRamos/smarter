import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Job } from 'bullmq';
import { CampaignSend } from './campaign-send.entity';
import { CampaignSendLog } from './campaign-send-log.entity';
import { Campaign } from './campaign.entity';
import { ClientRecord } from '../records/record.entity';
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
    private readonly gateway: CampaignsGateway,
    private readonly billingService: BillingService,
    private readonly smsService: SmsService,
    private readonly callService: CallService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
    private readonly webhooksService: WebhooksService,
    private readonly notificationsService: NotificationsService,
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
          if (!client.phone) {
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
            const smsMessage = this.interpolateMessage(campaign.messageTemplate || '', client);
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
            const callMessage = this.interpolateMessage(campaign.messageTemplate || '', client);
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

            const emailContent = this.interpolateMessage(campaign.messageTemplate || '', client);
            const emailSubject = this.interpolateMessage(campaign.emailSubject || smtpConfig.defaultSubject || 'Mensaje', client);

            const result = await this.emailService.sendEmail({
              to: emailAddress,
              subject: emailSubject,
              html: emailContent.replace(/\n/g, '<br>'),
              text: emailContent,
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
          const unitCost = await this.billingService.getActionCost(costAction);
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
          const unitCost = await this.billingService.getActionCost(costAction);
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
      const phones = successfulLogs.map((l) => l.phone!).filter(Boolean);
      if (phones.length === 0) return;

      // Find existing conversations for these phones in this inbox
      const existingConvs = await this.conversationRepo
        .createQueryBuilder('c')
        .where('c.inbox_id = :inboxId', { inboxId: inbox.id })
        .andWhere('c.contact_id IN (:...phones)', { phones })
        .getMany();

      const convByPhone = new Map(existingConvs.map((c) => [c.contactId, c]));
      const now = new Date();
      const lastMessageText = campaign.channel === 'sms'
        ? (campaign.messageTemplate || 'SMS').substring(0, 100)
        : `📋 ${campaign.whatsappTemplateName || ''}`;

      // Create missing conversations
      const newConversations: Partial<Conversation>[] = [];
      for (const log of successfulLogs) {
        const phone = log.phone!;
        if (!convByPhone.has(phone)) {
          const client = clients.find((c) => c.id === log.recordId);
          const contactName = client ? [client.firstName, client.lastName].filter(Boolean).join(' ') || phone : phone;
          newConversations.push({
            inboxId: inbox.id,
            contactId: phone,
            contactName,
            recordId: log.recordId,
            status: 'open',
            lastMessage: lastMessageText,
            lastMessageAt: now,
            lastMessageSource: 'campaign',
            unreadCount: 0,
          });
        }
      }

      // Bulk insert new conversations
      if (newConversations.length > 0) {
        const inserted = await this.conversationRepo.save(
          this.conversationRepo.create(newConversations),
        );
        for (const conv of inserted) {
          convByPhone.set(conv.contactId, conv);
        }
      }

      // Build messages for all successful sends
      const messages: Partial<Message>[] = [];
      for (const log of successfulLogs) {
        const phone = log.phone!;
        const conv = convByPhone.get(phone);
        if (!conv) continue;

        const client = clients.find((c) => c.id === log.recordId);
        let renderedContent: string;
        let messageType: string;
        let templateMeta: string | null = null;

        if (campaign.channel === 'sms') {
          // SMS: interpolate message template with client data
          renderedContent = this.interpolateMessage(campaign.messageTemplate || '', client!);
          messageType = 'text';
        } else if (campaign.channel === 'llamada') {
          // Call: interpolate message
          renderedContent = this.interpolateMessage(campaign.messageTemplate || '', client!);
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
      }

      // Update last_message on existing conversations
      const existingPhones = existingConvs.map((c) => c.contactId);
      if (existingPhones.length > 0) {
        await this.conversationRepo
          .createQueryBuilder()
          .update(Conversation)
          .set({ lastMessage: lastMessageText, lastMessageAt: now, lastMessageSource: 'campaign' })
          .where('inbox_id = :inboxId AND contact_id IN (:...phones)', { inboxId: inbox.id, phones: existingPhones })
          .execute();
      }
    } catch (error) {
      this.logger.error('[Worker] Error inserting conversations/messages:', error);
      // Non-fatal: don't fail the send because of this
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
