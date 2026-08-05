import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ContactEventsService } from './contact-events.service';

@Controller('contact-events')
@UseGuards(JwtAuthGuard)
export class ContactEventsController {
  constructor(private readonly contactEventsService: ContactEventsService) {}

  /** Create a contact event (from agent UI) */
  @Post()
  create(@Body() body: {
    tenantId: string;
    recordId: string;
    type: string;
    name: string;
    value?: number;
    currency?: string;
    metadata?: Record<string, any>;
    actorId?: string;
    actorName?: string;
  }) {
    return this.contactEventsService.create({
      ...body,
      source: 'manual',
    });
  }

  /** Get events for a specific contact (timeline) */
  @Get()
  getByRecord(
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

  /** Get all events for a tenant */
  @Get('tenant')
  getByTenant(
    @Query('tenantId') tenantId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.contactEventsService.getByTenant(
      tenantId,
      limit ? parseInt(limit) : 50,
      offset ? parseInt(offset) : 0,
    );
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.contactEventsService.delete(id);
  }
}
