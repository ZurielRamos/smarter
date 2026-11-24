import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { TenantAuditService } from '../audit/tenant-audit.service';
import { PROJECT_STATUSES, ProjectStatus, RecruitmentProject } from './entities/recruitment-project.entity';
import { ProjectProspect } from './entities/project-prospect.entity';
import { PROSPECT_ROLES, ProspectRole, isRole } from './prospect-states';
import { Actor, clampInt, escapeLike, optionalString, requireObject, requireString } from './validation';

export type ProjectAction = 'activate' | 'pause' | 'resume' | 'end';

interface Rule {
  from: ProjectStatus[];
  to: ProjectStatus;
  label: string;
}

/** Máquina de estados del proyecto. Cada transición se aplica con un UPDATE condicional al estado de origen. */
const RULES: Record<ProjectAction, Rule> = {
  activate: { from: ['draft'], to: 'active', label: 'activar' },
  pause: { from: ['active'], to: 'paused', label: 'pausar' },
  resume: { from: ['paused'], to: 'active', label: 'reanudar' },
  end: { from: ['active', 'paused'], to: 'ended', label: 'terminar' },
};

const STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: 'en borrador',
  active: 'activo',
  paused: 'pausado',
  ended: 'terminado',
};

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;
const MAX_DESCRIPTION = 1000;

export function slugify(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return base.length >= 3 ? base : 'proyecto';
}

/** Perfiles que puede elegir quien se registra por la landing: los aceptados, y moderador solo si se permite postularse. */
export function signupRoles(p: Pick<RecruitmentProject, 'roles' | 'defaultRole' | 'moderatorSignup'>): ProspectRole[] {
  const roles = p.roles?.length ? p.roles : (['participant'] as ProspectRole[]);
  const offered = roles.filter((r) => r !== 'moderator' || p.moderatorSignup);
  return offered.length ? offered : [p.defaultRole];
}

export const toProjectView = (p: RecruitmentProject, prospectCount?: number) => ({
  id: p.id,
  name: p.name,
  slug: p.slug,
  description: p.description,
  requiresSignedContract: p.requiresSignedContract,
  roles: p.roles?.length ? p.roles : (['participant'] as ProspectRole[]),
  defaultRole: p.defaultRole,
  moderatorSignup: p.moderatorSignup,
  status: p.status,
  publicName: p.publicName,
  registrationOpen: p.registrationOpen,
  landingEnabled: !!p.landing?.enabled,
  questionCount: Array.isArray(p.form?.questions) ? p.form.questions.length : 0,
  ...(prospectCount === undefined ? {} : { prospectCount }),
  endedAt: p.endedAt,
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
});

function parseName(value: unknown): string {
  const name = requireString(value, 'El nombre', 3, 80).replace(/\s+/g, ' ');
  if (CONTROL_CHARS.test(name)) throw new BadRequestException('El nombre tiene caracteres no permitidos');
  return name;
}

function parseSlug(value: unknown): string {
  const slug = requireString(value, 'La dirección', 3, 40).toLowerCase();
  if (!SLUG_RE.test(slug)) throw new BadRequestException('La dirección solo admite letras minúsculas, números y guiones');
  return slug;
}

function parseFlag(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new BadRequestException(`${field} debe ser verdadero o falso`);
  return value;
}

/** Perfiles que acepta el proyecto: al menos uno, sin repetir, en el orden del catálogo. */
function parseRoles(value: unknown): ProspectRole[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((r) => !isRole(r))) {
    throw new BadRequestException('Elige al menos un perfil: participante, encuestador o moderador');
  }
  return PROSPECT_ROLES.filter((r) => value.includes(r));
}

/**
 * Valida la combinación de perfiles. El perfil de entrada por la landing debe
 * estar entre los aceptados y solo es moderador si el proyecto no acepta otro.
 * Postularse como moderador desde el registro exige que se acepten moderadores.
 */
function checkRoles(roles: ProspectRole[], defaultRole: ProspectRole, moderatorSignup: boolean) {
  if (!roles.includes(defaultRole)) throw new BadRequestException('El perfil de quien se registra debe estar entre los que acepta el proyecto');
  if (defaultRole === 'moderator' && roles.some((r) => r !== 'moderator')) {
    throw new BadRequestException('Quien se registra entra como participante o encuestador; los moderadores se postulan o se asignan');
  }
  if (moderatorSignup && !roles.includes('moderator')) throw new BadRequestException('Para postularse como moderador, el proyecto debe aceptar moderadores');
}

function parseDescription(value: unknown): string | null {
  const text = optionalString(value, 'La descripción', MAX_DESCRIPTION);
  if (text !== null && CONTROL_CHARS.test(text.replace(/[\n\r\t]/g, ''))) throw new BadRequestException('La descripción tiene caracteres no permitidos');
  return text;
}

/**
 * Proyectos de reclutamiento de la cuenta: se crean de forma genérica (nombre,
 * dirección y descripción). La cara pública (landing, formulario, registro) la
 * maneja ProjectPublicService y los prospectos ProjectProspectsService.
 */
@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(RecruitmentProject) private readonly projects: Repository<RecruitmentProject>,
    @InjectRepository(ProjectProspect) private readonly prospects: Repository<ProjectProspect>,
    private readonly dataSource: DataSource,
    private readonly audit: TenantAuditService,
  ) {}

  private async requireOwn(tenantId: string, id: string): Promise<RecruitmentProject> {
    const p = await this.projects.findOne({ where: { id, tenantId } });
    if (!p) throw new NotFoundException('Proyecto no encontrado');
    return p;
  }

  private async uniqueSlug(tenantId: string, base: string): Promise<string> {
    for (let i = 0; i < 50; i++) {
      const suffix = i === 0 ? '' : `-${i + 1}`;
      const candidate = `${base.slice(0, 40 - suffix.length).replace(/-+$/g, '')}${suffix}`;
      if (!(await this.projects.exists({ where: { tenantId, slug: candidate } }))) return candidate;
    }
    throw new ConflictException('No se pudo generar una dirección única; escribe una');
  }

  private async log(tenantId: string, actor: Actor, projectId: string, action: string, metadata: Record<string, unknown> = {}) {
    await this.audit.log({
      tenantId,
      actorType: 'user',
      actorId: actor.id,
      actorLabel: actor.email,
      action: `reclutamiento.project.${action}`,
      targetType: 'recruitment_project',
      targetId: projectId,
      scopeId: projectId,
      metadata,
    });
  }

  private async countProspects(tenantId: string, ids: string[]): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const rows: Array<{ project_id: string; n: string }> = await this.prospects
      .createQueryBuilder('s')
      .select('s.project_id', 'project_id')
      .addSelect('count(*)', 'n')
      .where('s.tenant_id = :tenantId AND s.project_id IN (:...ids)', { tenantId, ids })
      .groupBy('s.project_id')
      .getRawMany();
    return new Map(rows.map((r) => [r.project_id, Number(r.n)]));
  }

  async list(tenantId: string, q: { status?: string; search?: string; page?: unknown; limit?: unknown }) {
    const page = clampInt(q.page, 1, 1, 100000);
    const limit = clampInt(q.limit, 20, 1, 100);
    const qb = this.projects.createQueryBuilder('p').where('p.tenantId = :tenantId', { tenantId });
    if (q.status) {
      if (!PROJECT_STATUSES.includes(q.status as ProjectStatus)) throw new BadRequestException('Estado inválido');
      qb.andWhere('p.status = :status', { status: q.status });
    }
    const search = q.search?.trim().slice(0, 80);
    if (search) {
      qb.andWhere("(p.name ILIKE :s ESCAPE '\\' OR p.slug ILIKE :s ESCAPE '\\')", { s: `%${escapeLike(search)}%` });
    }
    const [rows, total] = await qb
      .orderBy('p.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    const counts = await this.countProspects(tenantId, rows.map((r) => r.id));
    return { data: rows.map((p) => toProjectView(p, counts.get(p.id) ?? 0)), total, page, limit };
  }

  async detail(tenantId: string, id: string) {
    const p = await this.requireOwn(tenantId, id);
    const counts = await this.countProspects(tenantId, [id]);
    return toProjectView(p, counts.get(id) ?? 0);
  }

  async create(tenantId: string, actor: Actor, body: Record<string, unknown>) {
    const input = requireObject(body, 'El proyecto');
    const name = parseName(input.name);
    const description = input.description === undefined ? null : parseDescription(input.description);
    const requiresSignedContract = input.requiresSignedContract === undefined ? false : parseFlag(input.requiresSignedContract, 'Requiere contrato firmado');
    const roles = input.roles === undefined ? (['participant'] as ProspectRole[]) : parseRoles(input.roles);
    const defaultRole = input.defaultRole === undefined ? roles.find((r) => r !== 'moderator') ?? roles[0] : (input.defaultRole as ProspectRole);
    if (!isRole(defaultRole)) throw new BadRequestException('El perfil de quien se registra es inválido');
    const moderatorSignup = input.moderatorSignup === undefined ? false : parseFlag(input.moderatorSignup, 'Postularse como moderador');
    checkRoles(roles, defaultRole, moderatorSignup);
    const explicit = input.slug !== undefined && input.slug !== null && input.slug !== '';
    let slug = explicit ? parseSlug(input.slug) : await this.uniqueSlug(tenantId, slugify(name));
    for (let attempt = 0; ; attempt++) {
      try {
        const saved = await this.projects.save(this.projects.create({ tenantId, name, slug, description, requiresSignedContract, roles, defaultRole, moderatorSignup, status: 'draft', createdBy: actor.id }));
        await this.log(tenantId, actor, saved.id, 'create', { name, slug });
        return toProjectView(saved, 0);
      } catch (err: any) {
        if (err?.code !== '23505') throw err;
        // Dirección repetida: si la escribió la persona se le avisa; si es automática se busca otra.
        if (explicit || attempt >= 3) throw new ConflictException('Ya tienes un proyecto con esa dirección');
        slug = await this.uniqueSlug(tenantId, slugify(name));
      }
    }
  }

  async update(tenantId: string, actor: Actor, id: string, body: Record<string, unknown>) {
    const input = requireObject(body, 'El proyecto');
    const current = await this.requireOwn(tenantId, id);
    if (current.status === 'ended') throw new ConflictException('El proyecto terminó y ya no se puede editar');
    const patch: Partial<RecruitmentProject> = {};
    if (input.name !== undefined) patch.name = parseName(input.name);
    if (input.description !== undefined) patch.description = parseDescription(input.description);
    if (input.requiresSignedContract !== undefined) patch.requiresSignedContract = parseFlag(input.requiresSignedContract, 'Requiere contrato firmado');
    if (input.roles !== undefined || input.defaultRole !== undefined || input.moderatorSignup !== undefined) {
      const roles = input.roles === undefined ? current.roles : parseRoles(input.roles);
      let defaultRole = (input.defaultRole === undefined ? current.defaultRole : input.defaultRole) as ProspectRole;
      if (!isRole(defaultRole)) throw new BadRequestException('El perfil de quien se registra es inválido');
      // Al quitar el perfil de entrada sin elegir otro, se toma el primero que quede.
      if (input.defaultRole === undefined && !roles.includes(defaultRole)) defaultRole = roles.find((r) => r !== 'moderator') ?? roles[0];
      let moderatorSignup = input.moderatorSignup === undefined ? current.moderatorSignup : parseFlag(input.moderatorSignup, 'Postularse como moderador');
      if (input.moderatorSignup === undefined && !roles.includes('moderator')) moderatorSignup = false;
      checkRoles(roles, defaultRole, moderatorSignup);
      Object.assign(patch, { roles, defaultRole, moderatorSignup });
    }
    if (input.slug !== undefined) {
      const slug = parseSlug(input.slug);
      // La dirección pública se puede cambiar solo mientras nadie la usa.
      if (slug !== current.slug && current.status !== 'draft') {
        throw new ConflictException('La dirección solo se puede cambiar mientras el proyecto está en borrador');
      }
      patch.slug = slug;
    }
    if (Object.keys(patch).length === 0) return this.detail(tenantId, id);
    try {
      const res = await this.projects
        .createQueryBuilder()
        .update(RecruitmentProject)
        .set(patch)
        .where("id = :id AND tenant_id = :tenantId AND status <> 'ended'", { id, tenantId })
        .execute();
      if (!res.affected) throw new ConflictException('El proyecto cambió de estado; recarga e inténtalo de nuevo');
    } catch (err: any) {
      if (err?.code === '23505') throw new ConflictException('Ya tienes un proyecto con esa dirección');
      throw err;
    }
    await this.log(tenantId, actor, id, 'update', { fields: Object.keys(patch) });
    return this.detail(tenantId, id);
  }

  async transition(tenantId: string, actor: Actor, id: string, action: ProjectAction) {
    const rule = RULES[action];
    if (!rule) throw new NotFoundException();
    const current = await this.requireOwn(tenantId, id);
    if (!rule.from.includes(current.status)) {
      throw new ConflictException(`No se puede ${rule.label} un proyecto ${STATUS_LABELS[current.status]}`);
    }
    const set: Partial<RecruitmentProject> = { status: rule.to };
    if (rule.to === 'ended') {
      set.endedAt = new Date();
      // Un proyecto terminado deja de recibir registros.
      set.registrationOpen = false;
    }
    const res = await this.projects
      .createQueryBuilder()
      .update(RecruitmentProject)
      .set(set)
      .where('id = :id AND tenant_id = :tenantId AND status IN (:...from)', { id, tenantId, from: rule.from })
      .execute();
    if (!res.affected) throw new ConflictException('El proyecto cambió de estado; recarga e inténtalo de nuevo');
    await this.log(tenantId, actor, id, action, { from: current.status, to: rule.to });
    return this.detail(tenantId, id);
  }

  /** Solo se borra un proyecto sin prospectos: con registros, se termina. */
  async remove(tenantId: string, actor: Actor, id: string) {
    const current = await this.requireOwn(tenantId, id);
    await this.dataSource.transaction(async (em) => {
      // Bloquea la fila: un registro que llega a la vez espera y encuentra el proyecto ya borrado.
      const locked = await em.getRepository(RecruitmentProject).findOne({ where: { id, tenantId }, lock: { mode: 'pessimistic_write' } });
      if (!locked) throw new NotFoundException('Proyecto no encontrado');
      const used = await em.getRepository(ProjectProspect).exists({ where: { tenantId, projectId: id } });
      if (used) throw new ConflictException('El proyecto ya tiene prospectos; termínalo en lugar de eliminarlo');
      await em.getRepository(RecruitmentProject).delete({ id, tenantId });
    });
    await this.log(tenantId, actor, id, 'delete', { name: current.name, slug: current.slug });
    return { deleted: true };
  }
}
