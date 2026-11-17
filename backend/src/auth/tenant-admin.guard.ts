import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { isAdminRole } from '../users/enums/tenant-role.enum';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Exige que el usuario sea owner/admin del tenant indicado en `params.tenantId`.
 * SuperAdmin pasa siempre. Usar DESPUÉS de JwtAuthGuard y TenantAccessGuard, y
 * ANTES de ModuleFeatureGuard (que consulta la BD con ese id).
 *
 * Solo lee `params.tenantId` (no query ni body) para que la decisión de acceso
 * y el tenant sobre el que opera el controlador sean siempre el mismo valor.
 * También valida que sea un UUID: los guards corren antes que los pipes, y un
 * valor inválido llegaría a Postgres como error 500.
 */
@Injectable()
export class TenantAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    const tenantId = request.params?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Falta el tenant para validar permisos');
    }
    if (!UUID_RE.test(tenantId)) {
      throw new BadRequestException('tenantId inválido');
    }

    if (user?.isSuperAdmin) return true;

    const membership = user?.tenantRoles?.find((tr: any) => tr.tenantId === tenantId);
    if (!membership || !isAdminRole(membership.role)) {
      throw new ForbiddenException('Necesitas permisos de administrador en esta cuenta');
    }
    return true;
  }
}
