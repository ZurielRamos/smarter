import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantAccessGuard } from '../auth/tenant-access.guard';
import { TenantResource, TenantResourceGuard } from '../auth/tenant-resource.guard';
import { TemplatesService } from './templates.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';

@Controller('templates')
@UseGuards(JwtAuthGuard, TenantAccessGuard, TenantResourceGuard)
export class TemplatesController {
  constructor(private readonly service: TemplatesService) {}

  @Get()
  findAll(@Query('tenantId') tenantId: string, @Query('channel') channel?: string) {
    return this.service.findAll(tenantId, channel);
  }

  @Get(':id')
  @TenantResource('template')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateTemplateDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  @TenantResource('template')
  update(@Param('id') id: string, @Body() dto: UpdateTemplateDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @TenantResource('template')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  // === TRANSLATION ENDPOINTS ===

  @Put(':id/translations/:language')
  @TenantResource('template')
  upsertTranslation(
    @Param('id') id: string,
    @Param('language') language: string,
    @Body() body: {
      subject?: string | null;
      blocks?: any[] | null;
      html?: string | null;
      body?: string | null;
      voice?: string | null;
      audioCode?: string | null;
      whatsappComponents?: any[] | null;
    },
  ) {
    return this.service.upsertTranslation(id, language, body);
  }

  @Delete(':id/translations/:language')
  @TenantResource('template')
  removeTranslation(
    @Param('id') id: string,
    @Param('language') language: string,
  ) {
    return this.service.removeTranslation(id, language);
  }

  @Get(':id/resolve/:language')
  @TenantResource('template')
  resolveTranslation(
    @Param('id') id: string,
    @Param('language') language: string,
  ) {
    return this.service.resolveTranslation(id, language);
  }
}
