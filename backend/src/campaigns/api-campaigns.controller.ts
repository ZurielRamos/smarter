import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  Req,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ApiTokenGuard } from '../auth/api-token.guard';
import { CampaignsService } from './campaigns.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';
import { Campaign } from './campaign.entity';

/**
 * API pública de campañas (solo lectura).
 * Rutas: /api/v1/:slug/campaigns
 * Autenticación: API Token (header x-api-token)
 */
@Controller('v1/:slug/campaigns')
@UseGuards(ApiTokenGuard)
export class ApiCampaignsController {
  constructor(
    private readonly campaignsService: CampaignsService,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(Campaign)
    private readonly campaignRepo: Repository<Campaign>,
  ) {}

  private async resolveTenant(user: any, slug: string): Promise<{ tenantId: string; role: string }> {
    if (user.isSuperAdmin) {
      const tenant = await this.tenantRepo.findOne({ where: { slug } });
      if (!tenant) throw new NotFoundException('Cuenta no encontrada');
      return { tenantId: tenant.id, role: 'admin' };
    }

    const tenantRole = user.tenantRoles?.find((tr: any) => tr.tenant.slug === slug);
    if (!tenantRole) {
      throw new ForbiddenException('No tienes acceso a esta cuenta');
    }

    return { tenantId: tenantRole.tenantId, role: tenantRole.role };
  }

  private requireAdmin(role: string): void {
    if (role !== 'admin') {
      throw new ForbiddenException('Necesitas permisos de administrador para ejecutar campañas.');
    }
  }

  /**
   * GET /api/v1/:slug/campaigns
   * Listar todas las campañas de la cuenta.
   */
  @Get()
  async findAll(@Req() req: any, @Param('slug') slug: string) {
    const { tenantId } = await this.resolveTenant(req.user, slug);
    const campaigns = await this.campaignsService.findAll(tenantId);

    return {
      data: campaigns.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        status: c.status,
        channel: c.channel,
        inboxId: c.inboxId,
        matchedCount: c.matchedCount,
        isRecurring: c.isRecurring,
        sendDate: c.sendDate,
        sendTime: c.sendTime,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
    };
  }

  /**
   * GET /api/v1/:slug/campaigns/:id
   * Obtener detalle de una campaña.
   */
  @Get(':id')
  async findOne(@Req() req: any, @Param('slug') slug: string, @Param('id') id: string) {
    const { tenantId } = await this.resolveTenant(req.user, slug);
    const campaign = await this.campaignsService.findOne(id);

    if (!campaign || campaign.tenantId !== tenantId) {
      throw new NotFoundException('Campaña no encontrada');
    }

    return {
      id: campaign.id,
      name: campaign.name,
      description: campaign.description,
      status: campaign.status,
      channel: campaign.channel,
      inboxId: campaign.inboxId,
      segments: campaign.segments,
      listId: campaign.listId,
      matchedCount: campaign.matchedCount,
      maxSends: campaign.maxSends,
      isRecurring: campaign.isRecurring,
      sendDate: campaign.sendDate,
      sendTime: campaign.sendTime,
      recurrenceDays: campaign.recurrenceDays,
      messageTemplate: campaign.messageTemplate,
      whatsappTemplateName: campaign.whatsappTemplateName,
      whatsappTemplateLanguage: campaign.whatsappTemplateLanguage,
      whatsappTemplateCategory: campaign.whatsappTemplateCategory,
      createdAt: campaign.createdAt,
      updatedAt: campaign.updatedAt,
    };
  }

  /**
   * GET /api/v1/:slug/campaigns/:id/sends
   * Obtener los envíos (ejecuciones) de una campaña.
   */
  @Get(':id/sends')
  async getSends(@Req() req: any, @Param('slug') slug: string, @Param('id') id: string) {
    const { tenantId } = await this.resolveTenant(req.user, slug);

    const campaign = await this.campaignRepo.findOne({ where: { id } });
    if (!campaign || campaign.tenantId !== tenantId) {
      throw new NotFoundException('Campaña no encontrada');
    }

    const sends = await this.campaignsService.getSends(id);

    return {
      data: sends.map((s: any) => ({
        id: s.id,
        status: s.status,
        totalRecipients: s.totalRecipients,
        totalSent: s.totalSent,
        totalDelivered: s.totalDelivered,
        totalFailed: s.totalFailed,
        startedAt: s.startedAt,
        completedAt: s.completedAt,
        createdAt: s.createdAt,
      })),
    };
  }

  /**
   * POST /api/v1/:slug/campaigns/:id/send
   * Ejecutar una campaña. Solo administradores.
   * Encola el envío a todos los destinatarios que coincidan con los segmentos.
   */
  @Post(':id/send')
  async sendCampaign(@Req() req: any, @Param('slug') slug: string, @Param('id') id: string) {
    const { tenantId, role } = await this.resolveTenant(req.user, slug);
    this.requireAdmin(role);

    const campaign = await this.campaignRepo.findOne({ where: { id } });
    if (!campaign || campaign.tenantId !== tenantId) {
      throw new NotFoundException('Campaña no encontrada');
    }

    const result = await this.campaignsService.sendCampaign(id);
    return result;
  }
}
