import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IS_PUBLIC_KEY } from '../auth/public.decorator';
import { isFeatureEnabled } from '../auth/requires-feature.decorator';
import { TenantRole } from '../users/enums/tenant-role.enum';
import { Survey } from './survey.entity';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Control de acceso del módulo Encuestas. Va DESPUÉS de JwtAuthGuard y
 * TenantAccessGuard y cubre lo que ese último no puede:
 *
 * 1. Rutas con `:id` (encuesta): TenantAccessGuard no las protege porque no hay
 *    tenantId en la petición. Aquí el tenant se toma de la PROPIA encuesta (no
 *    del cliente) y se exige que el usuario pertenezca a él. Para quien no
 *    pertenece, la encuesta "no existe" (404), así no se confirma si un UUID es
 *    válido en otra cuenta.
 * 2. Rutas de colección (listar, crear, catálogos): exigen `tenantId`. Sin él,
 *    TenantAccessGuard dejaba pasar y los servicios listaban TODAS las cuentas.
 *    Si el tenantId llega en más de un lugar (query y body), deben coincidir:
 *    el guard autoriza uno y el servicio podría usar otro.
 * 3. Feature flag `encuestas` (activo por defecto; solo `false` lo apaga).
 * 4. Rol `viewer` (solo lectura): no puede modificar.
 *
 * SuperAdmin pasa los controles de membresía, flag y rol. Las rutas @Public
 * quedan fuera (el enlace público tiene sus propias validaciones).
 */
@Injectable()
export class SurveyAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(Survey)
    private readonly surveyRepo: Repository<Survey>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) throw new ForbiddenException('No autenticado');

    const surveyId: string | undefined = request.params?.id;
    let tenantId: string;
    const byId = surveyId !== undefined;

    if (byId) {
      if (!UUID_RE.test(surveyId)) throw new BadRequestException('Id de encuesta inválido');
      const survey = await this.surveyRepo.findOne({
        where: { id: surveyId },
        select: { id: true, tenantId: true },
      });
      if (!survey) throw new NotFoundException('Encuesta no encontrada');
      tenantId = survey.tenantId;
    } else {
      tenantId = this.resolveCollectionTenant(request);
    }

    if (user.isSuperAdmin) return true;

    const membership = user.tenantRoles?.find((tr: any) => tr.tenantId === tenantId);
    if (!membership) {
      // Por id: no revelar que la encuesta existe en otra cuenta.
      if (byId) throw new NotFoundException('Encuesta no encontrada');
      throw new ForbiddenException('No tienes acceso a esta cuenta');
    }

    if (!isFeatureEnabled(membership.tenant?.features, 'encuestas')) {
      throw new ForbiddenException('El módulo "encuestas" no está activo para esta cuenta');
    }

    if (membership.role === TenantRole.VIEWER && !READ_METHODS.has(request.method)) {
      throw new ForbiddenException('Tu rol es de solo lectura en esta cuenta');
    }

    return true;
  }

  /** tenantId de una ruta de colección: obligatorio, UUID y único entre query/body/params. */
  private resolveCollectionTenant(request: any): string {
    const candidates = [request.params?.tenantId, request.query?.tenantId, request.body?.tenantId].filter(
      (v) => v !== undefined && v !== null && v !== '',
    );
    if (candidates.length === 0) throw new BadRequestException('tenantId requerido');
    for (const c of candidates) {
      if (typeof c !== 'string' || !UUID_RE.test(c)) throw new BadRequestException('tenantId inválido');
    }
    if (new Set(candidates).size > 1) {
      throw new BadRequestException('tenantId inconsistente en la solicitud');
    }
    return candidates[0] as string;
  }
}
