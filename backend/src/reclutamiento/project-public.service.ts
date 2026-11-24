import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MediaStorageService } from '../media/media-storage.service';
import { TenantAuditService } from '../audit/tenant-audit.service';
import { Tenant } from '../tenants/tenant.entity';
import { RecruitmentProject } from './entities/recruitment-project.entity';
import { landingImageFolder, storeLandingImage } from './portal/landing-images';
import { DEFAULT_PROJECT_LANDING, LandingConfig, landingImageUrls, mergeLanding, parseLanding } from './portal/portal-landing';
import { ProjectForm, parseForm, readForm } from './project-form';
import { PortalConfigService } from './portal/portal-config.service';
import { ROLE_LABELS } from './prospect-states';
import { signupRoles } from './projects.service';
import { Actor, optionalString, requireObject } from './validation';

/** El nombre se pide siempre; no se ofrece como dato personal adicional. */
const NAME_FIELDS = new Set(['nombre_completo', 'nombre', 'apellido']);

const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

export interface ProjectPublicSettings {
  publicName: string | null;
  registrationOpen: boolean;
}

/**
 * Cara pública de un proyecto: nombre público, landing, formulario y registro.
 * Lo edita la reclutadora; la parte pública solo se sirve con el proyecto activo.
 */
@Injectable()
export class ProjectPublicService {
  constructor(
    @InjectRepository(RecruitmentProject) private readonly projects: Repository<RecruitmentProject>,
    private readonly audit: TenantAuditService,
    private readonly media: MediaStorageService,
    private readonly portalConfig: PortalConfigService,
  ) {}

  /** Proyecto de la reclutadora o 404. */
  private async own(tenantId: string, id: string): Promise<RecruitmentProject> {
    const p = await this.projects.findOne({ where: { id, tenantId } });
    if (!p) throw new NotFoundException('Proyecto no encontrado');
    return p;
  }

  /** Un proyecto terminado ya no se configura. */
  private async editable(tenantId: string, id: string): Promise<RecruitmentProject> {
    const p = await this.own(tenantId, id);
    if (p.status === 'ended') throw new ConflictException('El proyecto terminó y ya no se puede configurar');
    return p;
  }

  private folder(p: RecruitmentProject) {
    return landingImageFolder(p.tenantId, p.id);
  }

  private settingsOf(p: RecruitmentProject): ProjectPublicSettings {
    return { publicName: p.publicName, registrationOpen: p.registrationOpen };
  }

  private async log(tenantId: string, actor: Actor, projectId: string, action: string, metadata: Record<string, unknown>) {
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

  // ───────────────────────────── Lectura (reclutadora) ─────────────────────────────

  async get(tenantId: string, id: string) {
    const p = await this.own(tenantId, id);
    return {
      settings: this.settingsOf(p),
      landing: mergeLanding(p.landing, DEFAULT_PROJECT_LANDING),
      form: readForm(p.form),
    };
  }

  // ───────────────────────────── Escritura (reclutadora) ─────────────────────────────

  async updateSettings(tenantId: string, actor: Actor, id: string, body: Record<string, unknown>): Promise<ProjectPublicSettings> {
    const input = requireObject(body, 'La configuración');
    const current = await this.editable(tenantId, id);
    const patch: Partial<RecruitmentProject> = {};
    if (input.publicName !== undefined) {
      const name = input.publicName === null || input.publicName === '' ? null : optionalString(input.publicName, 'El nombre público', 80);
      if (name !== null && (name.length < 3 || CONTROL_CHARS.test(name))) throw new BadRequestException('El nombre público debe tener entre 3 y 80 caracteres');
      patch.publicName = name ? name.replace(/\s+/g, ' ') : null;
    }
    if (input.registrationOpen !== undefined) {
      if (typeof input.registrationOpen !== 'boolean') throw new BadRequestException('El valor debe ser verdadero o falso');
      patch.registrationOpen = input.registrationOpen;
    }
    if (Object.keys(patch).length === 0) return this.settingsOf(current);
    const res = await this.projects
      .createQueryBuilder()
      .update(RecruitmentProject)
      .set(patch)
      .where("id = :id AND tenant_id = :t AND status <> 'ended'", { id, t: tenantId })
      .execute();
    if (!res.affected) throw new ConflictException('El proyecto cambió de estado; recarga e inténtalo de nuevo');
    await this.log(tenantId, actor, id, 'settings_update', {
      fields: Object.keys(patch),
      ...(patch.registrationOpen !== undefined ? { registrationOpen: patch.registrationOpen } : {}),
    });
    return this.settingsOf({ ...current, ...patch } as RecruitmentProject);
  }

  async updateLanding(tenantId: string, actor: Actor, id: string, body: Record<string, unknown>): Promise<LandingConfig> {
    const input = requireObject(body, 'La landing');
    const current = await this.editable(tenantId, id);
    const folder = this.folder(current);
    const landing = parseLanding(input, { isOwnImage: (url) => this.media.isOwnUrl(url, folder) }, DEFAULT_PROJECT_LANDING);
    const previous = mergeLanding(current.landing, DEFAULT_PROJECT_LANDING);
    const res = await this.projects
      .createQueryBuilder()
      .update(RecruitmentProject)
      .set({ landing: landing as unknown as Record<string, any> })
      .where("id = :id AND tenant_id = :t AND status <> 'ended'", { id, t: tenantId })
      .execute();
    if (!res.affected) throw new ConflictException('El proyecto cambió de estado; recarga e inténtalo de nuevo');
    // Imágenes que ya no se usan: se borran del almacenamiento (solo las de este proyecto).
    const kept = new Set(landingImageUrls(landing));
    for (const url of landingImageUrls(previous)) {
      if (!kept.has(url) && this.media.isOwnUrl(url, folder)) await this.media.deleteByUrl(url).catch(() => undefined);
    }
    await this.log(tenantId, actor, id, 'landing_update', { enabled: landing.enabled, sections: landing.sections.filter((s) => s.enabled).map((s) => s.id) });
    return landing;
  }

  async uploadLandingImage(tenantId: string, id: string, slot: string, file: Parameters<typeof storeLandingImage>[4]) {
    await this.editable(tenantId, id);
    return storeLandingImage(this.media, tenantId, id, slot, file);
  }

  async updateForm(tenantId: string, actor: Actor, id: string, body: Record<string, unknown>): Promise<ProjectForm> {
    const form = parseForm(requireObject(body, 'El formulario'));
    await this.editable(tenantId, id);
    // Verificar por teléfono exige un número de WhatsApp de la cuenta y una plantilla.
    if (form.verification?.channels.includes('phone')) {
      await this.portalConfig.assertWhatsappReady(tenantId, form.verification.whatsapp, 'con la que se envía el código');
    }
    const catalog = new Set((await this.portalConfig.fieldCatalog(tenantId)).map((f) => f.key));
    for (const f of form.fields) {
      if (NAME_FIELDS.has(f.key)) throw new BadRequestException('El nombre ya se pide siempre al registrarse');
      if (!catalog.has(f.key)) throw new BadRequestException(`El dato «${f.key}» no existe en el contacto`);
    }
    const res = await this.projects
      .createQueryBuilder()
      .update(RecruitmentProject)
      .set({ form: form as unknown as { questions: any[] } })
      .where("id = :id AND tenant_id = :t AND status <> 'ended'", { id, t: tenantId })
      .execute();
    if (!res.affected) throw new ConflictException('El proyecto cambió de estado; recarga e inténtalo de nuevo');
    await this.log(tenantId, actor, id, 'form_update', {
      questions: form.questions.length,
      required: form.questions.filter((q) => q.required).length,
      personalFields: form.fields.map((f) => f.key),
      verification: form.verification ? form.verification.channels : 'cuenta',
    });
    return form;
  }

  // ───────────────────────────── Público ─────────────────────────────

  /**
   * Proyecto servido en la dirección pública: solo uno activo de esa cuenta.
   * Un proyecto en borrador, pausado o terminado responde igual que uno
   * que no existe.
   */
  async resolvePublic(tenant: Tenant, projectSlug: unknown): Promise<RecruitmentProject> {
    const slug = typeof projectSlug === 'string' && projectSlug.length <= 40 ? projectSlug.toLowerCase() : '';
    const project = slug ? await this.projects.findOne({ where: { tenantId: tenant.id, slug, status: 'active' } }) : null;
    if (!project) throw new NotFoundException('Proyecto no disponible');
    return project;
  }

  /** Lo que ve cualquier visitante de la dirección pública del proyecto. */
  async publicInfo(project: RecruitmentProject) {
    const landing = mergeLanding(project.landing, DEFAULT_PROJECT_LANDING);
    const form = readForm(project.form);
    const catalog = new Map((await this.portalConfig.fieldCatalog(project.tenantId)).map((f) => [f.key, f]));
    return {
      project: {
        name: project.publicName || project.name,
        // Perfiles entre los que elige quien se registra (si hay más de uno).
        roles: signupRoles(project).map((r) => ({ key: r, label: ROLE_LABELS[r], needsApproval: r === 'moderator' })),
        defaultRole: project.defaultRole,
        // Datos personales que se piden (se guardan en el contacto). Los que ya no existen en el CRM se omiten.
        fields: form.fields.flatMap((f) => {
          const def = catalog.get(f.key);
          return def ? [{ key: def.key, label: def.label, type: def.type, options: def.options, suggestions: def.suggestions, maxLength: def.maxLength, required: f.required }] : [];
        }),
        questions: form.questions.map((q) => ({
          id: q.id,
          type: q.type,
          label: q.label,
          help: q.help,
          required: q.required,
          options: q.options,
          min: q.min,
          max: q.max,
        })),
      },
      registrationOpen: project.registrationOpen,
      landing: landing.enabled ? landing : null,
    };
  }
}
