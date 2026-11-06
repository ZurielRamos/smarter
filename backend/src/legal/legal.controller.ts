import { BadRequestException, Body, Controller, Logger, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/public.decorator';
import { MailService } from '../mail/mail.service';

const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/;

/** Quita saltos de línea y caracteres de control de un texto de una línea. */
const oneLine = (s: unknown, max: number) =>
  String(s ?? '')
    .replace(/[\r\n\t\u0000-\u001f]+/g, ' ')
    .trim()
    .slice(0, max);

/**
 * Endpoints públicos para cumplimiento legal (Meta, GDPR, Ley 1581).
 * La página /data-deletion del frontend envía aquí las solicitudes de
 * eliminación de datos; se notifican por correo al responsable de datos.
 */
@Controller('data-deletion-requests')
export class LegalController {
  private readonly logger = new Logger(LegalController.name);

  constructor(
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Throttle({ short: { limit: 3, ttl: 60000 } })
  @Post()
  async create(@Body() body: { name?: string; email?: string; reason?: string }) {
    const name = oneLine(body?.name, 120);
    const email = oneLine(body?.email, 200);
    const reason = String(body?.reason ?? '').trim().slice(0, 1000);

    if (name.length < 2) throw new BadRequestException('Ingresa tu nombre completo');
    if (!EMAIL_RE.test(email)) throw new BadRequestException('Ingresa un correo válido');

    const to = this.config.get<string>('DATA_DELETION_EMAIL', 'notificaciones@strategee.us');
    const requestedAt = new Date().toISOString();

    try {
      // Solo texto plano: el contenido lo escribe un tercero sin autenticar.
      await this.mail.sendRaw({
        to,
        replyTo: email,
        subject: 'Solicitud de eliminación de datos personales',
        text: [
          'Se recibió una solicitud de eliminación de datos desde el sitio.',
          '',
          `Nombre: ${name}`,
          `Correo: ${email}`,
          `Fecha: ${requestedAt}`,
          `Motivo: ${reason || '(no indicado)'}`,
          '',
          'Verifica la identidad del solicitante antes de eliminar y responde a este correo',
          'para confirmar la recepción. Plazo máximo: 30 días calendario.',
        ].join('\n'),
      });
    } catch (err) {
      this.logger.error(`No se pudo notificar la solicitud de eliminación (${email}): ${(err as Error)?.message}`);
      throw new BadRequestException(
        'No pudimos registrar tu solicitud. Escríbenos a notificaciones@strategee.us.',
      );
    }

    this.logger.log(`Solicitud de eliminación de datos recibida: ${email} (${requestedAt})`);
    return { ok: true };
  }
}
