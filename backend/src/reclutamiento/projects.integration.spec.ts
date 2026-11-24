/**
 * Pruebas de integración de los proyectos de reclutamiento y sus prospectos
 * sobre un PostgreSQL real. Se omiten si no hay base de pruebas.
 *
 *   docker run -d --rm --name smarter-test-pg -e POSTGRES_PASSWORD=test -e POSTGRES_DB=smarter_test -p 127.0.0.1:55432:5432 postgres
 *   TEST_DATABASE_URL=postgres://postgres:test@127.0.0.1:55432/smarter_test npx jest projects.integration
 *
 * Borra y recrea el esquema: por seguridad se niega a correr si el nombre de la
 * base no contiene «test». Las suites de integración se turnan con un bloqueo de
 * PostgreSQL (ver testing/test-db.ts).
 */
import 'reflect-metadata';
// El almacenamiento de medios importa `uuid` (solo ESM), que Jest no carga; aquí no se usa.
jest.mock('../media/media-storage.service', () => ({ MediaStorageService: class MediaStorageService {} }));
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { DataSource } from 'typeorm';
import { openTestDb, testDbEnabled, TestDb } from './testing/test-db';
import { Tenant } from '../tenants/tenant.entity';
import { ClientRecord } from '../records/record.entity';
import { TenantAuditLog } from '../audit/tenant-audit-log.entity';
import { TenantAuditService } from '../audit/tenant-audit.service';
import { RecruitmentProject } from './entities/recruitment-project.entity';
import { ProjectProspect } from './entities/project-prospect.entity';
import { ProspectStatusEvent } from './entities/prospect-status-event.entity';
import { ProjectsController } from './projects.controller';
import { ProjectsService, slugify } from './projects.service';
import { ProjectProspectsService } from './project-prospects.service';
import { ProjectPublicService } from './project-public.service';
import { makePortalConfig } from './testing/portal-config';
import { Inbox } from '../chats/inbox.entity';
import { CustomField } from '../records/custom-field.entity';
import { ensureRecruitmentFields } from './recruitment-fields';
import { TenantAdminGuard } from '../auth/tenant-admin.guard';
import { ModuleFeatureGuard } from '../auth/module-feature.guard';
import { REQUIRES_FEATURE_KEY } from '../auth/requires-feature.decorator';

const suite = testDbEnabled ? describe : describe.skip;

describe('slugify', () => {
  it('quita tildes, símbolos y respeta el largo', () => {
    expect(slugify('Panel Bogotá 2026 — ¡Ya!')).toBe('panel-bogota-2026-ya');
    expect(slugify('ab')).toBe('proyecto');
    expect(slugify('x'.repeat(60)).length).toBeLessThanOrEqual(40);
  });
});

suite('Proyectos de reclutamiento y prospectos (PostgreSQL)', () => {
  let db: TestDb;
  let ds: DataSource;
  let projects: ProjectsService;
  let prospects: ProjectProspectsService;
  let publicFace: ProjectPublicService;
  let tenantA: Tenant;
  let tenantB: Tenant;
  const actor = { id: '00000000-0000-0000-0000-0000000000a1', email: 'ana@reclutadora.test' };

  const rejects = async (p: Promise<unknown>): Promise<any> => {
    try {
      await p;
      return null;
    } catch (e) {
      return e;
    }
  };
  const statusOf = async (id: string) => (await ds.getRepository(RecruitmentProject).findOneByOrFail({ id })).status;
  const record = (tenant: Tenant, data: Partial<ClientRecord>) =>
    ds.getRepository(ClientRecord).save(ds.getRepository(ClientRecord).create({ tenantId: tenant.id, ...data } as any) as unknown as ClientRecord);
  /** Proyecto activo y con el registro abierto. */
  const openProject = async (tenant: Tenant, name: string) => {
    const p = await projects.create(tenant.id, actor, { name });
    await projects.transition(tenant.id, actor, p.id, 'activate');
    await ds.getRepository(RecruitmentProject).update({ id: p.id }, { registrationOpen: true });
    return p;
  };
  const registerFull = (
    tenant: Tenant,
    projectId: string,
    channel: 'email' | 'phone',
    destination: string,
    fullName = 'Persona Prueba',
    extra: { other?: { email?: string; phone?: string }; values?: Record<string, string> } = {},
  ) => prospects.register(tenant.id, projectId, { fullName, channel, destination, consentAt: new Date(), answers: [], ...extra });
  const register = async (tenant: Tenant, projectId: string, channel: 'email' | 'phone', destination: string, fullName = 'Persona Prueba') =>
    (await registerFull(tenant, projectId, channel, destination, fullName)).status;
  /** Prospecto anterior al modelo con contacto: sin vínculo. */
  const legacyProspect = (tenant: Tenant, projectId: string, email: string, fullName = 'Prospecto Anterior') =>
    ds.getRepository(ProjectProspect).save(ds.getRepository(ProjectProspect).create({ tenantId: tenant.id, projectId, fullName, email, answers: [], consentAt: new Date() }));

  beforeAll(async () => {
    db = await openTestDb();
    ds = db.ds;
    const audit = new TenantAuditService(ds.getRepository(TenantAuditLog));
    projects = new ProjectsService(ds.getRepository(RecruitmentProject), ds.getRepository(ProjectProspect), ds, audit);
    const portalConfig = makePortalConfig(ds, audit);
    prospects = new ProjectProspectsService(ds.getRepository(ProjectProspect), ds.getRepository(RecruitmentProject), ds.getRepository(ClientRecord), ds, audit, portalConfig);
    publicFace = new ProjectPublicService(ds.getRepository(RecruitmentProject), audit, {} as any, portalConfig, {} as any);
    const tenants = ds.getRepository(Tenant);
    const mk = (name: string, slug: string) => tenants.save(tenants.create({ name, slug, isActive: true, features: { reclutamiento: true } } as any) as unknown as Tenant);
    tenantA = await mk('Reclutadora A', 'reclutadora-a');
    tenantB = await mk('Reclutadora B', 'reclutadora-b');
  });

  afterAll(async () => {
    await db?.close();
  });

  describe('controlador', () => {
    it('exige owner/admin y el módulo reclutamiento', () => {
      const guards: any[] = Reflect.getMetadata(GUARDS_METADATA, ProjectsController);
      expect(guards).toEqual(expect.arrayContaining([TenantAdminGuard, ModuleFeatureGuard]));
      expect(Reflect.getMetadata(REQUIRES_FEATURE_KEY, ProjectsController)).toBe('reclutamiento');
    });
  });

  describe('proyectos', () => {
    it('crea en borrador, sin cliente ni acuerdo, con la dirección derivada del nombre', async () => {
      const p = await projects.create(tenantA.id, actor, { name: 'Panel Bogotá', description: 'Convocatoria 2026' });
      expect(p).toMatchObject({ name: 'Panel Bogotá', slug: 'panel-bogota', status: 'draft', description: 'Convocatoria 2026', registrationOpen: false, prospectCount: 0 });
    });

    it('repite el nombre sin chocar: la dirección automática recibe sufijo', async () => {
      const a = await projects.create(tenantA.id, actor, { name: 'Mismo Nombre' });
      const b = await projects.create(tenantA.id, actor, { name: 'Mismo Nombre' });
      expect(a.slug).toBe('mismo-nombre');
      expect(b.slug).toBe('mismo-nombre-2');
    });

    it('una dirección escrita que ya existe se rechaza, y otra cuenta puede repetirla', async () => {
      await projects.create(tenantA.id, actor, { name: 'Uno', slug: 'repetida' });
      expect((await rejects(projects.create(tenantA.id, actor, { name: 'Dos', slug: 'repetida' })))?.status).toBe(409);
      await expect(projects.create(tenantB.id, actor, { name: 'Dos', slug: 'repetida' })).resolves.toMatchObject({ slug: 'repetida' });
    });

    it('valida nombre y dirección', async () => {
      expect((await rejects(projects.create(tenantA.id, actor, { name: 'ab' })))?.status).toBe(400);
      expect((await rejects(projects.create(tenantA.id, actor, { name: 'Valido', slug: 'Con Espacios' })))?.status).toBe(400);
      expect((await rejects(projects.create(tenantA.id, actor, null as any)))?.status).toBe(400);
    });

    it('el ciclo de vida es borrador → activo ↔ pausado → terminado, y no admite saltos', async () => {
      const p = await projects.create(tenantA.id, actor, { name: 'Ciclo de vida' });
      expect((await rejects(projects.transition(tenantA.id, actor, p.id, 'pause')))?.status).toBe(409);
      expect((await rejects(projects.transition(tenantA.id, actor, p.id, 'end')))?.status).toBe(409);
      await projects.transition(tenantA.id, actor, p.id, 'activate');
      await projects.transition(tenantA.id, actor, p.id, 'pause');
      expect(await statusOf(p.id)).toBe('paused');
      expect((await rejects(projects.transition(tenantA.id, actor, p.id, 'activate')))?.status).toBe(409);
      await projects.transition(tenantA.id, actor, p.id, 'resume');
      await ds.getRepository(RecruitmentProject).update({ id: p.id }, { registrationOpen: true });
      const ended = await projects.transition(tenantA.id, actor, p.id, 'end');
      expect(ended).toMatchObject({ status: 'ended', registrationOpen: false });
      expect(ended.endedAt).toBeTruthy();
      expect((await rejects(projects.transition(tenantA.id, actor, p.id, 'resume')))?.status).toBe(409);
      expect((await rejects(projects.update(tenantA.id, actor, p.id, { name: 'Nuevo nombre' })))?.status).toBe(409);
    });

    it('guarda si el proyecto requiere contrato firmado (solo informativo)', async () => {
      const p = await projects.create(tenantA.id, actor, { name: 'Con contrato' });
      expect(p.requiresSignedContract).toBe(false);
      expect((await projects.create(tenantA.id, actor, { name: 'Con contrato desde el inicio', requiresSignedContract: true })).requiresSignedContract).toBe(true);
      await expect(projects.update(tenantA.id, actor, p.id, { requiresSignedContract: true })).resolves.toMatchObject({ requiresSignedContract: true });
      expect((await projects.list(tenantA.id, { search: 'Con contrato' })).data.every((x) => typeof x.requiresSignedContract === 'boolean')).toBe(true);
      expect((await rejects(projects.update(tenantA.id, actor, p.id, { requiresSignedContract: 'sí' })))?.status).toBe(400);
      // Activo también se puede cambiar; terminado no.
      await projects.transition(tenantA.id, actor, p.id, 'activate');
      await expect(projects.update(tenantA.id, actor, p.id, { requiresSignedContract: false })).resolves.toMatchObject({ requiresSignedContract: false });
      // No se expone en la cara pública.
      const info = await publicFace.publicInfo(await ds.getRepository(RecruitmentProject).findOneByOrFail({ id: p.id }));
      expect(JSON.stringify(info)).not.toContain('requiresSignedContract');
    });

    it('la dirección solo cambia en borrador', async () => {
      const p = await projects.create(tenantA.id, actor, { name: 'Dirección móvil' });
      await expect(projects.update(tenantA.id, actor, p.id, { slug: 'nueva-direccion' })).resolves.toMatchObject({ slug: 'nueva-direccion' });
      await projects.transition(tenantA.id, actor, p.id, 'activate');
      expect((await rejects(projects.update(tenantA.id, actor, p.id, { slug: 'otra-mas' })))?.status).toBe(409);
      await expect(projects.update(tenantA.id, actor, p.id, { name: 'Dirección fija' })).resolves.toMatchObject({ name: 'Dirección fija', slug: 'nueva-direccion' });
    });

    it('otra cuenta no ve ni toca el proyecto (404)', async () => {
      const p = await projects.create(tenantA.id, actor, { name: 'Solo de A' });
      expect((await rejects(projects.detail(tenantB.id, p.id)))?.status).toBe(404);
      expect((await rejects(projects.update(tenantB.id, actor, p.id, { name: 'Robado' })))?.status).toBe(404);
      expect((await rejects(projects.transition(tenantB.id, actor, p.id, 'activate')))?.status).toBe(404);
      expect((await rejects(projects.remove(tenantB.id, actor, p.id)))?.status).toBe(404);
      const list = await projects.list(tenantB.id, {});
      expect(list.data.find((x) => x.id === p.id)).toBeUndefined();
    });

    it('lista con filtro de estado y búsqueda', async () => {
      const p = await projects.create(tenantB.id, actor, { name: 'Buscable Único' });
      await projects.transition(tenantB.id, actor, p.id, 'activate');
      const byStatus = await projects.list(tenantB.id, { status: 'active' });
      expect(byStatus.data.map((x) => x.id)).toContain(p.id);
      expect(byStatus.data.every((x) => x.status === 'active')).toBe(true);
      const bySearch = await projects.list(tenantB.id, { search: 'buscable' });
      expect(bySearch.data.map((x) => x.id)).toEqual([p.id]);
      expect((await rejects(projects.list(tenantB.id, { status: 'borrado' })))?.status).toBe(400);
      // Los comodines del LIKE no son comodines.
      expect((await projects.list(tenantB.id, { search: '%' })).data).toHaveLength(0);
    });

    it('elimina un proyecto sin prospectos y rechaza uno con prospectos', async () => {
      const empty = await projects.create(tenantA.id, actor, { name: 'Vacío' });
      await expect(projects.remove(tenantA.id, actor, empty.id)).resolves.toEqual({ deleted: true });
      expect((await rejects(projects.detail(tenantA.id, empty.id)))?.status).toBe(404);

      const used = await openProject(tenantA, 'Con prospectos');
      await register(tenantA, used.id, 'email', 'alguien@correo.test');
      expect((await rejects(projects.remove(tenantA.id, actor, used.id)))?.status).toBe(409);
      expect(await statusOf(used.id)).toBe('active');
    });
  });

  describe('cara pública', () => {
    it('solo se sirve un proyecto activo de la cuenta', async () => {
      const p = await projects.create(tenantA.id, actor, { name: 'Pública', slug: 'publica-a' });
      const tenantOf = (t: Tenant) => t;
      expect((await rejects(publicFace.resolvePublic(tenantOf(tenantA), 'publica-a')))?.status).toBe(404);
      await projects.transition(tenantA.id, actor, p.id, 'activate');
      await expect(publicFace.resolvePublic(tenantA, 'publica-a')).resolves.toMatchObject({ id: p.id });
      expect((await rejects(publicFace.resolvePublic(tenantB, 'publica-a')))?.status).toBe(404);
      await projects.transition(tenantA.id, actor, p.id, 'pause');
      expect((await rejects(publicFace.resolvePublic(tenantA, 'publica-a')))?.status).toBe(404);
    });

    it('guarda ajustes y formulario, y los devuelve en la cara pública', async () => {
      const p = await projects.create(tenantA.id, actor, { name: 'Con formulario', slug: 'con-formulario' });
      await publicFace.updateSettings(tenantA.id, actor, p.id, { publicName: 'Súmate al panel', registrationOpen: true });
      await publicFace.updateForm(tenantA.id, actor, p.id, { questions: [{ id: 'ciudad', type: 'short', label: '¿En qué ciudad vives?', required: true }] });
      const face = await publicFace.get(tenantA.id, p.id);
      expect(face.settings).toEqual({ publicName: 'Súmate al panel', registrationOpen: true });
      expect(face.form.questions).toHaveLength(1);
      await projects.transition(tenantA.id, actor, p.id, 'activate');
      const project = await publicFace.resolvePublic(tenantA, 'con-formulario');
      const info = await publicFace.publicInfo(project);
      expect(info.project.name).toBe('Súmate al panel');
      expect(info.project.questions.map((q) => q.id)).toEqual(['ciudad']);
      expect(info.registrationOpen).toBe(true);
      expect(JSON.stringify(info)).not.toContain('Convocatoria');
    });
  });

  describe('datos personales del formulario', () => {
    it('guarda solo claves del catálogo del CRM y nunca el nombre', async () => {
      const p = await projects.create(tenantA.id, actor, { name: 'Datos personales form' });
      const saved = await publicFace.updateForm(tenantA.id, actor, p.id, { questions: [], fields: [{ key: 'ciudad', required: true }, { key: 'direccion' }] });
      expect(saved.fields).toEqual([{ key: 'ciudad', required: true }, { key: 'direccion', required: false }]);
      expect((await publicFace.get(tenantA.id, p.id)).form.fields).toHaveLength(2);
      expect((await rejects(publicFace.updateForm(tenantA.id, actor, p.id, { questions: [], fields: [{ key: 'no_existe' }] })))?.status).toBe(400);
      expect((await rejects(publicFace.updateForm(tenantA.id, actor, p.id, { questions: [], fields: [{ key: 'nombre_completo' }] })))?.status).toBe(400);
      // Una configuración rechazada no pisa la guardada.
      expect((await publicFace.get(tenantA.id, p.id)).form.fields).toHaveLength(2);
    });
  });

  describe('verificación del proyecto', () => {
    it('verificar por teléfono exige un número de WhatsApp de la cuenta y una plantilla; por correo no pide nada', async () => {
      const p = await projects.create(tenantA.id, actor, { name: 'Verificación' });
      const inboxes = ds.getRepository(Inbox);
      const mine = await inboxes.save(inboxes.create({ tenantId: tenantA.id, name: 'WhatsApp A', channel: 'whatsapp' }));
      const foreign = await inboxes.save(inboxes.create({ tenantId: tenantB.id, name: 'WhatsApp B', channel: 'whatsapp' }));
      const wa = (inboxId: string | null, templateName = 'codigo') => ({ inboxId, templateName, language: 'es' });
      const save = (verification: unknown) => publicFace.updateForm(tenantA.id, actor, p.id, { questions: [], fields: [], verification });

      expect((await rejects(save({ channels: [] })))?.status).toBe(400);
      expect((await rejects(save({ channels: ['phone'], whatsapp: wa(null) })))?.status).toBe(400);
      expect((await rejects(save({ channels: ['phone'], whatsapp: wa(mine.id, '') })))?.status).toBe(400);
      expect((await rejects(save({ channels: ['phone'], whatsapp: wa(foreign.id) })))?.status).toBe(400);
      expect((await rejects(save({ channels: ['both'] })))?.status).toBe(400);

      await expect(save({ channels: ['email'] })).resolves.toMatchObject({ verification: { channels: ['email'] } });
      const ok = await save({ channels: ['phone', 'email'], whatsapp: wa(mine.id) });
      expect(ok.verification).toEqual({ channels: ['phone', 'email'], whatsapp: { inboxId: mine.id, templateName: 'codigo', language: 'es' } });
      expect((await publicFace.get(tenantA.id, p.id)).form.verification?.channels).toEqual(['phone', 'email']);
      // Volver a heredar la de la cuenta.
      await expect(save(null)).resolves.toMatchObject({ verification: null });
    });
  });

  describe('registro de prospectos', () => {
    it('crea el contacto del CRM y el prospecto, vinculados', async () => {
      const p = await openProject(tenantA, 'Registro simple');
      const before = await ds.getRepository(ClientRecord).count({ where: { tenantId: tenantA.id } });
      const res = await registerFull(tenantA, p.id, 'phone', '573001119999', 'Nueva Persona', { other: { email: 'nueva@persona.test' } });
      expect(res.status).toBe('applied');
      expect(await ds.getRepository(ClientRecord).count({ where: { tenantId: tenantA.id } })).toBe(before + 1);
      const contact = await ds.getRepository(ClientRecord).findOneByOrFail({ id: res.recordId! });
      expect(contact).toMatchObject({ tenantId: tenantA.id, fullName: 'Nueva Persona', firstName: 'Nueva', lastName: 'Persona', phone: '573001119999', email: 'nueva@persona.test', source: 'landing_proyecto' });
      const row = await ds.getRepository(ProjectProspect).findOneByOrFail({ projectId: p.id });
      expect(row).toMatchObject({ recordId: contact.id, linkMethod: 'auto', role: 'participant', status: 'nuevo', fullName: 'Nueva Persona' });
      expect((await projects.detail(tenantA.id, p.id)).prospectCount).toBe(1);
    });

    it('con el correo verificado, el teléfono sin verificar se guarda solo si no es de otro contacto', async () => {
      await record(tenantA, { fullName: 'Dueño del número', phone: '573007770000' });
      const p = await openProject(tenantA, 'Teléfono ajeno');
      const res = await registerFull(tenantA, p.id, 'email', 'otra@persona.test', 'Otra Persona', { other: { phone: '573007770000' } });
      const contact = await ds.getRepository(ClientRecord).findOneByOrFail({ id: res.recordId! });
      expect(contact.email).toBe('otra@persona.test');
      expect(contact.phone).toBeNull();
      expect((await ds.getRepository(ProjectProspect).findOneByOrFail({ projectId: p.id })).phone).toBe('573007770000');
      const free = await registerFull(tenantA, p.id, 'email', 'libre@persona.test', 'Libre Persona', { other: { phone: '573008880000' } });
      expect((await ds.getRepository(ClientRecord).findOneByOrFail({ id: free.recordId! })).phone).toBe('573008880000');
    });

    it('los datos personales llenan el contacto nuevo, y en uno existente solo lo que estaba vacío', async () => {
      const existing = await record(tenantA, { fullName: 'Con ciudad', email: 'ciudad@persona.test', city: 'Cali' });
      const p = await openProject(tenantA, 'Datos personales');
      await registerFull(tenantA, p.id, 'email', 'ciudad@persona.test', 'Con ciudad', { values: { ciudad: 'Bogotá', direccion: 'Calle 1 # 2-3' } });
      const after = await ds.getRepository(ClientRecord).findOneByOrFail({ id: existing.id });
      expect(after).toMatchObject({ city: 'Cali', address: 'Calle 1 # 2-3' });
      const fresh = await registerFull(tenantA, p.id, 'email', 'fresca@persona.test', 'Persona Fresca', { values: { ciudad: 'Medellín' } });
      expect((await ds.getRepository(ClientRecord).findOneByOrFail({ id: fresh.recordId! })).city).toBe('Medellín');
    });

    it('reutiliza el contacto existente con ese correo o teléfono, con y sin indicativo, sin crear otro', async () => {
      const byEmail = await record(tenantA, { fullName: 'Marta Ruiz', email: 'Marta@Correo.test' });
      const byPhone = await record(tenantA, { fullName: 'Luis Peña', phone: '3105556677', countryCode: '+57' });
      const p = await openProject(tenantA, 'Contactos existentes');
      const before = await ds.getRepository(ClientRecord).count({ where: { tenantId: tenantA.id } });
      expect((await registerFull(tenantA, p.id, 'email', 'marta@correo.test')).recordId).toBe(byEmail.id);
      expect((await registerFull(tenantA, p.id, 'phone', '573105556677')).recordId).toBe(byPhone.id);
      const other = await openProject(tenantA, 'Contactos existentes sin indicativo');
      expect((await registerFull(tenantA, other.id, 'phone', '3105556677')).recordId).toBe(byPhone.id);
      expect(await ds.getRepository(ClientRecord).count({ where: { tenantId: tenantA.id } })).toBe(before);
    });

    it('con varios contactos con el mismo dato elige siempre el más antiguo (repetir da lo mismo)', async () => {
      const first = await record(tenantA, { fullName: 'Gemelo Uno', email: 'compartido@correo.test' });
      await new Promise((r) => setTimeout(r, 20));
      await record(tenantA, { fullName: 'Gemelo Dos', email: 'compartido@correo.test' });
      const p = await openProject(tenantA, 'Contactos repetidos');
      expect((await registerFull(tenantA, p.id, 'email', 'compartido@correo.test')).recordId).toBe(first.id);
      expect(await register(tenantA, p.id, 'email', 'compartido@correo.test')).toBe('existing');
    });

    it('no usa contactos de otra cuenta', async () => {
      const foreign = await record(tenantB, { fullName: 'De otra cuenta', email: 'ajeno@correo.test' });
      const p = await openProject(tenantA, 'Aislamiento');
      const res = await registerFull(tenantA, p.id, 'email', 'ajeno@correo.test');
      expect(res.recordId).not.toBe(foreign.id);
      expect((await ds.getRepository(ClientRecord).findOneByOrFail({ id: res.recordId! })).tenantId).toBe(tenantA.id);
    });

    it('la misma persona no se duplica en el proyecto, ni registrándose por el otro canal, pero sí puede estar en otro', async () => {
      const p1 = await openProject(tenantA, 'Duplicados uno');
      const p2 = await openProject(tenantA, 'Duplicados dos');
      const first = await registerFull(tenantA, p1.id, 'phone', '573001112233', 'Persona Doble', { other: { email: 'doble@persona.test' } });
      expect(first.status).toBe('applied');
      expect((await registerFull(tenantA, p1.id, 'phone', '573001112233')).status).toBe('existing');
      // Por el correo que dejó antes: es el mismo contacto, el mismo prospecto.
      expect(await register(tenantA, p1.id, 'email', 'doble@persona.test')).toBe('existing');
      const second = await registerFull(tenantA, p2.id, 'phone', '573001112233');
      expect(second.status).toBe('applied');
      expect(second.recordId).toBe(first.recordId);
      expect(await ds.getRepository(ProjectProspect).count({ where: { projectId: p1.id } })).toBe(1);
    });

    it('registros simultáneos de la misma persona dejan un contacto y un prospecto', async () => {
      const p = await openProject(tenantA, 'Carrera');
      const before = await ds.getRepository(ClientRecord).count({ where: { tenantId: tenantA.id } });
      const outcomes = await Promise.all(Array.from({ length: 6 }, () => register(tenantA, p.id, 'email', 'carrera@persona.test')));
      expect(outcomes.filter((o) => o === 'applied')).toHaveLength(1);
      expect(outcomes.filter((o) => o === 'existing')).toHaveLength(5);
      expect(await ds.getRepository(ProjectProspect).count({ where: { projectId: p.id } })).toBe(1);
      expect(await ds.getRepository(ClientRecord).count({ where: { tenantId: tenantA.id } })).toBe(before + 1);
    });

    it('no guarda nada si el proyecto no recibe registros', async () => {
      const draft = await projects.create(tenantA.id, actor, { name: 'En borrador' });
      const before = await ds.getRepository(ClientRecord).count({ where: { tenantId: tenantA.id } });
      expect(await register(tenantA, draft.id, 'email', 'a@b.test')).toBe('closed');
      const p = await openProject(tenantA, 'Cerrado luego');
      await ds.getRepository(RecruitmentProject).update({ id: p.id }, { registrationOpen: false });
      expect(await register(tenantA, p.id, 'email', 'a@b.test')).toBe('closed');
      await ds.getRepository(RecruitmentProject).update({ id: p.id }, { registrationOpen: true });
      await projects.transition(tenantA.id, actor, p.id, 'pause');
      expect(await register(tenantA, p.id, 'email', 'a@b.test')).toBe('closed');
      // Un proyecto de otra cuenta no acepta registros por esta.
      const other = await openProject(tenantB, 'Ajeno');
      expect(await register(tenantA, other.id, 'email', 'a@b.test')).toBe('closed');
      expect(await ds.getRepository(ProjectProspect).count({ where: { projectId: other.id } })).toBe(0);
      expect(await ds.getRepository(ClientRecord).count({ where: { tenantId: tenantA.id } })).toBe(before);
    });
  });

  describe('agregar un contacto al proyecto', () => {
    it('lo agrega como prospecto manual, sin consentimiento de la landing, y no lo duplica', async () => {
      const contact = await record(tenantA, { fullName: 'Desde Chat', phone: '3001234567', countryCode: '+57', email: 'Chat@Correo.test' });
      const p = await projects.create(tenantA.id, actor, { name: 'Desde chats' });
      const added = await prospects.addRecord(tenantA.id, actor, p.id, contact.id);
      expect(added).toMatchObject({ fullName: 'Desde Chat', email: 'chat@correo.test', phone: '573001234567', role: 'participant', status: 'nuevo', source: 'manual', consentAt: null, link: { method: 'manual', record: { id: contact.id } } });
      expect(await ds.getRepository(ProjectProspect).findOneByOrFail({ id: added.id })).toMatchObject({ addedBy: actor.id, recordId: contact.id });
      expect((await rejects(prospects.addRecord(tenantA.id, actor, p.id, contact.id)))?.status).toBe(409);
      // Ya registrado por la landing también cuenta como «ya está».
      const q = await openProject(tenantA, 'Desde chats con landing');
      await register(tenantA, q.id, 'email', 'chat@correo.test');
      expect((await rejects(prospects.addRecord(tenantA.id, actor, q.id, contact.id)))?.status).toBe(409);
      expect((await prospects.forRecord(tenantA.id, contact.id)).data).toHaveLength(2);
    });

    it('no admite proyectos terminados, contactos ajenos o borrados, ni otra cuenta', async () => {
      const contact = await record(tenantA, { fullName: 'Contacto A' });
      const foreign = await record(tenantB, { fullName: 'Contacto B' });
      const gone = await record(tenantA, { fullName: 'Borrado', deletedAt: new Date() } as any);
      const p = await openProject(tenantA, 'Para agregar');
      expect((await rejects(prospects.addRecord(tenantA.id, actor, p.id, foreign.id)))?.status).toBe(404);
      expect((await rejects(prospects.addRecord(tenantA.id, actor, p.id, gone.id)))?.status).toBe(404);
      expect((await rejects(prospects.addRecord(tenantA.id, actor, p.id, 'x')))?.status).toBe(400);
      expect((await rejects(prospects.addRecord(tenantB.id, actor, p.id, foreign.id)))?.status).toBe(404);
      await projects.transition(tenantA.id, actor, p.id, 'end');
      expect((await rejects(prospects.addRecord(tenantA.id, actor, p.id, contact.id)))?.status).toBe(409);
    });

    it('agregar a la vez desde dos lugares deja un solo prospecto', async () => {
      const contact = await record(tenantA, { fullName: 'Carrera Chat' });
      const p = await projects.create(tenantA.id, actor, { name: 'Carrera desde chats' });
      const res = await Promise.allSettled(Array.from({ length: 4 }, () => prospects.addRecord(tenantA.id, actor, p.id, contact.id)));
      expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(await ds.getRepository(ProjectProspect).count({ where: { projectId: p.id } })).toBe(1);
    });
  });

  describe('campos del contacto de Reclutamiento', () => {
    it('crea estrato, ocupación y nivel educativo una sola vez, sin tocar un campo propio con la misma clave', async () => {
      const fields = ds.getRepository(CustomField);
      await fields.save(fields.create({ tenantId: tenantB.id, fieldKey: 'ocupacion', fieldLabel: 'A qué se dedica', fieldType: 'text', sortOrder: 7 }));
      expect(await ensureRecruitmentFields(ds.manager, tenantB.id)).toBe(2);
      expect(await ensureRecruitmentFields(ds.manager, tenantB.id)).toBe(0);
      const rows = await fields.find({ where: { tenantId: tenantB.id }, order: { sortOrder: 'ASC' } });
      expect(rows.map((f) => [f.fieldKey, f.fieldLabel, f.fieldType])).toEqual([
        ['ocupacion', 'A qué se dedica', 'text'],
        ['estrato', 'Estrato socioeconómico', 'select'],
        ['nivel_educativo', 'Nivel educativo', 'select'],
      ]);
      // Quedan disponibles para el formulario del proyecto.
      const catalog = (await makePortalConfig(ds, new TenantAuditService(ds.getRepository(TenantAuditLog))).fieldCatalog(tenantB.id)).map((f) => f.key);
      expect(catalog).toEqual(expect.arrayContaining(['estrato', 'ocupacion', 'nivel_educativo']));
    });
  });

  describe('perfiles del proyecto', () => {
    it('acepta uno o varios perfiles, con un perfil de entrada válido, y moderadores solo si se aceptan', async () => {
      const p = await projects.create(tenantA.id, actor, { name: 'Perfiles' });
      expect(p).toMatchObject({ roles: ['participant'], defaultRole: 'participant', moderatorSignup: false });
      const both = await projects.update(tenantA.id, actor, p.id, { roles: ['surveyor', 'participant'], defaultRole: 'surveyor' });
      expect(both).toMatchObject({ roles: ['participant', 'surveyor'], defaultRole: 'surveyor' });
      expect((await rejects(projects.update(tenantA.id, actor, p.id, { roles: [] })))?.status).toBe(400);
      expect((await rejects(projects.update(tenantA.id, actor, p.id, { roles: ['jefe'] })))?.status).toBe(400);
      expect((await rejects(projects.update(tenantA.id, actor, p.id, { defaultRole: 'moderator' })))?.status).toBe(400);
      expect((await rejects(projects.update(tenantA.id, actor, p.id, { moderatorSignup: true })))?.status).toBe(400);
      const mod = await projects.update(tenantA.id, actor, p.id, { roles: ['participant', 'moderator'], moderatorSignup: true });
      // Al quitar el perfil de entrada, se toma el primero que quede.
      expect(mod).toMatchObject({ roles: ['participant', 'moderator'], defaultRole: 'participant', moderatorSignup: true });
      expect((await rejects(projects.update(tenantA.id, actor, p.id, { defaultRole: 'moderator' })))?.status).toBe(400);
      // Al dejar de aceptar moderadores, se apaga la postulación como moderador.
      expect(await projects.update(tenantA.id, actor, p.id, { roles: ['participant'] })).toMatchObject({ moderatorSignup: false });
      // Un proyecto solo de moderadores entra como moderador.
      expect(await projects.update(tenantA.id, actor, p.id, { roles: ['moderator'], defaultRole: 'moderator' })).toMatchObject({ defaultRole: 'moderator' });
    });

    it('la landing ofrece los perfiles aceptados, y moderador solo con la postulación activa', async () => {
      const p = await openProject(tenantA, 'Oferta de perfiles');
      const offered = async () => (await publicFace.publicInfo(await ds.getRepository(RecruitmentProject).findOneByOrFail({ id: p.id }))).project.roles.map((r) => r.key);
      expect(await offered()).toEqual(['participant']);
      await projects.update(tenantA.id, actor, p.id, { roles: ['participant', 'surveyor', 'moderator'] });
      expect(await offered()).toEqual(['participant', 'surveyor']);
      await projects.update(tenantA.id, actor, p.id, { moderatorSignup: true });
      expect(await offered()).toEqual(['participant', 'surveyor', 'moderator']);
    });
  });

  describe('acciones de los flujos', () => {
    const flow = (tenant: Tenant, recordId: string | null, actions: any[]) => prospects.applyFlowActions(tenant.id, recordId, actions);

    it('agrega con perfil y estado, sin usuario, y no duplica', async () => {
      const contact = await record(tenantA, { fullName: 'Desde Flujo', email: 'flujo@persona.test' });
      const p = await openProject(tenantA, 'Flujo agregar');
      await projects.update(tenantA.id, actor, p.id, { roles: ['participant', 'surveyor'] });
      const notes = await flow(tenantA, contact.id, [{ type: 'add', projectId: p.id, role: 'surveyor', status: 'en_contacto' }]);
      expect(notes).toEqual(['Flujo: agregado a «Flujo agregar» como encuestador (En contacto).']);
      const row = await ds.getRepository(ProjectProspect).findOneByOrFail({ projectId: p.id, recordId: contact.id });
      expect(row).toMatchObject({ role: 'surveyor', status: 'en_contacto', source: 'manual', addedBy: null, decidedBy: null });
      const h = (await prospects.history(tenantA.id, p.id, row.id)).data;
      expect(h).toEqual([expect.objectContaining({ fromStatus: null, toStatus: 'en_contacto', byTeam: false, by: 'flow' })]);
      expect(await flow(tenantA, contact.id, [{ type: 'add', projectId: p.id }])).toEqual(['Flujo: ya estaba en «Flujo agregar»; no se cambió nada.']);
      expect(await ds.getRepository(ProjectProspect).count({ where: { projectId: p.id } })).toBe(1);
    });

    it('cambia el estado solo si ya está en el proyecto, y lo deja en el historial', async () => {
      const contact = await record(tenantA, { fullName: 'Estado Flujo' });
      const p = await openProject(tenantA, 'Flujo estado');
      expect(await flow(tenantA, contact.id, [{ type: 'status', projectId: p.id, status: 'seleccionado' }])).toEqual([
        'Flujo: no se cambió el estado porque el contacto no está en «Flujo estado».',
      ]);
      // Se pueden encadenar: agregar y luego cambiar el estado en la misma acción.
      const notes = await flow(tenantA, contact.id, [
        { type: 'add', projectId: p.id },
        { type: 'status', projectId: p.id, status: 'seleccionado' },
        { type: 'status', projectId: p.id, status: 'seleccionado' },
        { type: 'status', projectId: p.id, status: 'calificado' },
      ]);
      expect(notes).toEqual([
        'Flujo: agregado a «Flujo estado» como participante (Nuevo).',
        'Flujo: estado en «Flujo estado» cambiado a «Seleccionado».',
        'Flujo: ya estaba en «Seleccionado» en «Flujo estado».',
        'Flujo: la acción sobre «Flujo estado» no tiene un estado válido.',
      ]);
      const row = await ds.getRepository(ProjectProspect).findOneByOrFail({ projectId: p.id, recordId: contact.id });
      expect(row.status).toBe('seleccionado');
      expect((await prospects.history(tenantA.id, p.id, row.id)).data.map((e) => [e.fromStatus, e.toStatus, e.by])).toEqual([
        ['nuevo', 'seleccionado', 'flow'],
        [null, 'nuevo', 'flow'],
      ]);
    });

    it('guarda respuestas del formulario: preguntas en el prospecto y datos personales en el contacto', async () => {
      const contact = await record(tenantA, { fullName: 'Respuestas Flujo', city: 'Cali' });
      const p = await openProject(tenantA, 'Flujo respuestas');
      await publicFace.updateForm(tenantA.id, actor, p.id, {
        questions: [
          { id: 'medio', type: 'single', label: '¿Cómo te enteraste?', options: ['Redes sociales', 'Un amigo'] },
          { id: 'horario', type: 'multi', label: 'Horario', options: ['Mañana', 'Tarde', 'Noche'] },
          { id: 'moto', type: 'yesno', label: '¿Tienes moto?' },
          { id: 'edad', type: 'number', label: 'Edad', min: 18, max: 99 },
          { id: 'dia', type: 'date', label: 'Día disponible' },
        ],
        fields: [{ key: 'ciudad' }, { key: 'direccion' }],
      });
      const answers = [
        { item: 'question:medio', value: 'redes SOCIALES' },
        { item: 'question:horario', value: 'mañana, noche' },
        { item: 'question:moto', value: 'Sí' },
        { item: 'question:edad', value: '12' },
        { item: 'question:dia', value: '5/3/2026' },
        { item: 'question:borrada', value: 'x' },
        { item: 'field:ciudad', value: 'Bogotá' },
        { item: 'field:direccion', value: 'Calle 1 # 2-3' },
      ];
      expect(await flow(tenantA, contact.id, [{ type: 'answers', projectId: p.id, answers }])).toEqual(['Flujo: no se guardaron respuestas porque el contacto no está en «Flujo respuestas».']);
      await flow(tenantA, contact.id, [{ type: 'add', projectId: p.id }]);
      const [note] = await flow(tenantA, contact.id, [{ type: 'answers', projectId: p.id, answers }]);
      expect(note).toContain('se guardó «¿Cómo te enteraste?», «Horario», «¿Tienes moto?», «Día disponible», «Ciudad», «Dirección»');
      expect(note).toContain('«Edad» (el valor «12» no es válido)');
      expect(note).toContain('una pregunta que ya no está en el formulario');
      const row = await ds.getRepository(ProjectProspect).findOneByOrFail({ projectId: p.id, recordId: contact.id });
      expect(row.answers).toEqual([
        { id: 'medio', label: '¿Cómo te enteraste?', type: 'single', value: 'Redes sociales' },
        { id: 'horario', label: 'Horario', type: 'multi', value: ['Mañana', 'Noche'] },
        { id: 'moto', label: '¿Tienes moto?', type: 'yesno', value: true },
        { id: 'dia', label: 'Día disponible', type: 'date', value: '2026-03-05' },
      ]);
      const updated = await ds.getRepository(ClientRecord).findOneByOrFail({ id: contact.id });
      expect(updated).toMatchObject({ city: 'Bogotá', address: 'Calle 1 # 2-3' });
      // «Solo si está vacío» no reemplaza respuestas ni datos que ya existen.
      const [again] = await flow(tenantA, contact.id, [{ type: 'answers', projectId: p.id, onlyIfEmpty: true, answers: [{ item: 'question:medio', value: 'Un amigo' }, { item: 'field:ciudad', value: 'Medellín' }] }]);
      expect(again).toBe('Flujo: no se guardaron respuestas en «Flujo respuestas»: «¿Cómo te enteraste?» (ya tenía respuesta), «Ciudad» (ya tenía valor).');
      expect((await ds.getRepository(ClientRecord).findOneByOrFail({ id: contact.id })).city).toBe('Bogotá');
    });

    it('respeta las reglas del proyecto y nunca toca otra cuenta', async () => {
      const contact = await record(tenantA, { fullName: 'Reglas Flujo' });
      const foreignProject = await openProject(tenantB, 'De la otra cuenta');
      const onlyParticipants = await openProject(tenantA, 'Solo participantes');
      const ended = await openProject(tenantA, 'Terminado flujo');
      await projects.transition(tenantA.id, actor, ended.id, 'end');
      const notes = await flow(tenantA, contact.id, [
        { type: 'add', projectId: foreignProject.id },
        { type: 'add', projectId: onlyParticipants.id, role: 'moderator' },
        { type: 'add', projectId: ended.id },
      ]);
      expect(notes).toEqual([
        'Flujo: el proyecto de la acción «Agregar a proyecto» ya no existe.',
        'Flujo: no se agregó a «Solo participantes» porque el proyecto no acepta moderadores.',
        'Flujo: no se agregó a «Terminado flujo» porque el proyecto terminó.',
      ]);
      expect(await ds.getRepository(ProjectProspect).count({ where: { recordId: contact.id } })).toBe(0);
      // Un contacto de otra cuenta tampoco sirve.
      const foreignContact = await record(tenantB, { fullName: 'Ajeno Flujo' });
      expect(await flow(tenantA, foreignContact.id, [{ type: 'add', projectId: onlyParticipants.id }])).toEqual(['Flujo: las acciones de proyecto no se aplicaron porque el contacto no existe.']);
    });

    it('da los proyectos del contacto para las condiciones, solo de su cuenta y con el módulo activo', async () => {
      const contact = await record(tenantA, { fullName: 'Condiciones', email: 'condiciones@persona.test' });
      const p1 = await openProject(tenantA, 'Condición uno');
      const p2 = await openProject(tenantA, 'Condición dos');
      await projects.update(tenantA.id, actor, p2.id, { roles: ['participant', 'surveyor'] });
      await flow(tenantA, contact.id, [
        { type: 'add', projectId: p1.id, status: 'en_espera' },
        { type: 'add', projectId: p2.id, role: 'surveyor' },
      ]);
      expect(await prospects.flowMemberships(tenantA.id, contact.id)).toEqual({
        [p1.id]: { status: 'en_espera', role: 'participant' },
        [p2.id]: { status: 'nuevo', role: 'surveyor' },
      });
      expect(await prospects.flowMemberships(tenantB.id, contact.id)).toEqual({});
      expect(await prospects.flowMemberships(tenantA.id, null)).toEqual({});
      // Con el módulo apagado, las condiciones de proyecto no ven nada.
      const tenants = ds.getRepository(Tenant);
      await tenants.update({ id: tenantA.id }, { features: { reclutamiento: false } } as any);
      try {
        expect(await prospects.flowMemberships(tenantA.id, contact.id)).toEqual({});
      } finally {
        await tenants.update({ id: tenantA.id }, { features: { reclutamiento: true } } as any);
      }
    });

    it('sin contacto o sin Reclutamiento activo no hace nada', async () => {
      const p = await openProject(tenantA, 'Sin contacto flujo');
      expect(await flow(tenantA, null, [{ type: 'add', projectId: p.id }])).toEqual([
        'Flujo: las acciones de proyecto no se aplicaron porque la conversación no tiene un contacto vinculado.',
      ]);
      const tenants = ds.getRepository(Tenant);
      const off = await tenants.save(tenants.create({ name: 'Sin reclutamiento', slug: 'sin-reclutamiento', isActive: true, features: {} } as any) as unknown as Tenant);
      const c = await record(off, { fullName: 'X' });
      expect(await flow(off, c.id, [{ type: 'add', projectId: p.id }])).toEqual(['Flujo: las acciones de proyecto no se aplicaron porque Reclutamiento no está activo en la cuenta.']);
      expect(await flow(tenantA, c.id, [])).toEqual([]);
    });
  });

  describe('estado del prospecto', () => {
    it('entra como «Nuevo», se mueve entre los estados y guarda el motivo solo al descartar', async () => {
      const p = await openProject(tenantA, 'Estados');
      await register(tenantA, p.id, 'email', 'estado@persona.test');
      const prospect = await ds.getRepository(ProjectProspect).findOneByOrFail({ projectId: p.id });
      expect(prospect).toMatchObject({ role: 'participant', status: 'nuevo' });
      // Los estados anteriores al catálogo simple ya no existen.
      expect((await rejects(prospects.setStatus(tenantA.id, actor, p.id, prospect.id, { status: 'calificado' })))?.status).toBe(400);
      expect((await rejects(prospects.setStatus(tenantA.id, actor, p.id, prospect.id, { status: 'archivado' })))?.status).toBe(400);
      expect((await prospects.setStatus(tenantA.id, actor, p.id, prospect.id, { status: 'en_evaluacion', reason: 'ignorado' })).statusReason).toBeNull();
      const out = await prospects.setStatus(tenantA.id, actor, p.id, prospect.id, { status: 'no_seleccionado', reason: 'Fuera de zona' });
      expect(out).toMatchObject({ status: 'no_seleccionado', statusReason: 'Fuera de zona' });
      expect(await ds.getRepository(ProjectProspect).findOneByOrFail({ id: prospect.id })).toMatchObject({ decidedBy: actor.id });
      expect(await prospects.setStatus(tenantA.id, actor, p.id, prospect.id, { status: 'nuevo' })).toMatchObject({ status: 'nuevo', statusReason: null, decidedAt: null });
      expect((await prospects.list(tenantA.id, p.id, { status: 'nuevo' })).total).toBe(1);
      expect((await prospects.list(tenantA.id, p.id, { status: 'seleccionado' })).total).toBe(0);
      expect((await rejects(prospects.list(tenantA.id, p.id, { status: 'x' })))?.status).toBe(400);
    });

    it('guarda el historial de cada cambio, en orden y sin repetir los que no cambian nada', async () => {
      const p = await openProject(tenantA, 'Historial');
      await register(tenantA, p.id, 'email', 'historial@persona.test');
      const prospect = await ds.getRepository(ProjectProspect).findOneByOrFail({ projectId: p.id });
      await prospects.setStatus(tenantA.id, actor, p.id, prospect.id, { status: 'en_contacto' });
      await prospects.setStatus(tenantA.id, actor, p.id, prospect.id, { status: 'en_contacto' });
      await prospects.setStatus(tenantA.id, actor, p.id, prospect.id, { status: 'no_participo', reason: 'Viajó' });
      const h = (await prospects.history(tenantA.id, p.id, prospect.id)).data;
      expect(h.map((e) => [e.fromStatus, e.toStatus, e.byTeam])).toEqual([
        ['en_contacto', 'no_participo', true],
        ['nuevo', 'en_contacto', true],
        [null, 'nuevo', false],
      ]);
      expect(h[0].reason).toBe('Viajó');
      expect((await rejects(prospects.history(tenantB.id, p.id, prospect.id)))?.status).toBe(404);
    });

    it('cambia de perfil solo a uno que el proyecto acepta, y vuelve a «Nuevo»', async () => {
      const p = await openProject(tenantA, 'Cambio de perfil');
      await register(tenantA, p.id, 'email', 'perfil@persona.test');
      const prospect = await ds.getRepository(ProjectProspect).findOneByOrFail({ projectId: p.id });
      await prospects.setStatus(tenantA.id, actor, p.id, prospect.id, { status: 'seleccionado' });
      expect((await rejects(prospects.setRole(tenantA.id, actor, p.id, prospect.id, { role: 'moderator' })))?.status).toBe(400);
      await projects.update(tenantA.id, actor, p.id, { roles: ['participant', 'moderator'] });
      const changed = await prospects.setRole(tenantA.id, actor, p.id, prospect.id, { role: 'moderator' });
      expect(changed).toMatchObject({ role: 'moderator', status: 'nuevo' });
      const last = (await prospects.history(tenantA.id, p.id, prospect.id)).data[0];
      expect(last).toMatchObject({ fromRole: 'participant', role: 'moderator', fromStatus: 'seleccionado', toStatus: 'nuevo' });
      expect((await prospects.list(tenantA.id, p.id, { role: 'moderator' })).total).toBe(1);
      expect((await prospects.list(tenantA.id, p.id, {})).roleCounts).toEqual({ moderator: 1 });
      expect((await rejects(prospects.list(tenantA.id, p.id, { role: 'jefe' })))?.status).toBe(400);
    });

    it('agregar desde un chat permite elegir el estado de entrada, y lo deja en el historial', async () => {
      const contact = await record(tenantA, { fullName: 'Ya Seleccionada' });
      const p = await projects.create(tenantA.id, actor, { name: 'Estado de entrada' });
      expect((await rejects(prospects.addRecord(tenantA.id, actor, p.id, contact.id, undefined, 'calificado')))?.status).toBe(400);
      const added = await prospects.addRecord(tenantA.id, actor, p.id, contact.id, undefined, 'seleccionado');
      expect(added).toMatchObject({ role: 'participant', status: 'seleccionado' });
      expect(added.decidedAt).toBeTruthy();
      expect((await prospects.history(tenantA.id, p.id, added.id)).data).toEqual([expect.objectContaining({ fromStatus: null, toStatus: 'seleccionado', byTeam: true })]);
      const other = await record(tenantA, { fullName: 'Sin estado' });
      expect(await prospects.addRecord(tenantA.id, actor, p.id, other.id)).toMatchObject({ status: 'nuevo', decidedAt: null });
    });

    it('agregar desde un chat respeta los perfiles del proyecto', async () => {
      const contact = await record(tenantA, { fullName: 'Moderadora Chat' });
      const p = await projects.create(tenantA.id, actor, { name: 'Moderadores desde chat' });
      expect((await rejects(prospects.addRecord(tenantA.id, actor, p.id, contact.id, 'moderator')))?.status).toBe(400);
      expect((await rejects(prospects.addRecord(tenantA.id, actor, p.id, contact.id, 'jefe')))?.status).toBe(400);
      await projects.update(tenantA.id, actor, p.id, { roles: ['participant', 'moderator'] });
      expect(await prospects.addRecord(tenantA.id, actor, p.id, contact.id, 'moderator')).toMatchObject({ role: 'moderator', status: 'nuevo' });
    });

    it('otra cuenta no puede cambiarlo (404)', async () => {
      const p = await openProject(tenantA, 'Estados ajenos');
      await register(tenantA, p.id, 'email', 'ajeno-estado@persona.test');
      const prospect = await ds.getRepository(ProjectProspect).findOneByOrFail({ projectId: p.id });
      expect((await rejects(prospects.setStatus(tenantB.id, actor, p.id, prospect.id, { status: 'seleccionado' })))?.status).toBe(404);
      expect((await rejects(prospects.rate(tenantB.id, actor, p.id, prospect.id, { rating: 5 })))?.status).toBe(404);
    });
  });

  describe('calificación y resumen de la persona', () => {
    it('una calificación de 1 a 5 por proyecto, con nota; promedio, participaciones y última participación en la cuenta', async () => {
      const contact = await record(tenantA, { fullName: 'Calificada', email: 'calificada@persona.test' });
      const p1 = await openProject(tenantA, 'Calificación uno');
      const p2 = await openProject(tenantA, 'Calificación dos');
      await register(tenantA, p1.id, 'email', 'calificada@persona.test');
      await register(tenantA, p2.id, 'email', 'calificada@persona.test');
      const [a, b] = await Promise.all([p1, p2].map((p) => ds.getRepository(ProjectProspect).findOneByOrFail({ projectId: p.id })));
      for (const bad of [0, 6, 2.5, 'cinco']) expect((await rejects(prospects.rate(tenantA.id, actor, p1.id, a.id, { rating: bad })))?.status).toBe(400);
      expect(await prospects.rate(tenantA.id, actor, p1.id, a.id, { rating: 5, note: 'Muy puntual' })).toMatchObject({ rating: 5, ratingNote: 'Muy puntual' });
      await prospects.rate(tenantA.id, actor, p2.id, b.id, { rating: 2 });
      // Participó en uno; volver a marcarlo en el mismo proyecto cuenta una vez.
      await prospects.setStatus(tenantA.id, actor, p1.id, a.id, { status: 'participo' });
      await prospects.setStatus(tenantA.id, actor, p1.id, a.id, { status: 'seleccionado' });
      await prospects.setStatus(tenantA.id, actor, p1.id, a.id, { status: 'participo' });
      const row = (await prospects.list(tenantA.id, p1.id, {})).data[0];
      expect(row.person).toMatchObject({ ratingAverage: 3.5, ratingCount: 2, participations: 1 });
      expect(row.person?.lastParticipationAt).toBeTruthy();
      const fromContact = await prospects.forRecord(tenantA.id, contact.id);
      expect(fromContact.summary).toMatchObject({ ratingAverage: 3.5, participations: 1 });
      expect(fromContact.data.map((d) => d.rating).sort()).toEqual([2, 5]);
      // Quitar la calificación.
      expect(await prospects.rate(tenantA.id, actor, p2.id, b.id, { rating: null })).toMatchObject({ rating: null, ratingNote: null, ratedAt: null });
      expect((await prospects.forRecord(tenantA.id, contact.id)).summary).toMatchObject({ ratingAverage: 5, ratingCount: 1 });
    });

    it('al eliminar al prospecto se va su historial', async () => {
      const p = await openProject(tenantA, 'Historial borrado');
      await register(tenantA, p.id, 'email', 'borrar-historial@persona.test');
      const prospect = await ds.getRepository(ProjectProspect).findOneByOrFail({ projectId: p.id });
      await prospects.remove(tenantA.id, actor, p.id, prospect.id);
      expect(await ds.getRepository(ProspectStatusEvent).count({ where: { prospectId: prospect.id } })).toBe(0);
    });
  });

  describe('vínculo con contactos', () => {
    it('un contacto queda vinculado a prospectos de varios proyectos', async () => {
      const contact = await record(tenantA, { fullName: 'Ana Varios', email: 'varios@correo.test' });
      const p1 = await openProject(tenantA, 'Varios uno');
      const p2 = await openProject(tenantA, 'Varios dos');
      await register(tenantA, p1.id, 'email', 'varios@correo.test');
      await register(tenantA, p2.id, 'email', 'varios@correo.test');
      const res = await prospects.forRecord(tenantA.id, contact.id);
      expect(res.data.map((r) => r.projectName).sort()).toEqual(['Varios dos', 'Varios uno']);
      expect(res.data.every((r) => r.linkMethod === 'auto')).toBe(true);
      expect((await prospects.forRecord(tenantB.id, contact.id)).data).toHaveLength(0);
    });

    it('«Buscar coincidencias» vincula prospectos anteriores al modelo y deja los ambiguos', async () => {
      const p = await openProject(tenantA, 'Vínculo posterior');
      await legacyProspect(tenantA, p.id, 'tarde@correo.test');
      await legacyProspect(tenantA, p.id, 'doble@correo.test');
      await legacyProspect(tenantA, p.id, 'nadie@correo.test');
      const late = await record(tenantA, { fullName: 'Llegó Tarde', email: 'tarde@correo.test' });
      await record(tenantA, { fullName: 'Doble A', email: 'doble@correo.test' });
      await record(tenantA, { fullName: 'Doble B', email: 'doble@correo.test' });
      expect(await prospects.autoLink(tenantA.id, actor, p.id)).toEqual({ linked: 1, ambiguous: 1, unmatched: 1 });
      const tarde = await ds.getRepository(ProjectProspect).findOneByOrFail({ projectId: p.id, email: 'tarde@correo.test' });
      expect(tarde).toMatchObject({ recordId: late.id, linkMethod: 'auto', linkedBy: actor.id });
      expect(await prospects.autoLink(tenantA.id, actor, p.id)).toEqual({ linked: 0, ambiguous: 1, unmatched: 1 });
    });

    it('vínculo manual y desvinculación; no admite contactos de otra cuenta ni borrados', async () => {
      const p = await openProject(tenantA, 'Vínculo manual');
      const prospect = await legacyProspect(tenantA, p.id, 'manual@correo.test', 'Persona Manual');
      const mine = await record(tenantA, { fullName: 'Contacto Propio', email: 'otro-correo@correo.test' });
      const foreign = await record(tenantB, { fullName: 'Contacto Ajeno' });
      const deleted = await record(tenantA, { fullName: 'Contacto Borrado', deletedAt: new Date() } as any);

      expect((await rejects(prospects.link(tenantA.id, actor, p.id, prospect.id, foreign.id)))?.status).toBe(404);
      expect((await rejects(prospects.link(tenantA.id, actor, p.id, prospect.id, deleted.id)))?.status).toBe(404);
      expect((await rejects(prospects.link(tenantA.id, actor, p.id, prospect.id, 'no-es-uuid')))?.status).toBe(400);
      expect((await rejects(prospects.link(tenantB.id, actor, p.id, prospect.id, foreign.id)))?.status).toBe(404);

      const linked = await prospects.link(tenantA.id, actor, p.id, prospect.id, mine.id);
      expect(linked.link).toMatchObject({ method: 'manual', record: { id: mine.id, name: 'Contacto Propio' } });
      expect((await prospects.unlink(tenantA.id, actor, p.id, prospect.id)).link).toBeNull();
      expect(await ds.getRepository(ProjectProspect).findOneByOrFail({ id: prospect.id })).toMatchObject({ recordId: null, linkMethod: null, linkedAt: null });
    });

    it('sugiere candidatos por datos y por búsqueda, sin salir de la cuenta', async () => {
      const p = await openProject(tenantA, 'Candidatos');
      const prospect = await legacyProspect(tenantA, p.id, 'cand@correo.test');
      await record(tenantA, { fullName: 'Candidata Uno', email: 'cand@correo.test' });
      await record(tenantA, { fullName: 'Candidata Uno', email: 'cand@correo.test' });
      await record(tenantA, { fullName: 'Rosa Buscada', email: 'rosa@correo.test' });
      await record(tenantB, { fullName: 'Rosa Buscada', email: 'rosa@correo.test' });
      const byData = await prospects.candidates(tenantA.id, p.id, prospect.id);
      expect(byData.data).toHaveLength(2);
      expect(byData.data.every((c) => c.matchesData)).toBe(true);
      expect((await prospects.candidates(tenantA.id, p.id, prospect.id, 'rosa')).data.filter((c) => !c.matchesData)).toHaveLength(1);
    });
  });

  describe('listado y eliminación de prospectos', () => {
    it('lista con búsqueda y filtro de vinculados, y respeta el aislamiento por cuenta', async () => {
      const p = await openProject(tenantA, 'Listado');
      const contact = await record(tenantA, { fullName: 'Vinculada', email: 'vinculada@correo.test' });
      await register(tenantA, p.id, 'email', 'vinculada@correo.test', 'Elena Vinculada');
      await legacyProspect(tenantA, p.id, 'suelto@correo.test', 'Pedro Suelto');
      const all = await prospects.list(tenantA.id, p.id, {});
      expect(all.total).toBe(2);
      const linked = await prospects.list(tenantA.id, p.id, { linked: 'yes' });
      expect(linked.data.map((r) => r.fullName)).toEqual(['Elena Vinculada']);
      expect(linked.data[0].link?.record?.id).toBe(contact.id);
      expect((await prospects.list(tenantA.id, p.id, { linked: 'no' })).data.map((r) => r.fullName)).toEqual(['Pedro Suelto']);
      expect((await prospects.list(tenantA.id, p.id, { search: 'pedro' })).total).toBe(1);
      expect((await prospects.list(tenantA.id, p.id, { search: '%' })).total).toBe(0);
      expect((await rejects(prospects.list(tenantA.id, p.id, { linked: 'tal vez' })))?.status).toBe(400);
      expect((await rejects(prospects.list(tenantB.id, p.id, {})))?.status).toBe(404);
    });

    it('elimina un prospecto sin tocar el contacto, y solo desde su cuenta y proyecto', async () => {
      const p = await openProject(tenantA, 'Eliminar');
      const contact = await record(tenantA, { fullName: 'Se Queda', email: 'quedo@correo.test' });
      await register(tenantA, p.id, 'email', 'quedo@correo.test');
      const prospect = await ds.getRepository(ProjectProspect).findOneByOrFail({ projectId: p.id });
      expect((await rejects(prospects.remove(tenantB.id, actor, p.id, prospect.id)))?.status).toBe(404);
      await expect(prospects.remove(tenantA.id, actor, p.id, prospect.id)).resolves.toEqual({ deleted: true });
      expect(await ds.getRepository(ProjectProspect).count({ where: { id: prospect.id } })).toBe(0);
      expect(await ds.getRepository(ClientRecord).count({ where: { id: contact.id } })).toBe(1);
    });
  });

  describe('vista del contacto', () => {
    it('lista sus proyectos con el estado, sin borradores, y busca el contacto por canal', async () => {
      const contact = await record(tenantA, { fullName: 'Portal Persona', email: 'portal@persona.test', phone: '573004445566' });
      const p = await openProject(tenantA, 'Visible');
      const draft = await projects.create(tenantA.id, actor, { name: 'Oculto' });
      await register(tenantA, p.id, 'email', 'portal@persona.test');
      await ds.getRepository(ProjectProspect).save(ds.getRepository(ProjectProspect).create({ tenantId: tenantA.id, projectId: draft.id, fullName: 'x', answers: [], consentAt: new Date(), recordId: contact.id }));
      const mine = await prospects.forPortal(tenantA.id, contact.id);
      expect(mine).toEqual([expect.objectContaining({ slug: p.slug, name: 'Visible', role: 'participant', status: 'received', projectStatus: 'active' })]);
      expect(await prospects.findRecordWithProspects(tenantA.id, 'phone', '573004445566')).toBe(contact.id);
      expect(await prospects.findRecordWithProspects(tenantB.id, 'phone', '573004445566')).toBeNull();
      expect(await prospects.findRecordInProject(tenantA.id, p.id, 'email', 'portal@persona.test')).toBe(contact.id);
      expect(await prospects.findRecordInProject(tenantA.id, draft.id, 'email', 'otro@persona.test')).toBeNull();
    });
  });

  describe('auditoría', () => {
    it('registra las acciones sin guardar datos personales', async () => {
      const logs = await ds.getRepository(TenantAuditLog).find({ where: { tenantId: tenantA.id } });
      expect(logs.some((l) => l.action === 'reclutamiento.project.create')).toBe(true);
      expect(logs.some((l) => l.action === 'reclutamiento.prospect.auto_link')).toBe(true);
      expect(logs.some((l) => l.action === 'reclutamiento.prospect.status')).toBe(true);
      expect(JSON.stringify(logs.filter((l) => l.action.startsWith('reclutamiento.prospect.')).map((l) => l.metadata))).not.toMatch(/@correo\.test|@persona\.test|573/);
    });
  });
});
