import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Job } from 'bullmq';
import sharp from 'sharp';
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
import { MailgunService } from '../providers/mailgun.service';
import { EmailDomainService } from '../providers/email-domain.service';
import { EmailUnsubscribeService } from '../providers/email-unsubscribe.service';
import { MediaStorageService } from '../media/media-storage.service';

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

  /**
   * Caché en memoria del parámetro de header ya resuelto por cada media de
   * ejemplo (keyed por su header_handle). Evita re-descargar/re-subir el mismo
   * archivo por cada destinatario de la campaña. Se resuelve UNA vez por
   * ejecución del worker (el proceso corre con concurrency=1).
   */
  private readonly headerMediaCache = new Map<string, any>();

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
    private readonly mailgunService: MailgunService,
    private readonly emailDomainService: EmailDomainService,
    private readonly emailUnsubscribeService: EmailUnsubscribeService,
    private readonly mediaStorageService: MediaStorageService,
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
    // Email Transaccional requires Mailgun + domain config
    if (campaign.channel === 'email_transaccional') {
      if (!this.mailgunService.isConfigured()) {
        await this.failSend(sendId, 'Mailgun no está configurado a nivel global');
        return;
      }
      const emailConfig = await this.emailDomainService.findByInbox(inbox.id);
      if (!emailConfig || !emailConfig.domain) {
        await this.failSend(sendId, 'La bandeja de email transaccional no tiene dominio configurado');
        return;
      }
    }

    const recipientIds = send.recipientIds;
    if (!recipientIds || recipientIds.length === 0) {
      await this.failSend(sendId, 'No hay destinatarios en el snapshot');
      return;
    }

    // ¿Es una reanudación? Si el envío ya tiene progreso previo (resumeOffset o
    // contadores), continuamos desde ahí en vez de empezar de cero.
    const isResume = (send.resumeOffset || 0) > 0 || (send.totalSent || 0) > 0 || (send.totalFailed || 0) > 0;

    // Mark as sending. En reanudación NO reseteamos contadores ni startedAt.
    await this.sendRepo.update(sendId, {
      status: 'sending',
      ...(isResume ? {} : { startedAt: new Date() }),
    });
    this.gateway.emitSendProgress(sendId, campaign.tenantId, {
      status: 'sending',
      totalRecipients: recipientIds.length,
      totalSent: send.totalSent || 0,
      totalFailed: send.totalFailed || 0,
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

    // Contadores y punto de inicio. En reanudación arrancan desde lo ya procesado.
    let totalSent = send.totalSent || 0;
    let totalFailed = send.totalFailed || 0;
    const startOffset = send.resumeOffset || 0;
    const batchSize = 50;
    const totalRecipients = recipientIds.length;

    try {
      for (let offset = startOffset; offset < totalRecipients; offset += batchSize) {
        // Pausa cooperativa: antes de procesar cada lote, releemos el estado. Si
        // fue pausado, guardamos el cursor y salimos SIN liquidar créditos (la
        // reserva se mantiene hasta que el envío realmente termine al reanudar).
        const fresh = await this.sendRepo.findOne({ where: { id: sendId }, select: { status: true } });
        if (fresh?.status === 'paused') {
          await this.sendRepo.update(sendId, { totalSent, totalFailed, resumeOffset: offset });
          this.gateway.emitSendProgress(sendId, campaign.tenantId, {
            status: 'paused',
            totalRecipients,
            totalSent,
            totalFailed,
          });
          this.logger.log(`[Worker] Send ${sendId} pausado en offset ${offset}`);
          return; // salir sin marcar completed ni liquidar reserva
        }

        const batchIds = recipientIds.slice(offset, offset + batchSize);

        // Load client records for this batch
        const clients = await this.clientRepo.find({ where: { id: In(batchIds) } });

        // Procesa un cliente y DEVUELVE sus logs (no muta estado compartido),
        // para poder ejecutar varios envíos en paralelo de forma segura.
        const processClient = async (client: ClientRecord): Promise<Partial<CampaignSendLog>[]> => {
          const logs: Partial<CampaignSendLog>[] = [];
          if (campaign.channel === 'email' || campaign.channel === 'email_transaccional') {
            // Email channel: validate email instead of phone
            if (!client.email) {
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
              return logs;
            }
          } else if (!client.phone && !(campaign.channel === 'whatsapp' && client.whatsappId)) {
            // Para WhatsApp se acepta el BSUID (whatsappId) cuando no hay teléfono.
            // Para SMS/llamada el teléfono es obligatorio.
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
            return logs;
          }

          if (campaign.channel === 'sms') {
            // === SMS via LabsMobile ===
            const smsBody = await this.resolveTextContent(campaign, client);
            const smsMessage = this.interpolateMessage(smsBody, client);
            const result = await this.smsService.sendSms(client.phone, smsMessage);

            if (result.success) {
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
              return logs;
            }

            const smtpConfig = inbox.metadata?.smtp;
            if (!smtpConfig?.host || !smtpConfig?.user || !smtpConfig?.pass) {
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
              return logs;
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
          } else if (campaign.channel === 'email_transaccional') {
            // === Email Transaccional via Mailgun API ===
            const emailAddress = client.email;
            if (!emailAddress) {
              logs.push({
                sendId,
                campaignId,
                tenantId: campaign.tenantId,
                recordId: client.id,
                phone: client.phone || '',
                channel: 'email_transaccional',
                status: 'failed',
                errorCode: 'no_email',
              });
              return logs;
            }

            // Check if unsubscribed
            const isUnsub = await this.emailUnsubscribeService.isUnsubscribed(campaign.tenantId, emailAddress);
            if (isUnsub) {
              logs.push({
                sendId,
                campaignId,
                tenantId: campaign.tenantId,
                recordId: client.id,
                phone: client.phone || '',
                channel: 'email_transaccional',
                status: 'failed',
                errorCode: 'unsubscribed',
              });
              return logs;
            }

            const emailConfig = await this.emailDomainService.findByInbox(inbox.id);
            if (!emailConfig) {
              logs.push({
                sendId,
                campaignId,
                tenantId: campaign.tenantId,
                recordId: client.id,
                phone: client.phone || '',
                channel: 'email_transaccional',
                status: 'failed',
                errorCode: 'mailgun_not_configured',
              });
              return logs;
            }

            const emailContent = await this.resolveEmailContent(campaign, client);
            const emailSubject = this.interpolateMessage(emailContent.subject, client);
            const emailHtml = this.interpolateMessage(emailContent.html, client);

            try {
              const mgResult = await this.mailgunService.sendEmail({
                domain: emailConfig.domain,
                from: `"${emailConfig.fromName}" <${emailConfig.fromEmail}>`,
                to: emailAddress,
                subject: emailSubject,
                html: emailHtml.replace(/\n/g, '<br>'),
                text: emailHtml.replace(/<[^>]+>/g, ''),
                variables: { campaignId, sendId, recordId: client.id },
                tags: ['campaign', `campaign:${campaignId}`],
                tracking: true,
                unsubscribeUrl: this.emailUnsubscribeService.getUnsubscribeUrl(campaign.tenantId, emailAddress),
              });

              logs.push({
                sendId,
                campaignId,
                tenantId: campaign.tenantId,
                recordId: client.id,
                phone: client.phone || '',
                channel: 'email_transaccional',
                status: 'sent',
                providerMessageId: mgResult.id?.substring(0, 100) ?? null,
                sentAt: new Date(),
              });
            } catch (err: any) {
              logs.push({
                sendId,
                campaignId,
                tenantId: campaign.tenantId,
                recordId: client.id,
                phone: client.phone || '',
                channel: 'email_transaccional',
                status: 'failed',
                errorCode: (err.message || 'unknown').substring(0, 50),
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

            // Destinatario: teléfono si existe; si no, el BSUID (identidad).
            const recipientId = client.phone || client.whatsappId || '';
            // Send via Meta Cloud API
            const result = await this.sendWhatsAppMessage(
              inbox.accessToken!,
              inbox.phoneNumberId!,
              recipientId,
              campaign.whatsappTemplateName,
              campaign.whatsappTemplateLanguage || 'es',
              variables,
              templateComponents,
              inbox.tenantId,
            );

            if (result.success) {
              logs.push({
                sendId,
                campaignId,
                tenantId: campaign.tenantId,
                recordId: client.id,
                phone: (client.phone || recipientId).substring(0, 20),
                channel: 'whatsapp',
                status: 'sent',
                providerMessageId: result.messageId ?? null,
                sentAt: new Date(),
              });
            } else {
              logs.push({
                sendId,
                campaignId,
                tenantId: campaign.tenantId,
                recordId: client.id,
                phone: (client.phone || recipientId).substring(0, 20),
                channel: 'whatsapp',
                status: 'failed',
                errorCode: (result.error || 'unknown').substring(0, 50),
              });
            }
          }
          return logs;
        };

        // Procesa el lote con concurrencia controlada. Meta permite 80 msg/s
        // (tier 1) y más en tiers superiores; enviar de a uno desperdiciaba esa
        // capacidad y hacía que 10k envíos tardaran horas. Con un pool de envíos
        // en paralelo aprovechamos el ancho de banda respetando el limiter de
        // BullMQ (80/s) que actúa como techo de seguridad.
        const CONCURRENCY = 20;
        const logs: Partial<CampaignSendLog>[] = [];
        for (let i = 0; i < clients.length; i += CONCURRENCY) {
          const slice = clients.slice(i, i + CONCURRENCY);
          const results = await Promise.all(
            slice.map((client) =>
              processClient(client).catch((err) => {
                this.logger.warn(`[Worker] Error enviando a ${client.id}:`, err);
                return [{
                  sendId,
                  campaignId,
                  tenantId: campaign.tenantId,
                  recordId: client.id,
                  phone: (client.phone || client.whatsappId || '').substring(0, 20),
                  channel: campaign.channel || 'whatsapp',
                  status: 'failed',
                  errorCode: 'send_exception',
                }] as Partial<CampaignSendLog>[];
              }),
            ),
          );
          for (const r of results) logs.push(...r);
        }

        // Contadores derivados del resultado del lote (evita condiciones de
        // carrera al no mutar variables compartidas dentro del paralelismo).
        const batchSent = logs.filter((l) => l.status === 'sent').length;
        const batchFailed = logs.length - batchSent;
        totalSent += batchSent;
        totalFailed += batchFailed;

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

        // Update progress y cursor de reanudación (offset tras este lote).
        await this.sendRepo.update(sendId, {
          totalSent,
          totalFailed,
          resumeOffset: offset + batchIds.length,
        });

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
    templateComponents?: any[] | null,
    tenantId?: string,
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const components: any[] = [];

    // Header media: si la plantilla define un header IMAGE/VIDEO/DOCUMENT, WhatsApp
    // exige el media en el envío (si no, rechaza con 131053). Como la campaña no
    // sube un archivo, reutilizamos la imagen de EJEMPLO de la plantilla
    // (example.header_handle) y la re-subimos a la Media API para obtener un media
    // id fiable. Mismo comportamiento que el envío desde una conversación.
    const defHeader = (templateComponents || []).find(
      (c: any) => c?.type === 'HEADER' && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(c?.format),
    );
    if (defHeader) {
      const exampleHandle = defHeader.example?.header_handle?.[0];
      if (!exampleHandle) {
        return {
          success: false,
          error: `La plantilla "${templateName}" requiere media en el encabezado y no tiene imagen de ejemplo.`,
        };
      }
      const fmt = String(defHeader.format).toLowerCase(); // image | video | document
      try {
        const headerParam = await this.resolveHeaderMediaParam(
          fmt,
          exampleHandle,
          phoneNumberId,
          accessToken,
          tenantId,
        );
        components.push({ type: 'header', parameters: [headerParam] });
      } catch (err: any) {
        return {
          success: false,
          error: `No se pudo preparar el encabezado (${fmt}): ${err?.message || err}`,
        };
      }
    }

    const bodyParams = Object.entries(variables)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([, value]) => ({ type: 'text', text: value }));

    if (bodyParams.length > 0) {
      components.push({ type: 'body', parameters: bodyParams });
    }

    // Destinatario: si es un BSUID de identidad (p. ej. "CO.123...") se envía en
    // `recipient`; si es teléfono/wa_id, en `to` (sin el prefijo +).
    const isIdentity = /^[A-Z]{2,}(\.[A-Z]{2,})*\.\d+$/.test(phone);
    const recipientFields = isIdentity
      ? { recipient: phone }
      : { to: phone.startsWith('+') ? phone.slice(1) : phone };

    const requestBody = {
      messaging_product: 'whatsapp',
      ...recipientFields,
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

  /**
   * Resuelve el parámetro `parameters[0]` del header de una plantilla para el
   * envío, reutilizando SIEMPRE el media de ejemplo que se subió a Meta al crear
   * la plantilla (no se sube nada manualmente). Estrategia por tipo:
   *
   *   - IMAGE: se descarga, se normaliza a JPEG y se re-sube a la Media API para
   *     obtener un media `id` (evita 131053 por formato/color no soportado).
   *   - VIDEO / DOCUMENT: la Media API tiene límite de ~16MB y muchos videos de
   *     ejemplo lo superan, además el header_handle de la CDN de WhatsApp expira
   *     (Meta lo descarga con 403). Por eso el archivo se copia a nuestro storage
   *     público (R2) y se envía por `link` con esa URL estable, que Meta sí puede
   *     descargar sin límite de 16MB ni expiración.
   *
   * El resultado se cachea por header_handle para no repetir el trabajo por cada
   * destinatario de la campaña.
   */
  private async resolveHeaderMediaParam(
    fmt: string,
    exampleHandle: string,
    phoneNumberId: string,
    accessToken: string,
    tenantId?: string,
  ): Promise<any> {
    const cacheKey = `${fmt}:${exampleHandle}`;
    const cached = this.headerMediaCache.get(cacheKey);
    if (cached) return cached;

    let param: any;
    if (fmt === 'image') {
      const mediaId = await this.uploadWhatsAppMediaFromUrl(phoneNumberId, accessToken, exampleHandle);
      param = { type: 'image', image: { id: mediaId } };
    } else {
      // Video/documento: copiar a R2 y enviar por link estable.
      const link = await this.mirrorMediaToPublicUrl(exampleHandle, fmt, tenantId);
      param = { type: fmt, [fmt]: { link } };
    }

    this.headerMediaCache.set(cacheKey, param);
    return param;
  }

  /**
   * Descarga el media de ejemplo (video/documento) y lo sube a nuestro storage
   * público (R2), devolviendo una URL estable que Meta puede descargar por link.
   * Necesario porque la Media API rechaza archivos >16MB y el header_handle de la
   * CDN de WhatsApp expira (produce 403 al enviar).
   */
  private async mirrorMediaToPublicUrl(
    url: string,
    fmt: string,
    tenantId?: string,
  ): Promise<string> {
    // 1) Descargar el archivo de ejemplo desde la CDN de WhatsApp.
    let buffer: Buffer;
    let contentType: string;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`No se pudo descargar el archivo (HTTP ${res.status})`);
      contentType = res.headers.get('content-type') || (fmt === 'video' ? 'video/mp4' : 'application/octet-stream');
      buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length === 0) throw new Error('El archivo descargado está vacío');
    } catch (err: any) {
      throw new Error(`Error al descargar el ${fmt} del encabezado: ${err.message || err}`);
    }

    // 2) Subir a R2 para obtener una URL pública estable.
    const stored = await this.mediaStorageService.uploadBuffer(buffer, {
      channel: 'template',
      tenantId: tenantId || 'shared',
      conversationId: 'campaign-header',
      messageId: `hdr-${Date.now()}`,
      mimeType: contentType,
      filename: `header.${fmt === 'video' ? 'mp4' : 'bin'}`,
    });
    if (!stored?.url) {
      throw new Error('No se pudo almacenar el archivo del encabezado en el storage público');
    }
    return stored.url;
  }

  /**
   * Descarga una imagen desde una URL, la normaliza a JPEG (RGB 8-bit, ≤1600px)
   * y la sube a la Media API de WhatsApp, devolviendo el media id. Evita el error
   * 131053 que Meta lanza con imágenes en formatos/perfiles de color no soportados.
   * Portado de ChatsService.uploadWhatsAppMediaFromUrl para el envío de campañas.
   */
  private async uploadWhatsAppMediaFromUrl(
    phoneNumberId: string,
    accessToken: string,
    url: string,
  ): Promise<string> {
    // 1) Descargar la imagen de origen.
    let rawBuffer: Buffer;
    try {
      const imgRes = await fetch(url);
      if (!imgRes.ok) throw new Error(`No se pudo descargar la imagen (HTTP ${imgRes.status})`);
      rawBuffer = Buffer.from(await imgRes.arrayBuffer());
      if (rawBuffer.length === 0) throw new Error('La imagen descargada está vacía');
    } catch (err: any) {
      throw new Error(`Error al descargar la imagen del header: ${err.message || err}`);
    }

    // 2) Normalizar a JPEG RGB 8-bit (aplanar alfa sobre blanco, limitar tamaño).
    let imgBuffer: Buffer;
    const contentType = 'image/jpeg';
    const ext = 'jpg';
    try {
      imgBuffer = await sharp(rawBuffer)
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85, chromaSubsampling: '4:2:0' })
        .toBuffer();
    } catch (err: any) {
      throw new Error(`No se pudo procesar la imagen del header: ${err.message || err}`);
    }

    // 3) Subir por multipart a la Media API de WhatsApp.
    const boundary = `----FormBoundary${Date.now()}${Math.floor(Math.random() * 1e9)}`;
    const parts: Buffer[] = [];
    parts.push(
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="messaging_product"\r\n\r\nwhatsapp\r\n`),
    );
    parts.push(
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="type"\r\n\r\n${contentType}\r\n`),
    );
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="header.${ext}"\r\nContent-Type: ${contentType}\r\n\r\n`,
      ),
    );
    parts.push(imgBuffer);
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

    let uploadData: any;
    try {
      const uploadRes = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/media`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body: Buffer.concat(parts),
      });
      uploadData = await uploadRes.json();
    } catch (err: any) {
      throw new Error(`Error de red al subir la imagen a WhatsApp: ${err.message || err}`);
    }

    if (!uploadData?.id) {
      const metaMsg =
        uploadData?.error?.message ||
        uploadData?.error?.error_data?.details ||
        JSON.stringify(uploadData);
      throw new Error(`WhatsApp rechazó la subida de la imagen: ${metaMsg}`);
    }
    return uploadData.id;
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
      const isEmail = campaign.channel === 'email' || campaign.channel === 'email_transaccional';
      const contactIdentifiers = isEmail
        ? successfulLogs.map((l) => {
            const client = clients.find((c) => c.id === l.recordId);
            return client?.email || '';
          }).filter(Boolean)
        : successfulLogs.map((l) => l.phone!).filter(Boolean);

      if (contactIdentifiers.length === 0) return;

      // recordIds de los envíos (para reconciliar por contacto, no solo por
      // contact_id). Un mismo contacto puede tener su conversación identificada por
      // teléfono (contact_id numérico) o por BSUID de identidad de Meta ("CO.xxx")
      // si respondió por WhatsApp. Buscar solo por teléfono crearía un chat nuevo
      // y duplicaría la conversación. Por eso reconciliamos también por record_id.
      const recordIds = Array.from(
        new Set(successfulLogs.map((l) => l.recordId).filter(Boolean) as string[]),
      );

      // Find existing conversations for these contacts in this inbox, either by
      // contact_id (teléfono/email/BSUID) o por record_id (mismo contacto).
      const convQb = this.conversationRepo
        .createQueryBuilder('c')
        .where('c.inbox_id = :inboxId', { inboxId: inbox.id });
      if (recordIds.length > 0) {
        convQb.andWhere('(c.contact_id IN (:...contactIdentifiers) OR c.record_id IN (:...recordIds))', {
          contactIdentifiers,
          recordIds,
        });
      } else {
        convQb.andWhere('c.contact_id IN (:...contactIdentifiers)', { contactIdentifiers });
      }
      const existingConvs = await convQb.getMany();

      const convByContact = new Map(existingConvs.map((c) => [c.contactId, c]));
      // Índice por record_id: si un contacto ya tiene conversación (aunque sea con
      // otro contact_id, p. ej. su BSUID), la reutilizamos en vez de crear una nueva.
      const convByRecord = new Map<string, Conversation>();
      for (const c of existingConvs) {
        if (c.recordId && !convByRecord.has(c.recordId)) convByRecord.set(c.recordId, c);
      }
      const now = new Date();
      let lastMessageText: string;
      if (campaign.channel === 'email' || campaign.channel === 'email_transaccional') {
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
        if (!contactId) continue;
        // Ya existe conversación por contact_id o por record_id (mismo contacto): no crear otra.
        if (convByContact.has(contactId)) continue;
        if (log.recordId && convByRecord.has(log.recordId)) continue;

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
          if (conv.recordId) convByRecord.set(conv.recordId, conv);
        }
      }

      // Build messages for all successful sends
      const messages: Partial<Message>[] = [];
      for (const log of successfulLogs) {
        const client = clients.find((c) => c.id === log.recordId);
        const contactId = isEmail ? (client?.email || '') : log.phone!;
        // Resolver la conversación por contact_id o, si no, por record_id (reutiliza
        // la conversación existente del contacto aunque tenga otro contact_id/BSUID).
        const conv =
          convByContact.get(contactId) ||
          (log.recordId ? convByRecord.get(log.recordId) : undefined);
        if (!conv) continue;

        let renderedContent: string;
        let messageType: string;
        let templateMeta: string | null = null;

        if (campaign.channel === 'email' || campaign.channel === 'email_transaccional') {
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
