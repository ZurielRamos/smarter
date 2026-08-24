import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantAccessGuard } from '../auth/tenant-access.guard';
import { CampaignsService } from './campaigns.service';
import { WhatsAppService } from './whatsapp.service';
import { SegmentGroup } from './campaign.entity';
import { CustomField } from '../records/custom-field.entity';
import { CampaignSendLog } from './campaign-send-log.entity';

@Controller('campaigns')
@UseGuards(JwtAuthGuard, TenantAccessGuard)
export class CampaignsController {
  constructor(
    private readonly campaignsService: CampaignsService,
    private readonly whatsappService: WhatsAppService,
    @InjectRepository(CustomField)
    private readonly customFieldRepo: Repository<CustomField>,
    @InjectRepository(CampaignSendLog)
    private readonly campaignSendLogRepo: Repository<CampaignSendLog>,
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

  /**
   * GET /campaigns/:id/stats
   * Email campaign metrics: open rate, click rate, bounce rate, unsubscribe rate.
   * Optionally filter by sendId with ?sendId=xxx
   */
  @Get(':id/stats')
  async getStats(@Param('id') id: string, @Query('sendId') sendId?: string) {
    const where: any = { campaignId: id };
    if (sendId) where.sendId = sendId;

    const logs = await this.campaignSendLogRepo
      .createQueryBuilder('log')
      .select([
        'COUNT(*)::int AS "total"',
        'COUNT(*) FILTER (WHERE log.status = \'sent\' OR log.status = \'delivered\')::int AS "sent"',
        'COUNT(*) FILTER (WHERE log.status = \'delivered\')::int AS "delivered"',
        'COUNT(*) FILTER (WHERE log.status = \'failed\')::int AS "failed"',
        'COUNT(*) FILTER (WHERE log.opened_at IS NOT NULL)::int AS "opened"',
        'COUNT(*) FILTER (WHERE log.clicked_at IS NOT NULL)::int AS "clicked"',
        'COUNT(*) FILTER (WHERE log.complained_at IS NOT NULL)::int AS "complained"',
        'COUNT(*) FILTER (WHERE log.error_code = \'unsubscribed\')::int AS "unsubscribed"',
        'COUNT(*) FILTER (WHERE log.error_code IN (\'no_email\', \'unsubscribed\', \'mailgun_not_configured\'))::int AS "skipped"',
      ])
      .where(sendId ? 'log.send_id = :sendId' : 'log.campaign_id = :campaignId', { sendId, campaignId: id })
      .getRawOne();

    const total = logs.total || 0;
    const sent = logs.sent || 0;
    const delivered = logs.delivered || 0;
    const failed = logs.failed || 0;
    const opened = logs.opened || 0;
    const clicked = logs.clicked || 0;
    const complained = logs.complained || 0;
    const unsubscribed = logs.unsubscribed || 0;
    const skipped = logs.skipped || 0;

    return {
      total,
      sent,
      delivered,
      failed,
      skipped,
      opened,
      clicked,
      complained,
      unsubscribed,
      rates: {
        deliveryRate: sent > 0 ? Math.round((delivered / sent) * 10000) / 100 : 0,
        openRate: delivered > 0 ? Math.round((opened / delivered) * 10000) / 100 : 0,
        clickRate: delivered > 0 ? Math.round((clicked / delivered) * 10000) / 100 : 0,
        bounceRate: sent > 0 ? Math.round((failed / sent) * 10000) / 100 : 0,
        complaintRate: delivered > 0 ? Math.round((complained / delivered) * 10000) / 100 : 0,
        unsubscribeRate: delivered > 0 ? Math.round((unsubscribed / delivered) * 10000) / 100 : 0,
      },
    };
  }
}
