import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';

/**
 * Guard que autentica usuarios mediante su API token fijo.
 * Busca el token en:
 *  1. Header 'x-api-token'
 *  2. Header 'Authorization: Bearer <token>' (si el token no es un JWT)
 *
 * Inyecta el usuario completo (con tenantRoles) en request.user
 */
@Injectable()
export class ApiTokenGuard implements CanActivate {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const apiToken = this.extractToken(request);
    if (!apiToken) {
      throw new UnauthorizedException('Token de API requerido. Envía el header x-api-token o Authorization: Bearer <tu-token>');
    }

    // API tokens are 64-char hex strings; JWTs contain dots
    if (apiToken.includes('.')) {
      throw new UnauthorizedException('Token de API inválido. Usa tu token de API, no un JWT.');
    }

    const user = await this.userRepo.findOne({
      where: { apiToken, isActive: true },
      relations: { tenantRoles: { tenant: true } },
    });

    if (!user) {
      throw new UnauthorizedException('Token de API inválido o usuario desactivado');
    }

    // Attach user with active tenant roles
    const activeRoles = user.tenantRoles?.filter((tr) => tr.status === 'active') || [];
    request.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      isSuperAdmin: user.isSuperAdmin,
      tenantRoles: activeRoles.map((tr) => ({
        tenantId: tr.tenantId,
        role: tr.role,
        tenant: {
          id: tr.tenant.id,
          name: tr.tenant.name,
          slug: tr.tenant.slug,
        },
      })),
    };

    return true;
  }

  private extractToken(request: any): string | null {
    // Priority 1: x-api-token header
    const xApiToken = request.headers['x-api-token'];
    if (xApiToken) return xApiToken;

    // Priority 2: Authorization Bearer header (only if not a JWT)
    const authHeader = request.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }

    return null;
  }
}
