import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantRole, isAdminRole } from '../users/enums/tenant-role.enum';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const COMPANIES_ADMIN_ONLY_KEY = 'companiesAdminOnly';
/** Marca una ruta que solo pueden ejecutar owner/admin (por ejemplo, la migración masiva). */
export const CompaniesAdminOnly = () => SetMetadata(COMPANIES_ADMIN_ONLY_KEY, true);

/**
 * Control de rol del módulo Empresas. Va DESPUÉS de JwtAuthGuard y
 * TenantAccessGuard (que verifica pertenencia a la cuenta) y ANTES de
 * ModuleFeatureGuard.
 *
 * - Leer: cualquier miembro de la cuenta.
 * - Crear y editar: todos menos `viewer`.
 * - Eliminar una empresa y rutas marcadas con @CompaniesAdminOnly: solo owner/admin.
 *
 * Solo lee `params.tenantId`, el mismo valor que usan los servicios, para que
 * la cuenta autorizada y la cuenta sobre la que se opera sean siempre la misma.
 */
@Injectable()
export class CompaniesAccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const tenantId = request.params?.tenantId;

    if (!tenantId) throw new ForbiddenException('Falta la cuenta para validar permisos');
    if (!UUID_RE.test(tenantId)) throw new BadRequestException('tenantId inválido');
    if (user?.isSuperAdmin) return true;

    const membership = user?.tenantRoles?.find((tr: any) => tr.tenantId === tenantId);
    if (!membership) throw new ForbiddenException('No tienes acceso a esta cuenta');

    if (READ_METHODS.has(request.method)) return true;
    if (membership.role === TenantRole.VIEWER) {
      throw new ForbiddenException('Tu rol es de solo lectura');
    }
    const adminOnly = this.reflector.getAllAndOverride<boolean>(COMPANIES_ADMIN_ONLY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (adminOnly && !isAdminRole(membership.role)) {
      throw new ForbiddenException('Solo owner o admin pueden hacer esto');
    }
    // Eliminar una empresa exige admin. Desvincular un contacto (ruta con
    // `linkId`) lo puede hacer cualquiera que pueda editar.
    if (request.method === 'DELETE' && !request.params?.linkId && !isAdminRole(membership.role)) {
      throw new ForbiddenException('Solo owner o admin pueden eliminar');
    }
    return true;
  }
}
