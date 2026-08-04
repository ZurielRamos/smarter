import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Webhook } from './webhook.entity';
import * as crypto from 'crypto';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @InjectRepository(Webhook)
    private readonly webhookRepo: Repository<Webhook>,
  ) {}

  async findAll(tenantId: string): Promise<Webhook[]> {
    return this.webhookRepo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  async create(data: { tenantId: string; name: string; url: string; events: string[]; secret?: string }): Promise<Webhook> {
    const webhook = this.webhookRepo.create({
      tenantId: data.tenantId,
      name: data.name,
      url: data.url,
      events: data.events,
      secret: data.secret || null,
      enabled: true,
    });
    return this.webhookRepo.save(webhook);
  }

  async update(id: string, data: Partial<{ name: string; url: string; events: string[]; enabled: boolean; secret: string }>): Promise<Webhook> {
    await this.webhookRepo.update(id, data as any);
    return this.webhookRepo.findOneBy({ id }) as Promise<Webhook>;
  }

  async delete(id: string): Promise<void> {
    await this.webhookRepo.delete(id);
  }

  /**
   * Dispatch an event to all webhooks subscribed to it for a given tenant.
   */
  async dispatch(tenantId: string, event: string, payload: any): Promise<void> {
    const webhooks = await this.webhookRepo.find({ where: { tenantId, enabled: true } });
    const matching = webhooks.filter((w) => w.events.includes(event));

    for (const webhook of matching) {
      this.sendWebhook(webhook, event, payload).catch((err) => {
        this.logger.warn(`[Webhook] Failed to deliver to ${webhook.url}: ${err.message}`);
      });
    }
  }

  private async sendWebhook(webhook: Webhook, event: string, payload: any): Promise<void> {
    const body = JSON.stringify({ event, timestamp: new Date().toISOString(), data: payload });
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    if (webhook.secret) {
      const signature = crypto.createHmac('sha256', webhook.secret).update(body).digest('hex');
      headers['X-Webhook-Signature'] = signature;
    }

    headers['X-Webhook-Event'] = event;

    const res = await fetch(webhook.url, { method: 'POST', headers, body, signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      this.logger.warn(`[Webhook] ${webhook.url} returned ${res.status} for event ${event}`);
    }
  }
}
