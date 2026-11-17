import {
  Controller,
  Post,
  Get,
  Put,
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
import { AuthOnly, TenantResource, TenantResourceGuard } from '../auth/tenant-resource.guard';
import { UploadService, MappingConfig } from './upload.service';

/**
 * @deprecated Use /api/etl/* endpoints instead. This controller is kept for backward compatibility.
 */
@Controller('upload')
@UseGuards(JwtAuthGuard, TenantAccessGuard, TenantResourceGuard)
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Get('target-fields')
  @AuthOnly()
  getTargetFields() {
    return this.uploadService.getTargetFields();
  }

  @Post('parse')
  @AuthOnly()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  parseFile(@UploadedFile() file: Express.Multer.File) {
    return this.uploadService.parseFile(file);
  }

  @Post('map')
  async applyMapping(
    @Body() body: { fileId: string; mapping: MappingConfig; transforms?: Record<string, any>; templateName?: string; tenantId?: string; matchField?: string; headers?: string[] },
  ) {
    // Guardar el mapeo como template asociado a la estructura
    if (body.tenantId && body.headers) {
      await this.uploadService.saveTemplate(
        body.templateName || 'auto',
        body.mapping,
        body.tenantId,
        body.headers,
        body.transforms,
      );
    }
    return this.uploadService.applyMapping(body.fileId, body.mapping, body.tenantId, body.matchField, body.transforms);
  }

  // === Mapping Templates ===

  @Get('templates')
  getTemplates(@Query('tenantId') tenantId?: string) {
    return this.uploadService.getTemplates(tenantId);
  }

  @Post('templates/by-structure')
  getTemplateByStructure(@Body() body: { tenantId: string; headers: string[] }) {
    return this.uploadService.getTemplateByStructure(body.tenantId, body.headers);
  }

  @Post('templates')
  saveTemplate(@Body() body: { name: string; mapping: Record<string, string[]>; tenantId?: string; headers?: string[] }) {
    return this.uploadService.saveTemplate(body.name, body.mapping, body.tenantId, body.headers);
  }

  @Put('templates/:id/default')
  @TenantResource('mappingTemplate')
  setDefaultTemplate(@Param('id') id: string) {
    return this.uploadService.setDefaultTemplate(id);
  }

  @Delete('templates/:id')
  @TenantResource('mappingTemplate')
  deleteTemplate(@Param('id') id: string) {
    return this.uploadService.deleteTemplate(id);
  }
}
