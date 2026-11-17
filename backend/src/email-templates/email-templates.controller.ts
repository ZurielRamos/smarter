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
import { EmailTemplatesService } from './email-templates.service';
import { CreateEmailTemplateDto } from './dto/create-email-template.dto';
import { UpdateEmailTemplateDto } from './dto/update-email-template.dto';

@Controller('email-templates')
@UseGuards(JwtAuthGuard, TenantAccessGuard, TenantResourceGuard)
export class EmailTemplatesController {
  constructor(private readonly service: EmailTemplatesService) {}

  @Get()
  findAll(@Query('tenantId') tenantId: string, @Query('inboxId') inboxId?: string) {
    return this.service.findAll(tenantId, inboxId);
  }

  @Get(':id')
  @TenantResource('emailTemplate')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateEmailTemplateDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  @TenantResource('emailTemplate')
  update(@Param('id') id: string, @Body() dto: UpdateEmailTemplateDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @TenantResource('emailTemplate')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  // === TRANSLATION ENDPOINTS ===

  @Put(':id/translations/:language')
  @TenantResource('emailTemplate')
  upsertTranslation(
    @Param('id') id: string,
    @Param('language') language: string,
    @Body() body: { subject: string; blocks?: any[] | null; html: string },
  ) {
    return this.service.upsertTranslation(id, language, body);
  }

  @Delete(':id/translations/:language')
  @TenantResource('emailTemplate')
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
  @TenantResource('emailTemplate')
  resolveTranslation(
    @Param('id') id: string,
    @Param('language') language: string,
  ) {
    return this.service.resolveTranslation(id, language);
  }
}
