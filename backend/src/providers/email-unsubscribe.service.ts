import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { EmailUnsubscribe } from './email-unsubscribe.entity';

/**
 * Token payload: tenantId:email
 * Encrypted with AES-256-CBC using a secret derived from JWT_SECRET.
 */
@Injectable()
export class EmailUnsubscribeService {
  private readonly logger = new Logger(EmailUnsubscribeService.name);
  private readonly secret: Buffer;
  private readonly frontendUrl: string;

  constructor(
    @InjectRepository(EmailUnsubscribe)
    private readonly repo: Repository<EmailUnsubscribe>,
    private readonly configService: ConfigService,
  ) {
    // Derive a 32-byte key from JWT_SECRET for token encryption
    const jwtSecret = this.configService.get<string>('JWT_SECRET', 'default-secret');
    this.secret = crypto.createHash('sha256').update(jwtSecret).digest();
    this.frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:5173');
  }

  // ─── Token Management ──────────────────────────────────────────────

  /**
   * Generate an encrypted unsubscribe token for a tenant+email pair.
   */
  generateToken(tenantId: string, email: string): string {
    const payload = `${tenantId}:${email}`;
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', this.secret, iv);
    let encrypted = cipher.update(payload, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    // Token = iv(hex) + '.' + encrypted(hex)
    return iv.toString('hex') + '.' + encrypted;
  }

  /**
   * Decrypt and validate an unsubscribe token.
   * Returns { tenantId, email } or null if invalid.
   */
  decryptToken(token: string): { tenantId: string; email: string } | null {
    try {
      const [ivHex, encrypted] = token.split('.');
      if (!ivHex || !encrypted) return null;

      const iv = Buffer.from(ivHex, 'hex');
      const decipher = crypto.createDecipheriv('aes-256-cbc', this.secret, iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      const [tenantId, ...emailParts] = decrypted.split(':');
      const email = emailParts.join(':'); // Email could theoretically contain ':'
      if (!tenantId || !email) return null;

      return { tenantId, email };
    } catch {
      return null;
    }
  }

  /**
   * Generate the full unsubscribe URL for an email.
   */
  getUnsubscribeUrl(tenantId: string, email: string): string {
    const token = this.generateToken(tenantId, email);
    const baseUrl = this.configService.get<string>('API_BASE_URL', '') || this.frontendUrl.replace(':5173', ':3000');
    return `${baseUrl}/api/email/unsubscribe/${encodeURIComponent(token)}`;
  }

  // ─── Opt-out Management ────────────────────────────────────────────

  /**
   * Register an unsubscribe.
   */
  async unsubscribe(tenantId: string, email: string, reason = 'unsubscribe_link', source?: string): Promise<EmailUnsubscribe> {
    const normalized = email.toLowerCase().trim();

    // Check if already unsubscribed
    const existing = await this.repo.findOne({ where: { tenantId, email: normalized } });
    if (existing) return existing;

    const record = this.repo.create({
      tenantId,
      email: normalized,
      reason,
      source: source || null,
    });

    this.logger.log(`Email unsubscribed: ${normalized} (tenant: ${tenantId}, reason: ${reason})`);
    return this.repo.save(record);
  }

  /**
   * Re-subscribe an email (remove from opt-out list).
   */
  async resubscribe(tenantId: string, email: string): Promise<void> {
    const normalized = email.toLowerCase().trim();
    await this.repo.delete({ tenantId, email: normalized });
  }

  /**
   * Check if an email is unsubscribed for a tenant.
   */
  async isUnsubscribed(tenantId: string, email: string): Promise<boolean> {
    const normalized = email.toLowerCase().trim();
    const count = await this.repo.count({ where: { tenantId, email: normalized } });
    return count > 0;
  }

  /**
   * Filter a list of emails, returning only those NOT unsubscribed.
   * Efficient batch check for campaign sending.
   */
  async filterSubscribed(tenantId: string, emails: string[]): Promise<Set<string>> {
    if (emails.length === 0) return new Set();

    const normalized = emails.map((e) => e.toLowerCase().trim());

    // Batch query unsubscribed emails
    const unsubscribed = await this.repo.find({
      where: { tenantId, email: In(normalized) },
      select: { email: true },
    });

    const unsubSet = new Set(unsubscribed.map((u) => u.email));
    return new Set(normalized.filter((e) => !unsubSet.has(e)));
  }

  /**
   * Get all unsubscribes for a tenant (for admin view).
   */
  async findByTenant(tenantId: string, limit = 100, offset = 0): Promise<{ data: EmailUnsubscribe[]; total: number }> {
    const [data, total] = await this.repo.findAndCount({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
    return { data, total };
  }
}
