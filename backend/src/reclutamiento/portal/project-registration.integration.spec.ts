/**
 * Registro e ingreso por la landing de un proyecto, de punta a punta (códigos de
 * un solo uso incluidos) sobre un PostgreSQL real. Se omite si no hay base de
 * pruebas. Ver cómo correrlo en projects.integration.spec.ts.
 */
import 'reflect-metadata';
// El almacenamiento de medios importa `uuid` (solo ESM), que Jest no carga; aquí no se usa.
jest.mock('../../media/media-storage.service', () => ({ MediaStorageService: class MediaStorageService {} }));
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { openTestDb, testDbEnabled, TestDb } from '../testing/test-db';
import { makePortalConfig } from '../testing/portal-config';
import { Tenant } from '../../tenants/tenant.entity';
import { ClientRecord } from '../../records/record.entity';
import { TenantAuditLog } from '../../audit/tenant-audit-log.entity';
import { TenantAuditService } from '../../audit/tenant-audit.service';
import { RecruitmentProject } from '../entities/recruitment-project.entity';
import { ProjectProspect } from '../entities/project-prospect.entity';
import { ContactProfile } from '../entities/contact-profile.entity';
import { PortalOtp } from '../entities/portal-otp.entity';
import { PortalConfigRow } from '../entities/portal-config.entity';
import { PortalInvitation } from '../entities/portal-invitation.entity';
import { ProjectsService } from '../projects.service';
import { ProjectPublicService } from '../project-public.service';
import { ProjectProspectsService } from '../project-prospects.service';
import { PortalAuthService } from './portal-auth.service';

const suite = testDbEnabled ? describe : describe.skip;

suite('Registro e ingreso por la landing de un proyecto (PostgreSQL)', () => {
  let db: TestDb;
  let ds: DataSource;
  let auth: PortalAuthService;
  let projects: ProjectsService;
  let publicFace: ProjectPublicService;
  let tenant: Tenant;
  let otherTenant: Tenant;
  const codes: Array<{ to: string; code: string }> = [];
  /** Plantilla de WhatsApp con la que se envió cada código. */
  const waSent: Array<{ inboxId: string | null; templateName: string }> = [];
  const actor = { id: '00000000-0000-0000-0000-0000000000a1', email: 'ana@reclutadora.test' };
  const rejects = async (p: Promise<unknown>): Promise<any> => {
    try {
      await p;
      return null;
    } catch (e) {
      return e;
    }
  };
  const records = () => ds.getRepository(ClientRecord);

  beforeEach(() => {
    codes.length = 0;
    waSent.length = 0;
  });

  beforeAll(async () => {
    db = await openTestDb();
    ds = db.ds;
    const audit = new TenantAuditService(ds.getRepository(TenantAuditLog));
    const portalConfig = makePortalConfig(ds, audit);
    const prospects = new ProjectProspectsService(ds.getRepository(ProjectProspect), ds.getRepository(RecruitmentProject), records(), ds, audit, portalConfig);
    publicFace = new ProjectPublicService(ds.getRepository(RecruitmentProject), audit, {} as any, portalConfig);
    projects = new ProjectsService(ds.getRepository(RecruitmentProject), ds.getRepository(ProjectProspect), ds, audit);
    // La bandeja de salida: el código llega en el cuerpo del correo o en la variable de WhatsApp.
    const messenger: any = {
      sendEmail: async (to: string, _subject: string, body: string) => void codes.push({ to, code: /\b(\d{6})\b/.exec(body)?.[1] ?? '' }),
      sendWhatsApp: async (_t: string, wa: { inboxId: string | null; templateName: string }, to: string, params: string[], code: string) => {
        waSent.push({ inboxId: wa.inboxId, templateName: wa.templateName });
        codes.push({ to, code: code ?? params[0] });
      },
    };
    auth = new PortalAuthService(
      { get: (_k: string, d?: string) => d } as any,
      new JwtService({}),
      ds.getRepository(Tenant),
      ds.getRepository(ContactProfile),
      records(),
      ds.getRepository(PortalOtp),
      ds.getRepository(PortalInvitation),
      portalConfig,
      messenger,
      audit,
      ds,
      prospects,
      publicFace,
    );
    const tenants = ds.getRepository(Tenant);
    const mk = (name: string, slug: string) => tenants.save(tenants.create({ name, slug, isActive: true, features: { reclutamiento: true } } as any) as unknown as Tenant);
    tenant = await mk('Reclutadora', 'reclutadora');
    otherTenant = await mk('Otra', 'otra');
    // La cuenta verifica por correo o por teléfono.
    await ds.getRepository(PortalConfigRow).save(ds.getRepository(PortalConfigRow).create({ tenantId: tenant.id, config: { verification: { channel: 'both' } } } as any));
  });

  afterAll(async () => {
    await db?.close();
  });

  const open = async (name: string, slug: string, form: Record<string, unknown> = {}) => {
    const p = await projects.create(tenant.id, actor, { name, slug });
    await ds.getRepository(RecruitmentProject).update({ id: p.id }, { status: 'active', registrationOpen: true, form: { questions: [], fields: [], ...form } as any });
    return p;
  };
  const body = (extra: Record<string, unknown> = {}) => ({ fullName: 'Camila Torres', channel: 'email', destination: 'Camila@Correo.test', phone: '573001230000', consent: true, answers: {}, ...extra });
  const throttleReset = () => (auth as any).hits.clear();
  const auth_cfg = () => makePortalConfig(ds, new TenantAuditService(ds.getRepository(TenantAuditLog))).get(tenant.id);
  /** Registra a alguien de punta a punta y devuelve la sesión de la landing. */
  const registered = async (projectSlug: string, extra: Record<string, unknown> = {}) => {
    throttleReset();
    const sent = await auth.requestProjectRegistration(tenant.slug, projectSlug, body(extra));
    return auth.verifyProjectRegistration(tenant.slug, projectSlug, sent.otpId, codes.pop()!.code);
  };

  describe('registro', () => {
    it('verifica el código y deja contacto y prospecto, con la sesión de esa landing y sin perfil', async () => {
      const p = await open('Panel Norte', 'panel-norte', { questions: [{ id: 'barrio', type: 'short', label: '¿En qué barrio vives?', required: true, help: '', options: [], min: null, max: null }] });
      const profiles = await ds.getRepository(ContactProfile).count();
      throttleReset();
      const sent = await auth.requestProjectRegistration(tenant.slug, 'panel-norte', body({ answers: { barrio: 'Chapinero' } }));
      expect(sent.maskedDestination).toContain('@correo.test');
      const mail = codes.pop()!;
      expect(mail.to).toBe('camila@correo.test');
      const res = await auth.verifyProjectRegistration(tenant.slug, 'panel-norte', sent.otpId, mail.code);
      expect(res.status).toBe('applied');
      expect(res.sessionToken).toEqual(expect.any(String));

      const row = await ds.getRepository(ProjectProspect).findOneByOrFail({ projectId: p.id });
      const contact = await records().findOneByOrFail({ id: row.recordId! });
      expect(contact).toMatchObject({ tenantId: tenant.id, fullName: 'Camila Torres', email: 'camila@correo.test', phone: '573001230000' });
      expect(row.answers).toEqual([expect.objectContaining({ id: 'barrio', label: '¿En qué barrio vives?', value: 'Chapinero' })]);
      expect(await ds.getRepository(ContactProfile).count()).toBe(profiles);

      const session = await auth.authenticateProject(tenant.slug, 'panel-norte', res.sessionToken);
      expect(session.record.id).toBe(contact.id);
      expect(session.prospect).toMatchObject({ role: 'participant', status: 'nuevo' });
    });

    it('con el teléfono verificado, el correo es opcional; con el correo verificado, el teléfono es obligatorio', async () => {
      await open('Teléfono primero', 'telefono-primero');
      throttleReset();
      await expect(auth.requestProjectRegistration(tenant.slug, 'telefono-primero', body({ channel: 'phone', destination: '573009998877' }))).resolves.toHaveProperty('otpId');
      throttleReset();
      expect((await rejects(auth.requestProjectRegistration(tenant.slug, 'telefono-primero', body({ channel: 'phone', destination: '573009998877', email: 'no-es-correo' }))))?.status).toBe(400);
      throttleReset();
      expect((await rejects(auth.requestProjectRegistration(tenant.slug, 'telefono-primero', body({ phone: undefined }))))?.status).toBe(400);
    });

    it('pide y valida los datos personales que configuró el proyecto', async () => {
      await open('Con datos', 'con-datos', {
        fields: [
          { key: 'ciudad', required: true },
          { key: 'direccion', required: false },
        ],
      });
      throttleReset();
      expect((await rejects(auth.requestProjectRegistration(tenant.slug, 'con-datos', body())))?.message).toContain('Ciudad');
      const info = await publicFace.publicInfo(await publicFace.resolvePublic(tenant, 'con-datos'));
      expect(info.project.fields.map((f) => [f.key, f.required])).toEqual([['ciudad', true], ['direccion', false]]);
      const res = await registered('con-datos', { values: { ciudad: 'Bogotá', direccion: 'Calle 1', cedula: 'ignorada' } });
      const contact = await records().findOneByOrFail({ id: (await auth.authenticateProject(tenant.slug, 'con-datos', res.sessionToken)).record.id });
      expect(contact).toMatchObject({ city: 'Bogotá', address: 'Calle 1' });
    });

    it('el código no se puede reutilizar y uno incorrecto no guarda nada', async () => {
      await open('Panel Sur', 'panel-sur');
      throttleReset();
      const sent = await auth.requestProjectRegistration(tenant.slug, 'panel-sur', body({ destination: 'sur@correo.test' }));
      const { code } = codes.pop()!;
      expect((await rejects(auth.verifyProjectRegistration(tenant.slug, 'panel-sur', sent.otpId, code === '000000' ? '111111' : '000000')))?.status).toBe(400);
      expect(await records().count({ where: { tenantId: tenant.id, email: 'sur@correo.test' } })).toBe(0);
      expect((await auth.verifyProjectRegistration(tenant.slug, 'panel-sur', sent.otpId, code)).status).toBe('applied');
      expect((await rejects(auth.verifyProjectRegistration(tenant.slug, 'panel-sur', sent.otpId, code)))?.status).toBe(400);
    });

    it('un código de otro proyecto no registra en este ni da sesión', async () => {
      const a = await open('Proyecto A', 'proyecto-a');
      const b = await open('Proyecto B', 'proyecto-b');
      throttleReset();
      const sent = await auth.requestProjectRegistration(tenant.slug, 'proyecto-a', body({ destination: 'cruzado@correo.test' }));
      const { code } = codes.pop()!;
      expect(await auth.verifyProjectRegistration(tenant.slug, 'proyecto-b', sent.otpId, code)).toEqual({ status: 'closed' });
      expect(await ds.getRepository(ProjectProspect).count({ where: [{ projectId: a.id }, { projectId: b.id }] })).toBe(0);
    });

    it('un código del registro de proyecto no sirve para el portal ni para ingresar a la landing', async () => {
      await open('Proyecto C', 'proyecto-c');
      throttleReset();
      const sent = await auth.requestProjectRegistration(tenant.slug, 'proyecto-c', body({ destination: 'login@correo.test' }));
      const { code } = codes.pop()!;
      expect((await rejects(auth.verifyLogin(tenant.slug, sent.otpId, code, {})))?.status).toBe(400);
      expect((await rejects(auth.verifyProjectLogin(tenant.slug, 'proyecto-c', sent.otpId, code)))?.status).toBe(400);
    });

    it('si el proyecto se cierra entre el código y la verificación, no guarda nada', async () => {
      const p = await open('Proyecto D', 'proyecto-d');
      throttleReset();
      const sent = await auth.requestProjectRegistration(tenant.slug, 'proyecto-d', body({ destination: 'cierre@correo.test' }));
      const { code } = codes.pop()!;
      await ds.getRepository(RecruitmentProject).update({ id: p.id }, { registrationOpen: false });
      expect(await auth.verifyProjectRegistration(tenant.slug, 'proyecto-d', sent.otpId, code)).toEqual({ status: 'closed' });
      expect(await ds.getRepository(ProjectProspect).count({ where: { projectId: p.id } })).toBe(0);
      expect(await records().count({ where: { tenantId: tenant.id, email: 'cierre@correo.test' } })).toBe(0);
    });

    it('vuelve a registrarse con el mismo dato: «existing», el mismo contacto y también sesión', async () => {
      const contact = await records().save(records().create({ tenantId: tenant.id, fullName: 'Rosa en CRM', email: 'rosa@correo.test' } as any) as unknown as ClientRecord);
      const p = await open('Proyecto E', 'proyecto-e');
      const first = await registered('proyecto-e', { destination: 'rosa@correo.test', fullName: 'Rosa Gómez' });
      expect(first.status).toBe('applied');
      expect(await ds.getRepository(ProjectProspect).findOneByOrFail({ projectId: p.id })).toMatchObject({ recordId: contact.id });
      const again = await registered('proyecto-e', { destination: 'rosa@correo.test', fullName: 'Rosa Gómez' });
      expect(again.status).toBe('existing');
      expect(again.sessionToken).toEqual(expect.any(String));
      expect(await ds.getRepository(ProjectProspect).count({ where: { projectId: p.id } })).toBe(1);
    });

    it('rechaza el registro si el proyecto no está abierto, no existe o faltan datos', async () => {
      const p = await open('Proyecto F', 'proyecto-f');
      throttleReset();
      expect((await rejects(auth.requestProjectRegistration(tenant.slug, 'no-existe', body())))?.status).toBe(404);
      expect((await rejects(auth.requestProjectRegistration(tenant.slug, 'proyecto-f', body({ consent: false }))))?.status).toBe(400);
      expect((await rejects(auth.requestProjectRegistration(tenant.slug, 'proyecto-f', body({ destination: 'no-es-correo' }))))?.status).toBe(400);
      expect((await rejects(auth.requestProjectRegistration(tenant.slug, 'proyecto-f', body({ fullName: 'x' }))))?.status).toBe(400);
      await ds.getRepository(RecruitmentProject).update({ id: p.id }, { registrationOpen: false });
      expect((await rejects(auth.requestProjectRegistration(tenant.slug, 'proyecto-f', body())))?.status).toBe(403);
    });

    it('el modo de acceso general de la cuenta no cambia el registro del proyecto', async () => {
      await open('Proyecto G', 'proyecto-g');
      throttleReset();
      await expect(auth.requestProjectRegistration(tenant.slug, 'proyecto-g', body({ destination: 'general@correo.test' }))).resolves.toHaveProperty('otpId');
      expect((await rejects(auth.requestRegistration(tenant.slug, body({ destination: 'general2@correo.test' }))))?.status).toBe(403);
    });
  });

  describe('perfil al registrarse', () => {
    it('elige entre los perfiles que ofrece el proyecto; todos entran como «Nuevo»', async () => {
      const p = await open('Con perfiles', 'con-perfiles');
      await ds.getRepository(RecruitmentProject).update({ id: p.id }, { roles: ['participant', 'surveyor', 'moderator'], defaultRole: 'participant', moderatorSignup: false });
      throttleReset();
      expect((await rejects(auth.requestProjectRegistration(tenant.slug, 'con-perfiles', body({ role: 'moderator' }))))?.status).toBe(400);
      expect((await rejects(auth.requestProjectRegistration(tenant.slug, 'con-perfiles', body({ role: 'jefe' }))))?.status).toBe(400);
      await registered('con-perfiles', { destination: 'encuestadora@correo.test', role: 'surveyor' });
      await registered('con-perfiles', { destination: 'sin-elegir@correo.test' });
      await ds.getRepository(RecruitmentProject).update({ id: p.id }, { moderatorSignup: true });
      await registered('con-perfiles', { destination: 'moderadora@correo.test', role: 'moderator' });
      const rows = await ds.getRepository(ProjectProspect).find({ where: { projectId: p.id } });
      const byEmail = Object.fromEntries(rows.map((r) => [r.email, [r.role, r.status]]));
      expect(byEmail).toEqual({
        'encuestadora@correo.test': ['surveyor', 'nuevo'],
        'sin-elegir@correo.test': ['participant', 'nuevo'],
        'moderadora@correo.test': ['moderator', 'nuevo'],
      });
    });
  });

  describe('verificación configurada en el proyecto', () => {
    const verification = (channels: string[]) => ({ verification: { channels, whatsapp: { inboxId: 'inbox-del-proyecto', templateName: 'codigo_proyecto', language: 'es' } } });

    it('solo acepta los canales que el proyecto verifica', async () => {
      await open('Solo correo', 'solo-correo', verification(['email']));
      throttleReset();
      expect((await rejects(auth.requestProjectRegistration(tenant.slug, 'solo-correo', body({ channel: 'phone', destination: '573001110000' }))))?.status).toBe(400);
      await expect(auth.requestProjectRegistration(tenant.slug, 'solo-correo', body({ destination: 'solo@correo.test' }))).resolves.toHaveProperty('otpId');
      throttleReset();
      expect((await rejects(auth.requestProjectLogin(tenant.slug, 'solo-correo', { channel: 'phone', destination: '573001110000' })))?.status).toBe(400);
      const info = await publicFace.publicInfo(await publicFace.resolvePublic(tenant, 'solo-correo'));
      expect(info.project.name).toBe('Solo correo');
      expect(auth.projectConfig(await auth_cfg(), await publicFace.resolvePublic(tenant, 'solo-correo')).verification.channel).toBe('email');
    });

    it('con WhatsApp, el código sale por el número y la plantilla del proyecto, no por los de la cuenta', async () => {
      await open('Solo WhatsApp', 'solo-whatsapp', verification(['phone']));
      throttleReset();
      expect((await rejects(auth.requestProjectRegistration(tenant.slug, 'solo-whatsapp', body({ channel: 'email', destination: 'x@correo.test' }))))?.status).toBe(400);
      await auth.requestProjectRegistration(tenant.slug, 'solo-whatsapp', body({ channel: 'phone', destination: '573002223344' }));
      expect(waSent).toEqual([{ inboxId: 'inbox-del-proyecto', templateName: 'codigo_proyecto' }]);
      expect(codes.pop()!.to).toBe('573002223344');
    });

    it('con ambos canales la persona puede elegir; sin definir, manda la cuenta', async () => {
      await open('Ambos', 'ambos', verification(['email', 'phone']));
      throttleReset();
      await expect(auth.requestProjectRegistration(tenant.slug, 'ambos', body({ channel: 'phone', destination: '573003334455' }))).resolves.toHaveProperty('otpId');
      throttleReset();
      await expect(auth.requestProjectRegistration(tenant.slug, 'ambos', body({ destination: 'ambos@correo.test' }))).resolves.toHaveProperty('otpId');
      // Proyecto sin verificación propia: la cuenta verifica por «both» en esta prueba.
      await open('Hereda', 'hereda');
      throttleReset();
      await expect(auth.requestProjectRegistration(tenant.slug, 'hereda', body({ channel: 'phone', destination: '573004445566' }))).resolves.toHaveProperty('otpId');
    });
  });

  describe('ingreso a la landing de un proyecto', () => {
    it('pide un código a quien se registró, con el mismo resultado exista o no, y abre sesión solo en esa landing', async () => {
      await open('Landing Uno', 'landing-uno');
      await open('Landing Dos', 'landing-dos');
      const first = await registered('landing-uno', { destination: 'ingreso@correo.test', fullName: 'Persona Ingreso' });
      expect(first.status).toBe('applied');

      throttleReset();
      const stranger = await auth.requestProjectLogin(tenant.slug, 'landing-uno', { channel: 'email', destination: 'nadie@correo.test' });
      expect(Object.keys(stranger).sort()).toEqual(['channel', 'expiresInSec', 'maskedDestination', 'otpId']);
      expect(codes).toHaveLength(0);
      expect((await rejects(auth.verifyProjectLogin(tenant.slug, 'landing-uno', stranger.otpId, '123456')))?.status).toBe(400);

      throttleReset();
      const sent = await auth.requestProjectLogin(tenant.slug, 'landing-uno', { channel: 'email', destination: 'INGRESO@correo.test' });
      const session = await auth.verifyProjectLogin(tenant.slug, 'landing-uno', sent.otpId, codes.pop()!.code);
      const ok = await auth.authenticateProject(tenant.slug, 'landing-uno', session.sessionToken);
      expect(ok.record.email).toBe('ingreso@correo.test');
      // La sesión de una landing no vale en otra, ni como sesión del portal.
      expect((await rejects(auth.authenticateProject(tenant.slug, 'landing-dos', session.sessionToken)))?.status).toBe(401);
      expect((await rejects(auth.authenticate(tenant.slug, session.sessionToken)))?.status).toBe(401);
      // Quien no se registró en la landing dos no puede pedir código allí.
      throttleReset();
      await auth.requestProjectLogin(tenant.slug, 'landing-dos', { channel: 'email', destination: 'ingreso@correo.test' });
      expect(codes).toHaveLength(0);
    });

    it('puede tener sesión en varias landings a la vez', async () => {
      await open('Varias Uno', 'varias-uno');
      await open('Varias Dos', 'varias-dos');
      const a = await registered('varias-uno', { destination: 'varias@correo.test' });
      const b = await registered('varias-dos', { destination: 'varias@correo.test' });
      expect((await auth.authenticateProject(tenant.slug, 'varias-uno', a.sessionToken)).record.id).toBe((await auth.authenticateProject(tenant.slug, 'varias-dos', b.sessionToken)).record.id);
    });

    it('un proyecto pausado o terminado deja de aceptar sesiones', async () => {
      const p = await open('Se pausa', 'se-pausa');
      const res = await registered('se-pausa', { destination: 'pausa@correo.test' });
      await projects.transition(tenant.id, actor, p.id, 'pause');
      expect((await rejects(auth.authenticateProject(tenant.slug, 'se-pausa', res.sessionToken)))?.status).toBe(401);
    });

    it('no usa sesiones de otra cuenta, ni de un prospecto eliminado', async () => {
      const p = await open('Se borra', 'se-borra');
      const res = await registered('se-borra', { destination: 'borra@correo.test' });
      await ds.getRepository(ProjectProspect).delete({ projectId: p.id });
      expect((await rejects(auth.authenticateProject(tenant.slug, 'se-borra', res.sessionToken)))?.status).toBe(401);
      expect((await rejects(auth.authenticateProject(otherTenant.slug, 'se-borra', res.sessionToken)))?.status).toBe(401);
    });
  });

  describe('portal principal de la cuenta', () => {
    it('un contacto sin perfil entra con su código y ve sus proyectos, pero no es un encuestador', async () => {
      await open('Portal Uno', 'portal-uno');
      await open('Portal Dos', 'portal-dos');
      await registered('portal-uno', { destination: 'portal@correo.test', fullName: 'Persona Portal' });
      await registered('portal-dos', { destination: 'portal@correo.test', fullName: 'Persona Portal' });

      throttleReset();
      const sent = await auth.requestLogin(tenant.slug, { channel: 'email', destination: 'portal@correo.test' });
      const { portalToken } = await auth.verifyLogin(tenant.slug, sent.otpId, codes.pop()!.code, {});
      const session = await auth.authenticate(tenant.slug, portalToken);
      expect(session.profile).toBeNull();
      expect(session.record.email).toBe('portal@correo.test');
      // La sesión del portal no sirve en la landing de un proyecto.
      expect((await rejects(auth.authenticateProject(tenant.slug, 'portal-uno', portalToken)))?.status).toBe(401);
    });

    it('quien no se registró en ningún proyecto no recibe código', async () => {
      await records().save(records().create({ tenantId: tenant.id, fullName: 'Solo CRM', email: 'solocrm@correo.test' } as any));
      throttleReset();
      const res = await auth.requestLogin(tenant.slug, { channel: 'email', destination: 'solocrm@correo.test' });
      expect(res).toHaveProperty('otpId');
      expect(codes).toHaveLength(0);
    });

    it('un contacto eliminado pierde la sesión', async () => {
      await open('Portal Tres', 'portal-tres');
      await registered('portal-tres', { destination: 'eliminado@correo.test' });
      throttleReset();
      const sent = await auth.requestLogin(tenant.slug, { channel: 'email', destination: 'eliminado@correo.test' });
      const { portalToken } = await auth.verifyLogin(tenant.slug, sent.otpId, codes.pop()!.code, {});
      await records().update({ tenantId: tenant.id, email: 'eliminado@correo.test' }, { deletedAt: new Date() } as any);
      expect((await rejects(auth.authenticate(tenant.slug, portalToken)))?.status).toBe(401);
    });
  });
});
