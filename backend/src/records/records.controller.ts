import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Res, Req, BadRequestException } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantAccessGuard } from '../auth/tenant-access.guard';
import { RecordsService } from './records.service';
import { parseRecordFilters } from './record-filters';
import { ReadAction, TenantRefs, TenantResource, TenantResourceGuard } from '../auth/tenant-resource.guard';

@Controller('records')
@UseGuards(JwtAuthGuard, TenantAccessGuard, TenantResourceGuard)
export class RecordsController {
  constructor(private readonly recordsService: RecordsService) {}

  @Post()
  create(@Body() body: { tenantId: string; firstName?: string; lastName?: string; company?: string; jobTitle?: string; phone?: string; email?: string; website?: string; status?: string; channelSource?: string; tags?: string[]; notes?: string; customData?: Record<string, any> }) {
    return this.recordsService.createRecord(body);
  }

  @Get()
  findAll(
    @Query('page') page = '1',
    @Query('limit') limit = '50',
    @Query('tenantId') tenantId?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'ASC' | 'DESC',
    @Query('assignedTo') assignedTo?: string,
    @Query('assignedTeamId') assignedTeamId?: string,
    @Query('filters') filters?: string,
  ) {
    const parsedFilters = parseRecordFilters(filters);
    return this.recordsService.findAll(+page, +limit, tenantId, sortBy, sortOrder, assignedTo, assignedTeamId, parsedFilters);
  }

  @Get('stats')
  getStats(@Query('tenantId') tenantId?: string) {
    return this.recordsService.getStats(tenantId);
  }

  @Get('dashboard-metrics')
  getDashboardMetrics(@Query('tenantId') tenantId?: string) {
    return this.recordsService.getDashboardMetrics(tenantId);
  }

  @Get('kanban')
  getKanban(
    @Query('tenantId') tenantId: string,
    @Query('groupBy') groupBy: string,
    @Query('columnValue') columnValue: string,
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'ASC' | 'DESC',
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('assignedTo') assignedTo?: string,
    @Query('assignedTeamId') assignedTeamId?: string,
    @Query('filters') filters?: string,
  ) {
    return this.recordsService.getKanbanColumn(tenantId, groupBy, columnValue, search, sortBy, sortOrder, +page || 1, +limit || 20, assignedTo, assignedTeamId, parseRecordFilters(filters));
  }

  @Get('kanban/counts')
  getKanbanCounts(
    @Query('tenantId') tenantId: string,
    @Query('groupBy') groupBy: string,
    @Query('assignedTo') assignedTo?: string,
    @Query('assignedTeamId') assignedTeamId?: string,
    @Query('filters') filters?: string,
  ) {
    return this.recordsService.getKanbanCounts(tenantId, groupBy, assignedTo, assignedTeamId, parseRecordFilters(filters));
  }

  @Get('kanban/initial')
  getKanbanInitial(
    @Query('tenantId') tenantId: string,
    @Query('groupBy') groupBy: string,
    @Query('limit') limit = '20',
    @Query('assignedTo') assignedTo?: string,
    @Query('assignedTeamId') assignedTeamId?: string,
    @Query('filters') filters?: string,
  ) {
    return this.recordsService.getKanbanInitial(tenantId, groupBy, +limit || 20, assignedTo, assignedTeamId, parseRecordFilters(filters));
  }

  @Post('export')

  @ReadAction()
  async exportCsv(
    @Body() body: {
      tenantId: string;
      fields: Array<{ key: string; label: string }>;
      filters?: Array<{ field: string; operator: string; value: string }>;
      assignedTo?: string;
      assignedTeamId?: string;
      separator?: string;
      includeHeaders?: boolean;
      dateFormat?: string;
    },
    @Res() res: Response,
  ) {
    const csv = await this.recordsService.exportCsv(body);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="contactos_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send('\uFEFF' + csv);
  }

  @Get('deleted')
  getDeleted(
    @Query('tenantId') tenantId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '25',
    @Query('search') search?: string,
  ) {
    return this.recordsService.getDeleted(tenantId, +page, +limit, search);
  }

  @Get('search')
  globalSearch(
    @Query('tenantId') tenantId: string,
    @Query('q') query: string,
    @Query('limit') limit = '10',
  ) {
    return this.recordsService.globalSearch(tenantId, query, +limit);
  }

  @Get('distinct-values')
  getDistinctValues(@Query('field') field: string, @Query('tenantId') tenantId?: string) {
    return this.recordsService.getDistinctValues(field, tenantId);
  }

  @Get('notes')

  @TenantRefs({ kind: 'record', in: 'query', field: 'recordId' })
  getNotes(@Query('recordId') recordId: string, @Query('page') page = '1', @Query('limit') limit = '20') {
    return this.recordsService.getNotes(recordId, +page, +limit);
  }

  @Post('notes')

  @TenantRefs({ kind: 'record', in: 'body', field: 'recordId' })
  createNote(@Body() body: { tenantId: string; recordId: string; content: string; authorId?: string; authorName?: string }) {
    return this.recordsService.createNote(body);
  }

  @Delete('notes/:noteId')

  @TenantResource('recordNote', 'noteId')
  deleteNote(@Param('noteId') noteId: string) {
    return this.recordsService.deleteNote(noteId);
  }

  @Put('bulk')

  @TenantRefs({ kind: 'record', in: 'body', field: 'ids', many: true })
  bulkUpdate(@Body() body: { ids?: string[]; filters?: Array<{ field: string; operator: string; value: string }>; tenantId?: string; assignedTo?: string; assignedTeamId?: string; updates: Partial<{ status: string; assignedTo: string | null; assignedTeamId: string | null; tags: string[]; customData: Record<string, any> }>; actorId?: string; actorName?: string }) {
    if (body.ids && body.ids.length > 0) {
      return this.recordsService.bulkUpdate(body.ids, body.updates, body.actorId, body.actorName);
    }
    // Filter-based bulk update
    return this.recordsService.bulkUpdateByFilter(body.tenantId!, body.updates, body.filters, body.assignedTo, body.assignedTeamId, body.actorId, body.actorName);
  }

  @Delete('bulk')

  @TenantRefs({ kind: 'record', in: 'body', field: 'ids', many: true })
  bulkDelete(@Body() body: { ids?: string[]; filters?: Array<{ field: string; operator: string; value: string }>; tenantId?: string; assignedTo?: string; assignedTeamId?: string }) {
    if (body.ids && body.ids.length > 0) {
      return this.recordsService.bulkDelete(body.ids);
    }
    return this.recordsService.bulkDeleteByFilter(body.tenantId!, body.filters, body.assignedTo, body.assignedTeamId);
  }

  @Post('bulk/delete-preview')

  @ReadAction()

  @TenantRefs({ kind: 'record', in: 'body', field: 'ids', many: true })
  deletePreview(@Body() body: { ids?: string[]; filters?: Array<{ field: string; operator: string; value: string }>; tenantId?: string; assignedTo?: string; assignedTeamId?: string }) {
    if (body.ids && body.ids.length > 0) {
      return this.recordsService.getDeletePreview(body.ids);
    }
    return this.recordsService.getDeletePreviewByFilter(body.tenantId!, body.filters, body.assignedTo, body.assignedTeamId);
  }

  @Post('bulk/restore')

  @TenantRefs({ kind: 'record', in: 'body', field: 'ids', many: true })
  restoreDeleted(@Body() body: { ids: string[] }) {
    return this.recordsService.restoreDeleted(body.ids);
  }

  @Delete('bulk/permanent')

  @TenantRefs({ kind: 'record', in: 'body', field: 'ids', many: true })
  permanentDelete(@Body() body: { ids: string[] }) {
    return this.recordsService.permanentDelete(body.ids);
  }

  /** Historial de touchpoints (origen/atribución) de un contacto. tenantId es obligatorio. */
  @Get('touchpoints')
  @TenantRefs({ kind: 'record', in: 'query', field: 'recordId' })
  getTouchpoints(
    @Query('tenantId') tenantId: string,
    @Query('recordId') recordId: string,
    @Query('limit') limit = '50',
  ) {
    if (!tenantId || !recordId) {
      throw new BadRequestException('tenantId y recordId son obligatorios');
    }
    return this.recordsService.getTouchpoints(tenantId, recordId, +limit || 50);
  }

  @Get('activities')

  @TenantRefs({ kind: 'record', in: 'query', field: 'recordId' })
  getActivities(@Query('recordId') recordId: string, @Query('page') page = '1', @Query('limit') limit = '30') {
    return this.recordsService.getActivities(recordId, +page, +limit);
  }

  @Post('normalize-phones/preview')

  @ReadAction()
  previewPhoneNormalization(
    @Body() body: { tenantId: string; country?: string; cleanFormat?: boolean; custom?: { code?: string; digits?: number[] } },
  ) {
    return this.recordsService.previewPhoneNormalization(
      body.tenantId,
      body.country || 'CO',
      body.cleanFormat !== false,
      body.custom,
    );
  }

  @Post('normalize-phones/apply')
  applyPhoneNormalization(
    @Body() body: { tenantId: string; country?: string; cleanFormat?: boolean; custom?: { code?: string; digits?: number[] } },
    @Req() req: any,
  ) {
    return this.recordsService.applyPhoneNormalization(
      body.tenantId,
      body.country || 'CO',
      body.cleanFormat !== false,
      { actorId: req.user?.id, actorName: req.user?.name },
      body.custom,
    );
  }

  @Post('duplicates/detect')

  @ReadAction()
  detectDuplicates(@Body() body: { tenantId: string; criteria?: string[] }) {
    return this.recordsService.detectDuplicates(body.tenantId, body.criteria);
  }

  @Post('duplicates/merge')

  @TenantRefs({ kind: 'record', in: 'body', field: 'winnerId' }, { kind: 'record', in: 'body', field: 'loserIds', many: true })
  mergeRecords(
    @Body() body: { tenantId: string; winnerId: string; loserIds: string[] },
    @Req() req: any,
  ) {
    return this.recordsService.mergeRecords(
      body.tenantId,
      body.winnerId,
      body.loserIds,
      { actorId: req.user?.id, actorName: req.user?.name },
    );
  }

  @Get(':id')

  @TenantResource('record')
  findOne(@Param('id') id: string) {
    return this.recordsService.findOneById(id);
  }

  @Put(':id')

  @TenantResource('record')
  update(@Param('id') id: string, @Body() body: Partial<{ avatarUrl: string; firstName: string; lastName: string; company: string; jobTitle: string; phone: string; countryCode: string; email: string; website: string; documentType: string; documentNumber: string; gender: string; birthDate: string; city: string; region: string; address: string; status: string; channelSource: string; source: string; score: number; optInWhatsapp: boolean; optInEmail: boolean; assignedTo: string; assignedTeamId: string; tags: string[]; notes: string; customData: Record<string, any> }>, @Req() req: any) {
    // La cuenta y la identidad del contacto no se cambian desde el cliente.
    const { id: _id, tenantId: _tenantId, tenant: _tenant, deletedAt: _deletedAt, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = body as Record<string, any>;
    const data: any = { ...rest };
    if (data.birthDate) data.birthDate = new Date(data.birthDate);
    return this.recordsService.updateRecord(id, data, { actorId: req.user?.id, actorName: req.user?.name });
  }

  @Delete(':id')

  @TenantResource('record')
  remove(@Param('id') id: string) {
    return this.recordsService.deleteRecord(id);
  }
}
