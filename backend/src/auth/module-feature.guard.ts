import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';
import { REQUIRES_FEATURE_KEY } from './requires-feature.decorator';

/**
 * Guard que bloquea el acceso a módulos opcionales del CRM cuando el feature flag
 * correspondiente está apagado para el tenant.
 *
 * Lee el feature requerido desde el decorator @RequiresFeature(...) y comprueba
 * `tenant.features[feature]`. Si está ausente o falsy, responde 403.
 *
 * Resuelve el tenantId desde params.tenantId, query.tenantId o body.tenantId
 * (mismo criterio que TenantAccessGuard). Usar DESPUÉS de JwtAuthGuard.
 */
@Injectable()
export class ModuleFeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.getAllAndOverride<'companies' | 'projects'>(
      REQUIRES_FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Si el endpoint no declara feature requerido, no aplica este guard.
    if (!feature) return true;

    const request = context.switchToHttp().getRequest();

    const tenantId =
      request.params?.tenantId ||
      request.query?.tenantId ||
      request.body?.tenantId;

    if (!tenantId) {
      throw new ForbiddenException('Falta el tenant para validar el módulo');
    }

    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw new ForbiddenException('Cuenta no encontrada');
    }

    if (!tenant.features?.[feature]) {
      throw new ForbiddenException(
        `El módulo "${feature}" no está activo para esta cuenta`,
      );
    }

    return true;
  }
}
