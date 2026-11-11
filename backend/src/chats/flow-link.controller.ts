import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ChatsService } from './chats.service';
import {
  FLOW_LINK_CODE_RE,
  FlowLinksService,
} from '../conversation-flows/flow-links.service';
import { isHttpUrl } from '../conversation-flows/flow-buttons.util';

/**
 * User-Agents que NO son una persona abriendo el enlace: rastreadores de vista
 * previa de WhatsApp, Meta, Telegram, etc. y herramientas. Contarlos como clic
 * enviaría el seguimiento del flujo a alguien que aún no abrió nada.
 *
 * `^WhatsApp/` es el rastreador de vistas previas; el navegador que abre
 * WhatsApp en el teléfono se identifica como Chrome o Safari.
 */
const NON_HUMAN_UA =
  /^WhatsApp\/|facebookexternalhit|facebookcatalog|Facebot|Meta-ExternalAgent|Meta-ExternalFetcher|Twitterbot|TelegramBot|Slackbot|Discordbot|LinkedInBot|Skype|Embedly|bot\b|crawler|spider|preview|curl\/|wget\/|python-requests|go-http-client|java\/|headless/i;

/**
 * Redirección de enlaces cortos de flujos: GET /webhooks/l/:code
 * (`webhooks/*` queda fuera del prefijo /api). Es pública a propósito: la abren
 * los contactos desde su teléfono.
 */
@Controller('webhooks/l')
@SkipThrottle()
export class FlowLinkController {
  constructor(
    private readonly flowLinks: FlowLinksService,
    private readonly chatsService: ChatsService,
  ) {}

  @Get(':code')
  async redirect(
    @Param('code') code: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!FLOW_LINK_CODE_RE.test(code)) {
      return res.status(404).type('text/plain').send('Enlace no encontrado');
    }

    const link = await this.flowLinks.findByCode(code);
    // Solo se redirige a lo guardado en base de datos, nunca a un parámetro de la URL.
    if (!link || !isHttpUrl(link.url)) {
      return res.status(404).type('text/plain').send('Enlace no encontrado');
    }

    // Sin caché: cada apertura debe llegar al servidor para contarse.
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.redirect(302, link.url);

    // El clic se registra DESPUÉS de redirigir: si algo falla, la persona ya llegó.
    const ua = String(req.headers['user-agent'] || '');
    if (req.method !== 'GET' || !ua || NON_HUMAN_UA.test(ua)) return;
    setImmediate(() => {
      this.chatsService.registerFlowLinkClick(code).catch((err) => {
        console.error(
          '[FlowLink] Error al registrar el clic:',
          err?.message || err,
        );
      });
    });
  }
}
