import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { Tenant } from '../../tenants/tenant.entity';
import { ClientRecord } from '../../records/record.entity';
import { isFeatureEnabled } from '../../auth/requires-feature.decorator';
import { TenantAuditService } from '../../audit/tenant-audit.service';
import { ContactProfile } from '../entities/contact-profile.entity';
import { OtpPurpose, PortalOtp } from '../entities/portal-otp.entity';
import { PortalInvitation } from '../entities/portal-invitation.entity';
import { PortalConfig, PortalConfigService } from './portal-config.service';
import { ProjectProspectsService, RegisterOutcome } from '../project-prospects.service';
import { RecruitmentProject } from '../entities/recruitment-project.entity';
import { signupRoles } from '../projects.service';
import { ProspectRole } from '../prospect-states';
import { ProjectProspect } from '../entities/project-prospect.entity';
import { PortalFieldDef, normalizeFieldValue } from './portal-fields';
import { ProjectPublicService } from '../project-public.service';
import { effectiveVerification, readForm, validateAnswers } from '../project-form';
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

/** Sesión con perfil de encuestador: da acceso a datos, documentos, contratos y saldo. */
export interface PortalSession {
  tenant: Tenant;
  profile: ContactProfile;
}

/**
 * Sesión del portal de la cuenta. Quien se registró en un proyecto es un contacto
 * sin perfil: puede ver sus proyectos y su estado, pero nada más.
 */
export interface PortalAnySession {
  tenant: Tenant;
  profile: ContactProfile | null;
  record: ClientRecord;
}

/** Sesión de la landing de un proyecto: solo vale para ese proyecto. */
export interface ProjectSession {
  tenant: Tenant;
  project: RecruitmentProject;
  record: ClientRecord;
  prospect: ProjectProspect;
}

interface PortalTokenPayload {
  purpose: 'recruit-portal';
  tid: string;
  /** Perfil (encuestador). Sin él, `rid` es el contacto. */
  pid?: string;
  rid?: string;
  tv: number;
}

interface ProjectTokenPayload {
  purpose: 'recruit-project';
  tid: string;
  rid: string;
  prj: string;
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
    private readonly dataSource: DataSource,
    private readonly prospects: ProjectProspectsService,
    private readonly projectPublic: ProjectPublicService,
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
      // Sin perfil: un contacto registrado en algún proyecto también puede entrar para ver su estado.
      const recordId = await this.prospects.findRecordWithProspects(tenant.id, channel, destination);
      if (recordId) return this.issueCode(tenant, cfg, null, 'login', null, channel, destination, { recordId });
      // Respuesta indistinguible de un envío real.
      return { otpId: randomUUID(), channel, maskedDestination: maskDestination(channel, destination), expiresInSec: OTP_TTL_MS / 1000 };
    }
    const sent = await this.issueCode(tenant, cfg, profile.id, 'login', null, channel, destination);
    return sent;
  }

  private async findProfileByDestination(
    tenantId: string,
    channel: OtpChannel,
    dest: string,
    statuses: string[] = PORTAL_STATUSES,
  ): Promise<ContactProfile | null> {
    const qb = this.profiles
      .createQueryBuilder('p')
      .innerJoin(ClientRecord, 'r', 'r.id = p.recordId')
      .where('p.tenantId = :tenantId AND p.type = :type AND p.status IN (:...statuses)', { tenantId, type: 'surveyor', statuses })
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
    profileId: string | null,
    purpose: OtpPurpose,
    contractId: string | null,
    channel: OtpChannel,
    destination: string,
    payload: PortalOtp['payload'] = null,
  ) {
    // Tope por hora: por perfil, o por destino cuando todavía no hay perfil (registro).
    const since = new Date(Date.now() - HOUR_MS);
    const recentQb = this.otps.createQueryBuilder('o').where('o.tenantId = :t AND o.createdAt > :since', { t: tenant.id, since });
    if (profileId) recentQb.andWhere('o.profileId = :p', { p: profileId });
    else recentQb.andWhere('o.profileId IS NULL AND o.destination = :d', { d: destination });
    const recent = await recentQb.getCount();
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
        payload,
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
    expect: { purpose: OtpPurpose | OtpPurpose[]; profileId?: string; contractId?: string },
  ): Promise<PortalOtp> {
    const fail = () => new BadRequestException(GENERIC_OTP_ERROR);
    if (typeof otpId !== 'string' || !/^[0-9a-f-]{36}$/i.test(otpId) || typeof code !== 'string' || !/^\d{6}$/.test(code.trim())) throw fail();

    const res = await this.otps
      .createQueryBuilder()
      .update(PortalOtp)
      .set({ attempts: () => 'attempts + 1' })
      .where('id = :id AND tenant_id = :tenantId AND purpose = ANY(:purposes) AND verified_at IS NULL AND attempts < :max AND expires_at > now()', {
        id: otpId,
        tenantId,
        purposes: Array.isArray(expect.purpose) ? expect.purpose : [expect.purpose],
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
    return Object.assign(new PortalOtp(), { id: row.id, tenantId, profileId: row.profile_id, purpose: row.purpose, contractId: row.contract_id, channel: row.channel, destination: row.destination, payload: row.payload ?? null });
  }

  async verifyLogin(slug: string, otpId: unknown, code: unknown, ctx: { ip?: string }) {
    const tenant = await this.resolveTenant(slug);
    const cfg = await this.portalConfig.get(tenant.id);
    const otp = await this.consumeCode(tenant.id, otpId, code, { purpose: ['login', 'register'] });
    // Un código de registro crea el perfil ahora que el destino quedó verificado.
    // Un código de ingreso sin perfil es de un contacto registrado en un proyecto.
    if (otp.purpose === 'login' && !otp.profileId && otp.payload?.recordId) {
      const record = await this.records.findOne({ where: { id: otp.payload.recordId, tenantId: tenant.id } });
      if (!record || record.deletedAt) throw new BadRequestException(GENERIC_OTP_ERROR);
      const expiresInSec = cfg.sessionHours * 3600;
      const token = this.jwt.sign({ purpose: 'recruit-portal', tid: tenant.id, rid: record.id, tv: 0 } as PortalTokenPayload, { secret: this.secret(), expiresIn: expiresInSec });
      await this.audit.log({
        tenantId: tenant.id,
        actorType: 'system',
        actorId: null,
        action: 'reclutamiento.portal.contact_login',
        targetType: 'client_record',
        targetId: record.id,
        scopeId: record.id,
        metadata: { channel: otp.channel, ip: ctx.ip ?? null },
      });
      return { portalToken: token, expiresInSec };
    }
    const profile =
      otp.purpose === 'register'
        ? await this.completeRegistration(tenant, cfg, otp, ctx)
        : otp.profileId
          ? await this.profiles.findOne({ where: { id: otp.profileId, tenantId: tenant.id } })
          : null;
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

  // ───────────────────────────── Registro abierto ─────────────────────────────
  /**
   * Pide un código para registrarse (solo con el registro abierto). Todavía no
   * se crea nada: el contacto y el perfil nacen al verificar el código, así que
   * nadie puede registrar un correo o teléfono que no controla.
   *
   * La respuesta es idéntica si el destino ya tiene perfil (se le envía un código
   * de ingreso), si está bloqueado (suspendido o terminado; no se envía nada) o si
   * es nuevo.
   */
  async requestRegistration(slug: string, body: { fullName?: unknown; channel?: unknown; destination?: unknown; consent?: unknown }) {
    const tenant = await this.resolveTenant(slug);
    const cfg = await this.portalConfig.get(tenant.id);
    if (cfg.registration.mode !== 'open') {
      throw new ForbiddenException('El registro abierto no está habilitado. Pide una invitación a quien administra este portal.');
    }
    return this.startRegistration(tenant, cfg, body);
  }
  /**
   * Registro desde la dirección pública de un proyecto activo con el registro
   * abierto. Se pide el nombre, un teléfono o correo que se verifica con un código,
   * el otro dato de contacto, los datos personales y las preguntas que configuró el
   * proyecto. Todo se valida ya y viaja con el código; al verificarlo, la persona
   * queda como contacto del CRM y como prospecto del proyecto. El modo de acceso
   * general de la cuenta no aplica: cada proyecto tiene su propio interruptor.
   *
   * La respuesta es la misma exista o no un prospecto o un contacto con ese dato.
   */
  async requestProjectRegistration(
    slug: string,
    projectSlug: string,
    body: { fullName?: unknown; channel?: unknown; destination?: unknown; consent?: unknown; answers?: unknown; values?: unknown; email?: unknown; phone?: unknown; role?: unknown },
  ) {
    const tenant = await this.resolveTenant(slug);
    const cfg = await this.portalConfig.get(tenant.id);
    const project = await this.projectPublic.resolvePublic(tenant, projectSlug);
    if (!project.registrationOpen) throw new ForbiddenException('Este proyecto no está recibiendo registros por ahora.');
    const form = readForm(project.form);
    const answers = validateAnswers(form, body.answers);
    const projectCfg = this.projectConfig(cfg, project);
    const { channel, fullName, destination } = this.parseRegistration(projectCfg, body);
    const other = this.parseOtherContact(channel, body);
    const values = await this.parsePersonalValues(tenant.id, form.fields, body.values);
    // Perfil: uno de los que ofrece el registro; sin elegir, el de entrada del proyecto.
    const offered = signupRoles(project);
    const role = (body.role === undefined || body.role === null || body.role === '' ? project.defaultRole : body.role) as ProspectRole;
    if (!offered.includes(role)) throw new BadRequestException('Elige cómo quieres participar');
    this.throttleRequests(`${tenant.id}:${channel}:${destination}`);
    return this.issueCode(tenant, projectCfg, null, 'prospect', null, channel, destination, {
      fullName,
      consentAt: new Date().toISOString(),
      project: { id: project.id, answers, values, other, role },
    });
  }

  /** El otro dato de contacto: con el teléfono verificado, el correo es opcional; con el correo verificado, el teléfono es obligatorio. */
  private parseOtherContact(channel: OtpChannel, body: { email?: unknown; phone?: unknown }): { email?: string; phone?: string } {
    if (channel === 'phone') {
      const email = this.normalizeDestination('email', body.email);
      if (!email) return {};
      if (!this.isValidDestination('email', email)) throw new BadRequestException('Correo electrónico inválido');
      return { email };
    }
    const phone = this.normalizeDestination('phone', body.phone);
    if (!this.isValidDestination('phone', phone)) throw new BadRequestException('Escribe tu número de teléfono');
    return { phone };
  }

  /** Valida los datos personales que pide el proyecto contra el catálogo de campos del CRM. Ignora lo que no se pidió. */
  private async parsePersonalValues(tenantId: string, fields: Array<{ key: string; required: boolean }>, raw: unknown): Promise<Record<string, string>> {
    if (fields.length === 0) return {};
    if (raw !== undefined && raw !== null && (typeof raw !== 'object' || Array.isArray(raw))) throw new BadRequestException('Los datos personales son inválidos');
    const given = (raw ?? {}) as Record<string, unknown>;
    const catalog = new Map<string, PortalFieldDef>((await this.portalConfig.fieldCatalog(tenantId)).map((f) => [f.key, f]));
    const out: Record<string, string> = {};
    for (const f of fields) {
      const def = catalog.get(f.key);
      if (!def) continue;
      let value: string;
      try {
        value = normalizeFieldValue(def, given[f.key]);
      } catch (e) {
        throw new BadRequestException((e as Error).message);
      }
      if (!value) {
        if (f.required) throw new BadRequestException(`«${def.label}» es obligatorio`);
        continue;
      }
      out[f.key] = value;
    }
    return out;
  }

  /** Verifica el código de un registro de proyecto y guarda el contacto y el prospecto. Devuelve la sesión de esa landing. */
  async verifyProjectRegistration(slug: string, projectSlug: string, otpId: unknown, code: unknown): Promise<{ status: RegisterOutcome; sessionToken?: string; expiresInSec?: number }> {
    const tenant = await this.resolveTenant(slug);
    const cfg = await this.portalConfig.get(tenant.id);
    const otp = await this.consumeCode(tenant.id, otpId, code, { purpose: 'prospect' });
    const payload = otp.payload;
    const project = await this.projectPublic.resolvePublic(tenant, projectSlug).catch(() => null);
    // El código es de otro proyecto o el proyecto ya no está disponible: no se guarda nada.
    if (!project || !payload?.project || payload.project.id !== project.id || !payload.fullName || !payload.consentAt) {
      return { status: 'closed' };
    }
    const { status, recordId } = await this.prospects.register(tenant.id, project.id, {
      fullName: payload.fullName,
      channel: otp.channel,
      destination: otp.destination,
      other: payload.project.other,
      values: payload.project.values,
      consentAt: new Date(payload.consentAt),
      answers: payload.project.answers as any,
      role: payload.project.role as ProspectRole | undefined,
    });
    await this.audit.log({
      tenantId: tenant.id,
      actorType: 'system',
      actorId: null,
      action: 'reclutamiento.prospect.register',
      targetType: 'recruitment_project',
      targetId: project.id,
      scopeId: project.id,
      metadata: { channel: otp.channel, outcome: status, recordId },
    });
    // Quien verificó su dato queda con sesión en esta landing (y solo en esta).
    if (status === 'closed' || !recordId) return { status };
    return { status, ...this.signProjectSession(tenant, cfg, recordId, project.id) };
  }

  /** Valida lo que la persona escribió al registrarse: canal, nombre, consentimiento y destino. */
  private parseRegistration(
    cfg: PortalConfig,
    body: { fullName?: unknown; channel?: unknown; destination?: unknown; consent?: unknown },
  ): { channel: OtpChannel; fullName: string; destination: string } {
    const channel = body.channel as OtpChannel;
    this.assertChannelAllowed(cfg, channel);
    const fullName = typeof body.fullName === 'string' ? body.fullName.replace(/\s+/g, ' ').trim() : '';
    if (fullName.length < 3 || fullName.length > 100 || !/\p{L}/u.test(fullName)) throw new BadRequestException('Escribe tu nombre completo');
    if (body.consent !== true) throw new BadRequestException('Debes aceptar el tratamiento de tus datos para registrarte');
    const destination = this.normalizeDestination(channel, body.destination);
    if (!this.isValidDestination(channel, destination)) {
      throw new BadRequestException(channel === 'email' ? 'Correo electrónico inválido' : 'Número de teléfono inválido');
    }
    return { channel, fullName, destination };
  }

  private async startRegistration(
    tenant: Tenant,
    cfg: PortalConfig,
    body: { fullName?: unknown; channel?: unknown; destination?: unknown; consent?: unknown },
  ) {
    const { channel, fullName, destination } = this.parseRegistration(cfg, body);
    this.throttleRequests(`${tenant.id}:${channel}:${destination}`);
    const existing = await this.findProfileByDestination(tenant.id, channel, destination);
    if (existing) return this.issueCode(tenant, cfg, existing.id, 'login', null, channel, destination);
    const blocked = await this.findProfileByDestination(tenant.id, channel, destination, ['suspended', 'ended']);
    if (blocked) {
      return { otpId: randomUUID(), channel, maskedDestination: maskDestination(channel, destination), expiresInSec: OTP_TTL_MS / 1000 };
    }
    return this.issueCode(tenant, cfg, null, 'register', null, channel, destination, { fullName, consentAt: new Date().toISOString() });
  }

  /**
   * Crea el perfil `candidate` de quien verificó su destino. Si el CRM ya tiene
   * un único contacto con ese correo o teléfono verificado, se reutiliza (como
   * hace el portal de cursos); si no, se crea uno nuevo. Devuelve null si no se
   * puede completar (registro cerrado entre tanto, contacto ambiguo).
   */
  private async completeRegistration(
    tenant: Tenant,
    cfg: PortalConfig,
    otp: PortalOtp,
    ctx: { ip?: string },
  ): Promise<ContactProfile | null> {
    if (!otp.payload?.fullName || cfg.registration.mode !== 'open') return null;
    const channel = otp.channel as OtpChannel;
    const destination = otp.destination;
    try {
      return await this.dataSource.transaction(async (em) => {
        // Dos verificaciones simultáneas del mismo destino se turnan: la segunda ya ve el perfil de la primera.
        await em.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`recruit-register:${tenant.id}:${channel}:${destination}`]);
        const recordRepo = em.getRepository(ClientRecord);
        const profileRepo = em.getRepository(ContactProfile);
        const qb = recordRepo.createQueryBuilder('r').where('r.tenantId = :tenantId AND r.deletedAt IS NULL', { tenantId: tenant.id });
        if (channel === 'email') {
          qb.andWhere('lower(trim(r.email)) = :dest', { dest: destination });
        } else {
          qb.andWhere(
            "(regexp_replace(coalesce(r.phone, ''), '\\D', '', 'g') = :dest OR regexp_replace(coalesce(r.countryCode, ''), '\\D', '', 'g') || regexp_replace(coalesce(r.phone, ''), '\\D', '', 'g') = :dest)",
            { dest: destination },
          );
        }
        const matches = await qb.limit(2).getMany();
        // Dos contactos con el mismo teléfono no se resuelven solos. Con el correo, que no es único, se crea uno nuevo.
        if (matches.length > 1 && channel === 'phone') return null;
        let record: ClientRecord | null = matches.length === 1 ? matches[0] : null;
        if (record) {
          const existing = await profileRepo.findOne({ where: { tenantId: tenant.id, recordId: record.id, type: 'surveyor' } });
          if (existing) return existing;
        } else {
          const fullName = otp.payload!.fullName!;
          const [firstName, ...rest] = fullName.split(' ');
          record = await recordRepo.save(
            recordRepo.create({
              tenantId: tenant.id,
              fullName,
              firstName,
              lastName: rest.join(' ') || undefined,
              ...(channel === 'email' ? { email: destination } : { phone: destination }),
              channelSource: 'web',
              source: 'portal_reclutamiento',
            }),
          );
        }
        const profile = await profileRepo.save(
          profileRepo.create({
            tenantId: tenant.id,
            recordId: record.id,
            type: 'surveyor',
            status: 'candidate',
            data: { registration: { source: 'portal', at: new Date().toISOString(), consentAt: otp.payload!.consentAt } },
          }),
        );
        await this.audit.log(
          {
            tenantId: tenant.id,
            actorType: 'surveyor',
            actorId: profile.id,
            action: 'reclutamiento.portal.register',
            targetType: 'contact_profile',
            targetId: profile.id,
            scopeId: profile.id,
            metadata: { channel, reusedContact: matches.length === 1, ip: ctx.ip ?? null },
          },
          em,
        );
        return profile;
      });
    } catch (err: any) {
      // Carrera: otro registro del mismo destino se completó primero (índices únicos de teléfono o de perfil).
      if (err?.code === '23505') return this.findProfileByDestination(tenant.id, channel, destination);
      throw err;
    }
  }
  // ───────────────────────────── Sesión ─────────────────────────────

  /** Valida el token de sesión del portal. Cualquier problema es 401. */
  async authenticate(slug: string, token: unknown): Promise<PortalAnySession> {
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
    if (payload.pid) {
      const profile = await this.profiles.findOne({ where: { id: payload.pid, tenantId: tenant.id } });
      // Suspender o terminar el perfil sube tokenVersion e invalida la sesión.
      if (!profile || !PORTAL_STATUSES.includes(profile.status) || profile.tokenVersion !== payload.tv) throw deny();
      const record = await this.records.findOne({ where: { id: profile.recordId, tenantId: tenant.id } });
      if (!record || record.deletedAt) throw deny();
      return { tenant, profile, record };
    }
    if (!payload.rid) throw deny();
    const record = await this.records.findOne({ where: { id: payload.rid, tenantId: tenant.id } });
    if (!record || record.deletedAt) throw deny();
    return { tenant, profile: null, record };
  }

  // ───────────────────────────── Sesión de la landing de un proyecto ─────────────────────────────

  /** Configuración del portal con la verificación del proyecto (canales y plantilla de WhatsApp), o la de la cuenta si no definió una. */
  projectConfig(cfg: PortalConfig, project: RecruitmentProject): PortalConfig {
    const v = effectiveVerification(readForm(project.form), { channel: cfg.verification.channel, whatsapp: cfg.verification.whatsapp });
    return { ...cfg, verification: { ...cfg.verification, channel: v.channel, whatsapp: v.whatsapp } };
  }

  private signProjectSession(tenant: Tenant, cfg: PortalConfig, recordId: string, projectId: string) {
    const expiresInSec = cfg.sessionHours * 3600;
    const sessionToken = this.jwt.sign({ purpose: 'recruit-project', tid: tenant.id, rid: recordId, prj: projectId } as ProjectTokenPayload, {
      secret: this.secret(),
      expiresIn: expiresInSec,
    });
    return { sessionToken, expiresInSec };
  }

  /**
   * Pide un código para ingresar a la landing de un proyecto. Responde igual
   * exista o no un registro con ese dato, para no revelar quién se registró.
   */
  async requestProjectLogin(slug: string, projectSlug: string, body: { channel?: unknown; destination?: unknown }) {
    const tenant = await this.resolveTenant(slug);
    const cfg = await this.portalConfig.get(tenant.id);
    const project = await this.projectPublic.resolvePublic(tenant, projectSlug);
    const projectCfg = this.projectConfig(cfg, project);
    const channel = body.channel as OtpChannel;
    this.assertChannelAllowed(projectCfg, channel);
    const destination = this.normalizeDestination(channel, body.destination);
    if (!this.isValidDestination(channel, destination)) {
      throw new BadRequestException(channel === 'email' ? 'Correo electrónico inválido' : 'Número de teléfono inválido');
    }
    this.throttleRequests(`${tenant.id}:${channel}:${destination}`);
    const recordId = await this.prospects.findRecordInProject(tenant.id, project.id, channel, destination);
    if (!recordId) return { otpId: randomUUID(), channel, maskedDestination: maskDestination(channel, destination), expiresInSec: OTP_TTL_MS / 1000 };
    return this.issueCode(tenant, projectCfg, null, 'project_login', null, channel, destination, { recordId, project: { id: project.id, answers: [] } });
  }

  async verifyProjectLogin(slug: string, projectSlug: string, otpId: unknown, code: unknown) {
    const tenant = await this.resolveTenant(slug);
    const cfg = await this.portalConfig.get(tenant.id);
    const otp = await this.consumeCode(tenant.id, otpId, code, { purpose: 'project_login' });
    const project = await this.projectPublic.resolvePublic(tenant, projectSlug).catch(() => null);
    const recordId = otp.payload?.recordId;
    if (!project || !recordId || otp.payload?.project?.id !== project.id) throw new BadRequestException(GENERIC_OTP_ERROR);
    if (!(await this.prospects.exists(tenant.id, project.id, recordId))) throw new BadRequestException(GENERIC_OTP_ERROR);
    return this.signProjectSession(tenant, cfg, recordId, project.id);
  }

  /** Valida el token de la landing de un proyecto: solo sirve para ese proyecto. */
  async authenticateProject(slug: string, projectSlug: string, token: unknown): Promise<ProjectSession> {
    const deny = () => new UnauthorizedException('Tu sesión expiró. Verifica tu identidad de nuevo.');
    if (typeof token !== 'string' || !token) throw deny();
    let payload: ProjectTokenPayload;
    try {
      payload = this.jwt.verify(token, { secret: this.secret() }) as ProjectTokenPayload;
    } catch {
      throw deny();
    }
    if (payload.purpose !== 'recruit-project') throw deny();
    const tenant = await this.resolveTenant(slug).catch(() => null);
    if (!tenant || payload.tid !== tenant.id) throw deny();
    const project = await this.projectPublic.resolvePublic(tenant, projectSlug).catch(() => null);
    if (!project || project.id !== payload.prj) throw deny();
    const [record, prospect] = await Promise.all([
      this.records.findOne({ where: { id: payload.rid, tenantId: tenant.id } }),
      this.prospects.find(tenant.id, project.id, payload.rid),
    ]);
    if (!record || record.deletedAt || !prospect) throw deny();
    return { tenant, project, record, prospect };
  }
}
