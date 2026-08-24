import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { promises as dns } from 'dns';
import { EmailDomainConfig, DomainStatus } from './email-domain.entity';
import { MailgunService } from './mailgun.service';

@Injectable()
export class EmailDomainService {
  constructor(
    @InjectRepository(EmailDomainConfig)
    private readonly repo: Repository<EmailDomainConfig>,
    private readonly mailgunService: MailgunService,
  ) {}

  async findByTenant(tenantId: string): Promise<EmailDomainConfig[]> {
    return this.repo.find({ where: { tenantId } });
  }

  async findByInbox(inboxId: string): Promise<EmailDomainConfig | null> {
    return this.repo.findOne({ where: { inboxId } });
  }

  async upsert(
    inboxId: string,
    tenantId: string,
    data: { fromEmail: string; fromName: string; provider?: string },
  ): Promise<EmailDomainConfig> {
    const domain = data.fromEmail.split('@')[1];
    if (!domain) {
      throw new BadRequestException('Email inválido');
    }

    const provider = data.provider || 'mandrill';
    let config = await this.repo.findOne({ where: { inboxId } });

    if (config) {
      config.fromEmail = data.fromEmail;
      config.fromName = data.fromName;
      config.provider = provider;
      if (config.domain !== domain) {
        config.domain = domain;
        config.domainStatus = DomainStatus.PENDING;
        config.verifiedAt = null;
      }
    } else {
      config = this.repo.create({
        tenantId,
        inboxId,
        fromEmail: data.fromEmail,
        fromName: data.fromName,
        domain,
        provider,
        domainStatus: DomainStatus.PENDING,
      });
    }

    const saved = await this.repo.save(config);

    // If Mailgun provider, register domain in Mailgun
    if (provider === 'mailgun' && this.mailgunService.isConfigured()) {
      try {
        await this.mailgunService.addDomain(domain);
      } catch {
        // Non-blocking: domain may already exist or API may be temporarily unavailable
      }
    }

    return saved;
  }

  /**
   * Retorna los registros DNS que el tenant debe configurar.
   * Adapta los registros según el proveedor (mandrill o mailgun).
   */
  async getDnsRecords(
    domain: string,
    provider?: string,
  ): Promise<{ type: string; name: string; value: string; purpose: string; valid?: boolean }[]> {
    if (provider === 'mailgun') {
      return this.getMailgunDnsRecords(domain);
    }
    return this.getMandrillDnsRecords(domain);
  }

  private getMandrillDnsRecords(domain: string): { type: string; name: string; value: string; purpose: string }[] {
    return [
      {
        type: 'TXT',
        name: domain,
        value: 'v=spf1 include:spf.mandrillapp.com ~all',
        purpose: 'SPF — Autoriza al servidor de email a enviar en nombre del dominio',
      },
      {
        type: 'CNAME',
        name: `mandrill._domainkey.${domain}`,
        value: 'dkim.mandrillapp.com',
        purpose: 'DKIM — Firma digital para verificar autenticidad del email',
      },
      {
        type: 'TXT',
        name: `_dmarc.${domain}`,
        value: 'v=DMARC1; p=none; sp=none',
        purpose: 'DMARC — Política de validación y reportes',
      },
    ];
  }

  private async getMailgunDnsRecords(
    domain: string,
  ): Promise<{ type: string; name: string; value: string; purpose: string; valid?: boolean }[]> {
    // Get actual DNS records from Mailgun API
    const records = await this.mailgunService.getDnsRecords(domain);
    if (records.length > 0) {
      return records.map((r) => ({
        type: r.type,
        name: r.name,
        value: r.value,
        purpose: r.purpose,
        valid: r.valid,
      }));
    }

    // Fallback: generic Mailgun DNS records
    return [
      {
        type: 'TXT',
        name: domain,
        value: 'v=spf1 include:mailgun.org ~all',
        purpose: 'SPF — Autoriza a Mailgun a enviar en nombre del dominio',
      },
      {
        type: 'TXT',
        name: `mailo._domainkey.${domain}`,
        value: '(proporcionado por Mailgun al agregar el dominio)',
        purpose: 'DKIM — Firma digital para verificar autenticidad del email',
      },
      {
        type: 'CNAME',
        name: `email.${domain}`,
        value: 'mailgun.org',
        purpose: 'Tracking — Para seguimiento de aperturas y clicks',
      },
    ];
  }

  /**
   * Verifica los registros DNS del dominio del tenant.
   * Usa la API de Mailgun si el proveedor es mailgun, DNS directo para mandrill.
   */
  async verifyDomain(inboxId: string): Promise<{
    verified: boolean;
    results: { record: string; status: 'ok' | 'missing' | 'error'; detail?: string }[];
  }> {
    const config = await this.repo.findOne({ where: { inboxId } });
    if (!config) throw new NotFoundException('No hay configuración de email para esta bandeja');

    if (config.provider === 'mailgun') {
      return this.verifyMailgunDomain(config);
    }
    return this.verifyMandrillDomain(config);
  }

  private async verifyMailgunDomain(config: EmailDomainConfig): Promise<{
    verified: boolean;
    results: { record: string; status: 'ok' | 'missing' | 'error'; detail?: string }[];
  }> {
    const { verified, records } = await this.mailgunService.verifyDomain(config.domain);

    const results: { record: string; status: 'ok' | 'missing' | 'error'; detail?: string }[] = records.map((r) => ({
      record: r.purpose || r.type,
      status: r.valid ? ('ok' as const) : ('missing' as const),
      detail: r.valid ? undefined : `${r.name} → ${r.value}`,
    }));

    // If no records returned from API, add a generic status
    if (results.length === 0) {
      results.push({
        record: 'Verificación',
        status: 'error' as const,
        detail: 'No se pudo obtener información del dominio en Mailgun',
      });
    }

    config.domainStatus = verified ? DomainStatus.VERIFIED : DomainStatus.FAILED;
    if (verified) config.verifiedAt = new Date();
    await this.repo.save(config);

    return { verified, results };
  }

  private async verifyMandrillDomain(config: EmailDomainConfig): Promise<{
    verified: boolean;
    results: { record: string; status: 'ok' | 'missing' | 'error'; detail?: string }[];
  }> {
    const domain = config.domain;
    const results: { record: string; status: 'ok' | 'missing' | 'error'; detail?: string }[] = [];

    // Verificar SPF
    try {
      const txtRecords = await dns.resolveTxt(domain);
      const flat = txtRecords.map((r) => r.join('')).join(' ');
      if (flat.includes('spf.mandrillapp.com')) {
        results.push({ record: 'SPF', status: 'ok' });
      } else {
        results.push({ record: 'SPF', status: 'missing', detail: 'No se encontró include:spf.mandrillapp.com en los registros TXT' });
      }
    } catch {
      results.push({ record: 'SPF', status: 'error', detail: 'No se pudieron resolver registros TXT del dominio' });
    }

    // Verificar DKIM
    try {
      const cnames = await dns.resolveCname(`mandrill._domainkey.${domain}`);
      if (cnames.some((c) => c.includes('dkim.mandrillapp.com'))) {
        results.push({ record: 'DKIM', status: 'ok' });
      } else {
        results.push({ record: 'DKIM', status: 'missing', detail: 'CNAME no apunta a dkim.mandrillapp.com' });
      }
    } catch {
      results.push({ record: 'DKIM', status: 'missing', detail: 'No se encontró registro CNAME mandrill._domainkey' });
    }

    // Verificar DMARC
    try {
      const txtRecords = await dns.resolveTxt(`_dmarc.${domain}`);
      const flat = txtRecords.map((r) => r.join('')).join(' ');
      if (flat.includes('v=DMARC1')) {
        results.push({ record: 'DMARC', status: 'ok' });
      } else {
        results.push({ record: 'DMARC', status: 'missing', detail: 'No se encontró v=DMARC1 en _dmarc' });
      }
    } catch {
      results.push({ record: 'DMARC', status: 'missing', detail: 'No se encontró registro TXT _dmarc' });
    }

    const allOk = results.every((r) => r.status === 'ok');

    config.domainStatus = allOk ? DomainStatus.VERIFIED : DomainStatus.FAILED;
    if (allOk) config.verifiedAt = new Date();
    await this.repo.save(config);

    return { verified: allOk, results };
  }
}
