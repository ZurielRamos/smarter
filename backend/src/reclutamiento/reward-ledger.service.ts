import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { TenantAuditService } from '../audit/tenant-audit.service';
import { ClientRecord } from '../records/record.entity';
import { ContactProfile } from './entities/contact-profile.entity';
import { RewardLedgerEntry } from './entities/reward-ledger.entity';
import { SurveyorPaymentMethod } from './entities/surveyor-payment-method.entity';
import { Actor, clampInt, optionalString, requireCurrency, requireIsoDate, requireRate, requireUuid } from './validation';

/**
 * Lo que la reclutadora le debe a cada encuestador. Los pagos y ajustes los
 * registra la reclutadora. Todo es de solo agregar: el saldo es la suma de los
 * asientos. La causación por encuestas aprobadas vuelve con la etapa de estudios.
 */
@Injectable()
export class RewardLedgerService {
  constructor(
    @InjectRepository(RewardLedgerEntry) private readonly ledger: Repository<RewardLedgerEntry>,
    @InjectRepository(ContactProfile) private readonly profiles: Repository<ContactProfile>,
    @InjectRepository(ClientRecord) private readonly records: Repository<ClientRecord>,
    @InjectRepository(SurveyorPaymentMethod) private readonly methods: Repository<SurveyorPaymentMethod>,
    private readonly dataSource: DataSource,
    private readonly audit: TenantAuditService,
  ) {}

  // ───────────────────────────── Consultas ─────────────────────────────

  private async balances(tenantId: string, profileId: string, em?: EntityManager): Promise<Array<{ currency: string; balance: number }>> {
    const rows: Array<{ currency: string; balance: string }> = await (em ?? this.dataSource).query(
      `SELECT currency, SUM(amount) AS balance FROM reward_ledger WHERE tenant_id = $1 AND profile_id = $2 GROUP BY currency ORDER BY currency`,
      [tenantId, profileId],
    );
    return rows.map((r) => ({ currency: r.currency, balance: Number(r.balance) }));
  }

  private async ownProfile(tenantId: string, profileId: string) {
    const profile = await this.profiles.findOne({ where: { id: profileId, tenantId } });
    if (!profile) throw new NotFoundException('Encuestador no encontrado');
    return profile;
  }

  /** Movimientos de un encuestador, del más reciente al más antiguo. */
  private async entries(tenantId: string, profileId: string, page: number, limit: number) {
    const [rows, total] = await this.ledger.findAndCount({ where: { tenantId, profileId }, order: { createdAt: 'DESC' }, skip: (page - 1) * limit, take: limit });
    return {
      total,
      data: rows.map((e) => ({
        id: e.id,
        type: e.type,
        amount: e.amount,
        currency: e.currency,
        createdAt: e.createdAt,
        paidAt: e.paidAt,
        reference: e.reference,
        note: e.note,
        // El estudio y el punto de una encuesta causada vuelven con la etapa de estudios.
        study: null,
        point: null,
      })),
    };
  }
  async ledgerForProfile(tenantId: string, profileId: string, q: { page?: unknown; limit?: unknown }) {
    await this.ownProfile(tenantId, profileId);
    const page = clampInt(q.page, 1, 1, 100000);
    const limit = clampInt(q.limit, 25, 1, 100);
    return { balances: await this.balances(tenantId, profileId), ...(await this.entries(tenantId, profileId, page, limit)), page, limit };
  }

  /** Saldos de la cuenta: quién tiene algo por cobrar. */
  async balancesForTenant(tenantId: string, q: { search?: string } = {}) {
    const rows: Array<{ profile_id: string; currency: string; balance: string; last: Date }> = await this.dataSource.query(
      `SELECT profile_id, currency, SUM(amount) AS balance, MAX(created_at) AS last FROM reward_ledger WHERE tenant_id = $1 GROUP BY profile_id, currency HAVING SUM(amount) <> 0 ORDER BY SUM(amount) DESC LIMIT 500`,
      [tenantId],
    );
    const ids = Array.from(new Set(rows.map((r) => r.profile_id)));
    const profiles = ids.length ? await this.profiles.find({ where: { id: In(ids), tenantId } }) : [];
    const records = profiles.length ? await this.records.find({ where: { id: In(profiles.map((p) => p.recordId)), tenantId }, select: { id: true, fullName: true, firstName: true, lastName: true, email: true } }) : [];
    const recordById = new Map(records.map((r) => [r.id, r]));
    const nameOf = (profileId: string) => {
      const p = profiles.find((x) => x.id === profileId);
      const r = p ? recordById.get(p.recordId) : undefined;
      return { name: r ? r.fullName || [r.firstName, r.lastName].filter(Boolean).join(' ') || null : null, email: r?.email ?? null, status: p?.status ?? null };
    };
    const term = q.search?.trim().toLowerCase();
    const data = rows
      .map((r) => ({ profileId: r.profile_id, ...nameOf(r.profile_id), currency: r.currency, balance: Number(r.balance), lastMovement: r.last }))
      .filter((r) => !term || (r.name ?? '').toLowerCase().includes(term) || (r.email ?? '').toLowerCase().includes(term));
    const totals = new Map<string, number>();
    for (const r of data) totals.set(r.currency, (totals.get(r.currency) ?? 0) + r.balance);
    return { data, totals: [...totals].map(([currency, total]) => ({ currency, total: Math.round(total * 100) / 100 })) };
  }

  // ───────────────────────────── Pagos y ajustes ─────────────────────────────

  /** Registra un pago hecho por fuera. No puede superar el saldo en esa moneda. */
  async registerPayout(tenantId: string, actor: Actor, profileId: string, body: Record<string, unknown>) {
    await this.ownProfile(tenantId, profileId);
    const amount = requireRate(body?.amount, 'El valor del pago');
    if (amount <= 0) throw new BadRequestException('El valor del pago debe ser mayor que cero');
    const currency = requireCurrency(body?.currency);
    const paidAt = body?.paidAt ? requireIsoDate(body.paidAt, 'La fecha del pago') : new Date().toISOString().slice(0, 10);
    if (paidAt > new Date().toISOString().slice(0, 10)) throw new BadRequestException('La fecha del pago no puede ser futura');
    const reference = optionalString(body?.reference, 'La referencia', 120);
    const note = optionalString(body?.note, 'La nota', 500);
    let paymentMethodId: string | null = null;
    if (body?.paymentMethodId) {
      paymentMethodId = requireUuid(body.paymentMethodId, 'El método de pago');
      const method = await this.methods.findOne({ where: { id: paymentMethodId, tenantId, profileId } });
      if (!method) throw new NotFoundException('Método de pago no encontrado');
    }
    return this.dataSource.transaction(async (em) => {
      // Un pago a la vez por persona: el saldo se calcula y se descuenta sin carreras.
      await em.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`ledger:${tenantId}:${profileId}`]);
      const balance = (await this.balances(tenantId, profileId, em)).find((b) => b.currency === currency)?.balance ?? 0;
      if (amount > balance + 0.001) throw new ConflictException(`El pago supera el saldo pendiente (${balance.toFixed(2)} ${currency})`);
      const saved = await em.getRepository(RewardLedgerEntry).save(
        em.getRepository(RewardLedgerEntry).create({ tenantId, profileId, type: 'payout', amount: -amount, currency, paymentMethodId, reference, paidAt, note, createdBy: actor.id }),
      );
      await this.audit.log(
        { tenantId, actorType: 'user', actorId: actor.id, actorLabel: actor.email, action: 'reclutamiento.payout.register', targetType: 'reward_ledger', targetId: saved.id, scopeId: profileId, metadata: { amount, currency, paidAt, reference } },
        em,
      );
      return { id: saved.id, balance: Math.round((balance - amount) * 100) / 100, currency };
    });
  }

  /** Corrección manual con motivo (por ejemplo, una encuesta que se quedó sin causar). */
  async registerAdjustment(tenantId: string, actor: Actor, profileId: string, body: Record<string, unknown>) {
    await this.ownProfile(tenantId, profileId);
    const raw = typeof body?.amount === 'string' ? Number(body.amount) : body?.amount;
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw === 0 || Math.abs(raw) > 1_000_000_000) throw new BadRequestException('El valor del ajuste debe ser distinto de cero');
    const amount = Math.round(raw * 100) / 100;
    const currency = requireCurrency(body?.currency);
    const note = optionalString(body?.note, 'El motivo', 500);
    if (!note || note.length < 3) throw new BadRequestException('Explica el motivo del ajuste');
    return this.dataSource.transaction(async (em) => {
      await em.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`ledger:${tenantId}:${profileId}`]);
      const saved = await em.getRepository(RewardLedgerEntry).save(em.getRepository(RewardLedgerEntry).create({ tenantId, profileId, type: 'adjustment', amount, currency, note, createdBy: actor.id }));
      await this.audit.log(
        { tenantId, actorType: 'user', actorId: actor.id, actorLabel: actor.email, action: 'reclutamiento.payout.adjust', targetType: 'reward_ledger', targetId: saved.id, scopeId: profileId, metadata: { amount, currency, note } },
        em,
      );
      return { id: saved.id };
    });
  }

  // ───────────────────────────── Portal ─────────────────────────────

  /** Lo que la persona ve: su saldo y sus movimientos. */
  async earningsForProfile(tenantId: string, profile: ContactProfile, q: { page?: unknown } = {}) {
    const page = clampInt(q.page, 1, 1, 100000);
    const out = await this.entries(tenantId, profile.id, page, 30);
    return { balances: await this.balances(tenantId, profile.id), ...out, page, limit: 30 };
  }
}
