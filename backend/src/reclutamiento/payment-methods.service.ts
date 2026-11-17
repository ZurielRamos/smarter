import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Not, Repository } from 'typeorm';
import { TenantAuditService } from '../audit/tenant-audit.service';
import { ContactProfile } from './entities/contact-profile.entity';
import { PAYMENT_METHODS, PaymentMethodType, SurveyorPaymentMethod } from './entities/surveyor-payment-method.entity';
import { PaymentCryptoService } from './payment-crypto.service';
import { ProfilesService } from './profiles.service';
import { Actor, requireObject, requireString } from './validation';

const MAX_DETAIL_KEYS = 10;
const DETAIL_KEY_RE = /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/;

/** El contexto autenticado del cifrado liga el dato a su tenant y perfil. */
const aadFor = (tenantId: string, profileId: string) => `payment:${tenantId}:${profileId}`;

@Injectable()
export class PaymentMethodsService {
  constructor(
    @InjectRepository(SurveyorPaymentMethod) private readonly methods: Repository<SurveyorPaymentMethod>,
    private readonly profiles: ProfilesService,
    private readonly crypto: PaymentCryptoService,
    private readonly dataSource: DataSource,
    private readonly audit: TenantAuditService,
  ) {}

  private async requireMethod(tenantId: string, id: string): Promise<SurveyorPaymentMethod> {
    const method = await this.methods.findOne({ where: { id, tenantId } });
    if (!method) throw new NotFoundException('Método de pago no encontrado');
    return method;
  }

  async create(tenantId: string, actor: Actor, profileId: string, body: Record<string, unknown>) {
    const profile = await this.profiles.requireProfile(tenantId, profileId);
    if (profile.status === 'ended') {
      throw new ConflictException('El perfil está terminado. Reábrelo para agregar métodos de pago.');
    }
    const parsed = this.parse(body);
    const encrypted = this.crypto.encrypt(parsed.details, aadFor(tenantId, profileId));

    const saved = await this.dataSource.transaction(async (em) => {
      const repo = em.getRepository(SurveyorPaymentMethod);
      const hasAny = (await repo.count({ where: { tenantId, profileId }, take: 1 })) > 0;
      const entity = await repo.save(
        repo.create({
          tenantId,
          profileId,
          method: parsed.method,
          holderName: parsed.holderName,
          details: encrypted,
          hint: this.buildHint(parsed.details),
          isDefault: !hasAny,
          createdBy: actor.id,
        }),
      );
      await this.audit.log(
        {
          tenantId,
          actorType: 'user',
          actorId: actor.id,
          actorLabel: actor.email,
          action: 'reclutamiento.payment_method.create',
          targetType: 'surveyor_payment_method',
          targetId: entity.id,
          scopeId: profileId,
          metadata: { method: entity.method },
        },
        em,
      );
      return entity;
    });
    return this.publicView(saved);
  }

  /** Editar los datos invalida la verificación: una persona debe volver a verificar. */
  async update(tenantId: string, actor: Actor, id: string, body: Record<string, unknown>) {
    const existing = await this.requireMethod(tenantId, id);
    const profile = await this.profiles.requireProfile(tenantId, existing.profileId);
    if (profile.status === 'ended') {
      throw new ConflictException('El perfil está terminado. Reábrelo para editar métodos de pago.');
    }
    const parsed = this.parse(body);
    const encrypted = this.crypto.encrypt(parsed.details, aadFor(tenantId, existing.profileId));

    await this.dataSource.transaction(async (em) => {
      // Un perfil activo no puede quedarse sin ningún método verificado.
      if (existing.verifiedAt && profile.status === 'active') {
        await this.assertNotLastVerified(em.getRepository(SurveyorPaymentMethod), tenantId, existing, 'editar');
      }
      await em.getRepository(SurveyorPaymentMethod).update(
        { id, tenantId },
        {
          method: parsed.method,
          holderName: parsed.holderName,
          details: encrypted,
          hint: this.buildHint(parsed.details),
          verifiedAt: null,
          verifiedBy: null,
        },
      );
      await this.audit.log(
        {
          tenantId,
          actorType: 'user',
          actorId: actor.id,
          actorLabel: actor.email,
          action: 'reclutamiento.payment_method.update',
          targetType: 'surveyor_payment_method',
          targetId: id,
          scopeId: existing.profileId,
          metadata: { method: parsed.method, verificationReset: !!existing.verifiedAt },
        },
        em,
      );
    });
    return this.publicView(await this.requireMethod(tenantId, id));
  }

  async verify(tenantId: string, actor: Actor, id: string) {
    const method = await this.requireMethod(tenantId, id);
    if (method.verifiedAt) throw new ConflictException('Este método de pago ya está verificado');

    await this.dataSource.transaction(async (em) => {
      const res = await em
        .getRepository(SurveyorPaymentMethod)
        .update({ id, tenantId, verifiedAt: IsNull() }, { verifiedAt: new Date(), verifiedBy: actor.id });
      if (!res.affected) throw new ConflictException('El método de pago cambió mientras se procesaba. Reintenta.');
      await this.audit.log(
        {
          tenantId,
          actorType: 'user',
          actorId: actor.id,
          actorLabel: actor.email,
          action: 'reclutamiento.payment_method.verify',
          targetType: 'surveyor_payment_method',
          targetId: id,
          scopeId: method.profileId,
          metadata: { method: method.method },
        },
        em,
      );
    });
    return this.publicView(await this.requireMethod(tenantId, id));
  }

  async setDefault(tenantId: string, actor: Actor, id: string) {
    const method = await this.requireMethod(tenantId, id);
    await this.dataSource.transaction(async (em) => {
      const repo = em.getRepository(SurveyorPaymentMethod);
      await repo.update({ tenantId, profileId: method.profileId }, { isDefault: false });
      await repo.update({ id, tenantId }, { isDefault: true });
      await this.audit.log(
        {
          tenantId,
          actorType: 'user',
          actorId: actor.id,
          actorLabel: actor.email,
          action: 'reclutamiento.payment_method.default',
          targetType: 'surveyor_payment_method',
          targetId: id,
          scopeId: method.profileId,
          metadata: null,
        },
        em,
      );
    });
    return this.publicView(await this.requireMethod(tenantId, id));
  }

  /**
   * Devuelve los datos de pago descifrados. Es la única vía de lectura. El
   * acceso se registra en la auditoría ANTES de devolver el dato: si el
   * registro falla, no se revela nada.
   */
  async reveal(tenantId: string, actor: Actor, id: string) {
    const row = await this.methods
      .createQueryBuilder('m')
      .addSelect('m.details')
      .where('m.id = :id AND m.tenantId = :tenantId', { id, tenantId })
      .getOne();
    if (!row) throw new NotFoundException('Método de pago no encontrado');

    await this.audit.log({
      tenantId,
      actorType: 'user',
      actorId: actor.id,
      actorLabel: actor.email,
      action: 'reclutamiento.payment_method.reveal',
      targetType: 'surveyor_payment_method',
      targetId: id,
      scopeId: row.profileId,
      metadata: { method: row.method },
    });

    return {
      id: row.id,
      method: row.method,
      holderName: row.holderName,
      details: this.crypto.decrypt(row.details, aadFor(tenantId, row.profileId)),
    };
  }

  async remove(tenantId: string, actor: Actor, id: string) {
    const method = await this.requireMethod(tenantId, id);
    const profile: ContactProfile = await this.profiles.requireProfile(tenantId, method.profileId);

    await this.dataSource.transaction(async (em) => {
      const repo = em.getRepository(SurveyorPaymentMethod);
      if (method.verifiedAt && profile.status === 'active') {
        await this.assertNotLastVerified(repo, tenantId, method, 'eliminar');
      }
      await repo.softDelete({ id, tenantId });
      // Si era el predeterminado, el más reciente que quede toma su lugar.
      if (method.isDefault) {
        const next = await repo.findOne({
          where: { tenantId, profileId: method.profileId },
          order: { createdAt: 'DESC' },
        });
        if (next) await repo.update({ id: next.id, tenantId }, { isDefault: true });
      }
      await this.audit.log(
        {
          tenantId,
          actorType: 'user',
          actorId: actor.id,
          actorLabel: actor.email,
          action: 'reclutamiento.payment_method.delete',
          targetType: 'surveyor_payment_method',
          targetId: id,
          scopeId: method.profileId,
          metadata: { method: method.method },
        },
        em,
      );
    });
    return { success: true };
  }

  // ───────────────────────────── Internos ─────────────────────────────

  private async assertNotLastVerified(
    repo: Repository<SurveyorPaymentMethod>,
    tenantId: string,
    method: SurveyorPaymentMethod,
    verb: string,
  ) {
    const others = await repo.count({
      where: { tenantId, profileId: method.profileId, verifiedAt: Not(IsNull()), id: Not(method.id) },
      take: 1,
    });
    if (others === 0) {
      throw new ConflictException(
        `No puedes ${verb} el único método de pago verificado de un encuestador activo. Suspéndelo primero o agrega y verifica otro método.`,
      );
    }
  }

  private parse(body: Record<string, unknown>): {
    method: PaymentMethodType;
    holderName: string;
    details: Record<string, string>;
  } {
    const method = body.method;
    if (typeof method !== 'string' || !(PAYMENT_METHODS as readonly string[]).includes(method)) {
      throw new BadRequestException('Tipo de método de pago inválido');
    }
    const holderName = requireString(body.holderName, 'El titular', 2, 120);

    const raw = requireObject(body.details, 'Los datos de pago');
    const entries = Object.entries(raw);
    if (entries.length === 0) throw new BadRequestException('Los datos de pago no pueden estar vacíos');
    if (entries.length > MAX_DETAIL_KEYS) {
      throw new BadRequestException(`Los datos de pago admiten máximo ${MAX_DETAIL_KEYS} campos`);
    }
    const details: Record<string, string> = {};
    for (const [key, value] of entries) {
      if (!DETAIL_KEY_RE.test(key)) throw new BadRequestException(`Nombre de campo inválido: ${key}`);
      if (typeof value !== 'string' || value.trim().length === 0 || value.length > 200) {
        throw new BadRequestException(`El campo "${key}" debe ser un texto de hasta 200 caracteres`);
      }
      details[key] = value.trim();
    }
    return { method: method as PaymentMethodType, holderName, details };
  }

  /** "•••• 1234" a partir del identificador de cuenta, si existe y es suficientemente largo. */
  private buildHint(details: Record<string, string>): string | null {
    const source = details.accountNumber ?? details.identifier ?? details.phone ?? null;
    if (!source) return null;
    const compact = source.replace(/\s+/g, '');
    return compact.length >= 6 ? `•••• ${compact.slice(-4)}` : null;
  }

  /** Vista sin datos cifrados. */
  private publicView(m: SurveyorPaymentMethod) {
    const { details: _omit, ...rest } = m as SurveyorPaymentMethod & { details?: string };
    return rest;
  }
}
