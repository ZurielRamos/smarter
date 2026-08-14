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
import { EmailTemplatesService } from './email-templates.service';
import { CreateEmailTemplateDto } from './dto/create-email-template.dto';
import { UpdateEmailTemplateDto } from './dto/update-email-template.dto';

@Controller('email-templates')
export class EmailTemplatesController {
  constructor(private readonly service: EmailTemplatesService) {}

  @Get()
  findAll(@Query('tenantId') tenantId: string, @Query('inboxId') inboxId?: string) {
    return this.service.findAll(tenantId, inboxId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateEmailTemplateDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateEmailTemplateDto) {
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
    @Body() body: { subject: string; blocks?: any[] | null; html: string },
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

  /**
   * Resolve the best translation for a contact's language.
   * Useful for previewing which version a contact would receive.
   */
  @Get(':id/resolve/:language')
  resolveTranslation(
    @Param('id') id: string,
    @Param('language') language: string,
  ) {
    return this.service.resolveTranslation(id, language);
  }
}
