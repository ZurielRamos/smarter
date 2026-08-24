import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

interface MailgunSendOptions {
  domain: string;
  from: string;
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  /** Custom variables stored with the message for webhook identification */
  variables?: Record<string, string>;
  /** Tags for analytics grouping */
  tags?: string[];
  /** Enable open/click tracking */
  tracking?: boolean;
  /** List-Unsubscribe URL (RFC 2369 + RFC 8058 one-click) */
  unsubscribeUrl?: string;
}

interface MailgunSendResult {
  id: string;
  message: string;
}

interface MailgunDomainInfo {
  name: string;
  state: string; // 'active' | 'unverified' | 'disabled'
  sendingDnsRecords: { record_type: string; name: string; value: string; valid: string; priority?: string }[];
  receivingDnsRecords: { record_type: string; name: string; value: string; valid: string; priority?: string }[];
}

interface MailgunDnsRecord {
  type: string;
  name: string;
  value: string;
  valid: boolean;
  purpose: string;
}

@Injectable()
export class MailgunService {
  private readonly logger = new Logger(MailgunService.name);
  private mg: any;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly webhookSigningKey: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('MAILGUN_API_KEY', '');
    this.webhookSigningKey = this.configService.get<string>('MAILGUN_WEBHOOK_SIGNING_KEY', '');
    // Use EU endpoint if configured, otherwise default US
    const region = this.configService.get<string>('MAILGUN_REGION', 'us');
    this.baseUrl = region === 'eu' ? 'https://api.eu.mailgun.net' : 'https://api.mailgun.net';

    this.initClient();
  }

  private initClient() {
    if (!this.apiKey) {
      this.logger.warn('MAILGUN_API_KEY not configured. Mailgun service will not function.');
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const FormData = require('form-data');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Mailgun = require('mailgun.js');
      const mailgun = new Mailgun(FormData);
      this.mg = mailgun.client({
        username: 'api',
        key: this.apiKey,
        url: this.baseUrl,
      });
    } catch (err) {
      this.logger.error('Failed to initialize Mailgun client', err);
    }
  }

  /**
   * Check if the service is properly configured and ready to use.
   */
  isConfigured(): boolean {
    return !!this.mg && !!this.apiKey;
  }

  // ─── Domain Management ─────────────────────────────────────────────

  /**
   * Ensure a domain exists in Mailgun. Gets it if it exists, creates it if not.
   */
  async addDomain(domain: string): Promise<MailgunDomainInfo | null> {
    if (!this.mg) return null;

    // First try to get the domain — if it already exists in our account, use it
    const existing = await this.getDomain(domain);
    if (existing) {
      this.logger.log(`Domain already exists in Mailgun: ${domain}`);
      return existing;
    }

    // Domain doesn't exist in our account — try to create it
    try {
      const result = await this.mg.domains.create({ name: domain });
      this.logger.log(`Domain added to Mailgun: ${domain}`);
      return result;
    } catch (err: any) {
      const errMsg = err?.details || err?.message || '';
      this.logger.error(`Failed to add domain ${domain}`, errMsg);

      // Provide clear error messages
      if (errMsg.includes('already exists')) {
        throw new Error(
          `El dominio "${domain}" está registrado en otra cuenta de Mailgun. Usa un subdominio como mail.${domain}`,
        );
      }
      if (errMsg.includes('limit') || errMsg.includes('exceeded')) {
        throw new Error(
          `Se alcanzó el límite de dominios en Mailgun. Elimina un dominio existente o mejora tu plan.`,
        );
      }
      throw new Error(`Error al registrar dominio en Mailgun: ${errMsg}`);
    }
  }

  /**
   * Get domain info and DNS records from Mailgun.
   */
  async getDomain(domain: string): Promise<MailgunDomainInfo | null> {
    if (!this.mg) return null;
    try {
      const result = await this.mg.domains.get(domain);
      return result;
    } catch (err: any) {
      this.logger.error(`Failed to get domain ${domain}`, err?.message || err);
      return null;
    }
  }

  /**
   * Verify a domain's DNS records via Mailgun API.
   * Returns the domain state and the current verification status of each DNS record.
   */
  async verifyDomain(domain: string): Promise<{ verified: boolean; records: MailgunDnsRecord[] }> {
    if (!this.mg) return { verified: false, records: [] };
    try {
      // PUT to trigger Mailgun to re-check the domain's DNS
      const result = await this.mg.domains.verify(domain);
      const sendingRecords = result?.sendingDnsRecords || result?.sending_dns_records || [];
      const records: MailgunDnsRecord[] = sendingRecords.map((r: any) => ({
        type: r.record_type || r.type,
        name: r.name,
        value: r.value,
        valid: r.valid === 'valid' || r.valid === true,
        purpose: r.name?.includes('domainkey') ? 'DKIM' : r.value?.includes('spf') ? 'SPF' : 'MX/CNAME',
      }));

      const verified = result?.domain?.state === 'active' || records.every((r) => r.valid);
      return { verified, records };
    } catch (err: any) {
      this.logger.error(`Failed to verify domain ${domain}`, err?.message || err);
      return { verified: false, records: [] };
    }
  }

  /**
   * Get the required DNS records for a domain from Mailgun.
   */
  async getDnsRecords(domain: string): Promise<MailgunDnsRecord[]> {
    const domainInfo = await this.getDomain(domain);
    if (!domainInfo) return [];

    const sendingRecords = (domainInfo as any)?.sendingDnsRecords
      || (domainInfo as any)?.sending_dns_records
      || [];

    return sendingRecords.map((r: any) => ({
      type: r.record_type || r.type,
      name: r.name,
      value: r.value,
      valid: r.valid === 'valid' || r.valid === true,
      purpose: this.getRecordPurpose(r),
    }));
  }

  private getRecordPurpose(record: any): string {
    const name = record.name || '';
    const value = record.value || '';
    if (name.includes('domainkey')) return 'DKIM — Firma digital para verificar autenticidad';
    if (value.includes('spf') || value.includes('include:mailgun.org')) return 'SPF — Autoriza a Mailgun a enviar en nombre del dominio';
    if (name.includes('_dmarc')) return 'DMARC — Política de validación y reportes';
    return 'Registro de verificación';
  }

  // ─── Email Sending ─────────────────────────────────────────────────

  /**
   * Send a transactional email via Mailgun API.
   */
  async sendEmail(options: MailgunSendOptions): Promise<MailgunSendResult> {
    if (!this.mg) {
      throw new Error('Mailgun no está configurado. Configure MAILGUN_API_KEY.');
    }

    const messageData: any = {
      from: options.from,
      to: Array.isArray(options.to) ? options.to : [options.to],
      subject: options.subject,
    };

    if (options.html) messageData.html = options.html;
    if (options.text) messageData.text = options.text;
    if (!options.html && !options.text) {
      messageData.text = '';
    }

    // Custom variables for webhook identification
    if (options.variables) {
      messageData['h:X-Mailgun-Variables'] = JSON.stringify(options.variables);
    }

    // Tags
    if (options.tags?.length) {
      messageData['o:tag'] = options.tags;
    }

    // Tracking
    if (options.tracking !== false) {
      messageData['o:tracking'] = 'yes';
      messageData['o:tracking-opens'] = 'yes';
      messageData['o:tracking-clicks'] = 'yes';
    }

    // List-Unsubscribe headers (RFC 2369 + RFC 8058)
    if (options.unsubscribeUrl) {
      messageData['h:List-Unsubscribe'] = `<${options.unsubscribeUrl}>`;
      messageData['h:List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
    }

    try {
      const result = await this.mg.messages.create(options.domain, messageData);
      this.logger.debug(`Email sent via Mailgun: ${result.id} to ${options.to}`);
      return { id: result.id, message: result.message };
    } catch (err: any) {
      this.logger.error(`Mailgun send failed to ${options.to}`, err?.message || err);
      throw new Error(`Mailgun send error: ${err?.message || 'Unknown error'}`);
    }
  }

  // ─── Webhook Verification ──────────────────────────────────────────

  /**
   * Verify that a webhook payload actually came from Mailgun.
   * Uses HMAC-SHA256 with the webhook signing key.
   */
  verifyWebhookSignature(
    timestamp: string,
    token: string,
    signature: string,
  ): boolean {
    if (!this.webhookSigningKey) {
      this.logger.warn('MAILGUN_WEBHOOK_SIGNING_KEY not configured, skipping verification');
      return true; // Allow in dev when not configured
    }

    const encodedToken = crypto
      .createHmac('sha256', this.webhookSigningKey)
      .update(timestamp.concat(token))
      .digest('hex');

    return encodedToken === signature;
  }
}
