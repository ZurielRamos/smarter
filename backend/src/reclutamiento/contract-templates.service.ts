import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { TenantAuditService } from '../audit/tenant-audit.service';
import { ContractTemplate } from './entities/contract-template.entity';
import { FILTERS, Language, TemplateSyntaxError } from './contracts/contract-engine';
import { COUNTRY_PRESETS, buildStarterText, findPreset } from './contracts/contract-starters';
import {
  BodyAnalysis,
  LANGUAGES,
  analyzeBody,
  buildVariableCatalog,
  sanitizeBody,
  sanitizeCountry,
  sanitizeLanguage,
  sanitizeName,
  sanitizePrefix,
  sanitizeValues,
  usableCustomFields,
} from './contracts/contract-variables';
import { ContractRenderService, TemplateContent } from './contracts/contract-render.service';
import { ProfilesService } from './profiles.service';
import { Actor, optionalString, requireObject } from './validation';

const today = () => new Date().toISOString().slice(0, 10);

const FILTER_HELP: Record<string, string> = {
  date: 'Fecha en formato largo del idioma (5 de marzo de 2026).',
  money: 'Importe con la moneda del contrato (1.500,50 COP).',
  number: 'Número con separadores de miles.',
  pct: 'Porcentaje (12,5 %).',
  words: 'Importe en letras (mil quinientos con 50/100).',
  upper: 'Mayúsculas.',
  lower: 'Minúsculas.',
};

@Injectable()
export class ContractTemplatesService {
  constructor(
    @InjectRepository(ContractTemplate) private readonly templates: Repository<ContractTemplate>,
    private readonly profiles: ProfilesService,
    private readonly render: ContractRenderService,
    private readonly dataSource: DataSource,
    private readonly audit: TenantAuditService,
  ) {}

  /** Todo lo que la interfaz necesita: variables del desplegable (incluye los campos del CRM de la cuenta), modelos por país y filtros. */
  async catalog(tenantId: string) {
    const customFields = await this.render.loadCustomFields(tenantId);
    return {
      languages: LANGUAGES,
      variables: buildVariableCatalog(customFields),
      filters: FILTERS.filter((f) => f !== 'label').map((name) => ({ name, help: FILTER_HELP[name] })),
      presets: COUNTRY_PRESETS.map((p) => ({
        code: p.code,
        name: p.name,
        currency: p.currency,
        defaultLanguage: p.defaultLanguage,
        contractTypeLabel: p.contractTypeLabel,
        notes: p.notes,
      })),
    };
  }

  async requireTemplate(tenantId: string, id: string): Promise<ContractTemplate> {
    const t = await this.templates.findOne({ where: { id, tenantId } });
    if (!t) throw new NotFoundException('Plantilla no encontrada');
    return t;
  }

  list(tenantId: string, q: { status?: string; countryCode?: string }) {
    const where: Record<string, any> = { tenantId };
    if (q.status) {
      if (!['draft', 'published', 'archived'].includes(q.status)) throw new BadRequestException('Estado inválido');
      where.status = q.status;
    }
    if (q.countryCode) where.countryCode = q.countryCode.toUpperCase();
    return this.templates.find({ where, order: { updatedAt: 'DESC' } });
  }

  // ───────────────────────────── Crear y editar ─────────────────────────────

  async create(tenantId: string, actor: Actor, body: Record<string, unknown>): Promise<ContractTemplate> {
    const fromPreset = body.fromPreset ? requireObject(body.fromPreset, 'El modelo') : null;
    let base: Partial<ContractTemplate> = {};

    if (fromPreset) {
      const code = String(fromPreset.code ?? '').toUpperCase();
      const preset = findPreset(code);
      if (!preset) throw new BadRequestException('Modelo de país desconocido');
      const language = sanitizeLanguage(fromPreset.languageCode ?? preset.defaultLanguage);
      const countryCode = preset.code === 'GENERIC' ? sanitizeCountry(fromPreset.countryCode) : preset.code;
      base = {
        name: `${preset.contractTypeLabel[language]}${preset.code === 'GENERIC' ? '' : ` — ${preset.name[language]}`}`,
        countryCode,
        languageCode: language,
        body: buildStarterText(preset.code, language, countryCode),
        contractPrefix: 'CT',
      };
    }

    const fields = this.parseFields(body, base);
    const familyId = randomUUID();
    return this.dataSource.transaction(async (em) => {
      const repo = em.getRepository(ContractTemplate);
      const entity = await repo.save(
        repo.create({ ...fields, tenantId, familyId, version: 1, status: 'draft', createdBy: actor.id, publishedAt: null, publishedBy: null }),
      );
      await this.log(em, tenantId, actor, 'create', entity, { fromPreset: fromPreset ? String(fromPreset.code).toUpperCase() : null });
      return entity;
    });
  }

  async update(tenantId: string, actor: Actor, id: string, body: Record<string, unknown>): Promise<ContractTemplate> {
    const current = await this.requireTemplate(tenantId, id);
    if (current.status !== 'draft') {
      throw new ConflictException('Una plantilla publicada no se edita. Crea una nueva versión para modificarla.');
    }
    const fields = this.parseFields(body, current);
    await this.dataSource.transaction(async (em) => {
      const res = await em.getRepository(ContractTemplate).update({ id, tenantId, status: 'draft' }, fields);
      if (!res.affected) throw new ConflictException('La plantilla cambió mientras se guardaba. Reintenta.');
      await this.log(em, tenantId, actor, 'update', current, { fields: Object.keys(body) });
    });
    return this.requireTemplate(tenantId, id);
  }

  async remove(tenantId: string, actor: Actor, id: string) {
    const t = await this.requireTemplate(tenantId, id);
    if (t.status !== 'draft') throw new ConflictException('Solo se pueden eliminar plantillas en borrador. Archívala para retirarla de uso.');
    await this.dataSource.transaction(async (em) => {
      await em.getRepository(ContractTemplate).delete({ id, tenantId, status: 'draft' });
      await this.log(em, tenantId, actor, 'delete', t, null);
    });
    return { success: true };
  }

  // ───────────────────────────── Ciclo de vida ─────────────────────────────

  /** Valida la plantilla sin cambiarla. */
  async validate(tenantId: string, id: string): Promise<BodyAnalysis> {
    const t = await this.requireTemplate(tenantId, id);
    return this.analyze(tenantId, t.body);
  }

  async publish(tenantId: string, actor: Actor, id: string): Promise<{ template: ContractTemplate; analysis: BodyAnalysis }> {
    const t = await this.requireTemplate(tenantId, id);
    if (t.status !== 'draft') throw new ConflictException(`No se puede publicar una plantilla en estado «${t.status}»`);
    const analysis = await this.analyze(tenantId, t.body);
    if (analysis.errors.length) {
      throw new BadRequestException({ code: 'TEMPLATE_INVALID', message: 'La plantilla tiene errores y no se puede publicar.', errors: analysis.errors });
    }

    await this.dataSource.transaction(async (em) => {
      const repo = em.getRepository(ContractTemplate);
      const res = await repo.update({ id, tenantId, status: 'draft' }, { status: 'published', publishedAt: new Date(), publishedBy: actor.id });
      if (!res.affected) throw new ConflictException('La plantilla cambió mientras se publicaba. Reintenta.');
      // Una sola versión publicada por plantilla: las anteriores pasan a archivadas.
      await repo
        .createQueryBuilder()
        .update(ContractTemplate)
        .set({ status: 'archived' })
        .where('tenant_id = :tenantId AND family_id = :familyId AND status = :status AND id <> :id', {
          tenantId,
          familyId: t.familyId,
          status: 'published',
          id,
        })
        .execute();
      await this.log(em, tenantId, actor, 'publish', t, { version: t.version });
    });
    return { template: await this.requireTemplate(tenantId, id), analysis };
  }

  /** Crea un borrador nuevo a partir de una versión publicada o archivada. */
  async newVersion(tenantId: string, actor: Actor, id: string): Promise<ContractTemplate> {
    const source = await this.requireTemplate(tenantId, id);
    if (source.status === 'draft') throw new ConflictException('Esta plantilla ya es un borrador: edítala directamente.');

    return this.dataSource.transaction(async (em) => {
      const repo = em.getRepository(ContractTemplate);
      const existingDraft = await repo.findOne({ where: { tenantId, familyId: source.familyId, status: 'draft' } });
      if (existingDraft) {
        throw new ConflictException({ code: 'DRAFT_EXISTS', message: 'Ya existe un borrador de esta plantilla.', templateId: existingDraft.id });
      }
      const latest = await repo
        .createQueryBuilder('t')
        .select('MAX(t.version)', 'max')
        .where('t.tenantId = :tenantId AND t.familyId = :familyId', { tenantId, familyId: source.familyId })
        .getRawOne<{ max: number }>();
      const entity = await repo.save(
        repo.create({
          tenantId,
          familyId: source.familyId,
          version: Number(latest?.max ?? source.version) + 1,
          name: source.name,
          description: source.description,
          countryCode: source.countryCode,
          languageCode: source.languageCode,
          status: 'draft',
          body: source.body,
          contractPrefix: source.contractPrefix,
          createdBy: actor.id,
        }),
      );
      await this.log(em, tenantId, actor, 'new_version', entity, { fromVersion: source.version });
      return entity;
    });
  }

  async archive(tenantId: string, actor: Actor, id: string): Promise<ContractTemplate> {
    const t = await this.requireTemplate(tenantId, id);
    if (t.status !== 'published') throw new ConflictException('Solo se archivan plantillas publicadas.');
    await this.dataSource.transaction(async (em) => {
      await em.getRepository(ContractTemplate).update({ id, tenantId, status: 'published' }, { status: 'archived' });
      await this.log(em, tenantId, actor, 'archive', t, null);
    });
    return this.requireTemplate(tenantId, id);
  }

  async duplicate(tenantId: string, actor: Actor, id: string): Promise<ContractTemplate> {
    const source = await this.requireTemplate(tenantId, id);
    return this.dataSource.transaction(async (em) => {
      const repo = em.getRepository(ContractTemplate);
      const entity = await repo.save(
        repo.create({
          tenantId,
          familyId: randomUUID(),
          version: 1,
          name: `${source.name} (copia)`.slice(0, 200),
          description: source.description,
          countryCode: source.countryCode,
          languageCode: source.languageCode,
          status: 'draft',
          body: source.body,
          contractPrefix: source.contractPrefix,
          createdBy: actor.id,
        }),
      );
      await this.log(em, tenantId, actor, 'duplicate', entity, { from: source.id });
      return entity;
    });
  }

  // ───────────────────────────── Vista previa ─────────────────────────────

  /**
   * Redacta el texto con datos de ejemplo (o de un encuestador real) SIN guardar
   * nada. Acepta un borrador sin guardar en `draft` para previsualizar mientras
   * se edita.
   */
  async preview(tenantId: string, body: Record<string, unknown>) {
    let base: Partial<ContractTemplate> | null = null;
    if (body.templateId) base = await this.requireTemplate(tenantId, String(body.templateId));
    const draft = body.draft ? requireObject(body.draft, 'El borrador') : {};
    if (!base && !body.draft) throw new BadRequestException('Indica templateId o draft');

    const content: TemplateContent = {
      body: Object.prototype.hasOwnProperty.call(draft, 'body') ? sanitizeBody(draft.body) : base?.body ?? '',
      countryCode: draft.countryCode !== undefined ? sanitizeCountry(draft.countryCode) : base?.countryCode ?? 'CO',
      languageCode: draft.languageCode !== undefined ? sanitizeLanguage(draft.languageCode) : base?.languageCode ?? 'es',
    };
    const language = content.languageCode as Language;
    const analysis = await this.analyze(tenantId, content.body);
    const empty = { ...analysis, text: '', missing: [], blockers: [] as string[], language };
    if (analysis.errors.length) return empty;

    let contact: Record<string, any>;
    if (body.profileId) {
      const profile = await this.profiles.requireProfile(tenantId, String(body.profileId));
      contact = (await this.render.loadContact(tenantId, profile.recordId)) ?? {};
    } else {
      contact = this.render.sampleContact(language);
    }

    const values = sanitizeValues(body.values);
    const c = body.contract && typeof body.contract === 'object' ? (body.contract as Record<string, any>) : {};
    const preset = findPreset(content.countryCode);
    const facts = {
      number: 'PREVIEW-0001',
      issueDate: today(),
      startDate: typeof c.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c.startDate) ? c.startDate : today(),
      endDate: typeof c.endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c.endDate) ? c.endDate : null,
      rate: Number.isFinite(Number(c.rate)) && Number(c.rate) >= 0 ? Number(c.rate) : 1500,
      currency: typeof c.currency === 'string' && /^[A-Za-z]{3}$/.test(c.currency) ? c.currency.toUpperCase() : preset?.currency || 'USD',
    };

    try {
      const customFields = await this.render.loadCustomFields(tenantId);
      const out = this.render.render(content, contact, values, facts, customFields);
      return { ...analysis, text: out.text, missing: out.missing, blockers: out.blockers, language };
    } catch (e) {
      if (e instanceof TemplateSyntaxError) return { ...empty, errors: [e.message] };
      throw e;
    }
  }

  // ───────────────────────────── Internos ─────────────────────────────

  /** Valida el texto: sintaxis y que solo use variables que existen (incluye los campos del CRM de la cuenta). */
  private async analyze(tenantId: string, body: string): Promise<BodyAnalysis> {
    const fields = usableCustomFields(await this.render.loadCustomFields(tenantId));
    return analyzeBody(body, new Set(fields.map((f) => f.fieldKey)));
  }

  /** Convierte el cuerpo de una petición en los campos de la plantilla; lo ausente se hereda de `base`. */
  private parseFields(body: Record<string, unknown>, base: Partial<ContractTemplate>) {
    const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k) && body[k] !== undefined;
    const name = sanitizeName(has('name') ? body.name : base.name);
    const countryCode = sanitizeCountry(has('countryCode') ? body.countryCode : base.countryCode);
    const languageCode = sanitizeLanguage(has('languageCode') ? body.languageCode : base.languageCode ?? 'es');
    const text = has('body') ? sanitizeBody(body.body) : base.body ?? '';
    const contractPrefix = has('contractPrefix') ? sanitizePrefix(body.contractPrefix) : base.contractPrefix ?? null;
    const description = has('description') ? optionalString(body.description, 'La descripción', 2000) : base.description ?? null;
    return { name, description, countryCode, languageCode, body: text, contractPrefix };
  }

  private log(em: EntityManager, tenantId: string, actor: Actor, action: string, t: Pick<ContractTemplate, 'id' | 'familyId' | 'version' | 'name'>, metadata: Record<string, any> | null) {
    return this.audit.log(
      {
        tenantId,
        actorType: 'user',
        actorId: actor.id,
        actorLabel: actor.email,
        action: `reclutamiento.template.${action}`,
        targetType: 'contract_template',
        targetId: t.id,
        scopeId: t.familyId,
        metadata: { name: t.name, version: t.version, ...(metadata ?? {}) },
      },
      em,
    );
  }
}
