import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantAccessGuard } from '../auth/tenant-access.guard';
import { ModuleFeatureGuard } from '../auth/module-feature.guard';
import { TenantAdminGuard } from '../auth/tenant-admin.guard';
import { RequiresFeature } from '../auth/requires-feature.decorator';
import { TenantAuditService } from '../audit/tenant-audit.service';
import { ProfilesService } from './profiles.service';
import { ContractsService } from './contracts.service';
import { PaymentMethodsService } from './payment-methods.service';
import { ContractTemplatesService } from './contract-templates.service';
import { Actor, clampInt } from './validation';

/**
 * API del módulo Reclutamiento (cuenta reclutadora: encuestadores, contratos y
 * datos de pago).
 *
 * Todas las rutas llevan el tenant en la RUTA (`:tenantId`). Los guards
 * (acceso al tenant, feature flag y rol de administrador) leen ese mismo
 * parámetro, así que el tenant autorizado y el tenant sobre el que se opera
 * son siempre el mismo. Los servicios filtran por tenantId en cada consulta.
 */
@Controller('reclutamiento/:tenantId')
@UseGuards(JwtAuthGuard, TenantAccessGuard, TenantAdminGuard, ModuleFeatureGuard)
@RequiresFeature('reclutamiento')
export class ReclutamientoController {
  constructor(
    private readonly profiles: ProfilesService,
    private readonly contracts: ContractsService,
    private readonly paymentMethods: PaymentMethodsService,
    private readonly templates: ContractTemplatesService,
    private readonly audit: TenantAuditService,
  ) {}

  private actor(req: any): Actor {
    return { id: req.user.id, email: req.user.email };
  }

  // ── Encuestadores (perfiles) ──

  @Get('profiles')
  list(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.profiles.list(tenantId, { status, search, page, limit });
  }

  @Post('profiles')
  create(@Param('tenantId', ParseUUIDPipe) tenantId: string, @Body() body: Record<string, unknown>, @Req() req: any) {
    return this.profiles.create(tenantId, this.actor(req), body ?? {});
  }

  @Get('profiles/:profileId')
  detail(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('profileId', ParseUUIDPipe) profileId: string,
  ) {
    return this.profiles.detail(tenantId, profileId);
  }

  @Patch('profiles/:profileId')
  updateData(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: any,
  ) {
    return this.profiles.updateData(tenantId, this.actor(req), profileId, body ?? {});
  }

  @Post('profiles/:profileId/activate')
  activate(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Req() req: any,
  ) {
    return this.profiles.activate(tenantId, this.actor(req), profileId);
  }

  @Post('profiles/:profileId/suspend')
  suspend(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: any,
  ) {
    return this.profiles.suspend(tenantId, this.actor(req), profileId, body ?? {});
  }

  @Post('profiles/:profileId/end')
  end(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: any,
  ) {
    return this.profiles.end(tenantId, this.actor(req), profileId, body ?? {});
  }

  @Post('profiles/:profileId/reopen')
  reopen(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Req() req: any,
  ) {
    return this.profiles.reopen(tenantId, this.actor(req), profileId);
  }

  // ── Contratos ──

  @Post('profiles/:profileId/contracts')
  createContract(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: any,
  ) {
    return this.contracts.create(tenantId, this.actor(req), profileId, body ?? {});
  }

  @Patch('contracts/:contractId')
  updateContract(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('contractId', ParseUUIDPipe) contractId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: any,
  ) {
    return this.contracts.update(tenantId, this.actor(req), contractId, body ?? {});
  }

  @Post('contracts/:contractId/activate')
  activateContract(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('contractId', ParseUUIDPipe) contractId: string,
    @Req() req: any,
  ) {
    return this.contracts.activate(tenantId, this.actor(req), contractId);
  }

  @Post('contracts/:contractId/end')
  endContract(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('contractId', ParseUUIDPipe) contractId: string,
    @Req() req: any,
  ) {
    return this.contracts.end(tenantId, this.actor(req), contractId);
  }

  @Delete('contracts/:contractId')
  removeContract(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('contractId', ParseUUIDPipe) contractId: string,
    @Req() req: any,
  ) {
    return this.contracts.remove(tenantId, this.actor(req), contractId);
  }

  @Post('contracts/:contractId/sign')
  signContract(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('contractId', ParseUUIDPipe) contractId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: any,
  ) {
    return this.contracts.sign(tenantId, this.actor(req), contractId, body ?? {});
  }

  @Get('contracts/:contractId/document')
  contractDocument(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('contractId', ParseUUIDPipe) contractId: string,
  ) {
    return this.contracts.document(tenantId, contractId);
  }

  // ── Plantillas de contrato ──

  /** Variables del desplegable «{{» (incluye los campos del CRM de la cuenta), modelos por país y filtros. */
  @Get('contract-catalog')
  contractCatalog(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.templates.catalog(tenantId);
  }

  @Get('templates')
  listTemplates(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Query('status') status?: string,
    @Query('countryCode') countryCode?: string,
  ) {
    return this.templates.list(tenantId, { status, countryCode });
  }

  @Post('templates')
  createTemplate(@Param('tenantId', ParseUUIDPipe) tenantId: string, @Body() body: Record<string, unknown>, @Req() req: any) {
    return this.templates.create(tenantId, this.actor(req), body ?? {});
  }

  // Estática antes de `templates/:id` para que «preview» no se lea como un id.
  @Post('templates/preview')
  previewTemplate(@Param('tenantId', ParseUUIDPipe) tenantId: string, @Body() body: Record<string, unknown>) {
    return this.templates.preview(tenantId, body ?? {});
  }

  @Get('templates/:id')
  getTemplate(@Param('tenantId', ParseUUIDPipe) tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.templates.requireTemplate(tenantId, id);
  }

  @Patch('templates/:id')
  updateTemplate(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: any,
  ) {
    return this.templates.update(tenantId, this.actor(req), id, body ?? {});
  }

  @Delete('templates/:id')
  removeTemplate(@Param('tenantId', ParseUUIDPipe) tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.templates.remove(tenantId, this.actor(req), id);
  }

  @Post('templates/:id/validate')
  validateTemplate(@Param('tenantId', ParseUUIDPipe) tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.templates.validate(tenantId, id);
  }

  @Post('templates/:id/publish')
  publishTemplate(@Param('tenantId', ParseUUIDPipe) tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.templates.publish(tenantId, this.actor(req), id);
  }

  @Post('templates/:id/new-version')
  newTemplateVersion(@Param('tenantId', ParseUUIDPipe) tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.templates.newVersion(tenantId, this.actor(req), id);
  }

  @Post('templates/:id/archive')
  archiveTemplate(@Param('tenantId', ParseUUIDPipe) tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.templates.archive(tenantId, this.actor(req), id);
  }

  @Post('templates/:id/duplicate')
  duplicateTemplate(@Param('tenantId', ParseUUIDPipe) tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.templates.duplicate(tenantId, this.actor(req), id);
  }

  // ── Métodos de pago ──

  @Post('profiles/:profileId/payment-methods')
  createPaymentMethod(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: any,
  ) {
    return this.paymentMethods.create(tenantId, this.actor(req), profileId, body ?? {});
  }

  @Patch('payment-methods/:id')
  updatePaymentMethod(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: any,
  ) {
    return this.paymentMethods.update(tenantId, this.actor(req), id, body ?? {});
  }

  @Post('payment-methods/:id/verify')
  verifyPaymentMethod(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
  ) {
    return this.paymentMethods.verify(tenantId, this.actor(req), id);
  }

  @Post('payment-methods/:id/default')
  setDefaultPaymentMethod(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
  ) {
    return this.paymentMethods.setDefault(tenantId, this.actor(req), id);
  }

  /** POST (no GET) porque cada lectura de datos descifrados queda auditada. */
  @Post('payment-methods/:id/reveal')
  revealPaymentMethod(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
  ) {
    return this.paymentMethods.reveal(tenantId, this.actor(req), id);
  }

  @Delete('payment-methods/:id')
  removePaymentMethod(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
  ) {
    return this.paymentMethods.remove(tenantId, this.actor(req), id);
  }

  // ── Auditoría ──

  @Get('audit')
  auditLog(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Query('profileId') profileId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.audit.find(tenantId, {
      scopeId: profileId,
      limit: clampInt(limit, 50, 1, 200),
      offset: clampInt(offset, 0, 0, 1_000_000),
    });
  }
}
