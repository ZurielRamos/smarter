import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

export interface EmailSmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromName: string;
  fromEmail: string;
}

export interface EmailSendOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  smtpConfig: EmailSmtpConfig;
  replyTo?: string;
}

export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  /**
   * Send an email using per-inbox SMTP configuration.
   */
  async sendEmail(options: EmailSendOptions): Promise<EmailSendResult> {
    const { to, subject, html, text, smtpConfig, replyTo } = options;

    if (!to || !subject) {
      return { success: false, error: 'Missing to or subject' };
    }

    if (!smtpConfig.host || !smtpConfig.user || !smtpConfig.pass) {
      return { success: false, error: 'SMTP not configured' };
    }

    try {
      const transporter = nodemailer.createTransport({
        host: smtpConfig.host,
        port: smtpConfig.port || 465,
        secure: smtpConfig.secure ?? true,
        auth: {
          user: smtpConfig.user,
          pass: smtpConfig.pass,
        },
      });

      const from = `"${smtpConfig.fromName || 'Smartee'}" <${smtpConfig.fromEmail || smtpConfig.user}>`;

      const info = await transporter.sendMail({
        from,
        to,
        subject,
        html,
        text: text || undefined,
        replyTo: replyTo || undefined,
      });

      this.logger.log(`[Email] Sent to ${to}, messageId: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } catch (err) {
      this.logger.error(`[Email] Failed to send to ${to}:`, err);
      return { success: false, error: String(err) };
    }
  }

  /**
   * Test SMTP connection with given config.
   */
  async testConnection(smtpConfig: EmailSmtpConfig): Promise<{ success: boolean; error?: string }> {
    try {
      const transporter = nodemailer.createTransport({
        host: smtpConfig.host,
        port: smtpConfig.port || 465,
        secure: smtpConfig.secure ?? true,
        auth: {
          user: smtpConfig.user,
          pass: smtpConfig.pass,
        },
      });

      await transporter.verify();
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }
}
