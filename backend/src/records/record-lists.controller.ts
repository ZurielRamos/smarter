import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantAccessGuard } from '../auth/tenant-access.guard';
import { RecordListsService } from './record-lists.service';
import { ReadAction, TenantRefs, TenantResource, TenantResourceGuard } from '../auth/tenant-resource.guard';

@Controller('record-lists')
@UseGuards(JwtAuthGuard, TenantAccessGuard, TenantResourceGuard)
export class RecordListsController {
  constructor(private readonly listsService: RecordListsService) {}

  @Get()
  findAll(@Query('tenantId') tenantId: string) {
    return this.listsService.findAllByTenant(tenantId);
  }

  @Get(':id')

  @TenantResource('recordList')
  findOne(@Param('id') id: string) {
    return this.listsService.findOne(id);
  }

  @Get(':id/records')

  @TenantResource('recordList')
  getRecords(
    @Param('id') id: string,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
  ) {
    return this.listsService.getRecords(id, +page, +limit);
  }

  @Post('match')

  @ReadAction()
  match(@Body() body: {
    tenantId: string;
    field: 'documentNumber' | 'phone' | 'email' | 'whatsappId';
    values: string[];
  }) {
    return this.listsService.matchRecords(body.tenantId, body.field, body.values);
  }

  @Post('preview')

  @ReadAction()
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

  @TenantResource('recordList')
  update(@Param('id') id: string, @Body() body: { name?: string; filters?: any; color?: string }) {
    return this.listsService.update(id, body);
  }

  @Post(':id/records')

  @TenantResource('recordList')

  @TenantRefs({ kind: 'record', in: 'body', field: 'recordIds', many: true })
  addRecords(@Param('id') id: string, @Body() body: { recordIds: string[] }) {
    return this.listsService.addRecords(id, body.recordIds);
  }

  @Delete(':id/records')

  @TenantResource('recordList')

  @TenantRefs({ kind: 'record', in: 'body', field: 'recordIds', many: true })
  removeRecords(@Param('id') id: string, @Body() body: { recordIds: string[] }) {
    return this.listsService.removeRecords(id, body.recordIds);
  }

  @Delete(':id')

  @TenantResource('recordList')
  remove(@Param('id') id: string) {
    return this.listsService.remove(id);
  }
}
