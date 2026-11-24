import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantAccessGuard } from '../auth/tenant-access.guard';
import { TenantResourceService } from '../auth/tenant-resource.guard';
import { EtlService } from './etl.service';
import { CreateImportDto, ValidatePreviewDto, DeduplicatePreviewDto } from './dto/create-import.dto';
import type { ImportEntity } from './entities/import-job.entity';
import { AuthOnly, ReadAction, TenantResource, TenantResourceGuard } from '../auth/tenant-resource.guard';

/** Tipo de importación pedido por el cliente; cualquier valor desconocido es contactos. */
function toEntity(value?: string): ImportEntity {
  return value === 'companies' ? 'companies' : 'contacts';
}

@Controller('etl')
@UseGuards(JwtAuthGuard, TenantAccessGuard, TenantResourceGuard)
export class EtlController {
  constructor(
    private readonly etlService: EtlService,
    private readonly tenantResources: TenantResourceService,
  ) {}

  // ===========================
  // FILE PARSING
  // ===========================

  @Get('target-fields')

  @AuthOnly()
  getTargetFields() {
    return this.etlService.getTargetFields();
  }

  @Post('parse')

  @AuthOnly()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    }),
  )
  parseFile(@UploadedFile() file: Express.Multer.File) {
    return this.etlService.parseFile(file);
  }

  /** Async parse: upload file, queue parsing, return job immediately */
  @Post('parse-async')
  @AuthOnly()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    }),
  )
  parseFileAsync(@Req() req: any, @UploadedFile() file: Express.Multer.File, @Body() body: { tenantId?: string; entity?: string }) {
    // Multipart: el guard no ve el cuerpo, la cuenta se comprueba aquí.
    this.tenantResources.assertMember(req.user, body.tenantId, { write: true });
    return this.etlService.parseFileAsync(file, body.tenantId, toEntity(body.entity));
  }

  /** Get the current pending/parsing job for a tenant (for resuming) */
  @Get('active-job')
  getActiveJob(@Query('tenantId') tenantId: string, @Query('entity') entity?: string) {
    return this.etlService.getActiveJob(tenantId, toEntity(entity));
  }

  // ===========================
  // PREVIEWS
  // ===========================

  @Post('validate-preview')

  @ReadAction()
  validatePreview(@Body() body: ValidatePreviewDto) {
    return this.etlService.validatePreview(
      body.fileId,
      body.tenantId,
      body.mapping,
      body.transforms,
      body.validationRules,
    );
  }

  @Post('deduplicate-preview')

  @ReadAction()
  deduplicatePreview(@Body() body: DeduplicatePreviewDto) {
    return this.etlService.deduplicatePreview(
      body.fileId,
      body.tenantId,
      body.mapping,
      body.transforms,
      body.matchFields,
      body.fuzzyMatch,
      body.fuzzyThreshold,
    );
  }

  // ===========================
  // JOB EXECUTION
  // ===========================

  @Post('import')
  async createImport(@Body() body: CreateImportDto) {
    // For small files (< 50000 rows), execute synchronously
    // For larger files, queue for async processing with progress tracking
    const rowCount = this.etlService.getFileRowCount(body.fileId);

    if (rowCount <= 50000) {
      return this.etlService.executeSynchronous({
        tenantId: body.tenantId,
        fileId: body.fileId,
        mapping: body.mapping,
        transforms: body.transforms,
        matchFields: body.matchFields,
        deduplicateStrategy: body.deduplicateStrategy,
        overwriteFields: body.overwriteFields,
        fuzzyMatch: body.fuzzyMatch,
        fuzzyThreshold: body.fuzzyThreshold,
        validationRules: body.validationRules,
        templateName: body.templateName,
        headers: body.headers,
        defaultStatus: body.defaultStatus,
      });
    }

    return this.etlService.createImportJob({
      tenantId: body.tenantId,
      fileId: body.fileId,
      mapping: body.mapping,
      transforms: body.transforms,
      matchFields: body.matchFields,
      deduplicateStrategy: body.deduplicateStrategy,
      overwriteFields: body.overwriteFields,
      fuzzyMatch: body.fuzzyMatch,
      fuzzyThreshold: body.fuzzyThreshold,
      validationRules: body.validationRules,
      templateName: body.templateName,
      headers: body.headers,
      defaultStatus: body.defaultStatus,
    });
  }

  // ===========================
  // JOB MANAGEMENT
  // ===========================

  @Get('jobs/:id')

  @TenantResource('importJob')
  getJob(@Param('id') id: string) {
    return this.etlService.getJob(id);
  }

  @Get('jobs/:id/errors')

  @TenantResource('importJob')
  getJobErrors(
    @Param('id') id: string,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
  ) {
    return this.etlService.getJobErrors(id, +page, +limit);
  }

  @Get('jobs')
  getJobHistory(
    @Query('tenantId') tenantId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('entity') entity?: string,
  ) {
    return this.etlService.getJobHistory(tenantId, +page, +limit, toEntity(entity));
  }

  @Post('jobs/:id/cancel')

  @TenantResource('importJob')
  cancelJob(@Param('id') id: string) {
    return this.etlService.cancelJob(id);
  }

  // ===========================
  // TEMPLATES
  // ===========================

  @Get('templates')
  getTemplates(@Query('tenantId') tenantId?: string) {
    return this.etlService.getTemplates(tenantId);
  }

  @Post('templates/by-structure')

  @ReadAction()
  getTemplateByStructure(@Body() body: { tenantId: string; headers: string[]; entity?: string }) {
    return this.etlService.getTemplateByStructure(body.tenantId, body.headers, toEntity(body.entity));
  }

  @Post('templates')
  saveTemplate(@Body() body: { name: string; mapping: Record<string, string[]>; tenantId?: string; headers?: string[]; transforms?: Record<string, any> }) {
    return this.etlService.saveTemplate(body.name, body.mapping, body.tenantId, body.headers, body.transforms);
  }

  @Delete('templates/:id')

  @TenantResource('mappingTemplate')
  deleteTemplate(@Param('id') id: string) {
    return this.etlService.deleteTemplate(id);
  }
}
