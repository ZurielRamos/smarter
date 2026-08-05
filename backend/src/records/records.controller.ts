import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
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
  ) {
    return this.recordsService.findAll(+page, +limit, tenantId, sortBy, sortOrder, assignedTo, assignedTeamId);
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
