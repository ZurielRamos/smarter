import { Controller, Get, Post, Param, Res, Query, Body, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/public.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantAccessGuard } from '../auth/tenant-access.guard';
import type { Response } from 'express';
import { EmailUnsubscribeService } from './email-unsubscribe.service';

/**
 * Public endpoints for email unsubscribe.
 * No authentication required — accessed via link in emails.
 */
@SkipThrottle()
@Controller('email')
export class EmailUnsubscribeController {
  constructor(private readonly unsubscribeService: EmailUnsubscribeService) {}

  /**
   * GET /api/email/unsubscribe/:token
   * Shows a confirmation page. The user clicks "Confirmar" to complete.
   */
  @Public()
  @Get('unsubscribe/:token')
  async showUnsubscribePage(@Param('token') token: string, @Res() res: Response) {
    const payload = this.unsubscribeService.decryptToken(decodeURIComponent(token));

    if (!payload) {
      return res.status(400).send(this.renderPage('error', 'El enlace es inválido o ha expirado.'));
    }

    return res.status(200).send(this.renderPage('confirm', payload.email, token));
  }

  /**
   * POST /api/email/unsubscribe/:token
   * Actually performs the unsubscribe.
   */
  @Public()
  @Post('unsubscribe/:token')
  async confirmUnsubscribe(@Param('token') token: string, @Res() res: Response) {
    const payload = this.unsubscribeService.decryptToken(decodeURIComponent(token));

    if (!payload) {
      return res.status(400).send(this.renderPage('error', 'El enlace es inválido o ha expirado.'));
    }

    await this.unsubscribeService.unsubscribe(payload.tenantId, payload.email, 'unsubscribe_link');
    return res.status(200).send(this.renderPage('success', payload.email));
  }

  /**
   * GET /api/email/unsubscribe/:token/one-click
   * RFC 8058 one-click unsubscribe (used by List-Unsubscribe-Post header).
   * Mail clients call this directly.
   */
  @Public()
  @Post('unsubscribe/:token/one-click')
  async oneClickUnsubscribe(@Param('token') token: string, @Res() res: Response) {
    const payload = this.unsubscribeService.decryptToken(decodeURIComponent(token));

    if (!payload) {
      return res.status(400).json({ error: 'Invalid token' });
    }

    await this.unsubscribeService.unsubscribe(payload.tenantId, payload.email, 'one_click');
    return res.status(200).json({ success: true });
  }

  // ─── Admin endpoints (authenticated) ──────────────────────────────

  /**
   * GET /api/email/unsubscribes/:tenantId
   * List unsubscribes for a tenant (admin).
   */
  @UseGuards(JwtAuthGuard, TenantAccessGuard)
  @Get('unsubscribes/:tenantId')
  async listUnsubscribes(
    @Param('tenantId') tenantId: string,
    @Query('limit') limit = '100',
    @Query('offset') offset = '0',
  ) {
    return this.unsubscribeService.findByTenant(tenantId, Math.min(+limit, 500), +offset);
  }

  /**
   * POST /api/email/unsubscribes/:tenantId/resubscribe
   * Re-subscribe an email (admin action).
   */
  @UseGuards(JwtAuthGuard, TenantAccessGuard)
  @Post('unsubscribes/:tenantId/resubscribe')
  async resubscribe(@Param('tenantId') tenantId: string, @Body() body: { email: string }) {
    await this.unsubscribeService.resubscribe(tenantId, body.email);
    return { success: true };
  }

  // ─── HTML Rendering ────────────────────────────────────────────────

  private renderPage(type: 'confirm' | 'success' | 'error', email: string, token?: string): string {
    const baseStyles = `
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f8f9fa; }
      .card { background: white; border-radius: 12px; padding: 40px; max-width: 420px; text-align: center; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
      h1 { font-size: 20px; color: #1a1a1a; margin-bottom: 8px; }
      p { font-size: 14px; color: #666; line-height: 1.5; }
      .email { font-weight: 600; color: #333; }
      .btn { display: inline-block; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 500; text-decoration: none; cursor: pointer; border: none; margin-top: 16px; }
      .btn-danger { background: #dc3545; color: white; }
      .btn-danger:hover { background: #c82333; }
      .success-icon { font-size: 48px; margin-bottom: 12px; }
      .error-icon { font-size: 48px; margin-bottom: 12px; }
    `;

    if (type === 'confirm') {
      return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cancelar suscripción</title><style>${baseStyles}</style></head><body>
        <div class="card">
          <div class="success-icon">📧</div>
          <h1>Cancelar suscripción</h1>
          <p>¿Deseas dejar de recibir emails en <span class="email">${email}</span>?</p>
          <p style="font-size:12px;color:#999;">No volverás a recibir correos de marketing de esta cuenta.</p>
          <form method="POST" action="/api/email/unsubscribe/${encodeURIComponent(token!)}">
            <button type="submit" class="btn btn-danger">Confirmar cancelación</button>
          </form>
        </div>
      </body></html>`;
    }

    if (type === 'success') {
      return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Suscripción cancelada</title><style>${baseStyles}</style></head><body>
        <div class="card">
          <div class="success-icon">✅</div>
          <h1>Suscripción cancelada</h1>
          <p><span class="email">${email}</span> ha sido removido de la lista de envíos.</p>
          <p style="font-size:12px;color:#999;margin-top:16px;">Si esto fue un error, contacta al remitente para volver a suscribirte.</p>
        </div>
      </body></html>`;
    }

    // Error
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Error</title><style>${baseStyles}</style></head><body>
      <div class="card">
        <div class="error-icon">⚠️</div>
        <h1>Enlace inválido</h1>
        <p>${email}</p>
      </div>
    </body></html>`;
  }
}
