import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantAccessGuard } from '../auth/tenant-access.guard';
import { ModuleFeatureGuard } from '../auth/module-feature.guard';
import { TenantAdminGuard } from '../auth/tenant-admin.guard';
import { RequiresFeature } from '../auth/requires-feature.decorator';
import { ProjectAction, ProjectsService } from './projects.service';
import { ProjectPublicService } from './project-public.service';
import { ProjectProspectsService } from './project-prospects.service';
import { INITIAL_STATUS, PROSPECT_ROLES, PROSPECT_STATES, ROLE_LABELS } from './prospect-states';
import { Actor } from './validation';

const actorOf = (req: any): Actor => ({ id: req.user.id, email: req.user.email });

/**
 * Proyectos de reclutamiento (solo owner/admin con el módulo activo). El
 * tenant va en la ruta, como en el resto del módulo.
 */
@Controller('reclutamiento/:tenantId/projects')
@UseGuards(JwtAuthGuard, TenantAccessGuard, TenantAdminGuard, ModuleFeatureGuard)
@RequiresFeature('reclutamiento')
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly publicFace: ProjectPublicService,
    private readonly prospects: ProjectProspectsService,
  ) {}

  @Get()
  list(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.projects.list(tenantId, { status, search, page, limit });
  }

  @Post()
  @Throttle({ medium: { limit: 20, ttl: 60_000 } })
  create(@Param('tenantId', ParseUUIDPipe) tenantId: string, @Body() body: Record<string, unknown>, @Req() req: any) {
    return this.projects.create(tenantId, actorOf(req), body ?? {});
  }

  /** Perfiles y estados de los prospectos (catálogo fijo). Va antes de `:id`. */
  @Get('prospect-states')
  prospectStates() {
    return { roles: PROSPECT_ROLES.map((key) => ({ key, label: ROLE_LABELS[key] })), states: PROSPECT_STATES, initial: INITIAL_STATUS };
  }

  /** Proyectos donde un contacto del CRM tiene prospectos vinculados. Va antes de `:id`. */
  @Get('by-record/:recordId')
  byRecord(@Param('tenantId', ParseUUIDPipe) tenantId: string, @Param('recordId', ParseUUIDPipe) recordId: string) {
    return this.prospects.forRecord(tenantId, recordId);
  }

  @Get(':id')
  detail(@Param('tenantId', ParseUUIDPipe) tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.projects.detail(tenantId, id);
  }

  @Patch(':id')
  update(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: any,
  ) {
    return this.projects.update(tenantId, actorOf(req), id, body ?? {});
  }

  @Delete(':id')
  remove(@Param('tenantId', ParseUUIDPipe) tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.projects.remove(tenantId, actorOf(req), id);
  }

  // ── Ciclo de vida ──

  private transition(action: ProjectAction) {
    return (tenantId: string, id: string, req: any) => this.projects.transition(tenantId, actorOf(req), id, action);
  }

  @Post(':id/activate')
  activate(@Param('tenantId', ParseUUIDPipe) tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.transition('activate')(tenantId, id, req);
  }

  @Post(':id/pause')
  pause(@Param('tenantId', ParseUUIDPipe) tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.transition('pause')(tenantId, id, req);
  }

  @Post(':id/resume')
  resume(@Param('tenantId', ParseUUIDPipe) tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.transition('resume')(tenantId, id, req);
  }

  @Post(':id/end')
  end(@Param('tenantId', ParseUUIDPipe) tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.transition('end')(tenantId, id, req);
  }

  // ── Cara pública: landing, formulario y registro ──

  @Get(':id/public')
  publicFaceOf(@Param('tenantId', ParseUUIDPipe) tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.publicFace.get(tenantId, id);
  }

  @Put(':id/public/settings')
  updateSettings(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: any,
  ) {
    return this.publicFace.updateSettings(tenantId, actorOf(req), id, body ?? {});
  }

  @Put(':id/public/landing')
  async updateLanding(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: any,
  ) {
    return { landing: await this.publicFace.updateLanding(tenantId, actorOf(req), id, body ?? {}) };
  }

  @Post(':id/public/landing/images/:slot')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  uploadLandingImage(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('slot') slot: string,
    @UploadedFile() file: any,
  ) {
    return this.publicFace.uploadLandingImage(tenantId, id, slot, file);
  }

  @Put(':id/public/form')
  async updateForm(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: any,
  ) {
    return { form: await this.publicFace.updateForm(tenantId, actorOf(req), id, body ?? {}) };
  }

  // ── Prospectos ──

  @Get(':id/prospects')
  listProspects(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('search') search?: string,
    @Query('linked') linked?: string,
    @Query('status') status?: string,
    @Query('role') role?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.prospects.list(tenantId, id, { search, linked, status, role, page, limit });
  }

  /** Agrega un contacto del CRM al proyecto (p. ej. desde un chat). */
  @Post(':id/prospects')
  @Throttle({ medium: { limit: 30, ttl: 60_000 } })
  addProspect(@Param('tenantId', ParseUUIDPipe) tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: Record<string, unknown>, @Req() req: any) {
    return this.prospects.addRecord(tenantId, actorOf(req), id, body?.recordId, body?.role, body?.status);
  }

  /** Vincula automáticamente los prospectos que coinciden con un único contacto. Va antes de `:prospectId`. */
  @Post(':id/prospects/auto-link')
  @Throttle({ medium: { limit: 10, ttl: 60_000 } })
  autoLink(@Param('tenantId', ParseUUIDPipe) tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.prospects.autoLink(tenantId, actorOf(req), id);
  }

  @Get(':id/prospects/:prospectId/candidates')
  candidates(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('prospectId', ParseUUIDPipe) prospectId: string,
    @Query('search') search?: string,
  ) {
    return this.prospects.candidates(tenantId, id, prospectId, search);
  }

  @Put(':id/prospects/:prospectId/status')
  setProspectStatus(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('prospectId', ParseUUIDPipe) prospectId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: any,
  ) {
    return this.prospects.setStatus(tenantId, actorOf(req), id, prospectId, body ?? {});
  }

  @Put(':id/prospects/:prospectId/role')
  setProspectRole(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('prospectId', ParseUUIDPipe) prospectId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: any,
  ) {
    return this.prospects.setRole(tenantId, actorOf(req), id, prospectId, body ?? {});
  }

  @Put(':id/prospects/:prospectId/rating')
  rateProspect(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('prospectId', ParseUUIDPipe) prospectId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: any,
  ) {
    return this.prospects.rate(tenantId, actorOf(req), id, prospectId, body ?? {});
  }

  @Get(':id/prospects/:prospectId/history')
  prospectHistory(@Param('tenantId', ParseUUIDPipe) tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Param('prospectId', ParseUUIDPipe) prospectId: string) {
    return this.prospects.history(tenantId, id, prospectId);
  }

  @Put(':id/prospects/:prospectId/link')
  link(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('prospectId', ParseUUIDPipe) prospectId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: any,
  ) {
    return this.prospects.link(tenantId, actorOf(req), id, prospectId, body?.recordId);
  }

  @Delete(':id/prospects/:prospectId/link')
  unlink(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('prospectId', ParseUUIDPipe) prospectId: string,
    @Req() req: any,
  ) {
    return this.prospects.unlink(tenantId, actorOf(req), id, prospectId);
  }

  @Delete(':id/prospects/:prospectId')
  removeProspect(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('prospectId', ParseUUIDPipe) prospectId: string,
    @Req() req: any,
  ) {
    return this.prospects.remove(tenantId, actorOf(req), id, prospectId);
  }
}
