import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private readonly configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get('SMTP_HOST', 'smtp.gmail.com'),
      port: this.configService.get<number>('SMTP_PORT', 465),
      secure: this.configService.get('SMTP_SECURE', 'true') === 'true',
      auth: {
        user: this.configService.get('SMTP_USER'),
        pass: this.configService.get('SMTP_PASS'),
      },
    });
  }

  private get from(): string {
    const name = this.configService.get('SMTP_FROM_NAME', 'Smartee');
    const email = this.configService.get('SMTP_FROM_EMAIL', 'notificaciones@strategee.us');
    return `"${name}" <${email}>`;
  }

  async sendInvitation(params: {
    to: string;
    name: string;
    tenantName: string;
    role: string;
    temporaryPassword: string;
    loginUrl: string;
  }): Promise<void> {
    const { to, name, tenantName, role, temporaryPassword, loginUrl } = params;

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #1a1a1a; margin-bottom: 8px;">¡Te han invitado a Smartee!</h2>
        <p style="color: #666; font-size: 14px; line-height: 1.6;">
          Hola <strong>${name}</strong>,
        </p>
        <p style="color: #666; font-size: 14px; line-height: 1.6;">
          Has sido invitado como <strong>${role === 'admin' ? 'Administrador' : 'Agente'}</strong> 
          a la cuenta <strong>${tenantName}</strong> en Smartee.
        </p>
        <div style="background: #f8f9fa; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <p style="color: #333; font-size: 13px; margin: 0 0 8px 0;"><strong>Tus credenciales de acceso:</strong></p>
          <p style="color: #333; font-size: 13px; margin: 0;">Email: <code>${to}</code></p>
          <p style="color: #333; font-size: 13px; margin: 4px 0 0 0;">Contraseña temporal: <code>${temporaryPassword}</code></p>
        </div>
        <p style="color: #666; font-size: 14px; line-height: 1.6;">
          Ingresa a la plataforma y cambia tu contraseña:
        </p>
        <a href="${loginUrl}" style="display: inline-block; background: #1a1a1a; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 500; margin: 8px 0;">
          Ingresar a Smartee
        </a>
        <p style="color: #999; font-size: 12px; margin-top: 24px;">
          Si no esperabas esta invitación, puedes ignorar este correo.
        </p>
      </div>
    `;

    try {
      await this.transporter.sendMail({
        from: this.from,
        to,
        subject: `Te han invitado a ${tenantName} en Smartee`,
        html,
      });
      this.logger.log(`Invitation email sent to ${to}`);
    } catch (err) {
      this.logger.error(`Failed to send invitation email to ${to}:`, err);
      throw err;
    }
  }

  async sendTenantAccess(params: {
    to: string;
    name: string;
    tenantName: string;
    role: string;
    loginUrl: string;
  }): Promise<void> {
    const { to, name, tenantName, role, loginUrl } = params;

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #1a1a1a; margin-bottom: 8px;">Nuevo acceso a cuenta</h2>
        <p style="color: #666; font-size: 14px; line-height: 1.6;">
          Hola <strong>${name}</strong>,
        </p>
        <p style="color: #666; font-size: 14px; line-height: 1.6;">
          Se te ha otorgado acceso como <strong>${role === 'admin' ? 'Administrador' : 'Agente'}</strong> 
          a la cuenta <strong>${tenantName}</strong> en Smartee.
        </p>
        <p style="color: #666; font-size: 14px; line-height: 1.6;">
          Ya puedes acceder con tu cuenta actual:
        </p>
        <a href="${loginUrl}" style="display: inline-block; background: #1a1a1a; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 500; margin: 8px 0;">
          Ir a Smartee
        </a>
      </div>
    `;

    try {
      await this.transporter.sendMail({
        from: this.from,
        to,
        subject: `Tienes acceso a ${tenantName} en Smartee`,
        html,
      });
      this.logger.log(`Access notification sent to ${to}`);
    } catch (err) {
      this.logger.error(`Failed to send access email to ${to}:`, err);
    }
  }
}
