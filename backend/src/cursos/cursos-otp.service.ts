import {
  Injectable,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { createHash, randomInt } from 'crypto';
import { MailService } from '../mail/mail.service';
import { Inbox } from '../chats/inbox.entity';
import { Tenant } from '../tenants/tenant.entity';
import { Course, CourseVerificationConfig } from './entities/course.entity';
import { CourseOtp } from './entities/course-otp.entity';

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutos
const MAX_ATTEMPTS = 5;

export type OtpChannel = 'email' | 'phone';

@Injectable()
export class CursosOtpService {
  private readonly logger = new Logger(CursosOtpService.name);

  constructor(
    @InjectRepository(CourseOtp) private readonly otpRepo: Repository<CourseOtp>,
    @InjectRepository(Inbox) private readonly inboxRepo: Repository<Inbox>,
    private readonly mail: MailService,
  ) {}

  /**
   * OTP a nivel tenant (portal de academy), no atado a un curso. Usa la config
   * del portal (tenant.academyConfig) para enviar por email o WhatsApp.
   */
  async requestForTenant(
    tenant: Tenant,
    channel: OtpChannel,
    destinationRaw: string,
  ): Promise<{ otpId: string; channel: OtpChannel; maskedDestination: string; expiresInSec: number }> {
    const cfg = tenant.academyConfig || {};
    const allowed = cfg.verificationChannel || 'both';
    if (allowed !== 'both' && allowed !== channel) {
      throw new BadRequestException('Canal de verificación no permitido');
    }

    const destination = this.normalizeDestination(channel, destinationRaw);
    if (!this.isValidDestination(channel, destination)) {
      throw new BadRequestException(
        channel === 'email' ? 'Correo electrónico inválido' : 'Número de teléfono inválido',
      );
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const otp = await this.otpRepo.save(
      this.otpRepo.create({
        tenantId: tenant.id,
        courseId: null,
        enrollmentId: null,
        channel,
        destination,
        codeHash: this.hash(code),
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
        attempts: 0,
        verifiedAt: null,
      }),
    );

    if (channel === 'email') {
      await this.sendPortalEmail(cfg.emailTemplate, destination, code);
    } else {
      await this.sendPortalWhatsApp(tenant, destination, code);
    }

    return {
      otpId: otp.id,
      channel,
      maskedDestination: this.mask(channel, destination),
      expiresInSec: Math.round(OTP_TTL_MS / 1000),
    };
  }

  private async sendPortalEmail(
    tpl: { subject?: string; body?: string } | undefined,
    to: string,
    code: string,
  ): Promise<void> {
    const subject = (tpl?.subject || 'Tu código de acceso').replace(/\{\{\s*code\s*\}\}/gi, code);
    const body = (tpl?.body || 'Tu código de acceso al portal de cursos es: {{code}}\n\nExpira en 10 minutos.')
      .replace(/\{\{\s*code\s*\}\}/gi, code);
    const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;line-height:1.6;color:#1f2937;">
      ${body.split('\n').map((l) => this.escapeHtml(l)).join('<br/>')}
      <div style="margin-top:16px;font-size:28px;font-weight:700;letter-spacing:4px;color:#111827;">${code}</div>
    </div>`;
    try {
      await this.mail.sendRaw({ to, subject, text: body, html });
    } catch (err) {
      this.logger.error(`Fallo OTP portal (email) a ${to}: ${String(err)}`);
      throw new BadRequestException('No se pudo enviar el correo de verificación');
    }
  }

  private async sendPortalWhatsApp(tenant: Tenant, phone: string, code: string): Promise<void> {
    const cfg = tenant.academyConfig || {};
    if (!cfg.whatsappInboxId || !cfg.whatsappTemplateName) {
      throw new BadRequestException('La verificación por WhatsApp no está configurada');
    }
    const inbox = await this.inboxRepo.findOne({ where: { id: cfg.whatsappInboxId } });
    if (!inbox || inbox.tenantId !== tenant.id || !inbox.accessToken || !inbox.phoneNumberId) {
      throw new BadRequestException('El canal de WhatsApp no está conectado');
    }

    const components = [{ type: 'body', parameters: [{ type: 'text', text: code }] }];
    const buttonComponent = {
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: code }],
    };
    const to = phone.startsWith('+') ? phone.slice(1) : phone;
    const base: any = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: cfg.whatsappTemplateName,
        language: { code: cfg.whatsappLanguage || 'es' },
        components: [...components, buttonComponent],
      },
    };
    const send = (body: any) =>
      fetch(`https://graph.facebook.com/v21.0/${inbox.phoneNumberId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${inbox.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    try {
      let res = await send(base);
      if (!res.ok) res = await send({ ...base, template: { ...base.template, components } });
      const result = await res.json();
      if (!res.ok || !result.messages?.[0]?.id) {
        throw new Error(result?.error?.message || 'Error desconocido');
      }
    } catch (err) {
      this.logger.error(`Fallo OTP portal (WhatsApp) a ${to}: ${String(err)}`);
      throw new BadRequestException('No se pudo enviar el código por WhatsApp');
    }
  }

  /** Normaliza el destino: email en minúsculas, teléfono solo dígitos. */
  normalizeDestination(channel: OtpChannel, raw: string): string {
    const v = String(raw || '').trim();
    if (channel === 'email') return v.toLowerCase();
    return v.replace(/[^\d]/g, ''); // teléfono: solo dígitos (sin + ni espacios)
  }

  /**
   * Genera y envía un OTP por el canal indicado. Devuelve el id del OTP (para
   * el verify) y un destino enmascarado para mostrar en la UI.
   */
  async request(
    course: Course,
    enrollmentId: string | null,
    channel: OtpChannel,
    destinationRaw: string,
  ): Promise<{ otpId: string; channel: OtpChannel; maskedDestination: string; expiresInSec: number }> {
    const verification = course.settings?.verification;
    if (!verification?.enabled) {
      throw new BadRequestException('La verificación no está activa para este curso');
    }
    this.assertChannelAllowed(verification, channel);

    const destination = this.normalizeDestination(channel, destinationRaw);
    if (!this.isValidDestination(channel, destination)) {
      throw new BadRequestException(
        channel === 'email' ? 'Correo electrónico inválido' : 'Número de teléfono inválido',
      );
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const codeHash = this.hash(code);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    const otp = await this.otpRepo.save(
      this.otpRepo.create({
        tenantId: course.tenantId,
        courseId: course.id,
        enrollmentId,
        channel,
        destination,
        codeHash,
        expiresAt,
        attempts: 0,
        verifiedAt: null,
      }),
    );

    if (channel === 'email') {
      await this.sendEmailOtp(course, destination, code);
    } else {
      await this.sendWhatsAppOtp(course, destination, code);
    }

    return {
      otpId: otp.id,
      channel,
      maskedDestination: this.mask(channel, destination),
      expiresInSec: Math.round(OTP_TTL_MS / 1000),
    };
  }

  /**
   * Valida un OTP. Devuelve el canal y el destino normalizado si es correcto,
   * para que el servicio de cursos busque/atribuya el contacto.
   */
  async verify(otpId: string, code: string): Promise<{ channel: OtpChannel; destination: string }> {
    const otp = await this.otpRepo.findOne({ where: { id: otpId } });
    if (!otp) throw new BadRequestException('Código no encontrado. Solicita uno nuevo');
    if (otp.verifiedAt) throw new BadRequestException('Este código ya fue utilizado');
    if (otp.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('El código expiró. Solicita uno nuevo');
    }
    if (otp.attempts >= MAX_ATTEMPTS) {
      throw new BadRequestException('Demasiados intentos. Solicita un código nuevo');
    }

    if (this.hash(String(code || '').trim()) !== otp.codeHash) {
      otp.attempts += 1;
      await this.otpRepo.save(otp);
      throw new BadRequestException('Código incorrecto');
    }

    otp.verifiedAt = new Date();
    await this.otpRepo.save(otp);
    return { channel: otp.channel as OtpChannel, destination: otp.destination };
  }

  /** Limpia OTPs expirados (se puede invocar periódicamente). */
  async purgeExpired(): Promise<void> {
    await this.otpRepo.delete({ expiresAt: LessThan(new Date(Date.now() - OTP_TTL_MS)) });
  }

  // ─────────────────────────── envío ───────────────────────────

  private async sendEmailOtp(course: Course, to: string, code: string): Promise<void> {
    const tpl = course.settings?.verification?.emailTemplate;
    const subject = (tpl?.subject || 'Tu código de verificación').replace(/\{\{\s*code\s*\}\}/gi, code);
    const bodyText = (tpl?.body || 'Tu código de verificación es: {{code}}\n\nEl código expira en 10 minutos.')
      .replace(/\{\{\s*code\s*\}\}/gi, code);
    // HTML simple a partir del texto (respeta saltos de línea).
    const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;line-height:1.6;color:#1f2937;">
      ${bodyText.split('\n').map((l) => this.escapeHtml(l)).join('<br/>')}
      <div style="margin-top:16px;font-size:28px;font-weight:700;letter-spacing:4px;color:#111827;">${code}</div>
    </div>`;
    try {
      await this.mail.sendRaw({ to, subject, text: bodyText, html });
    } catch (err) {
      this.logger.error(`Fallo enviando OTP por email a ${to}: ${String(err)}`);
      throw new BadRequestException('No se pudo enviar el correo de verificación');
    }
  }

  private async sendWhatsAppOtp(course: Course, phone: string, code: string): Promise<void> {
    const v = course.settings?.verification;
    if (!v?.whatsappInboxId || !v.whatsappTemplateName) {
      throw new BadRequestException('La verificación por WhatsApp no está configurada');
    }
    const inbox = await this.inboxRepo.findOne({ where: { id: v.whatsappInboxId } });
    if (!inbox || inbox.tenantId !== course.tenantId) {
      throw new BadRequestException('Canal de WhatsApp no disponible');
    }
    if (!inbox.accessToken || !inbox.phoneNumberId) {
      throw new BadRequestException('El canal de WhatsApp no está conectado');
    }

    const codeVar = v.whatsappCodeVariable || '1';
    const bodyParams = [{ type: 'text', text: code }];
    const components = [{ type: 'body', parameters: bodyParams }];
    // Plantillas de autenticación de Meta requieren el botón de copia con el
    // mismo código; si la plantilla lo tiene, se añade el componente de botón.
    const buttonComponent = {
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: code }],
    };

    const to = phone.startsWith('+') ? phone.slice(1) : phone;
    const requestBody: any = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: v.whatsappTemplateName,
        language: { code: v.whatsappLanguage || 'es' },
        components: [...components, buttonComponent],
      },
    };

    // Reintento sin el botón si la plantilla no es de autenticación.
    const send = async (body: any) =>
      fetch(`https://graph.facebook.com/v21.0/${inbox.phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${inbox.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

    try {
      let res = await send(requestBody);
      if (!res.ok) {
        // Reintentar sin el botón (plantillas UTILITY/MARKETING de solo cuerpo).
        res = await send({ ...requestBody, template: { ...requestBody.template, components } });
      }
      const result = await res.json();
      if (!res.ok || !result.messages?.[0]?.id) {
        const msg = result?.error?.message || 'Error desconocido';
        throw new Error(msg);
      }
    } catch (err) {
      this.logger.error(`Fallo enviando OTP por WhatsApp a ${to}: ${String(err)}`);
      throw new BadRequestException('No se pudo enviar el código por WhatsApp');
    }
  }

  // ─────────────────────────── helpers ───────────────────────────

  private assertChannelAllowed(v: CourseVerificationConfig, channel: OtpChannel): void {
    const allowed = v.channel || 'both';
    if (allowed !== 'both' && allowed !== channel) {
      throw new BadRequestException('Canal de verificación no permitido para este curso');
    }
  }

  private isValidDestination(channel: OtpChannel, dest: string): boolean {
    if (channel === 'email') return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(dest);
    return dest.length >= 7 && dest.length <= 15;
  }

  private hash(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }

  private mask(channel: OtpChannel, dest: string): string {
    if (channel === 'email') {
      const [user, domain] = dest.split('@');
      const maskedUser = user.length <= 2 ? user[0] + '*' : user.slice(0, 2) + '***';
      return `${maskedUser}@${domain}`;
    }
    return dest.length > 4 ? `••••${dest.slice(-4)}` : dest;
  }

  private escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
