import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Inbox } from '../../chats/inbox.entity';
import { MailService } from '../../mail/mail.service';

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Sustituye {{variable}} por su valor; las variables desconocidas se dejan vacías. */
export function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_m, name: string) => vars[name.toLowerCase()] ?? '');
}

/** Envío de correos y plantillas de WhatsApp del portal del encuestador. */
@Injectable()
export class PortalMessengerService {
  private readonly logger = new Logger(PortalMessengerService.name);

  constructor(
    private readonly mail: MailService,
    @InjectRepository(Inbox) private readonly inboxes: Repository<Inbox>,
  ) {}

  /** `highlight` (p. ej. el código) se muestra grande bajo el mensaje; `link` se vuelve un botón. */
  async sendEmail(to: string, subject: string, body: string, opts: { highlight?: string; link?: string } = {}): Promise<void> {
    const lines = body
      .split('\n')
      .map((l) => escapeHtml(l))
      .join('<br/>');
    const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;line-height:1.6;color:#1f2937;">
      ${lines}
      ${opts.highlight ? `<div style="margin-top:16px;font-size:28px;font-weight:700;letter-spacing:4px;color:#111827;">${escapeHtml(opts.highlight)}</div>` : ''}
      ${opts.link ? `<p style="margin-top:20px"><a href="${escapeHtml(opts.link)}" style="background:#0f766e;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;">Abrir el portal</a></p>` : ''}
    </div>`;
    try {
      await this.mail.sendRaw({ to, subject, text: body, html });
    } catch (err) {
      this.logger.error(`Fallo enviando correo del portal: ${String(err)}`);
      throw new BadRequestException('No se pudo enviar el correo');
    }
  }

  /**
   * Envía una plantilla aprobada de WhatsApp. `bodyParams` van al cuerpo en
   * orden; `codeButton` agrega el botón de copiar código de las plantillas de
   * autenticación de Meta (si la plantilla no lo tiene, se reintenta sin él).
   */
  async sendWhatsApp(
    tenantId: string,
    wa: { inboxId: string | null; templateName: string; language: string },
    phoneDigits: string,
    bodyParams: string[],
    codeButton?: string,
  ): Promise<void> {
    if (!wa.inboxId || !wa.templateName) throw new BadRequestException('WhatsApp no está configurado');
    const inbox = await this.inboxes.findOne({ where: { id: wa.inboxId, tenantId } });
    if (!inbox || !inbox.accessToken || !inbox.phoneNumberId) throw new BadRequestException('El canal de WhatsApp no está conectado');

    // Meta no admite saltos de línea ni tabulaciones en los parámetros.
    const clean = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 1000) || '-';
    const body = { type: 'body', parameters: bodyParams.map((t) => ({ type: 'text', text: clean(t) })) };
    const button = codeButton ? { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: codeButton }] } : null;
    const payload = (components: unknown[]) => ({
      messaging_product: 'whatsapp',
      to: phoneDigits,
      type: 'template',
      template: { name: wa.templateName, language: { code: wa.language || 'es' }, components },
    });
    const send = (components: unknown[]) =>
      fetch(`https://graph.facebook.com/v21.0/${inbox.phoneNumberId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${inbox.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload(components)),
      });
    try {
      let res = await send(button ? [body, button] : [body]);
      if (!res.ok && button) res = await send([body]);
      const result: any = await res.json().catch(() => ({}));
      if (!res.ok || !result.messages?.[0]?.id) throw new Error(result?.error?.message || 'Error desconocido');
    } catch (err) {
      this.logger.error(`Fallo enviando WhatsApp del portal: ${String(err)}`);
      throw new BadRequestException('No se pudo enviar el mensaje de WhatsApp');
    }
  }
}
