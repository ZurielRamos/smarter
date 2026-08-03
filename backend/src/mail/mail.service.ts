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
    setupUrl: string;
  }): Promise<void> {
    const { to, name, tenantName, role, setupUrl } = params;

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 0;">
        <!-- Header -->
        <div style="background: #1a1a1a; padding: 24px 32px; border-radius: 12px 12px 0 0;">
          <img src="https://crm.strategee.us/logo-completo.png" alt="Smartee" style="height: 28px;" />
        </div>
        
        <!-- Body -->
        <div style="background: #ffffff; padding: 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
          <h2 style="color: #1a1a1a; margin: 0 0 16px 0; font-size: 20px;">¡Te han invitado!</h2>
          <p style="color: #4b5563; font-size: 14px; line-height: 1.6; margin: 0 0 8px 0;">
            Hola <strong>${name}</strong>,
          </p>
          <p style="color: #4b5563; font-size: 14px; line-height: 1.6; margin: 0 0 24px 0;">
            Has sido invitado como <strong>${role === 'admin' ? 'Administrador' : 'Agente'}</strong> 
            a la cuenta <strong>${tenantName}</strong> en Smartee.
          </p>
          
          <p style="color: #4b5563; font-size: 14px; line-height: 1.6; margin: 0 0 16px 0;">
            Para completar tu registro, establece tu contraseña haciendo clic en el siguiente botón:
          </p>
          
          <a href="${setupUrl}" style="display: inline-block; background: #1a1a1a; color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-size: 14px; font-weight: 600; margin: 8px 0 24px 0;">
            Establecer contraseña
          </a>
          
          <p style="color: #9ca3af; font-size: 12px; margin: 24px 0 0 0; padding-top: 16px; border-top: 1px solid #f3f4f6;">
            Este enlace expira en 48 horas. Si no solicitaste esta invitación, puedes ignorar este correo.
          </p>
        </div>
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
