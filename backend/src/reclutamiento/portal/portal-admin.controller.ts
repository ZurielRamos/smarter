import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, Req, StreamableFile, UseGuards, Res } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { TenantAccessGuard } from '../../auth/tenant-access.guard';
import { ModuleFeatureGuard } from '../../auth/module-feature.guard';
import { TenantAdminGuard } from '../../auth/tenant-admin.guard';
import { RequiresFeature } from '../../auth/requires-feature.decorator';
import { ContractsService } from '../contracts.service';
import { Actor } from '../validation';
import { PortalConfigService } from './portal-config.service';
import { PortalInvitationsService } from './portal-invitations.service';
import { ProfileDocumentsService } from './profile-documents.service';

/**
 * Administración del portal del encuestador (solo owner/admin de la cuenta):
 * configuración, invitaciones, revisión de documentos y envío de contratos.
 */
@Controller('reclutamiento/:tenantId')
@UseGuards(JwtAuthGuard, TenantAccessGuard, TenantAdminGuard, ModuleFeatureGuard)
@RequiresFeature('reclutamiento')
export class PortalAdminController {
  constructor(
    private readonly portalConfig: PortalConfigService,
    private readonly invitations: PortalInvitationsService,
    private readonly documents: ProfileDocumentsService,
    private readonly contracts: ContractsService,
  ) {}

  private actor(req: any): Actor {
    return { id: req.user.id, email: req.user.email };
  }

  // ── Configuración ──

  @Get('portal-config')
  async getConfig(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return {
      config: await this.portalConfig.get(tenantId),
      fields: await this.portalConfig.fieldCatalog(tenantId),
    };
  }

  @Put('portal-config')
  async updateConfig(@Param('tenantId', ParseUUIDPipe) tenantId: string, @Body() body: Record<string, unknown>, @Req() req: any) {
    return { config: await this.portalConfig.update(tenantId, this.actor(req), body ?? {}) };
  }

  @Get('portal-config/whatsapp-inboxes')
  inboxes(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.portalConfig.listInboxes(tenantId);
  }

  @Get('portal-config/whatsapp-templates')
  templates(@Param('tenantId', ParseUUIDPipe) tenantId: string, @Query('inboxId', ParseUUIDPipe) inboxId: string) {
    return this.portalConfig.listTemplates(tenantId, inboxId);
  }

  // ── Invitaciones y estado ──

  @Post('profiles/:profileId/invite')
  invite(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Req() req: any,
  ) {
    return this.invitations.invite(tenantId, this.actor(req), profileId);
  }

  @Get('profiles/:profileId/portal')
  status(@Param('tenantId', ParseUUIDPipe) tenantId: string, @Param('profileId', ParseUUIDPipe) profileId: string) {
    return this.invitations.status(tenantId, profileId);
  }

  // ── Documentos ──

  @Get('documents/:id/file')
  async file(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
  ) {
    const { doc, data } = await this.documents.read(tenantId, null, id, this.actor(req));
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', 'Content-Security-Policy': "sandbox; default-src 'none'" });
    return new StreamableFile(data, { type: doc.mimeType, disposition: `inline; filename="${encodeURIComponent(doc.fileName)}"` });
  }

  @Post('documents/:id/review')
  async review(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: any,
  ) {
    const doc = await this.documents.review(tenantId, this.actor(req), id, body ?? {});
    return { id: doc.id, status: doc.status, rejectReason: doc.rejectReason };
  }

  // ── Contratos en el portal ──

  @Post('contracts/:contractId/send')
  send(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('contractId', ParseUUIDPipe) contractId: string,
    @Req() req: any,
  ) {
    return this.contracts.sendToContact(tenantId, this.actor(req), contractId);
  }

  @Post('contracts/:contractId/withdraw')
  withdraw(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('contractId', ParseUUIDPipe) contractId: string,
    @Req() req: any,
  ) {
    return this.contracts.withdrawFromContact(tenantId, this.actor(req), contractId);
  }
}
