import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContactEvent } from './contact-event.entity';
import { WooHook } from './woo-hook.entity';
import { Inbox } from '../chats/inbox.entity';
import { ConversionsService } from './conversions.service';

export interface CreateContactEventParams {
  tenantId: string;
  recordId: string;
  type: string;
  name: string;
  value?: number;
  currency?: string;
  metadata?: Record<string, any>;
  source?: string;
  actorId?: string;
  actorName?: string;
}

@Injectable()
export class ContactEventsService {
  private readonly logger = new Logger(ContactEventsService.name);

  constructor(
    @InjectRepository(ContactEvent)
    private readonly contactEventRepo: Repository<ContactEvent>,
    @InjectRepository(WooHook)
    private readonly wooHookRepo: Repository<WooHook>,
    @InjectRepository(Inbox)
    private readonly inboxRepo: Repository<Inbox>,
    private readonly conversionsService: ConversionsService,
  ) {}

  /**
   * Create a contact event and optionally dispatch conversions to ad platforms.
   */
  async create(params: CreateContactEventParams): Promise<ContactEvent> {
    const event = this.contactEventRepo.create({
      tenantId: params.tenantId,
      recordId: params.recordId,
      type: params.type,
      name: params.name,
      value: params.value ?? null,
      currency: params.currency || 'COP',
      metadata: params.metadata || null,
      source: params.source || 'manual',
      actorId: params.actorId || null,
      actorName: params.actorName || null,
      dispatched: false,
    });

    const saved = await this.contactEventRepo.save(event);

    // Try to dispatch conversion to ad platforms
    this.dispatchIfConfigured(saved).catch((err) => {
      this.logger.warn(`[ContactEvent] Failed to dispatch conversion for event ${saved.id}:`, err);
    });

    // Execute WooCommerce hooks if event came from woocommerce/api
    if (params.source === 'api' || params.metadata?.source === 'woocommerce') {
      this.executeWooHooks(saved).catch((err) => {
        this.logger.warn(`[ContactEvent] Failed to execute woo hooks for event ${saved.id}:`, err);
      });
    }

    return saved;
  }

  /**
   * Check if there are ConversionEvents configured for this event type
   * and dispatch to the corresponding ad platforms.
   */
  private async dispatchIfConfigured(event: ContactEvent): Promise<void> {
    // Get the contact's email/phone for matching
    const record = await this.contactEventRepo.manager.query(
      'SELECT email, phone FROM clients WHERE id = $1',
      [event.recordId],
    );
    const email = record?.[0]?.email || undefined;
    const phone = record?.[0]?.phone || undefined;

    const logs = await this.conversionsService.dispatchConversion({
      tenantId: event.tenantId,
      recordId: event.recordId,
      triggerType: event.type,
      triggerValue: event.type, // for contact events, type IS the trigger value
      value: event.value ? Number(event.value) : undefined,
      email,
      phone,
    });

    if (logs.length > 0) {
      await this.contactEventRepo.update(event.id, {
        dispatched: true,
        dispatchedAt: new Date(),
      });
      this.logger.log(`[ContactEvent] Dispatched ${logs.length} conversion(s) for event ${event.id}`);
    }
  }

  /**
   * Execute WooCommerce hooks configured for this event type.
   * Handles: tag assignment and logging (notifications handled separately).
   */
  private async executeWooHooks(event: ContactEvent): Promise<void> {
    const hooks = await this.wooHookRepo.find({
      where: { tenantId: event.tenantId, event: event.type, enabled: true },
    });

    if (hooks.length === 0) return;

    for (const hook of hooks) {
      try {
        switch (hook.actionType) {
          case 'tag':
            if (hook.config.tagName && event.recordId) {
              // Add tag to contact
              const existingTags = await this.contactEventRepo.manager.query(
                'SELECT tags FROM clients WHERE id = $1',
                [event.recordId],
              );
              const currentTags: string[] = existingTags?.[0]?.tags || [];
              if (!currentTags.includes(hook.config.tagName)) {
                await this.contactEventRepo.manager.query(
                  'UPDATE clients SET tags = tags || $1::jsonb, updated_at = now() WHERE id = $2',
                  [JSON.stringify([hook.config.tagName]), event.recordId],
                );
                this.logger.log(`[WooHook] Added tag "${hook.config.tagName}" to record ${event.recordId}`);
              }
            }
            break;

          case 'conversion':
            // The conversion dispatch already happens via dispatchIfConfigured
            // This hook type is informational — we log it
            this.logger.log(`[WooHook] Conversion hook matched: ${hook.config.conversionName || event.type}`);
            break;

          case 'notification':
            if (hook.config.inboxId && hook.config.channel === 'whatsapp' && hook.config.templateName) {
              await this.sendWhatsAppNotification(hook, event);
            } else {
              this.logger.log(`[WooHook] Notification hook triggered for record ${event.recordId} via ${hook.config.channel} (non-whatsapp, skipped)`);
            }
            break;
        }
      } catch (err) {
        this.logger.warn(`[WooHook] Error executing hook ${hook.id}:`, err);
      }
    }
  }

  /**
   * Send a WhatsApp template notification for a WooHook.
   */
  private async sendWhatsAppNotification(hook: WooHook, event: ContactEvent): Promise<void> {
    const inbox = await this.inboxRepo.findOneBy({ id: hook.config.inboxId });
    if (!inbox || !inbox.accessToken || !inbox.phoneNumberId) {
      this.logger.warn(`[WooHook] Inbox ${hook.config.inboxId} not found or missing credentials`);
      return;
    }

    // Get contact phone
    const contact = await this.contactEventRepo.manager.query(
      'SELECT phone, first_name, last_name, email FROM clients WHERE id = $1',
      [event.recordId],
    );
    const phone = contact?.[0]?.phone;
    if (!phone) {
      this.logger.warn(`[WooHook] No phone for record ${event.recordId}, skipping WhatsApp`);
      return;
    }

    // Resolve variables from event metadata
    const metadata = event.metadata || {};
    const variableMapping = hook.config.variableMapping || {};
    const resolvedVars: Record<string, string> = {};

    const variableValues: Record<string, string> = {
      '{{firstName}}': contact[0]?.first_name || '',
      '{{lastName}}': contact[0]?.last_name || '',
      '{{email}}': contact[0]?.email || '',
      '{{phone}}': phone,
      '{{total}}': event.value ? String(event.value) : (metadata.total || '0'),
      '{{currency}}': event.currency || metadata.currency || 'COP',
      '{{orderNumber}}': metadata.order_number || metadata.orderNumber || '',
      '{{productName}}': metadata.items?.[0]?.name || metadata.product_name || '',
      '{{itemsCount}}': String(metadata.items_count || metadata.itemsCount || ''),
      '{{paymentMethod}}': metadata.payment_method || metadata.paymentMethod || '',
      '{{productSku}}': metadata.product_sku || '',
      '{{quantity}}': String(metadata.quantity || ''),
      '{{formName}}': metadata.form_title || metadata.formName || '',
      '{{username}}': metadata.username || '',
      '{{category}}': metadata.category || '',
    };

    for (const [varNum, varKey] of Object.entries(variableMapping)) {
      resolvedVars[varNum] = variableValues[varKey] || varKey || '';
    }

    // Send via Meta Cloud API
    const cleanPhone = phone.startsWith('+') ? phone.slice(1) : phone;
    const components: any[] = [];
    const bodyParams = Object.entries(resolvedVars)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([, value]) => ({ type: 'text', text: value }));

    if (bodyParams.length > 0) {
      components.push({ type: 'body', parameters: bodyParams });
    }

    const templateLanguage = hook.config.templateLanguage || 'es';

    const requestBody = {
      messaging_product: 'whatsapp',
      to: cleanPhone,
      type: 'template',
      template: {
        name: hook.config.templateName,
        language: { code: templateLanguage },
        components,
      },
    };

    try {
      const response = await fetch(
        `https://graph.facebook.com/v21.0/${inbox.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${inbox.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        },
      );

      const result = await response.json();

      if (response.ok && result.messages?.[0]?.id) {
        this.logger.log(`[WooHook] WhatsApp sent to ${cleanPhone}: messageId=${result.messages[0].id}`);
      } else {
        this.logger.warn(`[WooHook] WhatsApp send failed for ${cleanPhone}:`, result.error || result);
      }
    } catch (error) {
      this.logger.error(`[WooHook] WhatsApp send exception for ${cleanPhone}:`, error);
    }
  }

  /**
   * Get all events for a contact (timeline).
   */
  async getByRecord(recordId: string, limit = 50, offset = 0): Promise<{ data: ContactEvent[]; total: number }> {
    // Validate UUID format to prevent DB errors
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(recordId)) {
      return { data: [], total: 0 };
    }

    const [data, total] = await this.contactEventRepo.findAndCount({
      where: { recordId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
    return { data, total };
  }

  /**
   * Get all events for a tenant.
   */
  async getByTenant(tenantId: string, limit = 50, offset = 0): Promise<{ data: ContactEvent[]; total: number }> {
    const [data, total] = await this.contactEventRepo.findAndCount({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
    return { data, total };
  }

  async delete(id: string): Promise<void> {
    await this.contactEventRepo.delete(id);
  }
}
