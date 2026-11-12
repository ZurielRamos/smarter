import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation } from './conversation.entity';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type AuthUser = {
  isSuperAdmin?: boolean;
  tenantRoles?: Array<{ tenantId: string }>;
};

/**
 * Comprueba que el usuario pertenece al tenant dueño de una conversación.
 *
 * `TenantAccessGuard` solo valida el `tenantId` cuando viene en la petición; las
 * rutas que identifican la conversación por `:id` no lo traen, así que sin esta
 * comprobación cualquier usuario autenticado podría leer o escribir en
 * conversaciones de otros tenants si conoce su id.
 */
@Injectable()
export class ConversationAccessService {
  constructor(
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
  ) {}

  /** Devuelve el tenantId de la conversación o `null` si no existe. */
  async getTenantId(conversationId: string): Promise<string | null> {
    if (!UUID_RE.test(conversationId)) return null;
    const row = await this.conversationRepo
      .createQueryBuilder('c')
      .innerJoin('c.inbox', 'i')
      .select('i.tenant_id', 'tenantId')
      .where('c.id = :id', { id: conversationId })
      .getRawOne<{ tenantId: string }>();
    return row?.tenantId ?? null;
  }

  async assertAccess(user: AuthUser | undefined, conversationId: string): Promise<void> {
    if (user?.isSuperAdmin) return;
    const tenantId = await this.getTenantId(conversationId);
    if (!tenantId) throw new NotFoundException('Conversation not found');
    if (!user?.tenantRoles?.some((tr) => tr.tenantId === tenantId)) {
      throw new ForbiddenException('No tienes acceso a esta conversación');
    }
  }
}

/**
 * Se aplica a nivel de controlador: solo actúa en rutas `conversations/:id/...`.
 * (El upload multipart verifica el acceso dentro del handler porque el body aún
 * no está parseado cuando corren los guards.)
 */
@Injectable()
export class ConversationAccessGuard implements CanActivate {
  constructor(private readonly access: ConversationAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const routePath: string = request.route?.path ?? '';
    if (!routePath.includes('conversations/:id')) return true;

    await this.access.assertAccess(request.user, request.params?.id);
    return true;
  }
}
