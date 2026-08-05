import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Res } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantAccessGuard } from '../auth/tenant-access.guard';
import { RecordsService } from './records.service';

@Controller('records')
@UseGuards(JwtAuthGuard, TenantAccessGuard)
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
    @Query('assignedTo') assignedTo?: string,
    @Query('assignedTeamId') assignedTeamId?: string,
    @Query('filters') filters?: string,
  ) {
    const parsedFilters = filters ? JSON.parse(filters) : undefined;
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
  ) {
    return this.recordsService.getKanbanColumn(tenantId, groupBy, columnValue, search, sortBy, sortOrder, +page, +limit, assignedTo, assignedTeamId);
  }

  @Get('kanban/counts')
  getKanbanCounts(
    @Query('tenantId') tenantId: string,
    @Query('groupBy') groupBy: string,
    @Query('assignedTo') assignedTo?: string,
    @Query('assignedTeamId') assignedTeamId?: string,
  ) {
    return this.recordsService.getKanbanCounts(tenantId, groupBy, assignedTo, assignedTeamId);
  }

  @Get('kanban/initial')
  getKanbanInitial(
    @Query('tenantId') tenantId: string,
    @Query('groupBy') groupBy: string,
    @Query('limit') limit = '20',
    @Query('assignedTo') assignedTo?: string,
    @Query('assignedTeamId') assignedTeamId?: string,
  ) {
    return this.recordsService.getKanbanInitial(tenantId, groupBy, +limit, assignedTo, assignedTeamId);
  }

  @Post('export')
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
  getDistinctValues(@Query('field') field: string) {
    return this.recordsService.getDistinctValues(field);
  }

  @Get('notes')
  getNotes(@Query('recordId') recordId: string, @Query('page') page = '1', @Query('limit') limit = '20') {
    return this.recordsService.getNotes(recordId, +page, +limit);
  }

  @Post('notes')
  createNote(@Body() body: { tenantId: string; recordId: string; content: string; authorId?: string; authorName?: string }) {
    return this.recordsService.createNote(body);
  }

  @Delete('notes/:noteId')
  deleteNote(@Param('noteId') noteId: string) {
    return this.recordsService.deleteNote(noteId);
  }

  @Put('bulk')
  bulkUpdate(@Body() body: { ids?: string[]; filters?: Array<{ field: string; operator: string; value: string }>; tenantId?: string; assignedTo?: string; assignedTeamId?: string; updates: Partial<{ status: string; assignedTo: string | null; assignedTeamId: string | null; tags: string[] }>; actorId?: string; actorName?: string }) {
    if (body.ids && body.ids.length > 0) {
      return this.recordsService.bulkUpdate(body.ids, body.updates, body.actorId, body.actorName);
    }
    // Filter-based bulk update
    return this.recordsService.bulkUpdateByFilter(body.tenantId!, body.updates, body.filters, body.assignedTo, body.assignedTeamId, body.actorId, body.actorName);
  }

  @Delete('bulk')
  bulkDelete(@Body() body: { ids?: string[]; filters?: Array<{ field: string; operator: string; value: string }>; tenantId?: string; assignedTo?: string; assignedTeamId?: string }) {
    if (body.ids && body.ids.length > 0) {
      return this.recordsService.bulkDelete(body.ids);
    }
    return this.recordsService.bulkDeleteByFilter(body.tenantId!, body.filters, body.assignedTo, body.assignedTeamId);
  }

  @Post('bulk/delete-preview')
  deletePreview(@Body() body: { ids?: string[]; filters?: Array<{ field: string; operator: string; value: string }>; tenantId?: string; assignedTo?: string; assignedTeamId?: string }) {
    if (body.ids && body.ids.length > 0) {
      return this.recordsService.getDeletePreview(body.ids);
    }
    return this.recordsService.getDeletePreviewByFilter(body.tenantId!, body.filters, body.assignedTo, body.assignedTeamId);
  }

  @Post('bulk/restore')
  restoreDeleted(@Body() body: { ids: string[] }) {
    return this.recordsService.restoreDeleted(body.ids);
  }

  @Delete('bulk/permanent')
  permanentDelete(@Body() body: { ids: string[] }) {
    return this.recordsService.permanentDelete(body.ids);
  }

  @Get('activities')
  getActivities(@Query('recordId') recordId: string, @Query('page') page = '1', @Query('limit') limit = '30') {
    return this.recordsService.getActivities(recordId, +page, +limit);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.recordsService.findOneById(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: Partial<{ avatarUrl: string; firstName: string; lastName: string; phone: string; countryCode: string; email: string; documentType: string; documentNumber: string; gender: string; birthDate: string; city: string; region: string; status: string; channelSource: string; source: string; score: number; optInWhatsapp: boolean; optInEmail: boolean; assignedTo: string; assignedTeamId: string; tags: string[]; customData: Record<string, any> }>) {
    const data: any = { ...body };
    if (data.birthDate) data.birthDate = new Date(data.birthDate);
    return this.recordsService.updateRecord(id, data);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.recordsService.deleteRecord(id);
  }
}
