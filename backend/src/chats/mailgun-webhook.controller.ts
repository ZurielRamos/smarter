import { Controller, Post, Body, Res, Logger } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/public.decorator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Response } from 'express';
import { Message } from './message.entity';
import { Conversation } from './conversation.entity';
import { Inbox } from './inbox.entity';
import { CampaignSendLog } from '../campaigns/campaign-send-log.entity';
import { MailgunService } from '../providers/mailgun.service';
import { EmailUnsubscribeService } from '../providers/email-unsubscribe.service';
import { ChatsGateway } from './chats.gateway';

/**
 * Webhook endpoint for Mailgun delivery events.
 * Handles: delivered, opened, clicked, bounced, complained, failed.
 */
@SkipThrottle()
@Controller('webhooks/mailgun')
export class MailgunWebhookController {
  private readonly logger = new Logger(MailgunWebhookController.name);

  constructor(
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(Inbox)
    private readonly inboxRepo: Repository<Inbox>,
    @InjectRepository(CampaignSendLog)
    private readonly campaignSendLogRepo: Repository<CampaignSendLog>,
    private readonly mailgunService: MailgunService,
    private readonly emailUnsubscribeService: EmailUnsubscribeService,
    private readonly chatsGateway: ChatsGateway,
  ) {}

  @Public()
  @Post()
  async handleMailgunEvent(@Body() body: any, @Res() res: Response) {
    // Respond immediately to avoid Mailgun retries
    res.status(200).send('ok');

    try {
      const signature = body?.signature;
      const eventData = body?.['event-data'];

      if (!signature || !eventData) {
        this.logger.warn('Invalid Mailgun webhook payload');
        return;
      }

      // Verify signature
      const isValid = this.mailgunService.verifyWebhookSignature(
        signature.timestamp,
        signature.token,
        signature.signature,
      );

      if (!isValid) {
        this.logger.warn('Invalid Mailgun webhook signature');
        return;
      }

      const event = eventData.event; // delivered, opened, clicked, failed, complained
      const messageId = eventData.message?.headers?.['message-id'] || eventData['message-id'];
      const userVariables = eventData['user-variables'] || {};

      // Try to find the message by Mailgun message-id stored as externalId
      let message: Message | null = null;

      if (messageId) {
        // Mailgun stores message-id with angle brackets
        const cleanId = messageId.replace(/[<>]/g, '');
        message = await this.messageRepo.findOne({
          where: [
            { externalId: messageId },
            { externalId: `<${cleanId}>` },
            { externalId: cleanId },
          ],
        });
      }

      // Fallback: try user variables (messageId, conversationId)
      if (!message && userVariables.messageId) {
        message = await this.messageRepo.findOne({ where: { id: userVariables.messageId } });
      }

      if (!message) {
        this.logger.debug(`Mailgun event ${event} — message not found: ${messageId}`);
        return;
      }

      // Map Mailgun event to our message status
      const newStatus = this.mapEventToStatus(event, message.status);
      if (!newStatus || newStatus === message.status) return;

      // Update message status
      message.status = newStatus;
      await this.messageRepo.save(message);

      // Emit real-time update
      const conversation = await this.conversationRepo.findOne({ where: { id: message.conversationId } });
      let tenantId: string | null = null;
      if (conversation) {
        const inbox = await this.inboxRepo.findOne({ where: { id: conversation.inboxId } });
        if (inbox) {
          tenantId = inbox.tenantId;
          this.chatsGateway.server
            .to(`tenant:${inbox.tenantId}`)
            .emit('message:status', {
              messageId: message.id,
              conversationId: message.conversationId,
              status: newStatus,
              event,
            });
        }
      }

      this.logger.debug(`Mailgun ${event} → message ${message.id} status: ${newStatus}`);

      // Auto-unsubscribe on complaint or permanent bounce
      if (event === 'complained' || (event === 'failed' && eventData.severity === 'permanent')) {
        const recipientEmail = eventData.recipient;
        if (recipientEmail && tenantId) {
          const reason = event === 'complained' ? 'complained' : 'bounced';
          await this.emailUnsubscribeService.unsubscribe(tenantId, recipientEmail, reason, `webhook:${event}`);
          this.logger.log(`Auto-unsubscribed ${recipientEmail} (${reason})`);
        }
      }

      // Update campaign send logs if this is a campaign email
      await this.updateCampaignSendLog(eventData, event, userVariables);
    } catch (error) {
      this.logger.error('Error processing Mailgun webhook', error);
    }
  }

  /**
   * Update campaign_send_logs with delivery/tracking events.
   */
  private async updateCampaignSendLog(eventData: any, event: string, userVariables: Record<string, string>) {
    const campaignId = userVariables.campaignId;
    const sendId = userVariables.sendId;
    const recordId = userVariables.recordId;

    if (!campaignId || !sendId) return; // Not a campaign email

    try {
      // Find the log entry
      let log: CampaignSendLog | null = null;

      if (recordId) {
        log = await this.campaignSendLogRepo.findOne({ where: { sendId, recordId } });
      }

      // Fallback: find by providerMessageId
      if (!log) {
        const messageId = eventData.message?.headers?.['message-id'] || eventData['message-id'];
        if (messageId) {
          const cleanId = messageId.replace(/[<>]/g, '');
          log = await this.campaignSendLogRepo.findOne({
            where: [
              { sendId, providerMessageId: messageId },
              { sendId, providerMessageId: `<${cleanId}>` },
              { sendId, providerMessageId: cleanId },
            ],
          });
        }
      }

      if (!log) return;

      const now = new Date();

      switch (event) {
        case 'delivered':
          if (!log.deliveredAt) {
            log.status = 'delivered';
            log.deliveredAt = now;
          }
          break;
        case 'opened':
          if (!log.openedAt) {
            log.openedAt = now;
          }
          break;
        case 'clicked':
          if (!log.clickedAt) {
            log.clickedAt = now;
          }
          if (!log.openedAt) {
            log.openedAt = now; // Click implies open
          }
          break;
        case 'failed':
        case 'bounced':
          log.status = 'failed';
          log.errorCode = (eventData.reason || eventData.severity || 'bounce').substring(0, 50);
          break;
        case 'complained':
          log.complainedAt = now;
          log.status = 'failed';
          log.errorCode = 'complained';
          break;
        default:
          return;
      }

      await this.campaignSendLogRepo.save(log);
    } catch (err) {
      this.logger.debug(`Campaign log update failed for send ${sendId}: ${err}`);
    }
  }

  /**
   * Map a Mailgun event type to our internal message status.
   * Status progression: sent → delivered → read (opened)
   * Failed/bounced/complained → failed
   */
  private mapEventToStatus(event: string, currentStatus: string): string | null {
    // Don't downgrade status
    const statusOrder = ['sent', 'delivered', 'read'];
    const currentIdx = statusOrder.indexOf(currentStatus);

    switch (event) {
      case 'delivered':
        return currentIdx < 1 ? 'delivered' : null;
      case 'opened':
        return currentIdx < 2 ? 'read' : null;
      case 'clicked':
        // Click implies opened
        return currentIdx < 2 ? 'read' : null;
      case 'failed':
      case 'bounced':
        return 'failed';
      case 'complained':
        return 'failed';
      default:
        return null;
    }
  }
}
