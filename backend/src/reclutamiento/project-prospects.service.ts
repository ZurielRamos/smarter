import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, In, Repository } from 'typeorm';
import { TenantAuditService } from '../audit/tenant-audit.service';
import { ClientRecord } from '../records/record.entity';
import { Tenant } from '../tenants/tenant.entity';
import { isFeatureEnabled } from '../auth/requires-feature.decorator';
import { ProjectProspect, ProspectLinkMethod } from './entities/project-prospect.entity';
import { ProspectStatusEvent } from './entities/prospect-status-event.entity';
import { ALL_STATUSES, INITIAL_STATUS, PARTICIPATED_STATUSES, ProspectRole, ROLE_LABELS, isRole, publicStatusOf, stateOf } from './prospect-states';
import { RecruitmentProject } from './entities/recruitment-project.entity';
import { AnswerSnapshot, answerFromText, mergeAnswers, readForm } from './project-form';
import { digitsOf, findRecordsByContact } from './record-match';
import { PortalConfigService } from './portal/portal-config.service';
import { buildRecordPatch, normalizeFieldValue } from './portal/portal-fields';
import { Actor, clampInt, escapeLike, optionalString, requireUuid } from './validation';

/** Resultado de registrarse por la landing. `closed` es el único que no deja prospecto. */
export type RegisterOutcome = 'applied' | 'existing' | 'closed';

const AUTO_LINK_BATCH = 200;

export interface PersonSummary {
  ratingAverage: number | null;
  ratingCount: number;
  participations: number;
  lastParticipationAt: Date | null;
}

const EMPTY_SUMMARY: PersonSummary = { ratingAverage: null, ratingCount: 0, participations: 0, lastParticipationAt: null };

/** Teléfono del contacto solo con dígitos y con indicativo (sin repetirlo si ya lo trae). */
function fullPhone(r: Pick<ClientRecord, 'phone' | 'countryCode'>): string | null {
  const phone = digitsOf(r.phone);
  if (!phone) return null;
  const cc = digitsOf(r.countryCode);
  const full = cc && !(phone.startsWith(cc) && phone.length > cc.length + 6) ? `${cc}${phone}` : phone;
  return full.length >= 7 && full.length <= 15 ? full : null;
}
const AUTO_LINK_MAX = 2000;

const recordName = (r: ClientRecord) => r.fullName || [r.firstName, r.lastName].filter(Boolean).join(' ') || r.email || r.phone || 'Sin nombre';

const recordView = (r: ClientRecord) => ({ id: r.id, name: recordName(r), email: r.email ?? null, phone: r.phone ?? null });

/**
 * Prospectos de un proyecto: quienes se registraron por su landing. No son
 * contactos del CRM. Se vinculan a un contacto de forma automática (un único
 * contacto con el mismo correo o teléfono verificado) o manual.
 */
@Injectable()
export class ProjectProspectsService {
  constructor(
    @InjectRepository(ProjectProspect) private readonly prospects: Repository<ProjectProspect>,
    @InjectRepository(RecruitmentProject) private readonly projects: Repository<RecruitmentProject>,
    @InjectRepository(ClientRecord) private readonly records: Repository<ClientRecord>,
    private readonly dataSource: DataSource,
    private readonly audit: TenantAuditService,
    private readonly portalConfig: PortalConfigService,
  ) {}

  private async requireProject(tenantId: string, projectId: string): Promise<RecruitmentProject> {
    const p = await this.projects.findOne({ where: { id: projectId, tenantId } });
    if (!p) throw new NotFoundException('Proyecto no encontrado');
    return p;
  }

  private async requireProspect(tenantId: string, projectId: string, prospectId: string): Promise<ProjectProspect> {
    const s = await this.prospects.findOne({ where: { id: prospectId, projectId, tenantId } });
    if (!s) throw new NotFoundException('Prospecto no encontrado');
    return s;
  }

  /** Único contacto de la cuenta que coincide con el dato verificado del prospecto; null si hay ninguno o varios. */
  private async uniqueMatch(em: EntityManager, tenantId: string, p: Pick<ProjectProspect, 'email' | 'phone'>): Promise<ClientRecord | null> {
    const found = await findRecordsByContact(em, tenantId, p, 2);
    return found.length === 1 ? found[0] : null;
  }

  // ───────────────────────────── Registro (público) ─────────────────────────────

  /**
   * Guarda el registro de quien verificó su correo o teléfono por la landing de
   * un proyecto: reutiliza el contacto del CRM con ese dato (si hay varios, el más
   * antiguo, para que repetir el registro dé siempre el mismo resultado) o crea
   * uno nuevo, y deja a la persona como prospecto del proyecto. Los datos
   * personales pedidos solo llenan campos vacíos del contacto: un registro público
   * no pisa lo que el CRM ya tenía.
   *
   * Si el proyecto ya no recibe registros (se cerró entre el envío del código y
   * su verificación) no guarda nada. Una persona es un solo prospecto por proyecto.
   */
  async register(
    tenantId: string,
    projectId: string,
    input: {
      fullName: string;
      channel: 'email' | 'phone';
      destination: string;
      other?: { email?: string; phone?: string };
      values?: Record<string, string>;
      consentAt: Date;
      answers: AnswerSnapshot[];
      /** Perfil elegido al registrarse; si falta, el de entrada del proyecto. */
      role?: ProspectRole;
    },
  ): Promise<{ status: RegisterOutcome; recordId: string | null }> {
    const defs = new Map((await this.portalConfig.fieldCatalog(tenantId)).map((f) => [f.key, f]));
    const verified = input.channel === 'email' ? { email: input.destination } : { phone: input.destination };
    const email = verified.email ?? input.other?.email ?? null;
    const phone = verified.phone ?? input.other?.phone ?? null;
    try {
      return await this.dataSource.transaction(async (em) => {
        // Compartido con quien borra el proyecto: no se registra sobre un proyecto que se está eliminando.
        const project = await em.getRepository(RecruitmentProject).findOne({ where: { id: projectId, tenantId }, lock: { mode: 'pessimistic_read' } });
        if (!project || project.status !== 'active' || !project.registrationOpen) return { status: 'closed' as const, recordId: null };
        // Dos registros simultáneos del mismo dato se turnan: el segundo ya ve el contacto y el prospecto del primero.
        await em.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`recruit-register:${tenantId}:${input.channel}:${input.destination}`]);

        const recordRepo = em.getRepository(ClientRecord);
        const found = await findRecordsByContact(em, tenantId, { email: verified.email ?? null, phone: verified.phone ?? null }, 50);
        const oldest = found.length ? found.reduce((a, b) => (a.createdAt <= b.createdAt ? a : b)) : null;
        const valuePatch = (target: Record<string, any>) => buildRecordPatch(target, input.values ?? {}, defs, true);
        let record: ClientRecord;
        if (oldest) {
          record = oldest;
          const patch: Record<string, unknown> = { ...valuePatch(record) };
          if (!record.email && email) patch.email = email;
          if (!record.phone && phone && !(await this.phoneTaken(em, tenantId, phone, record.id))) patch.phone = phone;
          if (Object.keys(patch).length) await recordRepo.update({ id: record.id, tenantId }, patch as any);
        } else {
          const [firstName, ...rest] = input.fullName.split(' ');
          const base: Record<string, any> = {
            tenantId,
            fullName: input.fullName,
            firstName,
            lastName: rest.join(' ') || undefined,
            email: email ?? undefined,
            // El teléfono sin verificar solo se guarda si no es de otro contacto.
            phone: phone && (verified.phone || !(await this.phoneTaken(em, tenantId, phone, null))) ? phone : undefined,
            channelSource: 'web',
            source: 'landing_proyecto',
          };
          Object.assign(base, valuePatch(base));
          record = await recordRepo.save(recordRepo.create(base as any) as unknown as ClientRecord);
        }

        const repo = em.getRepository(ProjectProspect);
        if (await repo.exists({ where: { projectId, recordId: record.id } })) return { status: 'existing' as const, recordId: record.id };
        const role = input.role ?? project.defaultRole ?? 'participant';
        const saved = await repo.save(
          repo.create({
            tenantId,
            projectId,
            role,
            status: INITIAL_STATUS,
            fullName: input.fullName,
            email,
            phone,
            answers: input.answers,
            consentAt: input.consentAt,
            recordId: record.id,
            linkMethod: 'auto',
            linkedAt: new Date(),
          }),
        );
        await this.recordEvent(em, saved, null, null, null, null, 'landing');
        return { status: 'applied' as const, recordId: record.id };
      });
    } catch (err: any) {
      // Carrera: otro registro de la misma persona se guardó primero (índice único del prospecto).
      if (err?.code === '23505') {
        const again = await findRecordsByContact(this.dataSource.manager, tenantId, { email: verified.email ?? null, phone: verified.phone ?? null }, 1);
        return { status: 'existing', recordId: again[0]?.id ?? null };
      }
      throw err;
    }
  }

  private async phoneTaken(em: EntityManager, tenantId: string, phone: string, exceptRecordId: string | null): Promise<boolean> {
    const found = await findRecordsByContact(em, tenantId, { phone }, 2);
    return found.some((r) => r.id !== exceptRecordId);
  }

  // ───────────────────────────── Lectura (cuenta) ─────────────────────────────

  async list(tenantId: string, projectId: string, q: { search?: string; linked?: string; status?: string; role?: string; page?: unknown; limit?: unknown }) {
    await this.requireProject(tenantId, projectId);
    const page = clampInt(q.page, 1, 1, 100000);
    const limit = clampInt(q.limit, 25, 1, 100);
    const qb = this.prospects.createQueryBuilder('s').where('s.tenantId = :tenantId AND s.projectId = :projectId', { tenantId, projectId });
    if (q.linked === 'yes') qb.andWhere('s.recordId IS NOT NULL');
    else if (q.linked === 'no') qb.andWhere('s.recordId IS NULL');
    else if (q.linked) throw new BadRequestException('Filtro inválido');
    if (q.role) {
      if (!isRole(q.role)) throw new BadRequestException('Perfil inválido');
      qb.andWhere('s.role = :role', { role: q.role });
    }
    if (q.status) {
      if (!ALL_STATUSES.has(q.status)) throw new BadRequestException('Estado inválido');
      qb.andWhere('s.status = :status', { status: q.status });
    }
    const search = q.search?.trim().slice(0, 80);
    if (search) {
      const like = `%${escapeLike(search)}%`;
      const num = digitsOf(search);
      qb.andWhere(
        new Brackets((w) => {
          w.where("s.fullName ILIKE :like ESCAPE '\\'", { like }).orWhere("s.email ILIKE :like ESCAPE '\\'", { like });
          if (num.length >= 3) w.orWhere('s.phone LIKE :num', { num: `%${num}%` });
        }),
      );
    }
    const [rows, total] = await qb
      .orderBy('s.createdAt', 'DESC')
      .addOrderBy('s.id', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    const recordIds = [...new Set(rows.map((r) => r.recordId).filter((x): x is string => !!x))];
    const linked = recordIds.length ? await this.records.find({ where: { id: In(recordIds), tenantId } }) : [];
    const byId = new Map(linked.map((r) => [r.id, r]));
    const summaries = await this.summaries(tenantId, recordIds);
    // Cuántos hay de cada perfil en el proyecto (para las pestañas), sin los demás filtros.
    const counts: Array<{ role: ProspectRole; n: string }> = await this.prospects
      .createQueryBuilder('s')
      .select('s.role', 'role')
      .addSelect('count(*)', 'n')
      .where('s.tenantId = :tenantId AND s.projectId = :projectId', { tenantId, projectId })
      .groupBy('s.role')
      .getRawMany();
    return {
      data: rows.map((s) => ({ ...this.view(s, s.recordId ? byId.get(s.recordId) : undefined), person: s.recordId ? summaries.get(s.recordId) ?? EMPTY_SUMMARY : null })),
      total,
      page,
      limit,
      roleCounts: Object.fromEntries(counts.map((c) => [c.role, Number(c.n)])) as Partial<Record<ProspectRole, number>>,
    };
  }

  /**
   * Resumen de cada persona en toda la cuenta: promedio de sus calificaciones,
   * cuántas veces participó y cuándo fue la última (según el historial).
   */
  private async summaries(tenantId: string, recordIds: string[]): Promise<Map<string, PersonSummary>> {
    const out = new Map<string, PersonSummary>();
    if (recordIds.length === 0) return out;
    const ratings: Array<{ record_id: string; avg: string | null; n: string }> = await this.prospects.query(
      `SELECT record_id, AVG(rating) AS avg, COUNT(rating) AS n FROM project_prospects WHERE tenant_id = $1 AND record_id = ANY($2) GROUP BY record_id`,
      [tenantId, recordIds],
    );
    // Una participación por proyecto: el primer evento a un estado de participación efectiva.
    const parts: Array<{ record_id: string; n: string; last: Date | null }> = await this.prospects.query(
      `SELECT record_id, COUNT(DISTINCT project_id) AS n, MAX(created_at) AS last FROM prospect_status_events
        WHERE tenant_id = $1 AND record_id = ANY($2) AND to_status = ANY($3) GROUP BY record_id`,
      [tenantId, recordIds, PARTICIPATED_STATUSES],
    );
    for (const id of recordIds) out.set(id, { ...EMPTY_SUMMARY });
    for (const r of ratings) {
      const n = Number(r.n);
      out.get(r.record_id)!.ratingAverage = n ? Math.round(Number(r.avg) * 10) / 10 : null;
      out.get(r.record_id)!.ratingCount = n;
    }
    for (const p of parts) {
      out.get(p.record_id)!.participations = Number(p.n);
      out.get(p.record_id)!.lastParticipationAt = p.last;
    }
    return out;
  }

  /** Guarda un cambio en el historial (en la misma transacción que el cambio). */
  private async recordEvent(
    em: EntityManager,
    p: ProjectProspect,
    fromStatus: string | null,
    fromRole: string | null,
    actorId: string | null,
    reason: string | null = null,
    via: 'landing' | 'flow' | null = null,
  ) {
    const repo = em.getRepository(ProspectStatusEvent);
    await repo.save(
      repo.create({ tenantId: p.tenantId, projectId: p.projectId, prospectId: p.id, recordId: p.recordId, role: p.role, fromStatus, toStatus: p.status, fromRole, reason, actorId, via }),
    );
  }

  private view(s: ProjectProspect, record?: ClientRecord) {
    return {
      id: s.id,
      fullName: s.fullName,
      email: s.email,
      phone: s.phone,
      role: s.role,
      status: s.status,
      statusReason: s.statusReason,
      decidedAt: s.decidedAt,
      rating: s.rating,
      ratingNote: s.ratingNote,
      ratedAt: s.ratedAt,
      answers: s.answers,
      source: s.source,
      consentAt: s.consentAt,
      createdAt: s.createdAt,
      link: s.recordId
        ? { method: s.linkMethod, linkedAt: s.linkedAt, record: record && !record.deletedAt ? recordView(record) : null }
        : null,
    };
  }

  /** Contactos con los que se podría vincular el prospecto: los que coinciden en datos, más los que encuentre la búsqueda. */
  async candidates(tenantId: string, projectId: string, prospectId: string, search?: string) {
    const prospect = await this.requireProspect(tenantId, projectId, prospectId);
    const byData = await findRecordsByContact(this.dataSource.manager, tenantId, prospect, 10);
    const term = search?.trim().slice(0, 80);
    let bySearch: ClientRecord[] = [];
    if (term && term.length >= 2) {
      const like = `%${escapeLike(term)}%`;
      const num = digitsOf(term);
      bySearch = await this.records
        .createQueryBuilder('r')
        .where('r.tenantId = :tenantId AND r.deletedAt IS NULL', { tenantId })
        .andWhere(
          new Brackets((w) => {
            w.where("r.fullName ILIKE :like ESCAPE '\\'", { like }).orWhere("r.email ILIKE :like ESCAPE '\\'", { like });
            if (num.length >= 3) w.orWhere("regexp_replace(coalesce(r.phone, ''), '\\D', '', 'g') LIKE :num", { num: `%${num}%` });
          }),
        )
        .orderBy('r.createdAt', 'DESC')
        .limit(10)
        .getMany();
    }
    const seen = new Set<string>();
    const data = [...byData.map((r) => ({ ...recordView(r), matchesData: true })), ...bySearch.map((r) => ({ ...recordView(r), matchesData: false }))].filter((r) =>
      seen.has(r.id) ? false : (seen.add(r.id), true),
    );
    return { data };
  }

  /** Proyectos en los que un contacto tiene prospectos vinculados. */
  async forRecord(tenantId: string, recordId: string) {
    requireUuid(recordId, 'El contacto');
    const rows: Array<{
      prospectId: string;
      projectId: string;
      projectName: string;
      projectSlug: string;
      projectStatus: string;
      role: ProspectRole;
      status: string;
      rating: number | null;
      linkMethod: ProspectLinkMethod;
      linkedAt: Date;
      registeredAt: Date;
    }> = await this.prospects
      .createQueryBuilder('s')
      .innerJoin(RecruitmentProject, 'p', 'p.id = s.projectId AND p.tenantId = s.tenantId')
      .select('s.id', 'prospectId')
      .addSelect('s.projectId', 'projectId')
      .addSelect('p.name', 'projectName')
      .addSelect('p.slug', 'projectSlug')
      .addSelect('p.status', 'projectStatus')
      .addSelect('s.role', 'role')
      .addSelect('s.status', 'status')
      .addSelect('s.rating', 'rating')
      .addSelect('s.linkMethod', 'linkMethod')
      .addSelect('s.linkedAt', 'linkedAt')
      .addSelect('s.createdAt', 'registeredAt')
      .where('s.tenantId = :tenantId AND s.recordId = :recordId', { tenantId, recordId })
      .orderBy('s.createdAt', 'DESC')
      .getRawMany();
    const summary = (await this.summaries(tenantId, rows.length ? [recordId] : [])).get(recordId) ?? EMPTY_SUMMARY;
    return { data: rows, summary };
  }

  // ───────────────────────────── Ingreso de contactos ─────────────────────────────

  /** Contacto con ese dato verificado que tenga algún prospecto en la cuenta (el más antiguo si hay varios). */
  async findRecordWithProspects(tenantId: string, channel: 'email' | 'phone', destination: string): Promise<string | null> {
    return this.findProspectRecord(tenantId, channel, destination, null);
  }

  /** Igual, pero con prospecto en ese proyecto. */
  async findRecordInProject(tenantId: string, projectId: string, channel: 'email' | 'phone', destination: string): Promise<string | null> {
    return this.findProspectRecord(tenantId, channel, destination, projectId);
  }

  private async findProspectRecord(tenantId: string, channel: 'email' | 'phone', destination: string, projectId: string | null): Promise<string | null> {
    const contact = channel === 'email' ? { email: destination } : { phone: destination };
    const records = await findRecordsByContact(this.dataSource.manager, tenantId, contact, 50);
    if (records.length === 0) return null;
    const qb = this.prospects
      .createQueryBuilder('s')
      .select('s.recordId', 'recordId')
      .where('s.tenantId = :tenantId AND s.recordId IN (:...ids)', { tenantId, ids: records.map((r) => r.id) });
    if (projectId) qb.andWhere('s.projectId = :projectId', { projectId });
    const rows: Array<{ recordId: string }> = await qb.groupBy('s.recordId').getRawMany();
    const withProspects = records.filter((r) => rows.some((x) => x.recordId === r.id));
    if (withProspects.length === 0) return null;
    return withProspects.reduce((a, b) => (a.createdAt <= b.createdAt ? a : b)).id;
  }

  exists(tenantId: string, projectId: string, recordId: string): Promise<boolean> {
    return this.prospects.exists({ where: { tenantId, projectId, recordId } });
  }

  find(tenantId: string, projectId: string, recordId: string): Promise<ProjectProspect | null> {
    return this.prospects.findOne({ where: { tenantId, projectId, recordId } });
  }

  /** Proyectos de un contacto con su estado, para su portal. Los borradores no se muestran. */
  async forPortal(tenantId: string, recordId: string) {
    const rows: Array<{ slug: string; name: string; publicName: string | null; projectStatus: string; role: ProspectRole; status: string; registeredAt: Date }> = await this.prospects
      .createQueryBuilder('s')
      .innerJoin(RecruitmentProject, 'p', 'p.id = s.projectId AND p.tenantId = s.tenantId')
      .select('p.slug', 'slug')
      .addSelect('p.name', 'name')
      .addSelect('p.publicName', 'publicName')
      .addSelect('p.status', 'projectStatus')
      .addSelect('s.role', 'role')
      .addSelect('s.status', 'status')
      .addSelect('s.createdAt', 'registeredAt')
      .where('s.tenantId = :tenantId AND s.recordId = :recordId', { tenantId, recordId })
      .andWhere("p.status <> 'draft'")
      .orderBy('s.createdAt', 'DESC')
      .getRawMany();
    // La persona ve su perfil y una versión pública de su estado, nunca el estado interno.
    return rows.map((r) => ({ slug: r.slug, name: r.publicName || r.name, projectStatus: r.projectStatus, role: r.role, status: publicStatusOf(r.status), registeredAt: r.registeredAt }));
  }

  // ───────────────────────────── Vínculo con contactos ─────────────────────────────

  private async log(tenantId: string, actor: Actor, projectId: string, action: string, metadata: Record<string, unknown>, targetId: string) {
    await this.audit.log({
      tenantId,
      actorType: 'user',
      actorId: actor.id,
      actorLabel: actor.email,
      action: `reclutamiento.prospect.${action}`,
      targetType: 'project_prospect',
      targetId,
      scopeId: projectId,
      metadata,
    });
  }

  /**
   * Agrega un contacto del CRM al proyecto como prospecto (por ejemplo, desde
   * un chat). No hay consentimiento de la landing ni respuestas al formulario.
   * El proyecto no puede estar terminado y la persona no puede estar ya en él.
   */
  async addRecord(tenantId: string, actor: Actor, projectId: string, rawRecordId: unknown, rawRole?: unknown, rawStatus?: unknown) {
    const recordId = requireUuid(rawRecordId, 'El contacto');
    if (rawRole !== undefined && rawRole !== null && !isRole(rawRole)) throw new BadRequestException('Perfil inválido');
    // Estado de entrada: por defecto «Nuevo»; el equipo puede agregarlo ya avanzado (p. ej. «Seleccionado»).
    const status = rawStatus === undefined || rawStatus === null || rawStatus === '' ? INITIAL_STATUS : String(rawStatus);
    if (!stateOf(status)) throw new BadRequestException('Estado inválido');
    const decided = status !== INITIAL_STATUS;
    const record = await this.records.findOne({ where: { id: recordId, tenantId } });
    if (!record || record.deletedAt) throw new NotFoundException('Contacto no encontrado');
    const created = await this.dataSource.transaction(async (em) => {
      // Bloqueo compartido con quien borra o termina el proyecto.
      const project = await em.getRepository(RecruitmentProject).findOne({ where: { id: projectId, tenantId }, lock: { mode: 'pessimistic_read' } });
      if (!project) throw new NotFoundException('Proyecto no encontrado');
      if (project.status === 'ended') throw new ConflictException('El proyecto terminó y ya no recibe personas');
      const repo = em.getRepository(ProjectProspect);
      if (await repo.exists({ where: { projectId, recordId } })) throw new ConflictException('Este contacto ya está en el proyecto');
      const role = (rawRole as ProspectRole | undefined) ?? project.defaultRole ?? 'participant';
      if (!(project.roles ?? ['participant']).includes(role)) throw new BadRequestException(`El proyecto no acepta ${ROLE_LABELS[role].toLowerCase()}es`);
      const fullName = (record.fullName || [record.firstName, record.lastName].filter(Boolean).join(' ') || record.email || record.phone || 'Sin nombre').slice(0, 100);
      const saved = await repo.save(
        repo.create({
          tenantId,
          projectId,
          role,
          status,
          decidedBy: decided ? actor.id : null,
          decidedAt: decided ? new Date() : null,
          fullName,
          email: record.email ? record.email.trim().toLowerCase().slice(0, 200) : null,
          phone: fullPhone(record),
          answers: [],
          consentAt: null,
          source: 'manual',
          addedBy: actor.id,
          recordId,
          linkMethod: 'manual',
          linkedBy: actor.id,
          linkedAt: new Date(),
        }),
      );
      await this.recordEvent(em, saved, null, null, actor.id);
      return saved;
    }).catch((err: any) => {
      // Dos personas agregando al mismo contacto a la vez: el índice único lo impide.
      if (err?.code === '23505') throw new ConflictException('Este contacto ya está en el proyecto');
      throw err;
    });
    await this.log(tenantId, actor, projectId, 'add', { recordId, source: 'manual', role: created.role, status: created.status }, created.id);
    return this.view(created, record);
  }

  // ───────────────────────────── Acciones de los flujos ─────────────────────────────

  /**
   * Proyectos del contacto para las condiciones de los flujos: id → estado y
   * perfil. Vacío si la cuenta no tiene Reclutamiento activo (una sola consulta).
   */
  /** Nombres de proyectos de la cuenta por id (para el nodo «Generación IA»). Ignora ids ajenos. */
  async projectNames(tenantId: string, ids: string[]): Promise<Record<string, string>> {
    const valid = ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
    if (!valid.length) return {};
    const rows = await this.projects.find({ where: { tenantId, id: In(valid) }, select: { id: true, name: true } });
    return Object.fromEntries(rows.map((p) => [p.id, p.name]));
  }

  async flowMemberships(tenantId: string, recordId: string | null): Promise<Record<string, { status: string; role: string }>> {
    if (!recordId) return {};
    const rows: Array<{ project_id: string; status: string; role: string }> = await this.prospects.query(
      `SELECT pp.project_id, pp.status, pp.role
         FROM project_prospects pp
         JOIN tenants t ON t.id = pp.tenant_id
        WHERE pp.tenant_id = $1 AND pp.record_id = $2
          AND (t.features->>'reclutamiento')::boolean IS TRUE`,
      [tenantId, recordId],
    );
    return Object.fromEntries(rows.map((r) => [r.project_id, { status: r.status, role: r.role }]));
  }


  /**
   * Aplica las acciones de proyecto de un flujo sobre el contacto de una
   * conversación. Las hace el sistema (sin usuario), en orden, y nunca fallan
   * el flujo: lo que no se puede hacer se omite y se explica en la nota que
   * devuelve. Solo con Reclutamiento activo en la cuenta.
   *
   * - Agregar: si ya está en el proyecto no cambia nada; no admite proyectos
   *   terminados ni perfiles que el proyecto no acepta.
   * - Cambiar estado: solo si ya está en el proyecto.
   */
  async applyFlowActions(
    tenantId: string,
    recordId: string | null,
    actions: Array<{ type: 'add' | 'status' | 'answers'; projectId: string; role?: string; status?: string; answers?: Array<{ item: string; value: string }>; onlyIfEmpty?: boolean }>,
  ): Promise<string[]> {
    if (actions.length === 0) return [];
    const tenant = await this.dataSource.getRepository(Tenant).findOne({ where: { id: tenantId }, select: { id: true, features: true } });
    if (!tenant || !isFeatureEnabled(tenant.features, 'reclutamiento')) return ['Flujo: las acciones de proyecto no se aplicaron porque Reclutamiento no está activo en la cuenta.'];
    if (!recordId) return ['Flujo: las acciones de proyecto no se aplicaron porque la conversación no tiene un contacto vinculado.'];
    const record = await this.records.findOne({ where: { id: recordId, tenantId } });
    if (!record || record.deletedAt) return ['Flujo: las acciones de proyecto no se aplicaron porque el contacto no existe.'];
    const notes: string[] = [];
    for (const a of actions) {
      try {
        notes.push(a.type === 'add' ? await this.flowAdd(tenantId, record, a) : a.type === 'answers' ? await this.flowAnswers(tenantId, record, a) : await this.flowStatus(tenantId, record, a));
      } catch (err: any) {
        notes.push(`Flujo: no se pudo aplicar una acción de proyecto (${err?.message || 'error'}).`);
      }
    }
    return notes;
  }

  private async flowAdd(tenantId: string, record: ClientRecord, a: { projectId: string; role?: string; status?: string }): Promise<string> {
    return this.dataSource
      .transaction(async (em) => {
        const project = await em.getRepository(RecruitmentProject).findOne({ where: { id: a.projectId, tenantId }, lock: { mode: 'pessimistic_read' } });
        if (!project) return 'Flujo: el proyecto de la acción «Agregar a proyecto» ya no existe.';
        if (project.status === 'ended') return `Flujo: no se agregó a «${project.name}» porque el proyecto terminó.`;
        const repo = em.getRepository(ProjectProspect);
        const existing = await repo.findOne({ where: { projectId: project.id, recordId: record.id } });
        if (existing) return `Flujo: ya estaba en «${project.name}»; no se cambió nada.`;
        const role = (isRole(a.role) ? a.role : project.defaultRole) ?? 'participant';
        if (!(project.roles ?? ['participant']).includes(role)) return `Flujo: no se agregó a «${project.name}» porque el proyecto no acepta ${ROLE_LABELS[role].toLowerCase()}es.`;
        const status = a.status && stateOf(a.status) ? a.status : INITIAL_STATUS;
        const saved = await repo.save(
          repo.create({
            tenantId,
            projectId: project.id,
            role,
            status,
            decidedAt: status === INITIAL_STATUS ? null : new Date(),
            fullName: (record.fullName || [record.firstName, record.lastName].filter(Boolean).join(' ') || record.email || record.phone || 'Sin nombre').slice(0, 100),
            email: record.email ? record.email.trim().toLowerCase().slice(0, 200) : null,
            phone: fullPhone(record),
            answers: [],
            consentAt: null,
            source: 'manual',
            recordId: record.id,
            linkMethod: 'manual',
            linkedAt: new Date(),
          }),
        );
        await this.recordEvent(em, saved, null, null, null, null, 'flow');
        await this.audit.log(
          { tenantId, actorType: 'system', actorId: null, action: 'reclutamiento.prospect.add', targetType: 'project_prospect', targetId: saved.id, scopeId: project.id, metadata: { recordId: record.id, source: 'flow', role, status } },
          em,
        );
        return `Flujo: agregado a «${project.name}» como ${ROLE_LABELS[role].toLowerCase()} (${stateOf(status)!.label}).`;
      })
      .catch((err: any) => {
        // Otro proceso lo agregó al mismo tiempo (índice único): ya está.
        if (err?.code === '23505') return 'Flujo: ya estaba en el proyecto; no se cambió nada.';
        throw err;
      });
  }

  /**
   * «Guardar respuestas en proyecto»: llena preguntas del formulario del
   * proyecto (en el prospecto) y datos personales del formulario (en el
   * contacto). Cada valor se valida como en el registro; lo que no sirve se
   * omite y la nota lo explica. Solo si el contacto ya está en el proyecto.
   */
  private async flowAnswers(tenantId: string, record: ClientRecord, a: { projectId: string; answers?: Array<{ item: string; value: string }>; onlyIfEmpty?: boolean }): Promise<string> {
    const project = await this.projects.findOne({ where: { id: a.projectId, tenantId } });
    if (!project) return 'Flujo: el proyecto de la acción «Guardar respuestas en proyecto» ya no existe.';
    if (project.status === 'ended') return `Flujo: no se guardaron respuestas en «${project.name}» porque el proyecto terminó.`;
    const prospect = await this.prospects.findOne({ where: { tenantId, projectId: project.id, recordId: record.id } });
    if (!prospect) return `Flujo: no se guardaron respuestas porque el contacto no está en «${project.name}».`;
    const form = readForm(project.form);
    const defs = new Map((await this.portalConfig.fieldCatalog(tenantId)).map((f) => [f.key, f]));
    const current: AnswerSnapshot[] = Array.isArray(prospect.answers) ? (prospect.answers as AnswerSnapshot[]) : [];

    const saved: string[] = [];
    const skipped: string[] = [];
    const updates: AnswerSnapshot[] = [];
    const values: Record<string, string> = {};
    for (const { item, value } of a.answers ?? []) {
      const [kind, key] = [item.slice(0, item.indexOf(':')), item.slice(item.indexOf(':') + 1)];
      if (kind === 'question') {
        const q = form.questions.find((x) => x.id === key);
        if (!q) {
          skipped.push('una pregunta que ya no está en el formulario');
          continue;
        }
        if (a.onlyIfEmpty && current.some((x) => x.id === q.id)) {
          skipped.push(`«${q.label}» (ya tenía respuesta)`);
          continue;
        }
        try {
          updates.push(answerFromText(q, value));
          saved.push(`«${q.label}»`);
        } catch {
          skipped.push(`«${q.label}» (el valor «${value.slice(0, 40)}» no es válido)`);
        }
      } else {
        const def = defs.get(key);
        if (!def || !form.fields.some((f) => f.key === key)) {
          skipped.push(`un dato personal que ya no está en el formulario`);
          continue;
        }
        try {
          // Fechas escritas como dd/mm/aaaa también sirven.
          const dmy = def.type === 'date' ? /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(value.trim()) : null;
          const v = normalizeFieldValue(def, dmy ? `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}` : value);
          if (v) values[key] = v;
        } catch {
          skipped.push(`«${def.label}» (el valor «${value.slice(0, 40)}» no es válido)`);
        }
      }
    }

    const patch = buildRecordPatch(record as any, values, defs, !!a.onlyIfEmpty);
    // Los datos personales que no cambiaron (o ya tenían valor con «solo si está vacío») no se cuentan como guardados.
    for (const key of Object.keys(values)) {
      const def = defs.get(key)!;
      const changed = def.source === 'fixed' ? def.prop! in patch : !!(patch.customData && (patch.customData as Record<string, unknown>)[key] !== (record.customData ?? {})[key]);
      if (!changed && a.onlyIfEmpty) skipped.push(`«${def.label}» (ya tenía valor)`);
      else saved.push(`«${def.label}»`);
    }
    if (updates.length === 0 && Object.keys(patch).length === 0) {
      return `Flujo: no se guardaron respuestas en «${project.name}»${skipped.length ? `: ${skipped.join(', ')}` : ''}.`;
    }

    let merged: AnswerSnapshot[];
    try {
      merged = updates.length ? mergeAnswers(current, updates) : current;
    } catch (err: any) {
      return `Flujo: no se guardaron respuestas en «${project.name}» (${err?.message || 'error'}).`;
    }
    await this.dataSource.transaction(async (em) => {
      if (updates.length) await em.getRepository(ProjectProspect).update({ id: prospect.id }, { answers: merged });
      if (Object.keys(patch).length) await em.getRepository(ClientRecord).update({ id: record.id, tenantId }, patch as any);
      await this.audit.log(
        {
          tenantId,
          actorType: 'system',
          actorId: null,
          action: 'reclutamiento.prospect.answers',
          targetType: 'project_prospect',
          targetId: prospect.id,
          scopeId: project.id,
          metadata: { source: 'flow', questions: updates.map((u) => u.id), fields: Object.keys(values) },
        },
        em,
      );
    });
    Object.assign(record, patch);
    return `Flujo: en «${project.name}» se guardó ${saved.join(', ')}${skipped.length ? `. No se guardó: ${skipped.join(', ')}` : ''}.`;
  }

  private async flowStatus(tenantId: string, record: ClientRecord, a: { projectId: string; status?: string }): Promise<string> {
    const state = a.status ? stateOf(a.status) : undefined;
    const project = await this.projects.findOne({ where: { id: a.projectId, tenantId } });
    if (!project) return 'Flujo: el proyecto de la acción «Cambiar estado en proyecto» ya no existe.';
    if (!state) return `Flujo: la acción sobre «${project.name}» no tiene un estado válido.`;
    if (project.status === 'ended') return `Flujo: no se cambió el estado en «${project.name}» porque el proyecto terminó.`;
    const prospect = await this.prospects.findOne({ where: { tenantId, projectId: project.id, recordId: record.id } });
    if (!prospect) return `Flujo: no se cambió el estado porque el contacto no está en «${project.name}».`;
    if (prospect.status === state.key) return `Flujo: ya estaba en «${state.label}» en «${project.name}».`;
    await this.dataSource.transaction(async (em) => {
      const res = await em
        .getRepository(ProjectProspect)
        .update({ id: prospect.id, status: prospect.status }, { status: state.key, statusReason: null, decidedBy: null, decidedAt: state.key === INITIAL_STATUS ? null : new Date() });
      // Si alguien lo cambió a la vez, gana ese cambio y no se registra nada.
      if (!res.affected) return;
      await this.recordEvent(em, { ...prospect, status: state.key }, prospect.status, null, null, null, 'flow');
      await this.audit.log(
        { tenantId, actorType: 'system', actorId: null, action: 'reclutamiento.prospect.status', targetType: 'project_prospect', targetId: prospect.id, scopeId: project.id, metadata: { source: 'flow', from: prospect.status, to: state.key } },
        em,
      );
    });
    return `Flujo: estado en «${project.name}» cambiado a «${state.label}».`;
  }

  /**
   * Cambia el estado dentro del embudo del perfil de la persona. Se puede mover
   * a cualquier estado de ese embudo (también para corregir). El motivo
   * (interno) solo se guarda en los estados de descarte. Todo queda en el historial.
   */
  async setStatus(tenantId: string, actor: Actor, projectId: string, prospectId: string, body: Record<string, unknown>) {
    const status = String(body?.status ?? '');
    const current = await this.requireProspect(tenantId, projectId, prospectId);
    const state = stateOf(status);
    if (!state) throw new BadRequestException('Estado inválido');
    const reason = state.negative ? optionalString(body?.reason, 'El motivo', 500) : null;
    if (current.status === status && current.statusReason === reason) return this.view(current, await this.recordOf(tenantId, current));
    const initial = status === INITIAL_STATUS;
    await this.dataSource.transaction(async (em) => {
      const res = await em
        .getRepository(ProjectProspect)
        .update({ id: prospectId, projectId, tenantId }, { status, statusReason: reason, decidedBy: initial ? null : actor.id, decidedAt: initial ? null : new Date() });
      if (!res.affected) throw new NotFoundException('Prospecto no encontrado');
      await this.recordEvent(em, { ...current, status }, current.status, null, actor.id, reason);
    });
    await this.log(tenantId, actor, projectId, 'status', { role: current.role, from: current.status, to: status }, prospectId);
    const next = await this.requireProspect(tenantId, projectId, prospectId);
    return this.view(next, await this.recordOf(tenantId, next));
  }

  /**
   * Cambia el perfil de la persona en el proyecto (p. ej. de participante a
   * moderador). Vuelve a «Nuevo»: lo decidido valía para el perfil anterior.
   */
  async setRole(tenantId: string, actor: Actor, projectId: string, prospectId: string, body: Record<string, unknown>) {
    const role = body?.role;
    if (!isRole(role)) throw new BadRequestException('Perfil inválido');
    const project = await this.requireProject(tenantId, projectId);
    if (project.status === 'ended') throw new ConflictException('El proyecto terminó y ya no se puede cambiar');
    if (!(project.roles ?? ['participant']).includes(role)) throw new BadRequestException(`El proyecto no acepta ${ROLE_LABELS[role].toLowerCase()}es`);
    const current = await this.requireProspect(tenantId, projectId, prospectId);
    if (current.role === role) return this.view(current, await this.recordOf(tenantId, current));
    const status = INITIAL_STATUS;
    await this.dataSource.transaction(async (em) => {
      await em.getRepository(ProjectProspect).update({ id: prospectId, projectId, tenantId }, { role, status, statusReason: null, decidedBy: null, decidedAt: null });
      await this.recordEvent(em, { ...current, role, status }, current.status, current.role, actor.id);
    });
    await this.log(tenantId, actor, projectId, 'role', { from: current.role, to: role }, prospectId);
    const next = await this.requireProspect(tenantId, projectId, prospectId);
    return this.view(next, await this.recordOf(tenantId, next));
  }

  /** Calificación del equipo en este proyecto: 1 a 5 (o nula para quitarla) y una nota opcional. */
  async rate(tenantId: string, actor: Actor, projectId: string, prospectId: string, body: Record<string, unknown>) {
    const raw = body?.rating;
    const rating = raw === null || raw === undefined || raw === '' ? null : Number(raw);
    if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) throw new BadRequestException('La calificación debe ser de 1 a 5');
    const note = rating === null ? null : optionalString(body?.note, 'La nota', 1000);
    await this.requireProspect(tenantId, projectId, prospectId);
    await this.prospects.update(
      { id: prospectId, projectId, tenantId },
      { rating, ratingNote: note, ratedBy: rating === null ? null : actor.id, ratedAt: rating === null ? null : new Date() },
    );
    await this.log(tenantId, actor, projectId, 'rate', { rating }, prospectId);
    const next = await this.requireProspect(tenantId, projectId, prospectId);
    return this.view(next, await this.recordOf(tenantId, next));
  }

  /** Historial del prospecto en este proyecto, del más reciente al más antiguo. */
  async history(tenantId: string, projectId: string, prospectId: string) {
    await this.requireProspect(tenantId, projectId, prospectId);
    const rows = await this.dataSource.getRepository(ProspectStatusEvent).find({ where: { tenantId, projectId, prospectId }, order: { createdAt: 'DESC' }, take: 100 });
    return {
      data: rows.map((e) => ({ id: e.id, role: e.role, fromRole: e.fromRole, fromStatus: e.fromStatus, toStatus: e.toStatus, reason: e.reason, byTeam: !!e.actorId, by: e.actorId ? 'team' : e.via === 'flow' ? 'flow' : 'landing', createdAt: e.createdAt })),
    };
  }

  private async recordOf(tenantId: string, p: ProjectProspect): Promise<ClientRecord | undefined> {
    return p.recordId ? ((await this.records.findOne({ where: { id: p.recordId, tenantId } })) ?? undefined) : undefined;
  }

  async link(tenantId: string, actor: Actor, projectId: string, prospectId: string, rawRecordId: unknown) {
    const recordId = requireUuid(rawRecordId, 'El contacto');
    await this.requireProject(tenantId, projectId);
    await this.requireProspect(tenantId, projectId, prospectId);
    const record = await this.records.findOne({ where: { id: recordId, tenantId } });
    if (!record || record.deletedAt) throw new NotFoundException('Contacto no encontrado');
    const res = await this.prospects.update({ id: prospectId, projectId, tenantId }, { recordId, linkMethod: 'manual', linkedBy: actor.id, linkedAt: new Date() });
    if (!res.affected) throw new NotFoundException('Prospecto no encontrado');
    await this.log(tenantId, actor, projectId, 'link', { recordId, method: 'manual' }, prospectId);
    return this.view(await this.requireProspect(tenantId, projectId, prospectId), record);
  }

  async unlink(tenantId: string, actor: Actor, projectId: string, prospectId: string) {
    const prospect = await this.requireProspect(tenantId, projectId, prospectId);
    if (!prospect.recordId) return this.view(prospect);
    await this.prospects.update({ id: prospectId, projectId, tenantId }, { recordId: null, linkMethod: null, linkedBy: null, linkedAt: null });
    await this.log(tenantId, actor, projectId, 'unlink', { recordId: prospect.recordId }, prospectId);
    return this.view(await this.requireProspect(tenantId, projectId, prospectId));
  }

  /**
   * Vincula los prospectos sin vínculo del proyecto cuyo correo o teléfono
   * coincide con un único contacto. Sirve para los contactos que llegaron al CRM
   * después del registro. Los ambiguos (varios contactos) se dejan para el vínculo manual.
   */
  async autoLink(tenantId: string, actor: Actor, projectId: string) {
    await this.requireProject(tenantId, projectId);
    let linked = 0;
    let ambiguous = 0;
    let unmatched = 0;
    const done = new Set<string>();
    while (done.size < AUTO_LINK_MAX) {
      const batch = await this.prospects
        .createQueryBuilder('s')
        .where('s.tenantId = :tenantId AND s.projectId = :projectId AND s.recordId IS NULL', { tenantId, projectId })
        .andWhere(done.size ? 's.id NOT IN (:...done)' : '1=1', { done: [...done] })
        .orderBy('s.createdAt', 'ASC')
        .limit(AUTO_LINK_BATCH)
        .getMany();
      if (batch.length === 0) break;
      for (const s of batch) {
        done.add(s.id);
        const found = await findRecordsByContact(this.dataSource.manager, tenantId, s, 2);
        if (found.length === 1) {
          const res = await this.prospects
            .createQueryBuilder()
            .update(ProjectProspect)
            .set({ recordId: found[0].id, linkMethod: 'auto', linkedBy: actor.id, linkedAt: new Date() })
            .where('id = :id AND tenant_id = :tenantId AND record_id IS NULL', { id: s.id, tenantId })
            .execute();
          if (res.affected) linked++;
        } else if (found.length > 1) ambiguous++;
        else unmatched++;
      }
    }
    await this.log(tenantId, actor, projectId, 'auto_link', { linked, ambiguous, unmatched }, projectId);
    return { linked, ambiguous, unmatched };
  }

  /** Elimina el registro de una persona (por ejemplo, ante una solicitud de supresión de datos). No toca el contacto del CRM. */
  async remove(tenantId: string, actor: Actor, projectId: string, prospectId: string) {
    const prospect = await this.requireProspect(tenantId, projectId, prospectId);
    const res = await this.dataSource.transaction(async (em) => {
      const deleted = await em.getRepository(ProjectProspect).delete({ id: prospectId, projectId, tenantId });
      // Con la persona se va su historial en el proyecto.
      await em.getRepository(ProspectStatusEvent).delete({ tenantId, prospectId });
      return deleted;
    });
    if (!res.affected) throw new ConflictException('El prospecto ya fue eliminado');
    await this.log(tenantId, actor, projectId, 'delete', { linked: !!prospect.recordId }, prospectId);
    return { deleted: true };
  }
}
