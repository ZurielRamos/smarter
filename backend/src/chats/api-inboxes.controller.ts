import {
  Controller,
  Get,
  Param,
  UseGuards,
  Req,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ApiTokenGuard } from '../auth/api-token.guard';
import { ChatsService } from './chats.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';
import { TenantRole } from '../users/enums/tenant-role.enum';

/**
 * API pública de bandejas (solo lectura).
 * Rutas: /api/v1/:slug/inboxes
 * Autenticación: API Token (header x-api-token)
 */
@Controller('v1/:slug/inboxes')
@UseGuards(ApiTokenGuard)
export class ApiInboxesController {
  constructor(
    private readonly chatsService: ChatsService,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
  ) {}

  private async resolveTenant(user: any, slug: string): Promise<{ tenantId: string; role: TenantRole }> {
    if (user.isSuperAdmin) {
      const tenant = await this.tenantRepo.findOne({ where: { slug } });
      if (!tenant) throw new NotFoundException('Cuenta no encontrada');
      return { tenantId: tenant.id, role: TenantRole.ADMIN };
    }

    const tenantRole = user.tenantRoles?.find((tr: any) => tr.tenant.slug === slug);
    if (!tenantRole) {
      throw new ForbiddenException('No tienes acceso a esta cuenta');
    }

    return { tenantId: tenantRole.tenantId, role: tenantRole.role };
  }

  /**
   * GET /api/v1/:slug/inboxes
   * Listar todas las bandejas de la cuenta.
   */
  @Get()
  async findAll(@Req() req: any, @Param('slug') slug: string) {
    const { tenantId } = await this.resolveTenant(req.user, slug);
    const inboxes = await this.chatsService.getInboxes(tenantId);

    return {
      data: inboxes.map((inbox) => ({
        id: inbox.id,
        name: inbox.name,
        channel: inbox.channel,
        status: inbox.status,
        channelName: inbox.channelName,
        phoneNumberId: inbox.phoneNumberId,
        createdAt: inbox.createdAt,
      })),
    };
  }

  /**
   * GET /api/v1/:slug/inboxes/:id
   * Obtener detalle de una bandeja.
   */
  @Get(':id')
  async findOne(@Req() req: any, @Param('slug') slug: string, @Param('id') id: string) {
    const { tenantId } = await this.resolveTenant(req.user, slug);
    const inbox = await this.chatsService.findInboxById(id);

    if (!inbox || inbox.tenantId !== tenantId) {
      throw new NotFoundException('Bandeja no encontrada');
    }

    return {
      id: inbox.id,
      name: inbox.name,
      channel: inbox.channel,
      status: inbox.status,
      channelName: inbox.channelName,
      phoneNumberId: inbox.phoneNumberId,
      pageId: inbox.pageId,
      wabaId: inbox.wabaId,
      metadata: inbox.metadata,
      createdAt: inbox.createdAt,
      updatedAt: inbox.updatedAt,
    };
  }
}
