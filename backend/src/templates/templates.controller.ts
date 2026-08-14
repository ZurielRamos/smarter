import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
} from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';

@Controller('templates')
export class TemplatesController {
  constructor(private readonly service: TemplatesService) {}

  @Get()
  findAll(@Query('tenantId') tenantId: string, @Query('channel') channel?: string) {
    return this.service.findAll(tenantId, channel);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateTemplateDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTemplateDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  // === TRANSLATION ENDPOINTS ===

  @Put(':id/translations/:language')
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
  removeTranslation(
    @Param('id') id: string,
    @Param('language') language: string,
  ) {
    return this.service.removeTranslation(id, language);
  }

  @Get(':id/resolve/:language')
  resolveTranslation(
    @Param('id') id: string,
    @Param('language') language: string,
  ) {
    return this.service.resolveTranslation(id, language);
  }
}
