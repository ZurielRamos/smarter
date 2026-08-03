import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

/**
 * Guard que requiere que el usuario sea SuperAdmin.
 * Usar DESPUÉS de JwtAuthGuard.
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.isSuperAdmin) {
      throw new ForbiddenException('Se requieren permisos de Super Administrador');
    }

    return true;
  }
}
