import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Inbox } from './inbox.entity';

@Injectable()
export class WebhookForwarderService {
  private readonly logger = new Logger(WebhookForwarderService.name);
  private readonly devForwardUrl: string | undefined;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Inbox)
    private readonly inboxRepo: Repository<Inbox>,
  ) {
    this.devForwardUrl = this.configService.get<string>('DEV_WEBHOOK_FORWARD_URL');
    if (this.devForwardUrl) {
      this.logger.log(`Webhook forwarding enabled → ${this.devForwardUrl}`);
    }
  }

  /**
   * Checks if the webhook belongs to a dev tenant and forwards it.
   * Returns true if forwarded (meaning production should skip processing).
   * Returns false if it should be processed normally.
   */
  async forwardIfDev(body: any): Promise<boolean> {
    if (!this.devForwardUrl) return false;

    const tenantIds = await this.extractTenantIds(body);
    if (tenantIds.length === 0) return false;

    // Check if ALL identified tenants are dev tenants
    const devInboxes = await this.inboxRepo
      .createQueryBuilder('inbox')
      .innerJoin('inbox.tenant', 'tenant')
      .where('inbox.tenantId IN (:...tenantIds)', { tenantIds })
      .andWhere('tenant.isDev = :isDev', { isDev: true })
      .getCount();

    if (devInboxes === 0) return false;

    // Forward to dev environment
    try {
      const url = `${this.devForwardUrl}/webhooks/meta`;
      this.logger.log(`Forwarding webhook to dev: ${url}`);
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return true;
    } catch (error) {
      this.logger.error(`Failed to forward webhook to dev: ${error.message}`);
      // If forwarding fails, process normally in production
      return false;
    }
  }

  /**
   * Extracts tenant IDs from the webhook payload by looking up inboxes
   * based on phone_number_id or page_id.
   */
  private async extractTenantIds(body: any): Promise<string[]> {
    const tenantIds = new Set<string>();
    const entries = body.entry || [];

    for (const entry of entries) {
      // WhatsApp: find by phone_number_id
      if (entry.changes) {
        for (const change of entry.changes) {
          const phoneNumberId = change.value?.metadata?.phone_number_id;
          if (phoneNumberId) {
            const inbox = await this.inboxRepo.findOne({ where: { phoneNumberId } });
            if (inbox) tenantIds.add(inbox.tenantId);
          }
        }
      }

      // Messenger/Instagram: find by page_id (entry.id)
      if (entry.messaging || entry.changes?.some((c: any) => c.field === 'messages' && c.value?.sender)) {
        const pageId = entry.id;
        if (pageId) {
          const inbox = await this.inboxRepo.findOne({ where: { pageId } });
          if (inbox) tenantIds.add(inbox.tenantId);
        }
      }
    }

    return Array.from(tenantIds);
  }
}
