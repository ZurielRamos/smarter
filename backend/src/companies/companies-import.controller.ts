import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantAccessGuard } from '../auth/tenant-access.guard';
import { ModuleFeatureGuard } from '../auth/module-feature.guard';
import { RequiresFeature } from '../auth/requires-feature.decorator';
import { CompaniesAccessGuard } from './companies-access.guard';
import { CompaniesImportService } from './companies-import.service';

/**
 * Importación de empresas desde archivo. El archivo se sube y se lee con los
 * endpoints genéricos del ETL (`/etl/parse`, `/etl/parse-async`, con
 * `entity=companies`); aquí van los pasos propios de empresas: campos destino,
 * vistas previas y ejecución. Roles y flag: los mismos que el resto del módulo.
 */
@Controller('companies/:tenantId/import')
@UseGuards(JwtAuthGuard, TenantAccessGuard, CompaniesAccessGuard, ModuleFeatureGuard)
@RequiresFeature('companies')
export class CompaniesImportController {
  constructor(private readonly imports: CompaniesImportService) {}

  @Get('target-fields')
  targetFields() {
    return this.imports.getTargetFields();
  }

  @Post('validate-preview')
  validatePreview(@Param('tenantId', ParseUUIDPipe) _tenantId: string, @Body() body: unknown) {
    return this.imports.validatePreview(this.imports.parseConfig(body));
  }

  @Post('deduplicate-preview')
  deduplicatePreview(@Param('tenantId', ParseUUIDPipe) tenantId: string, @Body() body: unknown) {
    return this.imports.deduplicatePreview(tenantId, this.imports.parseConfig(body));
  }

  @Post('execute')
  execute(@Param('tenantId', ParseUUIDPipe) tenantId: string, @Body() body: unknown, @Req() req: any) {
    return this.imports.start(tenantId, { id: req.user.id, email: req.user.email }, this.imports.parseConfig(body));
  }
}
