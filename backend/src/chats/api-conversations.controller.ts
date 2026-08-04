import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
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
import { Inbox } from './inbox.entity';

/**
 * API pública de conversaciones.
 * Rutas: /api/v1/:slug/conversations
 * Autenticación: API Token (header x-api-token)
 */
@Controller('v1/:slug/conversations')
@UseGuards(ApiTokenGuard)
export class ApiConversationsController {
  constructor(
    private readonly chatsService: ChatsService,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(Inbox)
    private readonly inboxRepo: Repository<Inbox>,
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
      throw new ForbiddenException('Los agentes solo tienen acceso de lectura. Necesitas permisos de administrador para esta acción.');
    }
  }

  /**
   * Verifica que una conversación pertenece a un inbox del tenant.
   */
  private async validateConversationAccess(conversationId: string, tenantId: string) {
    const conversation = await this.chatsService.findConversationById(conversationId);
    if (!conversation) {
      throw new NotFoundException('Conversación no encontrada');
    }
    const inbox = await this.inboxRepo.findOne({ where: { id: conversation.inboxId } });
    if (!inbox || inbox.tenantId !== tenantId) {
      throw new ForbiddenException('No tienes acceso a esta conversación');
    }
    return conversation;
  }

  /**
   * GET /api/v1/:slug/conversations
   * Listar conversaciones con paginación.
   * Incluye: inbox, contacto vinculado, etiquetas.
   */
  @Get()
  async findAll(
    @Req() req: any,
    @Param('slug') slug: string,
    @Query('inboxId') inboxId?: string,
    @Query('status') status?: string,
    @Query('limit') limit = '15',
    @Query('offset') offset = '0',
  ) {
    const { tenantId } = await this.resolveTenant(req.user, slug);
    const opts = { limit: Math.min(+limit, 100), offset: +offset };

    let result: { data: any[]; total: number };

    if (inboxId) {
      // Verify inbox belongs to tenant
      const inbox = await this.inboxRepo.findOne({ where: { id: inboxId } });
      if (!inbox || inbox.tenantId !== tenantId) {
        throw new ForbiddenException('No tienes acceso a esta bandeja');
      }
      result = await this.chatsService.getConversationsPaginated(inboxId, opts);
    } else {
      result = await this.chatsService.getConversationsByTenantPaginated(tenantId, opts);
    }

    // Enrich with labels data
    const labels = await this.chatsService.getLabels(tenantId);
    const labelsMap = new Map(labels.map((l) => [l.id, l]));

    const enriched = result.data.map((conv) => ({
      id: conv.id,
      inboxId: conv.inboxId,
      inbox: conv.inbox ? {
        id: conv.inbox.id,
        name: conv.inbox.name,
        channel: conv.inbox.channel,
        channelName: conv.inbox.channelName,
      } : null,
      contactId: conv.contactId,
      contactName: conv.contactName,
      contactAvatar: conv.contactAvatar,
      record: conv.record ? {
        id: conv.record.id,
        firstName: conv.record.firstName,
        lastName: conv.record.lastName,
        phone: conv.record.phone,
        email: conv.record.email,
      } : null,
      status: conv.status,
      lastMessage: conv.lastMessage,
      lastMessageAt: conv.lastMessageAt,
      unreadCount: conv.unreadCount,
      labels: (conv.labelIds || []).map((id: string) => labelsMap.get(id)).filter(Boolean),
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
    }));

    return { data: enriched, total: result.total };
  }

  /**
   * GET /api/v1/:slug/conversations/:id
   * Obtener una conversación con todos sus detalles.
   */
  @Get(':id')
  async findOne(@Req() req: any, @Param('slug') slug: string, @Param('id') id: string) {
    const { tenantId } = await this.resolveTenant(req.user, slug);
    const conversation = await this.validateConversationAccess(id, tenantId);

    const labels = await this.chatsService.getLabels(tenantId);
    const labelsMap = new Map(labels.map((l) => [l.id, l]));

    return {
      id: conversation.id,
      inboxId: conversation.inboxId,
      inbox: conversation.inbox ? {
        id: conversation.inbox.id,
        name: conversation.inbox.name,
        channel: conversation.inbox.channel,
        channelName: conversation.inbox.channelName,
      } : null,
      contactId: conversation.contactId,
      contactName: conversation.contactName,
      contactAvatar: conversation.contactAvatar,
      record: conversation.record ? {
        id: conversation.record.id,
        firstName: conversation.record.firstName,
        lastName: conversation.record.lastName,
        phone: conversation.record.phone,
        email: conversation.record.email,
      } : null,
      status: conversation.status,
      lastMessage: conversation.lastMessage,
      lastMessageAt: conversation.lastMessageAt,
      unreadCount: conversation.unreadCount,
      labels: (conversation.labelIds || []).map((id: string) => labelsMap.get(id)).filter(Boolean),
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };
  }

  /**
   * POST /api/v1/:slug/conversations/:id/labels
   * Agregar o quitar etiquetas de una conversación.
   * Solo administradores.
   */
  @Post(':id/labels')
  async toggleLabel(
    @Req() req: any,
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() body: { labelId: string; action: 'add' | 'remove' },
  ) {
    const { tenantId, role } = await this.resolveTenant(req.user, slug);
    this.requireAdmin(role);
    await this.validateConversationAccess(id, tenantId);

    const result = await this.chatsService.toggleConversationLabel(
      id,
      body.labelId,
      body.action,
      req.user.id,
      req.user.name,
    );

    // Return enriched labels
    const labels = await this.chatsService.getLabels(tenantId);
    const labelsMap = new Map(labels.map((l) => [l.id, l]));
    const enrichedLabels = (result.labelIds || []).map((lid: string) => labelsMap.get(lid)).filter(Boolean);

    return { labels: enrichedLabels };
  }

  /**
   * POST /api/v1/:slug/conversations/:id/read
   * Marcar conversación como leída.
   */
  @Post(':id/read')
  async markAsRead(@Req() req: any, @Param('slug') slug: string, @Param('id') id: string) {
    const { tenantId } = await this.resolveTenant(req.user, slug);
    await this.validateConversationAccess(id, tenantId);
    await this.chatsService.markAsRead(id);
    return { success: true };
  }

  /**
   * DELETE /api/v1/:slug/conversations/:id
   * Eliminar una conversación. Solo administradores.
   */
  @Delete(':id')
  async remove(@Req() req: any, @Param('slug') slug: string, @Param('id') id: string) {
    const { tenantId, role } = await this.resolveTenant(req.user, slug);
    this.requireAdmin(role);
    await this.validateConversationAccess(id, tenantId);
    await this.chatsService.deleteConversation(id);
    return { message: 'Conversación eliminada correctamente' };
  }
}
