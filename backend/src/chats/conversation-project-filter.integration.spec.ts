/**
 * Filtro de la lista de conversaciones por proyectos de reclutamiento, sobre un
 * PostgreSQL real. Se omite si no hay base de pruebas (ver reclutamiento/projects.integration.spec.ts).
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { openTestDb, testDbEnabled, TestDb } from '../reclutamiento/testing/test-db';
import { Tenant } from '../tenants/tenant.entity';
import { Inbox } from './inbox.entity';
import { Conversation } from './conversation.entity';
import { ClientRecord } from '../records/record.entity';
import { RecruitmentProject } from '../reclutamiento/entities/recruitment-project.entity';
import { ProjectProspect } from '../reclutamiento/entities/project-prospect.entity';
import { applyProjectFilter, parseProjectFilter } from './conversation-project-filter';

(testDbEnabled ? describe : describe.skip)('Conversaciones filtradas por proyecto (PostgreSQL)', () => {
  let db: TestDb;
  let ds: DataSource;
  const ids: Record<string, string> = {};

  /** Nombres de los contactos de las conversaciones que pasan el filtro. */
  const run = async (projectIds: string[], statuses: string[] = []) => {
    const qb = ds
      .getRepository(Conversation)
      .createQueryBuilder('conv')
      .leftJoinAndSelect('conv.inbox', 'inbox')
      .leftJoinAndSelect('conv.record', 'record')
      .orderBy('conv.contact_name', 'ASC');
    applyProjectFilter(qb, { projectIds, statuses });
    return (await qb.getMany()).map((c) => c.contactName);
  };

  beforeAll(async () => {
    db = await openTestDb();
    ds = db.ds;
    const mk = async <T>(entity: any, data: Record<string, unknown>): Promise<T> => ds.getRepository(entity).save(ds.getRepository(entity).create(data)) as Promise<T>;
    for (const t of ['a', 'b']) {
      const tenant = await mk<Tenant>(Tenant, { name: `Cuenta ${t}`, slug: `cuenta-${t}`, isActive: true });
      ids[`tenant_${t}`] = tenant.id;
      ids[`inbox_${t}`] = (await mk<Inbox>(Inbox, { tenantId: tenant.id, name: 'WhatsApp', channel: 'whatsapp' })).id;
    }
    const project = (t: string, slug: string) => mk<RecruitmentProject>(RecruitmentProject, { tenantId: ids[`tenant_${t}`], name: slug, slug });
    ids.p1 = (await project('a', 'proyecto-uno')).id;
    ids.p2 = (await project('a', 'proyecto-dos')).id;
    ids.pb = (await project('b', 'proyecto-ajeno')).id;
    const person = async (t: string, name: string, prospects: Array<[string, string]>) => {
      const record = await mk<ClientRecord>(ClientRecord, { tenantId: ids[`tenant_${t}`], fullName: name });
      await mk(Conversation, { inboxId: ids[`inbox_${t}`], recordId: record.id, contactId: name, contactName: name });
      for (const [projectKey, status] of prospects) {
        await mk(ProjectProspect, { tenantId: ids[`tenant_${t}`], projectId: ids[projectKey], recordId: record.id, fullName: name, status, answers: [] });
      }
    };
    await person('a', 'Ana', [['p1', 'nuevo']]);
    await person('a', 'Beto', [['p1', 'seleccionado'], ['p2', 'nuevo']]);
    await person('a', 'Carla', [['p2', 'participo']]);
    await person('a', 'Dani', []);
    await person('b', 'Eva', [['pb', 'nuevo']]);
    // Conversación sin contacto vinculado.
    await mk(Conversation, { inboxId: ids.inbox_a, contactId: 'anon', contactName: 'Sin contacto' });
  });

  afterAll(async () => {
    await db?.close();
  });

  it('uno o varios proyectos, con todos los estados', async () => {
    expect(await run([ids.p1])).toEqual(['Ana', 'Beto']);
    expect(await run([ids.p1, ids.p2])).toEqual(['Ana', 'Beto', 'Carla']);
  });

  it('solo los estados elegidos, en cualquiera de los proyectos elegidos', async () => {
    expect(await run([ids.p1], ['nuevo'])).toEqual(['Ana']);
    expect(await run([ids.p1, ids.p2], ['nuevo'])).toEqual(['Ana', 'Beto']);
    expect(await run([ids.p1, ids.p2], ['seleccionado', 'participo'])).toEqual(['Beto', 'Carla']);
    expect(await run([ids.p2], ['seleccionado'])).toEqual([]);
  });

  it('un proyecto de otra cuenta no trae conversaciones de esta', async () => {
    const names = await run([ids.pb]);
    expect(names).toEqual(['Eva']);
    // Eva es de la cuenta B: al listar por los canales de A (como hace la vista) no aparece.
    const qb = ds.getRepository(Conversation).createQueryBuilder('conv').leftJoinAndSelect('conv.inbox', 'inbox').leftJoinAndSelect('conv.record', 'record').where('conv.inbox_id IN (:...inboxIds)', { inboxIds: [ids.inbox_a] });
    applyProjectFilter(qb, { projectIds: [ids.pb], statuses: [] });
    expect(await qb.getCount()).toBe(0);
  });

  it('el parámetro ignora ids y estados inválidos, y sin proyectos no filtra', () => {
    expect(parseProjectFilter(undefined, 'nuevo')).toBeUndefined();
    expect(parseProjectFilter('no-es-uuid,,', 'nuevo')).toBeUndefined();
    expect(parseProjectFilter(`${ids.p1},${ids.p1},x`, 'nuevo,inventado, seleccionado')).toEqual({ projectIds: [ids.p1], statuses: ['nuevo', 'seleccionado'] });
    expect(parseProjectFilter(ids.p1, '')).toEqual({ projectIds: [ids.p1], statuses: [] });
  });
});
