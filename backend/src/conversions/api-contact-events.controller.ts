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
   *
   * POST /api/v1/:slug/contact-events
   * Headers: x-api-token: <token>
   * Body: { recordId, type, name, value?, currency?, metadata? }
   */
  @Post()
  async create(
    @Param('slug') slug: string,
    @Body() body: {
      recordId: string;
      type: string;
      name: string;
      value?: number;
      currency?: string;
      metadata?: Record<string, any>;
    },
  ) {
    const tenant = await this.tenantRepo.findOneBy({ slug });
    if (!tenant) return { error: 'Tenant not found' };

    return this.contactEventsService.create({
      tenantId: tenant.id,
      recordId: body.recordId,
      type: body.type,
      name: body.name,
      value: body.value,
      currency: body.currency,
      metadata: body.metadata,
      source: 'api',
    });
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
