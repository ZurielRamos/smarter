import {
  Body,
  Controller,
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
import { PortalSessionGuard, PortalSessionParam } from './portal-session.guard';
import { MAX_DOCUMENT_BYTES } from './profile-documents.service';
import type { PortalSession } from './portal-auth.service';

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
  ) {}

  private ip(req: any): string | undefined {
    return req.ip || req.socket?.remoteAddress;
  }

  // ───── Acceso (sin sesión) ─────

  @Get()
  async info(@Param('tenantSlug') slug: string) {
    const tenant = await this.auth.resolveTenant(slug);
    const cfg = await this.portalConfig.get(tenant.id);
    return { tenant: { name: tenant.name, slug: tenant.slug, iconPath: tenant.iconPath }, verificationChannel: cfg.verification.channel, welcomeMessage: cfg.welcomeMessage };
  }

  @Get('invitation/:token')
  @Throttle({ medium: { limit: 20, ttl: 60_000 } })
  invitation(@Param('tenantSlug') slug: string, @Param('token') token: string) {
    return this.auth.describeInvitation(slug, token);
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
  me(@PortalSessionParam() session: PortalSession) {
    return this.portal.me(session);
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
