import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantAccessGuard } from '../auth/tenant-access.guard';
import { RecordListsService } from './record-lists.service';

@Controller('record-lists')
@UseGuards(JwtAuthGuard, TenantAccessGuard)
export class RecordListsController {
  constructor(private readonly listsService: RecordListsService) {}

  @Get()
  findAll(@Query('tenantId') tenantId: string) {
    return this.listsService.findAllByTenant(tenantId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.listsService.findOne(id);
  }

  @Get(':id/records')
  getRecords(
    @Param('id') id: string,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
  ) {
    return this.listsService.getRecords(id, +page, +limit);
  }

  @Post('preview')
  preview(@Body() body: {
    tenantId: string;
    filters: { groups: { logic: 'and' | 'or'; conditions: { field: string; operator: string; value: string }[] }[]; groupLogic: 'and' | 'or' };
  }) {
    return this.listsService.previewCount(body.tenantId, body.filters);
  }

  @Post()
  create(@Body() body: {
    tenantId: string;
    name: string;
    type: 'static' | 'dynamic';
    filters?: { logic: 'and' | 'or'; conditions: { field: string; operator: string; value: string }[] };
    color?: string;
  }) {
    return this.listsService.create(body);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: { name?: string; filters?: any; color?: string }) {
    return this.listsService.update(id, body);
  }

  @Post(':id/records')
  addRecords(@Param('id') id: string, @Body() body: { recordIds: string[] }) {
    return this.listsService.addRecords(id, body.recordIds);
  }

  @Delete(':id/records')
  removeRecords(@Param('id') id: string, @Body() body: { recordIds: string[] }) {
    return this.listsService.removeRecords(id, body.recordIds);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.listsService.remove(id);
  }
}
