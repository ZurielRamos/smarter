import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { promises as dns } from 'dns';
import { EmailDomainConfig, DomainStatus } from './email-domain.entity';

@Injectable()
export class EmailDomainService {
  constructor(
    @InjectRepository(EmailDomainConfig)
    private readonly repo: Repository<EmailDomainConfig>,
  ) {}

  async findByTenant(tenantId: string): Promise<EmailDomainConfig[]> {
    return this.repo.find({ where: { tenantId } });
  }

  async findByInbox(inboxId: string): Promise<EmailDomainConfig | null> {
    return this.repo.findOne({ where: { inboxId } });
  }

  async upsert(inboxId: string, tenantId: string, data: { fromEmail: string; fromName: string }): Promise<EmailDomainConfig> {
    const domain = data.fromEmail.split('@')[1];
    if (!domain) {
      throw new BadRequestException('Email inválido');
    }

    let config = await this.repo.findOne({ where: { inboxId } });

    if (config) {
      config.fromEmail = data.fromEmail;
      config.fromName = data.fromName;
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
        domainStatus: DomainStatus.PENDING,
      });
    }

    return this.repo.save(config);
  }

  /**
   * Retorna los registros DNS que el tenant debe configurar.
   */
  getDnsRecords(domain: string): { type: string; name: string; value: string; purpose: string }[] {
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

  /**
   * Verifica los registros DNS del dominio del tenant.
   */
  async verifyDomain(inboxId: string): Promise<{
    verified: boolean;
    results: { record: string; status: 'ok' | 'missing' | 'error'; detail?: string }[];
  }> {
    const config = await this.repo.findOne({ where: { inboxId } });
    if (!config) throw new NotFoundException('No hay configuración de email para esta bandeja');

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

    // Actualizar estado
    config.domainStatus = allOk ? DomainStatus.VERIFIED : DomainStatus.FAILED;
    if (allOk) config.verifiedAt = new Date();
    await this.repo.save(config);

    return { verified: allOk, results };
  }
}
