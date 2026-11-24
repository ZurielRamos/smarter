import {
  Body,
  Controller,
  Query,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../auth/public.decorator';
import { PortalAuthService } from './portal-auth.service';
import { PortalConfigService } from './portal-config.service';
import { PortalService } from './portal.service';
import { ProjectPublicService } from '../project-public.service';
import { RewardLedgerService } from '../reward-ledger.service';
import { PortalAnySessionParam, PortalSessionGuard, PortalSessionParam, ProjectSessionGuard, ProjectSessionParam } from './portal-session.guard';
import { MAX_DOCUMENT_BYTES } from './profile-documents.service';
import type { PortalAnySession, PortalSession, ProjectSession } from './portal-auth.service';

/**
 * Portal público del encuestador. No usa la sesión del CRM: las rutas de datos
 * exigen el token del portal (PortalSessionGuard) y siempre operan sobre el
 * perfil de esa sesión, nunca sobre un id que envíe el cliente.
 */
@Public()
@Controller('recruit-portal/:tenantSlug')
export class PortalController {
  constructor(
    private readonly auth: PortalAuthService,
    private readonly portalConfig: PortalConfigService,
    private readonly portal: PortalService,
    private readonly projectPublic: ProjectPublicService,
    private readonly ledger: RewardLedgerService,
  ) {}

  private ip(req: any): string | undefined {
    return req.ip || req.socket?.remoteAddress;
  }

  // ───── Acceso (sin sesión) ─────

  @Get()
  async info(@Param('tenantSlug') slug: string) {
    const tenant = await this.auth.resolveTenant(slug);
    const cfg = await this.portalConfig.get(tenant.id);
    return {
      tenant: { name: tenant.name, slug: tenant.slug, iconPath: tenant.iconPath },
      verificationChannel: cfg.verification.channel,
      welcomeMessage: cfg.welcomeMessage,
      registration: { open: cfg.registration.mode === 'open', consentText: cfg.registration.consentText },
      // Apagada, el portal muestra solo el acceso.
      landing: cfg.landing.enabled ? cfg.landing : null,
    };
  }

  /** Dirección pública de un proyecto: su landing, formulario y si recibe postulaciones. */
  @Get('projects/:projectSlug')
  async projectInfo(@Param('tenantSlug') slug: string, @Param('projectSlug') projectSlug: string) {
    const tenant = await this.auth.resolveTenant(slug);
    const project = await this.projectPublic.resolvePublic(tenant, projectSlug);
    const [cfg, info] = await Promise.all([this.portalConfig.get(tenant.id), this.projectPublic.publicInfo(project)]);
    return {
      tenant: { name: tenant.name, slug: tenant.slug, iconPath: tenant.iconPath },
      // Los canales con que se verifica este proyecto (los suyos, o los de la cuenta).
      verificationChannel: this.auth.projectConfig(cfg, project).verification.channel,
      welcomeMessage: cfg.welcomeMessage,
      registration: { open: info.registrationOpen, consentText: cfg.registration.consentText },
      landing: info.landing,
      project: info.project,
    };
  }

  /** Registro por la dirección de un proyecto: pide el código; el prospecto se guarda al verificarlo. */
  @Post('projects/:projectSlug/register/request')
  @Throttle({ medium: { limit: 5, ttl: 60_000 } })
  requestProjectRegistration(
    @Param('tenantSlug') slug: string,
    @Param('projectSlug') projectSlug: string,
    @Body() body: { fullName?: string; channel?: string; destination?: string; consent?: boolean; answers?: unknown },
  ) {
    return this.auth.requestProjectRegistration(slug, projectSlug, body ?? {});
  }

  @Post('projects/:projectSlug/register/verify')
  @Throttle({ medium: { limit: 20, ttl: 60_000 } })
  verifyProjectRegistration(@Param('tenantSlug') slug: string, @Param('projectSlug') projectSlug: string, @Body() body: { otpId?: string; code?: string }) {
    return this.auth.verifyProjectRegistration(slug, projectSlug, body?.otpId, body?.code);
  }

  /** Ingreso a la landing de un proyecto: pide el código a quien ya se registró en él. */
  @Post('projects/:projectSlug/login/request')
  @Throttle({ medium: { limit: 10, ttl: 60_000 } })
  requestProjectLogin(@Param('tenantSlug') slug: string, @Param('projectSlug') projectSlug: string, @Body() body: { channel?: string; destination?: string }) {
    return this.auth.requestProjectLogin(slug, projectSlug, body ?? {});
  }

  @Post('projects/:projectSlug/login/verify')
  @Throttle({ medium: { limit: 20, ttl: 60_000 } })
  verifyProjectLogin(@Param('tenantSlug') slug: string, @Param('projectSlug') projectSlug: string, @Body() body: { otpId?: string; code?: string }) {
    return this.auth.verifyProjectLogin(slug, projectSlug, body?.otpId, body?.code);
  }

  /** Lo que la persona ve de su participación en este proyecto, con la sesión de esta landing. */
  @Get('projects/:projectSlug/me')
  @UseGuards(ProjectSessionGuard)
  projectMe(@ProjectSessionParam() session: ProjectSession) {
    return this.portal.projectMe(session);
  }

  @Get('invitation/:token')
  @Throttle({ medium: { limit: 20, ttl: 60_000 } })
  invitation(@Param('tenantSlug') slug: string, @Param('token') token: string) {
    return this.auth.describeInvitation(slug, token);
  }

  /** Registro abierto: pide el código con el que se verifica el correo o teléfono. No crea nada todavía. */
  @Post('register/request')
  @Throttle({ medium: { limit: 5, ttl: 60_000 } })
  requestRegistration(
    @Param('tenantSlug') slug: string,
    @Body() body: { fullName?: string; channel?: string; destination?: string; consent?: boolean },
  ) {
    return this.auth.requestRegistration(slug, body ?? {});
  }
  @Post('otp/request')
  @Throttle({ medium: { limit: 10, ttl: 60_000 } })
  requestCode(@Param('tenantSlug') slug: string, @Body() body: { inviteToken?: string; channel?: string; destination?: string }) {
    return this.auth.requestLogin(slug, body ?? {});
  }

  @Post('otp/verify')
  @Throttle({ medium: { limit: 20, ttl: 60_000 } })
  verifyCode(@Param('tenantSlug') slug: string, @Body() body: { otpId?: string; code?: string }, @Req() req: any) {
    return this.auth.verifyLogin(slug, body?.otpId, body?.code, { ip: this.ip(req) });
  }

  // ───── Con sesión ─────

  @Get('me')
  @UseGuards(PortalSessionGuard)
  me(@PortalAnySessionParam() session: PortalAnySession) {
    return session.profile ? this.portal.me({ tenant: session.tenant, profile: session.profile }) : this.portal.meContact(session);
  }

  /** Saldo y movimientos de la persona: encuestas aprobadas, reversas y pagos. */
  @Get('me/earnings')
  @UseGuards(PortalSessionGuard)
  earnings(@PortalSessionParam() session: PortalSession, @Query('page') page?: string) {
    return this.ledger.earningsForProfile(session.tenant.id, session.profile, { page });
  }

  @Patch('me/data')
  @UseGuards(PortalSessionGuard)
  updateData(@PortalSessionParam() session: PortalSession, @Body() body: Record<string, unknown>) {
    return this.portal.updateData(session, body ?? {});
  }

  @Post('documents/:docKey')
  @UseGuards(PortalSessionGuard)
  @Throttle({ medium: { limit: 20, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1 } }))
  async uploadDocument(@PortalSessionParam() session: PortalSession, @Param('docKey') docKey: string, @UploadedFile() file: any) {
    const doc = await this.portal.uploadDocument(session, docKey, file);
    return { id: doc.id, docKey: doc.docKey, fileName: doc.fileName, status: doc.status };
  }

  @Get('documents/:id/file')
  @UseGuards(PortalSessionGuard)
  async documentFile(
    @PortalSessionParam() session: PortalSession,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: any,
  ) {
    const { doc, data } = await this.portal.readDocument(session, id);
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', 'Content-Security-Policy': "sandbox; default-src 'none'" });
    return new StreamableFile(data, { type: doc.mimeType, disposition: `inline; filename="${encodeURIComponent(doc.fileName)}"` });
  }

  @Delete('documents/:id')
  @UseGuards(PortalSessionGuard)
  removeDocument(@PortalSessionParam() session: PortalSession, @Param('id', ParseUUIDPipe) id: string) {
    return this.portal.removeDocument(session, id);
  }

  @Get('contracts/:contractId')
  @UseGuards(PortalSessionGuard)
  contract(@PortalSessionParam() session: PortalSession, @Param('contractId', ParseUUIDPipe) contractId: string) {
    return this.portal.contractDocument(session, contractId);
  }

  @Post('contracts/:contractId/sign/request')
  @UseGuards(PortalSessionGuard)
  @Throttle({ medium: { limit: 10, ttl: 60_000 } })
  requestSign(
    @PortalSessionParam() session: PortalSession,
    @Param('contractId', ParseUUIDPipe) contractId: string,
    @Body() body: { channel?: string },
  ) {
    return this.portal.requestSignCode(session, contractId, body?.channel);
  }

  @Post('contracts/:contractId/sign')
  @UseGuards(PortalSessionGuard)
  @Throttle({ medium: { limit: 20, ttl: 60_000 } })
  sign(
    @PortalSessionParam() session: PortalSession,
    @Param('contractId', ParseUUIDPipe) contractId: string,
    @Body() body: { otpId?: string; code?: string; accept?: boolean },
    @Req() req: any,
  ) {
    return this.portal.sign(session, contractId, body ?? {}, { ip: this.ip(req), userAgent: req.headers['user-agent'] });
  }
}
