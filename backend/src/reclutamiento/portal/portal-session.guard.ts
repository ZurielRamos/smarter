import { CanActivate, createParamDecorator, ExecutionContext, Injectable } from '@nestjs/common';
import { PortalAuthService, PortalSession } from './portal-auth.service';

/**
 * Autentica las rutas del portal con el token de sesión del encuestador
 * (cabecera `x-portal-token`). Es independiente de la sesión del CRM.
 */
@Injectable()
export class PortalSessionGuard implements CanActivate {
  constructor(private readonly auth: PortalAuthService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const header = req.headers['x-portal-token'];
    req.portal = await this.auth.authenticate(req.params?.tenantSlug, Array.isArray(header) ? header[0] : header);
    return true;
  }
}

/** Sesión del encuestador autenticado (la pone PortalSessionGuard). */
export const PortalSessionParam = createParamDecorator((_data: unknown, ctx: ExecutionContext): PortalSession => {
  return ctx.switchToHttp().getRequest().portal;
});
