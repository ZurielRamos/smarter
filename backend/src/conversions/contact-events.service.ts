import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContactEvent } from './contact-event.entity';
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
   * Get all events for a contact (timeline).
   */
  async getByRecord(recordId: string, limit = 50, offset = 0): Promise<{ data: ContactEvent[]; total: number }> {
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
