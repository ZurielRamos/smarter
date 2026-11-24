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
import { RequiresFeature } from '../auth/requires-feature.decorator';
import { Actor } from '../reclutamiento/validation';
import { CompaniesAccessGuard, CompaniesAdminOnly } from './companies-access.guard';
import { CompaniesBulkService } from './companies-bulk.service';
import { CompaniesService } from './companies.service';

/**
 * API del módulo Empresas. El tenant va en la RUTA (`:tenantId`) para que los
 * guards y el servicio usen siempre el mismo valor. Requiere el flag
 * `companies` de la cuenta (apagado por defecto).
 */
@Controller('companies/:tenantId')
@UseGuards(JwtAuthGuard, TenantAccessGuard, CompaniesAccessGuard, ModuleFeatureGuard)
@RequiresFeature('companies')
export class CompaniesController {
  constructor(
    private readonly companies: CompaniesService,
    private readonly bulk: CompaniesBulkService,
  ) {}

  private actor(req: any): Actor {
    return { id: req.user.id, email: req.user.email };
  }

  @Get()
  list(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Query('search') search?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('parentId') parentId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.companies.list(tenantId, { search, type, status, parentId, page, limit });
  }

  @Get('map')
  map(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Query('search') search?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('parentId') parentId?: string,
  ) {
    return this.companies.mapPoints(tenantId, { search, type, status, parentId });
  }

  @Get('by-contact/:recordId')
  byContact(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('recordId', ParseUUIDPipe) recordId: string,
  ) {
    return this.companies.byContact(tenantId, recordId);
  }

  @Post('migrate-from-contacts')
  @CompaniesAdminOnly()
  migrate(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() body: { dryRun?: unknown },
    @Req() req: any,
  ) {
    return this.bulk.migrateFromContacts(tenantId, this.actor(req), body?.dryRun !== false);
  }

  @Post()
  create(@Param('tenantId', ParseUUIDPipe) tenantId: string, @Body() body: unknown, @Req() req: any) {
    return this.companies.create(tenantId, this.actor(req), body);
  }

  @Get(':id')
  detail(@Param('tenantId', ParseUUIDPipe) tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.companies.detail(tenantId, id);
  }

  @Patch(':id')
  update(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @Req() req: any,
  ) {
    return this.companies.update(tenantId, this.actor(req), id, body);
  }

  @Delete(':id')
  remove(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
  ) {
    return this.companies.remove(tenantId, this.actor(req), id);
  }

  @Post(':id/contacts')
  linkContact(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @Req() req: any,
  ) {
    return this.companies.linkContact(tenantId, this.actor(req), id, body);
  }

  @Delete(':id/contacts/:linkId')
  unlinkContact(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('linkId', ParseUUIDPipe) linkId: string,
    @Req() req: any,
  ) {
    return this.companies.unlinkContact(tenantId, this.actor(req), id, linkId);
  }
}
