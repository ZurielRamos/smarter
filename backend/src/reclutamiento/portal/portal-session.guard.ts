import { CanActivate, createParamDecorator, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PortalAnySession, PortalSession, PortalAuthService, ProjectSession } from './portal-auth.service';

/**
 * Autentica las rutas del portal con el token de sesión (cabecera
 * `x-portal-token`). Es independiente de la sesión del CRM. La sesión puede ser
 * de un encuestador (con perfil) o de un contacto registrado en un proyecto.
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

/** Sesión del portal sea de perfil o de contacto (la pone PortalSessionGuard). */
export const PortalAnySessionParam = createParamDecorator((_data: unknown, ctx: ExecutionContext): PortalAnySession => {
  return ctx.switchToHttp().getRequest().portal;
});

/** Sesión de un encuestador con perfil. Un contacto sin perfil no pasa: no tiene datos, documentos ni contratos. */
export const PortalSessionParam = createParamDecorator((_data: unknown, ctx: ExecutionContext): PortalSession => {
  const session: PortalAnySession = ctx.switchToHttp().getRequest().portal;
  if (!session.profile) throw new ForbiddenException('Esta sección está disponible cuando la cuenta te habilite como parte del equipo.');
  return { tenant: session.tenant, profile: session.profile };
});

/** Autentica las rutas de la landing de un proyecto: el token solo vale para ese proyecto. */
@Injectable()
export class ProjectSessionGuard implements CanActivate {
  constructor(private readonly auth: PortalAuthService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const header = req.headers['x-portal-token'];
    req.projectSession = await this.auth.authenticateProject(req.params?.tenantSlug, req.params?.projectSlug, Array.isArray(header) ? header[0] : header);
    return true;
  }
}

export const ProjectSessionParam = createParamDecorator((_data: unknown, ctx: ExecutionContext): ProjectSession => {
  return ctx.switchToHttp().getRequest().projectSession;
});
