import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiTokenGuard } from '../auth/api-token.guard';
import { Tenant } from '../tenants/tenant.entity';
import { TenantRole, isAdminRole } from '../users/enums/tenant-role.enum';
import { ConversationFlowsService } from '../conversation-flows/conversation-flows.service';
import { ChatsService, FlowStartTemplate } from './chats.service';

/**
 * API pública de flujos conversacionales.
 * Rutas: /api/v1/:slug/flows
 * Autenticación: API Token (header x-api-token)
 */
@Controller('v1/:slug/flows')
@UseGuards(ApiTokenGuard)
export class ApiFlowsController {
  constructor(
    private readonly chatsService: ChatsService,
    private readonly flowsService: ConversationFlowsService,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
  ) {}

  private async resolveTenant(
    user: any,
    slug: string,
  ): Promise<{ tenantId: string; role: TenantRole }> {
    if (user.isSuperAdmin) {
      const tenant = await this.tenantRepo.findOne({ where: { slug } });
      if (!tenant) throw new NotFoundException('Cuenta no encontrada');
      return { tenantId: tenant.id, role: TenantRole.ADMIN };
    }
    const tenantRole = user.tenantRoles?.find(
      (tr: any) => tr.tenant.slug === slug,
    );
    if (!tenantRole)
      throw new ForbiddenException('No tienes acceso a esta cuenta');
    return { tenantId: tenantRole.tenantId, role: tenantRole.role };
  }

  /**
   * GET /api/v1/:slug/flows
   * Flujos de la cuenta (id, nombre, estado).
   */
  @Get()
  async findAll(@Req() req: any, @Param('slug') slug: string) {
    const { tenantId } = await this.resolveTenant(req.user, slug);
    const flows = await this.flowsService.findAll(tenantId);
    return flows.map((f) => ({ id: f.id, name: f.name, status: f.status }));
  }

  /**
   * POST /api/v1/:slug/flows/:flowId/start
   * Inicia un flujo activo para un contacto. Solo administradores.
   *
   * Destinatario: `conversationId`, o `inboxId` con `recordId` o `phone`.
   * `variables` quedan disponibles como {{clave}} en el flujo.
   * Si la ventana de 24 h está cerrada (WhatsApp) se exige `template`: se
   * envía y el flujo empieza cuando el contacto responda.
   */
  @Post(':flowId/start')
  async start(
    @Req() req: any,
    @Param('slug') slug: string,
    @Param('flowId') flowId: string,
    @Body()
    body: {
      conversationId?: string;
      inboxId?: string;
      recordId?: string;
      phone?: string;
      variables?: Record<string, string>;
      template?: FlowStartTemplate | null;
    },
  ) {
    const { tenantId, role } = await this.resolveTenant(req.user, slug);
    if (!isAdminRole(role))
      throw new ForbiddenException(
        'Necesitas permisos de administrador para iniciar flujos.',
      );
    if (!/^[0-9a-f-]{36}$/i.test(flowId))
      throw new BadRequestException('flowId no es válido');
    const conversationId =
      await this.chatsService.resolveConversationForFlowStart(tenantId, {
        conversationId: body?.conversationId,
        inboxId: body?.inboxId,
        recordId: body?.recordId,
        phone: body?.phone,
      });
    return this.chatsService.startFlowInConversation(conversationId, flowId, {
      source: 'api',
      variables: body?.variables,
      template: body?.template ?? null,
      performedBy: req.user?.id ?? null,
    });
  }
}
