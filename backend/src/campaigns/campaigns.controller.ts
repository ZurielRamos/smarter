import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantAccessGuard } from '../auth/tenant-access.guard';
import { CampaignsService } from './campaigns.service';
import { WhatsAppService } from './whatsapp.service';
import { SegmentGroup } from './campaign.entity';
import { CustomField } from '../records/custom-field.entity';

@Controller('campaigns')
@UseGuards(JwtAuthGuard, TenantAccessGuard)
export class CampaignsController {
  constructor(
    private readonly campaignsService: CampaignsService,
    private readonly whatsappService: WhatsAppService,
    @InjectRepository(CustomField)
    private readonly customFieldRepo: Repository<CustomField>,
  ) {}

  @Get()
  findAll(@Query('tenantId') tenantId?: string) {
    return this.campaignsService.findAll(tenantId);
  }

  // === WhatsApp Templates (must be before :id routes) ===

  @Get('whatsapp/templates')
  async getWhatsAppTemplates(@Query('inboxId') inboxId?: string) {
    if (!inboxId) return [];
    // Get inbox credentials
    const inbox = await this.campaignsService.getInboxById(inboxId);
    if (!inbox || !inbox.accessToken || !inbox.wabaId) return [];
    return this.whatsappService.getTemplates({
      metaToken: inbox.accessToken,
      metaBusinessId: inbox.wabaId,
    });
  }

  @Get('whatsapp/available-fields')
  async getAvailableFields(@Query('tenantId') tenantId?: string) {
    // System fields always available
    const systemFields = [
      { field: 'firstName', label: 'Nombre' },
      { field: 'lastName', label: 'Apellido' },
      { field: 'fullName', label: 'Nombre completo' },
      { field: 'phone', label: 'Teléfono' },
      { field: 'email', label: 'Email' },
      { field: 'documentType', label: 'Tipo documento' },
      { field: 'documentNumber', label: 'Nº documento' },
      { field: 'gender', label: 'Género' },
      { field: 'city', label: 'Ciudad' },
      { field: 'region', label: 'Región' },
      { field: 'status', label: 'Estado' },
      { field: 'channelSource', label: 'Canal' },
      { field: 'source', label: 'Fuente' },
      { field: 'score', label: 'Score' },
    ];

    if (!tenantId) return systemFields;

    // Load custom fields for this tenant
    const customFields = await this.customFieldRepo.find({
      where: { tenantId },
      order: { sortOrder: 'ASC' },
    });

    const custom = customFields
      .filter((f) => !f.isSystem)
      .map((f) => ({ field: f.fieldKey, label: f.fieldLabel }));

    return [...systemFields, ...custom];
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.campaignsService.findOne(id);
  }

  @Post()
  create(
    @Body()
    body: {
      name: string;
      description?: string;
      segments: SegmentGroup[];
      channel?: string;
      inboxId?: string;
      tenantId?: string;
    },
  ) {
    return this.campaignsService.create(body);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() body: Partial<{
      name: string;
      description: string;
      segments: SegmentGroup[];
      channel: string;
      inboxId: string | null;
      status: string;
      listId: string | null;
      messageTemplate: string;
      emailSubject: string;
      emailTemplateId: string | null;
      whatsappTemplateName: string;
      whatsappTemplateLanguage: string;
      whatsappVariableMapping: Record<string, string>;
      whatsappTemplateCategory: string;
      callVoice: string;
      callRetries: string;
      callLeaveVoicemail: boolean;
      callAudioCode: string;
      maxSends: number | null;
      isRecurring: boolean;
      sendDate: string | null;
      sendTime: string | null;
      recurrenceDays: Record<string, string> | null;
    }>,
  ) {
    return this.campaignsService.update(id, body);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.campaignsService.delete(id);
  }

  @Post('preview')
  preview(@Body() body: { segments: SegmentGroup[]; tenantId?: string }) {
    return this.campaignsService.preview(body.segments, body.tenantId);
  }

  @Get(':id/sends')
  getSends(@Param('id') id: string) {
    return this.campaignsService.getSends(id);
  }

  @Post(':id/send')
  sendCampaign(@Param('id') id: string) {
    return this.campaignsService.sendCampaign(id);
  }
}
