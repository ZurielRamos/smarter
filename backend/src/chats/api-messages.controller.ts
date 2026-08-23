import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
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
import { Message } from './message.entity';
import { TenantRole, isAdminRole } from '../users/enums/tenant-role.enum';

/**
 * API pública de mensajes.
 * Rutas: /api/v1/:slug/conversations/:conversationId/messages
 * Autenticación: API Token (header x-api-token)
 */
@Controller('v1/:slug/conversations/:conversationId/messages')
@UseGuards(ApiTokenGuard)
export class ApiMessagesController {
  constructor(
    private readonly chatsService: ChatsService,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(Inbox)
    private readonly inboxRepo: Repository<Inbox>,
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
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

  private requireAdmin(role: string): void {
    if (!isAdminRole(role)) {
      throw new ForbiddenException('Los agentes solo tienen acceso de lectura. Necesitas permisos de administrador para esta acción.');
    }
  }

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
   * GET /api/v1/:slug/conversations/:conversationId/messages
   * Listar mensajes de una conversación con paginación.
   */
  @Get()
  async findAll(
    @Req() req: any,
    @Param('slug') slug: string,
    @Param('conversationId') conversationId: string,
    @Query('limit') limit = '50',
    @Query('before') before?: string,
  ) {
    const { tenantId } = await this.resolveTenant(req.user, slug);
    await this.validateConversationAccess(conversationId, tenantId);

    const messages = await this.chatsService.getMessages(conversationId, Math.min(+limit, 100), before);

    return {
      data: messages.map((m) => ({
        id: m.id,
        conversationId: m.conversationId,
        direction: m.direction,
        messageType: m.messageType,
        content: m.content,
        mediaUrl: m.mediaUrl,
        mediaMimeType: m.mediaMimeType,
        status: m.status,
        senderId: m.senderId,
        sender: m.sender ? { id: m.sender.id, name: m.sender.name } : null,
        externalId: m.externalId,
        replyToExternalId: m.replyToExternalId,
        createdAt: m.createdAt,
      })),
      hasMore: messages.length === Math.min(+limit, 100),
    };
  }

  /**
   * GET /api/v1/:slug/conversations/:conversationId/messages/:id
   * Obtener un mensaje por ID.
   */
  @Get(':id')
  async findOne(
    @Req() req: any,
    @Param('slug') slug: string,
    @Param('conversationId') conversationId: string,
    @Param('id') id: string,
  ) {
    const { tenantId } = await this.resolveTenant(req.user, slug);
    await this.validateConversationAccess(conversationId, tenantId);

    const message = await this.messageRepo.findOne({
      where: { id, conversationId },
      relations: { sender: true },
    });
    if (!message) {
      throw new NotFoundException('Mensaje no encontrado');
    }

    return {
      id: message.id,
      conversationId: message.conversationId,
      direction: message.direction,
      messageType: message.messageType,
      content: message.content,
      mediaUrl: message.mediaUrl,
      mediaMimeType: message.mediaMimeType,
      status: message.status,
      senderId: message.senderId,
      sender: message.sender ? { id: message.sender.id, name: message.sender.name } : null,
      externalId: message.externalId,
      replyToExternalId: message.replyToExternalId,
      createdAt: message.createdAt,
    };
  }

  /**
   * POST /api/v1/:slug/conversations/:conversationId/messages
   * Enviar un mensaje de texto. Solo administradores.
   */
  @Post()
  async sendMessage(
    @Req() req: any,
    @Param('slug') slug: string,
    @Param('conversationId') conversationId: string,
    @Body() body: { content: string; messageType?: string; replyToExternalId?: string },
  ) {
    const { tenantId, role } = await this.resolveTenant(req.user, slug);
    this.requireAdmin(role);
    await this.validateConversationAccess(conversationId, tenantId);

    const message = await this.chatsService.sendMessage(
      conversationId,
      body.content,
      body.messageType || 'text',
      req.user.id,
      body.replyToExternalId,
    );

    return {
      id: message.id,
      conversationId: message.conversationId,
      direction: message.direction,
      messageType: message.messageType,
      content: message.content,
      status: message.status,
      senderId: message.senderId,
      createdAt: message.createdAt,
    };
  }

  /**
   * POST /api/v1/:slug/conversations/:conversationId/messages/note
   * Crear una nota privada. Solo administradores.
   */
  @Post('note')
  async createNote(
    @Req() req: any,
    @Param('slug') slug: string,
    @Param('conversationId') conversationId: string,
    @Body() body: { content: string },
  ) {
    const { tenantId, role } = await this.resolveTenant(req.user, slug);
    this.requireAdmin(role);
    await this.validateConversationAccess(conversationId, tenantId);

    const message = await this.chatsService.createNote(
      conversationId,
      body.content,
      req.user.id,
    );

    return {
      id: message.id,
      conversationId: message.conversationId,
      direction: message.direction,
      messageType: message.messageType,
      content: message.content,
      status: message.status,
      senderId: message.senderId,
      createdAt: message.createdAt,
    };
  }
}
