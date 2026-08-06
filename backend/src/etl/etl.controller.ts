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
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantAccessGuard } from '../auth/tenant-access.guard';
import { EtlService } from './etl.service';
import { CreateImportDto, ValidatePreviewDto, DeduplicatePreviewDto } from './dto/create-import.dto';

@Controller('etl')
@UseGuards(JwtAuthGuard, TenantAccessGuard)
export class EtlController {
  constructor(private readonly etlService: EtlService) {}

  // ===========================
  // FILE PARSING
  // ===========================

  @Get('target-fields')
  getTargetFields() {
    return this.etlService.getTargetFields();
  }

  @Post('parse')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    }),
  )
  parseFile(@UploadedFile() file: Express.Multer.File) {
    return this.etlService.parseFile(file);
  }

  /** Async parse: upload file, queue parsing, return job immediately */
  @Post('parse-async')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    }),
  )
  parseFileAsync(@UploadedFile() file: Express.Multer.File, @Body() body: { tenantId?: string }) {
    return this.etlService.parseFileAsync(file, body.tenantId);
  }

  /** Get the current pending/parsing job for a tenant (for resuming) */
  @Get('active-job')
  getActiveJob(@Query('tenantId') tenantId: string) {
    return this.etlService.getActiveJob(tenantId);
  }

  // ===========================
  // PREVIEWS
  // ===========================

  @Post('validate-preview')
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
    });
  }

  // ===========================
  // JOB MANAGEMENT
  // ===========================

  @Get('jobs/:id')
  getJob(@Param('id') id: string) {
    return this.etlService.getJob(id);
  }

  @Get('jobs/:id/errors')
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
  ) {
    return this.etlService.getJobHistory(tenantId, +page, +limit);
  }

  @Post('jobs/:id/cancel')
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
  getTemplateByStructure(@Body() body: { tenantId: string; headers: string[] }) {
    return this.etlService.getTemplateByStructure(body.tenantId, body.headers);
  }

  @Post('templates')
  saveTemplate(@Body() body: { name: string; mapping: Record<string, string[]>; tenantId?: string; headers?: string[]; transforms?: Record<string, any> }) {
    return this.etlService.saveTemplate(body.name, body.mapping, body.tenantId, body.headers, body.transforms);
  }

  @Delete('templates/:id')
  deleteTemplate(@Param('id') id: string) {
    return this.etlService.deleteTemplate(id);
  }
}
