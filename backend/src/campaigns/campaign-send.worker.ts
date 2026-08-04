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
    if (!inbox || !inbox.accessToken || !inbox.phoneNumberId) {
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

          // Send via Meta Cloud API
          const result = await this.sendWhatsAppMessage(
            inbox.accessToken,
            inbox.phoneNumberId,
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

      this.gateway.emitSendProgress(sendId, campaign.tenantId, {
        status: 'completed',
        totalRecipients,
        totalSent,
        totalFailed,
      });

      // Charge credits for successful sends only
      if (totalSent > 0 && campaign.tenantId) {
        try {
          const costAction = this.getCostAction(campaign.channel);
          const unitCost = await this.billingService.getActionCost(costAction);
          if (unitCost !== null) {
            const totalCredits = totalSent * unitCost;
            await this.billingService.consume(campaign.tenantId, {
              amount: totalCredits,
              source: `campaign_${campaign.channel}`,
              referenceId: sendId,
              description: `Campaña "${campaign.name}" — ${totalSent} envíos × ${unitCost} créditos`,
            });
            this.logger.log(`[Worker] Charged ${totalCredits} credits (${totalSent} × ${unitCost}) for send ${sendId}`);
          }
        } catch (billingError) {
          this.logger.warn(`[Worker] Could not charge credits for send ${sendId}:`, billingError);
          // Non-fatal: send already completed successfully
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
      phone: () => client.phone || '',
      email: () => client.email || '',
      status: () => (client as any).status || '',
      channelSource: () => (client as any).channelSource || '',
    };

    if (systemFields[field]) return systemFields[field]();

    // Custom fields from JSONB
    const custom = (client as any).customFields || (client as any).custom_fields || {};
    return String(custom[field] ?? '');
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
      const templateName = campaign.whatsappTemplateName || '';
      const lastMessageText = `📋 ${templateName}`;

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

        // Build rendered content from template body with variables substituted
        let renderedContent = `[Plantilla: ${templateName}]`;
        if (templateComponents) {
          const bodyComp = templateComponents.find((c: any) => c.type === 'BODY');
          if (bodyComp?.text) {
            renderedContent = bodyComp.text;
            // Replace {{1}}, {{2}}, etc. with actual values
            if (campaign.whatsappVariableMapping && client) {
              for (const [pos, field] of Object.entries(campaign.whatsappVariableMapping)) {
                renderedContent = renderedContent.replace(`{{${pos}}}`, this.getClientField(client, field));
              }
            }
          }
        }

        // Store template metadata in mediaUrl (same format as chats service)
        const templateMeta = templateComponents
          ? JSON.stringify({ name: templateName, language: campaign.whatsappTemplateLanguage || 'es', components: templateComponents })
          : null;

        messages.push({
          conversationId: conv.id,
          direction: 'outbound',
          messageType: 'template',
          content: renderedContent,
          mediaUrl: templateMeta,
          externalId: log.providerMessageId || undefined,
          status: 'sent',
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
          .set({ lastMessage: lastMessageText, lastMessageAt: now })
          .where('inbox_id = :inboxId AND contact_id IN (:...phones)', { inboxId: inbox.id, phones: existingPhones })
          .execute();
      }
    } catch (error) {
      this.logger.error('[Worker] Error inserting conversations/messages:', error);
      // Non-fatal: don't fail the send because of this
    }
  }

  private getCostAction(channel: string | null): string {
    switch (channel) {
      case 'whatsapp': return 'whatsapp_marketing';
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
