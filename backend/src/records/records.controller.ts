import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { RecordsService } from './records.service';

@Controller('records')
export class RecordsController {
  constructor(private readonly recordsService: RecordsService) {}

  @Post()
  create(@Body() body: { tenantId: string; firstName?: string; lastName?: string; phone?: string; email?: string; status?: string; channelSource?: string; tags?: string[]; customData?: Record<string, any> }) {
    return this.recordsService.createRecord(body);
  }

  @Get()
  findAll(
    @Query('page') page = '1',
    @Query('limit') limit = '50',
    @Query('tenantId') tenantId?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'ASC' | 'DESC',
  ) {
    return this.recordsService.findAll(+page, +limit, tenantId, sortBy, sortOrder);
  }

  @Get('stats')
  getStats(@Query('tenantId') tenantId?: string) {
    return this.recordsService.getStats(tenantId);
  }

  @Get('distinct-values')
  getDistinctValues(@Query('field') field: string) {
    return this.recordsService.getDistinctValues(field);
  }
}
