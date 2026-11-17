import { BadRequestException, HttpException, HttpStatus, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'crypto';
import { Repository } from 'typeorm';
import { Tenant } from '../../tenants/tenant.entity';
import { ClientRecord } from '../../records/record.entity';
import { isFeatureEnabled } from '../../auth/requires-feature.decorator';
import { TenantAuditService } from '../../audit/tenant-audit.service';
import { ContactProfile } from '../entities/contact-profile.entity';
import { PortalOtp } from '../entities/portal-otp.entity';
import { PortalInvitation } from '../entities/portal-invitation.entity';
import { PortalConfig, PortalConfigService } from './portal-config.service';
import { PortalMessengerService, fillTemplate } from './portal-messenger.service';

export type OtpChannel = 'email' | 'phone';

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
/** Perfiles que pueden entrar al portal (un encuestador suspendido o terminado no). */
const PORTAL_STATUSES = ['candidate', 'active'];
const COOLDOWN_MS = 30_000;
const MAX_PER_HOUR = 5;
const HOUR_MS = 60 * 60 * 1000;
const GENERIC_OTP_ERROR = 'Código incorrecto o vencido. Solicita uno nuevo.';

export interface PortalSession {
  tenant: Tenant;
  profile: ContactProfile;
}

interface PortalTokenPayload {
  purpose: 'recruit-portal';
  tid: string;
  pid: string;
  tv: number;
}

const digits = (s: unknown) => String(s ?? '').replace(/\D/g, '');

export function maskDestination(channel: OtpChannel, dest: string): string {
  if (channel === 'email') {
    const [user, domain] = dest.split('@');
    return `${user.length <= 2 ? `${user[0] ?? ''}*` : `${user.slice(0, 2)}***`}@${domain}`;
  }
  return dest.length > 4 ? `••••${dest.slice(-4)}` : dest;
}

/** Autenticación del portal del encuestador: invitaciones, códigos de un solo uso y sesión. */
@Injectable()
export class PortalAuthService {
  /** Límite de solicitudes de código por destino; en memoria, por instancia. */
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    @InjectRepository(ContactProfile) private readonly profiles: Repository<ContactProfile>,
    @InjectRepository(ClientRecord) private readonly records: Repository<ClientRecord>,
    @InjectRepository(PortalOtp) private readonly otps: Repository<PortalOtp>,
    @InjectRepository(PortalInvitation) private readonly invitations: Repository<PortalInvitation>,
    private readonly portalConfig: PortalConfigService,
    private readonly messenger: PortalMessengerService,
    private readonly audit: TenantAuditService,
  ) {}

  // ───────────────────────────── Utilidades ─────────────────────────────

  /** Clave propia del portal, derivada del secreto del CRM: un token de usuario no sirve aquí ni al revés. */
  private secret(): string {
    const base = this.config.get<string>('JWT_SECRET', 'stratecast-super-secret-key');
    return createHmac('sha256', base).update('recruit-portal-v1').digest('hex');
  }

  hashToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  private codeHash(otpId: string, code: string): string {
    return createHmac('sha256', this.secret()).update(`otp:${otpId}:${code}`).digest('hex');
  }

  async resolveTenant(slug: string): Promise<Tenant> {
    const tenant = typeof slug === 'string' && slug.length <= 60 ? await this.tenants.findOne({ where: { slug } }) : null;
    if (!tenant || !tenant.isActive || !isFeatureEnabled(tenant.features, 'reclutamiento')) {
      throw new NotFoundException('Portal no disponible');
    }
    return tenant;
  }

  /** Limita la frecuencia de solicitudes de código para una clave (30 s entre envíos, 5 por hora). */
  throttleRequests(key: string): void {
    const now = Date.now();
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < HOUR_MS);
    if (list.length && now - list[list.length - 1] < COOLDOWN_MS) {
      throw new HttpException('Espera unos segundos antes de pedir otro código.', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (list.length >= MAX_PER_HOUR) {
      throw new HttpException('Pediste demasiados códigos. Inténtalo de nuevo en una hora.', HttpStatus.TOO_MANY_REQUESTS);
    }
    list.push(now);
    this.hits.set(key, list);
    if (this.hits.size > 5000) {
      for (const [k, v] of this.hits) if (!v.some((t) => now - t < HOUR_MS)) this.hits.delete(k);
    }
  }

  normalizeDestination(channel: OtpChannel, raw: unknown): string {
    const v = typeof raw === 'string' ? raw.trim() : '';
    if (channel === 'email') return v.toLowerCase();
    return digits(v);
  }

  private isValidDestination(channel: OtpChannel, dest: string): boolean {
    if (channel === 'email') return dest.length <= 200 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(dest);
    return dest.length >= 7 && dest.length <= 15;
  }

  /** Dirección con la que se contacta al encuestador por un canal, según su ficha. */
  destinationOf(record: Pick<ClientRecord, 'email' | 'phone' | 'countryCode'>, channel: OtpChannel): string | null {
    if (channel === 'email') {
      const e = this.normalizeDestination('email', record.email);
      return this.isValidDestination('email', e) ? e : null;
    }
    const phone = digits(record.phone);
    if (!phone) return null;
    const cc = digits(record.countryCode);
    const full = cc && !(phone.startsWith(cc) && phone.length > cc.length + 6) ? `${cc}${phone}` : phone;
    return this.isValidDestination('phone', full) ? full : null;
  }

  private assertChannelAllowed(cfg: PortalConfig, channel: OtpChannel): void {
    if (channel !== 'email' && channel !== 'phone') throw new BadRequestException('Canal de verificación inválido');
    const allowed = cfg.verification.channel;
    if (allowed !== 'both' && allowed !== channel) throw new BadRequestException('Ese canal de verificación no está habilitado');
  }

  // ───────────────────────────── Invitaciones ─────────────────────────────

  /** Crea una invitación vigente (anula las anteriores del perfil). Devuelve el token en claro, que solo existe en el enlace. */
  async createInvitation(tenantId: string, profileId: string, expiresDays: number, createdBy: string | null, channels: string[]) {
    const token = randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + expiresDays * 24 * HOUR_MS);
    await this.invitations
      .createQueryBuilder()
      .update(PortalInvitation)
      .set({ expiresAt: () => 'now()' })
      .where('tenant_id = :tenantId AND profile_id = :profileId AND expires_at > now()', { tenantId, profileId })
      .execute();
    const row = await this.invitations.save(
      this.invitations.create({ tenantId, profileId, tokenHash: this.hashToken(token), channels, expiresAt, createdBy }),
    );
    return { token, expiresAt, id: row.id };
  }

  async deleteInvitation(id: string): Promise<void> {
    await this.invitations.delete({ id });
  }

  /** Perfil y contacto de una invitación vigente; null si el enlace no sirve. */
  private async loadInvitation(tenant: Tenant, token: unknown): Promise<{ profile: ContactProfile; record: ClientRecord } | null> {
    if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
    const inv = await this.invitations.findOne({ where: { tokenHash: this.hashToken(token), tenantId: tenant.id } });
    if (!inv || inv.expiresAt.getTime() < Date.now()) return null;
    const profile = await this.profiles.findOne({ where: { id: inv.profileId, tenantId: tenant.id } });
    if (!profile || !PORTAL_STATUSES.includes(profile.status)) return null;
    const record = await this.records.findOne({ where: { id: profile.recordId, tenantId: tenant.id } });
    if (!record || record.deletedAt) return null;
    return { profile, record };
  }

  /** Datos que ve quien abre un enlace de invitación: su nombre y los canales con que puede recibir el código. */
  async describeInvitation(slug: string, token: string) {
    const tenant = await this.resolveTenant(slug);
    const cfg = await this.portalConfig.get(tenant.id);
    const found = await this.loadInvitation(tenant, token);
    if (!found) throw new NotFoundException('La invitación no es válida o ya venció. Pide una nueva a quien te invitó.');
    const channels = (['email', 'phone'] as OtpChannel[])
      .filter((c) => cfg.verification.channel === 'both' || cfg.verification.channel === c)
      .map((c) => ({ channel: c, destination: this.destinationOf(found.record, c) }))
      .filter((c): c is { channel: OtpChannel; destination: string } => !!c.destination)
      .map((c) => ({ channel: c.channel, masked: maskDestination(c.channel, c.destination) }));
    const name = found.record.firstName || found.record.fullName?.split(' ')[0] || null;
    return { name, channels };
  }

  // ───────────────────────────── Código de ingreso ─────────────────────────────

  /**
   * Pide un código de ingreso. Nunca revela si el destino pertenece a un
   * encuestador: si no existe responde igual que si lo enviara.
   */
  async requestLogin(slug: string, body: { inviteToken?: unknown; channel?: unknown; destination?: unknown }) {
    const tenant = await this.resolveTenant(slug);
    const cfg = await this.portalConfig.get(tenant.id);
    const channel = body.channel as OtpChannel;
    this.assertChannelAllowed(cfg, channel);

    let profile: ContactProfile | null = null;
    let destination: string;
    if (body.inviteToken) {
      const found = await this.loadInvitation(tenant, body.inviteToken);
      if (!found) throw new NotFoundException('La invitación no es válida o ya venció. Pide una nueva a quien te invitó.');
      const dest = this.destinationOf(found.record, channel);
      if (!dest) throw new BadRequestException(channel === 'email' ? 'No tenemos tu correo registrado' : 'No tenemos tu teléfono registrado');
      profile = found.profile;
      destination = dest;
    } else {
      destination = this.normalizeDestination(channel, body.destination);
      if (!this.isValidDestination(channel, destination)) {
        throw new BadRequestException(channel === 'email' ? 'Correo electrónico inválido' : 'Número de teléfono inválido');
      }
      profile = await this.findProfileByDestination(tenant.id, channel, destination);
    }

    this.throttleRequests(`${tenant.id}:${channel}:${destination}`);

    if (!profile || !PORTAL_STATUSES.includes(profile.status)) {
      // Respuesta indistinguible de un envío real.
      return { otpId: randomUUID(), channel, maskedDestination: maskDestination(channel, destination), expiresInSec: OTP_TTL_MS / 1000 };
    }
    const sent = await this.issueCode(tenant, cfg, profile.id, 'login', null, channel, destination);
    return sent;
  }

  private async findProfileByDestination(tenantId: string, channel: OtpChannel, dest: string): Promise<ContactProfile | null> {
    const qb = this.profiles
      .createQueryBuilder('p')
      .innerJoin(ClientRecord, 'r', 'r.id = p.recordId')
      .where('p.tenantId = :tenantId AND p.type = :type AND p.status IN (:...statuses)', { tenantId, type: 'surveyor', statuses: PORTAL_STATUSES })
      .andWhere('r.tenantId = :tenantId AND r.deletedAt IS NULL');
    if (channel === 'email') {
      qb.andWhere('lower(trim(r.email)) = :dest', { dest });
    } else {
      qb.andWhere(
        "(regexp_replace(coalesce(r.phone, ''), '\\D', '', 'g') = :dest OR regexp_replace(coalesce(r.countryCode, ''), '\\D', '', 'g') || regexp_replace(coalesce(r.phone, ''), '\\D', '', 'g') = :dest)",
        { dest },
      );
    }
    const found = await qb.limit(2).getMany();
    // Si dos encuestadores comparten el dato no se adivina cuál es.
    return found.length === 1 ? found[0] : null;
  }

  /** Genera, guarda y envía un código. Si el envío falla, no deja el código guardado. */
  async issueCode(
    tenant: Tenant,
    cfg: PortalConfig,
    profileId: string,
    purpose: 'login' | 'sign',
    contractId: string | null,
    channel: OtpChannel,
    destination: string,
  ) {
    const recent = await this.otps
      .createQueryBuilder('o')
      .where('o.tenantId = :t AND o.profileId = :p AND o.createdAt > :since', { t: tenant.id, p: profileId, since: new Date(Date.now() - HOUR_MS) })
      .getCount();
    if (recent >= 10) throw new HttpException('Pediste demasiados códigos. Inténtalo de nuevo en una hora.', HttpStatus.TOO_MANY_REQUESTS);

    const id = randomUUID();
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.otps.save(
      this.otps.create({
        id,
        tenantId: tenant.id,
        profileId,
        purpose,
        contractId,
        channel,
        destination,
        codeHash: this.codeHash(id, code),
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
        attempts: 0,
        verifiedAt: null,
      }),
    );
    try {
      if (channel === 'email') {
        const vars = { empresa: tenant.name, code };
        await this.messenger.sendEmail(destination, fillTemplate(cfg.verification.email.subject, vars), fillTemplate(cfg.verification.email.body, vars));
      } else {
        await this.messenger.sendWhatsApp(tenant.id, cfg.verification.whatsapp, destination, [code], code);
      }
    } catch (err) {
      await this.otps.delete({ id });
      throw err;
    }
    return { otpId: id, channel, maskedDestination: maskDestination(channel, destination), expiresInSec: OTP_TTL_MS / 1000 };
  }

  /**
   * Valida un código de un solo uso. El intento se cuenta ANTES de comparar, de
   * forma atómica, así que enviar muchas respuestas en paralelo no da más de
   * MAX_ATTEMPTS intentos. Todos los fallos devuelven el mismo mensaje.
   */
  async consumeCode(
    tenantId: string,
    otpId: unknown,
    code: unknown,
    expect: { purpose: 'login' | 'sign'; profileId?: string; contractId?: string },
  ): Promise<PortalOtp> {
    const fail = () => new BadRequestException(GENERIC_OTP_ERROR);
    if (typeof otpId !== 'string' || !/^[0-9a-f-]{36}$/i.test(otpId) || typeof code !== 'string' || !/^\d{6}$/.test(code.trim())) throw fail();

    const res = await this.otps
      .createQueryBuilder()
      .update(PortalOtp)
      .set({ attempts: () => 'attempts + 1' })
      .where('id = :id AND tenant_id = :tenantId AND purpose = :purpose AND verified_at IS NULL AND attempts < :max AND expires_at > now()', {
        id: otpId,
        tenantId,
        purpose: expect.purpose,
        max: MAX_ATTEMPTS,
      })
      .returning('*')
      .execute();
    const row = (res.raw as any[])?.[0];
    if (!row) throw fail();
    if (expect.profileId && row.profile_id !== expect.profileId) throw fail();
    if (expect.contractId && row.contract_id !== expect.contractId) throw fail();

    const given = Buffer.from(this.codeHash(otpId, code.trim()), 'hex');
    const stored = Buffer.from(row.code_hash, 'hex');
    if (given.length !== stored.length || !timingSafeEqual(given, stored)) throw fail();

    const mark = await this.otps
      .createQueryBuilder()
      .update(PortalOtp)
      .set({ verifiedAt: () => 'now()' })
      .where('id = :id AND verified_at IS NULL', { id: otpId })
      .execute();
    if (!mark.affected) throw fail();
    return Object.assign(new PortalOtp(), { id: row.id, tenantId, profileId: row.profile_id, purpose: row.purpose, contractId: row.contract_id, channel: row.channel, destination: row.destination });
  }

  async verifyLogin(slug: string, otpId: unknown, code: unknown, ctx: { ip?: string }) {
    const tenant = await this.resolveTenant(slug);
    const cfg = await this.portalConfig.get(tenant.id);
    const otp = await this.consumeCode(tenant.id, otpId, code, { purpose: 'login' });
    const profile = await this.profiles.findOne({ where: { id: otp.profileId, tenantId: tenant.id } });
    if (!profile || !PORTAL_STATUSES.includes(profile.status)) throw new BadRequestException(GENERIC_OTP_ERROR);

    await this.profiles.update({ id: profile.id }, { lastPortalLoginAt: new Date() });
    const expiresInSec = cfg.sessionHours * 3600;
    const token = this.jwt.sign(
      { purpose: 'recruit-portal', tid: tenant.id, pid: profile.id, tv: profile.tokenVersion } as PortalTokenPayload,
      { secret: this.secret(), expiresIn: expiresInSec },
    );
    await this.audit.log({
      tenantId: tenant.id,
      actorType: 'surveyor',
      actorId: profile.id,
      action: 'reclutamiento.portal.login',
      targetType: 'contact_profile',
      targetId: profile.id,
      scopeId: profile.id,
      metadata: { channel: otp.channel, ip: ctx.ip ?? null },
    });
    return { portalToken: token, expiresInSec };
  }

  // ───────────────────────────── Sesión ─────────────────────────────

  /** Valida el token de sesión y devuelve el encuestador. Cualquier problema es 401. */
  async authenticate(slug: string, token: unknown): Promise<PortalSession> {
    const deny = () => new UnauthorizedException('Tu sesión expiró. Verifica tu identidad de nuevo.');
    if (typeof token !== 'string' || !token) throw deny();
    let payload: PortalTokenPayload;
    try {
      payload = this.jwt.verify(token, { secret: this.secret() }) as PortalTokenPayload;
    } catch {
      throw deny();
    }
    if (payload.purpose !== 'recruit-portal') throw deny();
    let tenant: Tenant;
    try {
      tenant = await this.resolveTenant(slug);
    } catch {
      throw deny();
    }
    if (payload.tid !== tenant.id) throw deny();
    const profile = await this.profiles.findOne({ where: { id: payload.pid, tenantId: tenant.id } });
    // Suspender o terminar el perfil sube tokenVersion e invalida la sesión.
    if (!profile || !PORTAL_STATUSES.includes(profile.status) || profile.tokenVersion !== payload.tv) throw deny();
    return { tenant, profile };
  }
}
