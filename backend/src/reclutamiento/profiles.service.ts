import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull, Not, Repository } from 'typeorm';
import { ClientRecord } from '../records/record.entity';
import { TenantAuditService } from '../audit/tenant-audit.service';
import { ContactProfile, PROFILE_STATUSES, PROFILE_TYPES, ProfileStatus } from './entities/contact-profile.entity';
import { SurveyorContract } from './entities/surveyor-contract.entity';
import { SurveyorPaymentMethod } from './entities/surveyor-payment-method.entity';
import {
  Actor,
  clampInt,
  escapeLike,
  optionalString,
  requireObject,
  requireUuid,
} from './validation';

type ProfileAction = 'activate' | 'suspend' | 'end' | 'reopen';

const ACTIONS: Record<
  ProfileAction,
  { from: ProfileStatus[]; to: ProfileStatus; revokeSessions: boolean; label: string }
> = {
  activate: { from: ['candidate', 'suspended'], to: 'active', revokeSessions: false, label: 'activar' },
  suspend: { from: ['active'], to: 'suspended', revokeSessions: true, label: 'suspender' },
  end: { from: ['candidate', 'active', 'suspended'], to: 'ended', revokeSessions: true, label: 'terminar' },
  reopen: { from: ['ended'], to: 'candidate', revokeSessions: false, label: 'reabrir' },
};

const MAX_DATA_BYTES = 8 * 1024;

@Injectable()
export class ProfilesService {
  constructor(
    @InjectRepository(ContactProfile) private readonly profiles: Repository<ContactProfile>,
    @InjectRepository(ClientRecord) private readonly records: Repository<ClientRecord>,
    @InjectRepository(SurveyorContract) private readonly contracts: Repository<SurveyorContract>,
    @InjectRepository(SurveyorPaymentMethod) private readonly methods: Repository<SurveyorPaymentMethod>,
    private readonly dataSource: DataSource,
    private readonly audit: TenantAuditService,
  ) {}

  /** Perfil del tenant o 404. Toda búsqueda por id pasa por aquí con tenantId. */
  async requireProfile(tenantId: string, profileId: string): Promise<ContactProfile> {
    const profile = await this.profiles.findOne({ where: { id: profileId, tenantId } });
    if (!profile) throw new NotFoundException('Encuestador no encontrado');
    return profile;
  }

  // ───────────────────────────── Lectura ─────────────────────────────

  async list(
    tenantId: string,
    q: { status?: string; search?: string; page?: unknown; limit?: unknown },
  ) {
    const page = clampInt(q.page, 1, 1, 100000);
    const limit = clampInt(q.limit, 25, 1, 100);

    const qb = this.profiles
      .createQueryBuilder('p')
      .where('p.tenantId = :tenantId', { tenantId })
      .andWhere('p.type = :type', { type: 'surveyor' });

    if (q.status) {
      if (!(PROFILE_STATUSES as readonly string[]).includes(q.status)) {
        throw new BadRequestException('Estado inválido');
      }
      qb.andWhere('p.status = :status', { status: q.status });
    }

    const term = q.search?.trim();
    if (term) {
      qb.andWhere(
        `p.recordId IN (
          SELECT r.id FROM clients r
          WHERE r.tenant_id = :tenantId AND r.deleted_at IS NULL AND (
            r.full_name ILIKE :term ESCAPE '\\' OR r.first_name ILIKE :term ESCAPE '\\' OR
            r.last_name ILIKE :term ESCAPE '\\' OR r.phone ILIKE :term ESCAPE '\\' OR
            r.email ILIKE :term ESCAPE '\\'
          )
        )`,
        { term: `%${escapeLike(term)}%` },
      );
    }

    const [rows, total] = await qb
      .orderBy('p.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const items = await this.enrich(tenantId, rows);
    return { data: items, total, page, limit };
  }

  async detail(tenantId: string, profileId: string) {
    const profile = await this.requireProfile(tenantId, profileId);
    const [contact] = await this.loadContacts(tenantId, [profile.recordId]);
    const contracts = await this.contracts.find({
      where: { tenantId, profileId },
      order: { createdAt: 'DESC' },
    });
    // `details` no se selecciona por defecto: aquí nunca salen datos cifrados.
    const paymentMethods = await this.methods.find({
      where: { tenantId, profileId },
      order: { createdAt: 'DESC' },
    });
    return { profile, contact: contact ?? null, contracts, paymentMethods };
  }

  // ───────────────────────────── Escritura ─────────────────────────────

  async create(tenantId: string, actor: Actor, body: Record<string, unknown>) {
    const recordId = requireUuid(body.recordId, 'Contacto');
    const data = this.parseData(body.data);

    const record = await this.records.findOne({
      where: { id: recordId, tenantId, deletedAt: IsNull() },
    });
    if (!record) throw new NotFoundException('Contacto no encontrado en esta cuenta');

    const type = PROFILE_TYPES[0];
    const existing = await this.profiles.findOne({ where: { tenantId, recordId, type } });
    if (existing) {
      throw new ConflictException({
        code: 'PROFILE_EXISTS',
        message:
          existing.status === 'ended'
            ? 'Este contacto fue encuestador y su perfil está terminado. Puedes reabrirlo.'
            : 'Este contacto ya es encuestador.',
        profileId: existing.id,
        status: existing.status,
      });
    }

    try {
      return await this.dataSource.transaction(async (em) => {
        const profile = await em.getRepository(ContactProfile).save(
          em.getRepository(ContactProfile).create({ tenantId, recordId, type, status: 'candidate', data }),
        );
        await this.audit.log(
          {
            tenantId,
            actorType: 'user',
            actorId: actor.id,
            actorLabel: actor.email,
            action: 'reclutamiento.profile.create',
            targetType: 'contact_profile',
            targetId: profile.id,
            scopeId: profile.id,
            metadata: { recordId, type },
          },
          em,
        );
        return profile;
      });
    } catch (err: any) {
      // Carrera con otra solicitud: el índice único (tenant, contacto, tipo) lo impide.
      if (err?.code === '23505') {
        throw new ConflictException({ code: 'PROFILE_EXISTS', message: 'Este contacto ya es encuestador.' });
      }
      throw err;
    }
  }

  async updateData(tenantId: string, actor: Actor, profileId: string, body: Record<string, unknown>) {
    const profile = await this.requireProfile(tenantId, profileId);
    if (profile.status === 'ended') {
      throw new ConflictException('El perfil está terminado. Reábrelo para editarlo.');
    }
    const data = this.parseData(body.data);
    await this.profiles.update({ id: profileId, tenantId }, { data });
    await this.audit.log({
      tenantId,
      actorType: 'user',
      actorId: actor.id,
      actorLabel: actor.email,
      action: 'reclutamiento.profile.update',
      targetType: 'contact_profile',
      targetId: profileId,
      scopeId: profileId,
      metadata: { keys: Object.keys(data) },
    });
    return this.requireProfile(tenantId, profileId);
  }

  activate(tenantId: string, actor: Actor, profileId: string) {
    return this.transition(tenantId, actor, profileId, 'activate', null);
  }

  suspend(tenantId: string, actor: Actor, profileId: string, body: Record<string, unknown>) {
    const reason = optionalString(body.reason, 'El motivo', 500);
    if (!reason) throw new BadRequestException('El motivo de la suspensión es requerido');
    return this.transition(tenantId, actor, profileId, 'suspend', reason);
  }

  end(tenantId: string, actor: Actor, profileId: string, body: Record<string, unknown>) {
    return this.transition(tenantId, actor, profileId, 'end', optionalString(body.reason, 'El motivo', 500));
  }

  reopen(tenantId: string, actor: Actor, profileId: string) {
    return this.transition(tenantId, actor, profileId, 'reopen', null);
  }

  // ───────────────────────────── Internos ─────────────────────────────

  /**
   * Cambia el estado del perfil dentro de una transacción. El UPDATE es
   * condicional al estado actual, de modo que dos solicitudes simultáneas no
   * pueden aplicar la misma transición dos veces.
   */
  private async transition(
    tenantId: string,
    actor: Actor,
    profileId: string,
    action: ProfileAction,
    reason: string | null,
  ): Promise<ContactProfile> {
    const cfg = ACTIONS[action];

    await this.dataSource.transaction(async (em) => {
      const repo = em.getRepository(ContactProfile);
      const profile = await repo.findOne({ where: { id: profileId, tenantId } });
      if (!profile) throw new NotFoundException('Encuestador no encontrado');

      if (!cfg.from.includes(profile.status)) {
        throw new ConflictException(`No se puede ${cfg.label} un perfil en estado "${profile.status}"`);
      }
      if (action === 'activate') {
        await this.assertActivationReady(em, tenantId, profileId);
      }

      const patch: Record<string, any> = { status: cfg.to };
      if (action === 'activate') {
        patch.enabledBy = actor.id;
        patch.enabledAt = new Date();
        patch.statusReason = null;
      } else if (action === 'suspend' || action === 'end') {
        patch.statusReason = reason;
      } else if (action === 'reopen') {
        patch.statusReason = null;
      }
      if (cfg.revokeSessions) patch.tokenVersion = () => 'token_version + 1';

      const res = await repo
        .createQueryBuilder()
        .update(ContactProfile)
        .set(patch)
        .where('id = :id AND tenant_id = :tenantId AND status = :from', {
          id: profileId,
          tenantId,
          from: profile.status,
        })
        .execute();
      if (!res.affected) {
        throw new ConflictException('El estado del perfil cambió mientras se procesaba. Reintenta.');
      }

      // Al terminar el perfil, sus contratos activos terminan con él.
      if (action === 'end') {
        await em
          .getRepository(SurveyorContract)
          .createQueryBuilder()
          .update(SurveyorContract)
          .set({
            status: 'ended',
            endDate: () => 'LEAST(COALESCE(end_date, CURRENT_DATE), CURRENT_DATE)',
          })
          .where('tenant_id = :tenantId AND profile_id = :profileId AND status = :status', {
            tenantId,
            profileId,
            status: 'active',
          })
          .execute();
      }

      await this.audit.log(
        {
          tenantId,
          actorType: 'user',
          actorId: actor.id,
          actorLabel: actor.email,
          action: `reclutamiento.profile.${action}`,
          targetType: 'contact_profile',
          targetId: profileId,
          scopeId: profileId,
          metadata: { from: profile.status, to: cfg.to, ...(reason ? { reason } : {}) },
        },
        em,
      );
    });

    return this.requireProfile(tenantId, profileId);
  }

  /**
   * Un encuestador solo se activa con contrato vigente y un método de pago ya
   * verificado por una persona.
   */
  private async assertActivationReady(em: EntityManager, tenantId: string, profileId: string) {
    const activeContracts = await em
      .getRepository(SurveyorContract)
      .count({ where: { tenantId, profileId, status: 'active' }, take: 1 });
    if (activeContracts === 0) {
      throw new BadRequestException('Para activar al encuestador necesitas un contrato activo');
    }
    const verified = await em
      .getRepository(SurveyorPaymentMethod)
      .count({ where: { tenantId, profileId, verifiedAt: Not(IsNull()) }, take: 1 });
    if (verified === 0) {
      throw new BadRequestException('Para activar al encuestador necesitas un método de pago verificado');
    }
  }

  private parseData(value: unknown): Record<string, any> {
    if (value === undefined || value === null) return {};
    const obj = requireObject(value, 'Los datos del encuestador');
    if (Buffer.byteLength(JSON.stringify(obj), 'utf8') > MAX_DATA_BYTES) {
      throw new BadRequestException('Los datos del encuestador son demasiado grandes');
    }
    return obj;
  }

  private async loadContacts(tenantId: string, recordIds: string[]) {
    if (recordIds.length === 0) return [];
    const rows = await this.records.find({
      where: { id: In(recordIds), tenantId },
      select: {
        id: true,
        fullName: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        avatarUrl: true,
        city: true,
        region: true,
        countryCode: true,
        deletedAt: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.fullName || [r.firstName, r.lastName].filter(Boolean).join(' ') || null,
      firstName: r.firstName,
      lastName: r.lastName,
      phone: r.phone,
      email: r.email,
      avatarUrl: r.avatarUrl,
      city: r.city,
      region: r.region,
      countryCode: r.countryCode,
      deleted: !!r.deletedAt,
    }));
  }

  /** Añade a cada perfil el contacto, el contrato vigente y si ya tiene pago verificado. */
  private async enrich(tenantId: string, rows: ContactProfile[]) {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);

    const [contacts, activeContracts, verifiedRaw] = await Promise.all([
      this.loadContacts(tenantId, rows.map((r) => r.recordId)),
      this.contracts.find({ where: { tenantId, profileId: In(ids), status: 'active' } }),
      this.methods
        .createQueryBuilder('m')
        .select('m.profileId', 'profileId')
        .where('m.tenantId = :tenantId AND m.profileId IN (:...ids) AND m.verifiedAt IS NOT NULL', { tenantId, ids })
        .groupBy('m.profileId')
        .getRawMany<{ profileId: string }>(),
    ]);

    const contactById = new Map(contacts.map((c) => [c.id, c]));
    const contractByProfile = new Map(activeContracts.map((c) => [c.profileId, c]));
    const verified = new Set(verifiedRaw.map((v) => v.profileId));

    return rows.map((p) => {
      const c = contractByProfile.get(p.id);
      return {
        ...p,
        contact: contactById.get(p.recordId) ?? null,
        activeContract: c
          ? { id: c.id, defaultRate: c.defaultRate, currency: c.currency, countryCode: c.countryCode, endDate: c.endDate }
          : null,
        paymentVerified: verified.has(p.id),
      };
    });
  }
}
