import { Controller, Post, Get, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiTokenGuard } from '../auth/api-token.guard';
import { Tenant } from '../tenants/tenant.entity';
import { ContactEventsService } from './contact-events.service';

/**
 * Public API for contact events (conversion tracking).
 * Route: /api/v1/:slug/contact-events
 * Auth: API Token (header x-api-token)
 */
@Controller('v1/:slug/contact-events')
@UseGuards(ApiTokenGuard)
export class ApiContactEventsController {
  constructor(
    private readonly contactEventsService: ContactEventsService,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
  ) {}

  /**
   * Create a contact event via API.
   * This automatically dispatches conversions to connected ad platforms.
   * If recordId is not provided, matches by phone/email/document or creates a new contact.
   *
   * POST /api/v1/:slug/contact-events
   * Headers: x-api-token: <token>
   * Body: { recordId?, type, name, value?, currency?, metadata?, firstName?, lastName?, phone?, email?, documentNumber? }
   */
  @Post()
  async create(
    @Param('slug') slug: string,
    @Body() body: {
      recordId?: string;
      type: string;
      name: string;
      value?: number;
      currency?: string;
      metadata?: Record<string, any>;
      firstName?: string;
      lastName?: string;
      phone?: string;
      email?: string;
      documentNumber?: string;
    },
  ) {
    const tenant = await this.tenantRepo.findOneBy({ slug });
    if (!tenant) return { error: 'Tenant not found' };

    let recordId = body.recordId;

    // If no recordId, try to find or create the contact
    if (!recordId) {
      recordId = await this.findOrCreateRecord(tenant.id, body);
    }

    return this.contactEventsService.create({
      tenantId: tenant.id,
      recordId,
      type: body.type,
      name: body.name,
      value: body.value,
      currency: body.currency,
      metadata: body.metadata,
      source: 'api',
    });
  }

  /**
   * Find a contact by phone, email, or document. If not found, create one.
   */
  private async findOrCreateRecord(tenantId: string, data: { firstName?: string; lastName?: string; phone?: string; email?: string; documentNumber?: string }): Promise<string> {
    // Try to match by phone
    if (data.phone) {
      const normalizedPhone = data.phone.replace(/^\+/, '');
      const found = await this.tenantRepo.manager.query(
        `SELECT id FROM clients WHERE tenant_id = $1 AND REPLACE(phone, '+', '') = $2 LIMIT 1`,
        [tenantId, normalizedPhone],
      );
      if (found?.[0]?.id) return found[0].id;
    }

    // Try to match by email
    if (data.email) {
      const found = await this.tenantRepo.manager.query(
        `SELECT id FROM clients WHERE tenant_id = $1 AND LOWER(email) = LOWER($2) LIMIT 1`,
        [tenantId, data.email],
      );
      if (found?.[0]?.id) return found[0].id;
    }

    // Try to match by document number
    if (data.documentNumber) {
      const found = await this.tenantRepo.manager.query(
        `SELECT id FROM clients WHERE tenant_id = $1 AND document_number = $2 LIMIT 1`,
        [tenantId, data.documentNumber],
      );
      if (found?.[0]?.id) return found[0].id;
    }

    // No match found — create new contact
    const result = await this.tenantRepo.manager.query(
      `INSERT INTO clients (id, tenant_id, first_name, last_name, phone, email, document_number, status, channel_source, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 'lead', 'api', now(), now())
       RETURNING id`,
      [tenantId, data.firstName || null, data.lastName || null, data.phone || null, data.email || null, data.documentNumber || null],
    );
    return result[0].id;
  }

  /**
   * Get events for a contact.
   * GET /api/v1/:slug/contact-events?recordId=xxx
   */
  @Get()
  async getByRecord(
    @Param('slug') slug: string,
    @Query('recordId') recordId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.contactEventsService.getByRecord(
      recordId,
      limit ? parseInt(limit) : 50,
      offset ? parseInt(offset) : 0,
    );
  }
}
