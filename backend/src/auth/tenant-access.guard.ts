import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

/**
 * Guard que verifica que el usuario tiene acceso al tenant solicitado.
 * Busca el tenantId en params.id, params.tenantId, o body.tenantId.
 * SuperAdmins tienen acceso a todos los tenants.
 * Usar DESPUÉS de JwtAuthGuard.
 */
@Injectable()
export class TenantAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // SuperAdmin puede acceder a cualquier tenant
    if (user?.isSuperAdmin) {
      return true;
    }

    // Determinar el tenantId del request
    const tenantId =
      request.params?.tenantId ||
      request.query?.tenantId ||
      request.body?.tenantId;

    if (!tenantId) {
      // Si no hay tenantId en la request, permitir (endpoints globales)
      return true;
    }

    // Verificar que el usuario pertenezca a este tenant
    const hasAccess = user?.tenantRoles?.some(
      (tr: any) => tr.tenantId === tenantId,
    );

    if (!hasAccess) {
      throw new ForbiddenException('No tienes acceso a esta cuenta');
    }

    return true;
  }
}
