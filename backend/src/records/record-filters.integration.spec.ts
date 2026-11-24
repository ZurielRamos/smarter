/**
 * Filtros avanzados y tablero de contactos sobre un PostgreSQL real: cada tipo
 * de columna con cada operador, los filtros de proyecto y que tabla y tablero
 * devuelvan lo mismo. Se omite sin base de pruebas (ver reclutamiento/projects.integration.spec.ts).
 */
import 'reflect-metadata';
// El almacenamiento de medios importa `uuid` (solo ESM), que Jest no carga; aquí no se usa.
jest.mock('../media/media-storage.service', () => ({ MediaStorageService: class MediaStorageService {} }));
import { DataSource } from 'typeorm';
import { openTestDb, testDbEnabled, TestDb } from '../reclutamiento/testing/test-db';
import { Tenant } from '../tenants/tenant.entity';
import { ClientRecord } from './record.entity';
import { RecruitmentProject } from '../reclutamiento/entities/recruitment-project.entity';
import { ProjectProspect } from '../reclutamiento/entities/project-prospect.entity';
import { RecordsService } from './records.service';

type F = { field: string; operator: string; value: string };

(testDbEnabled ? describe : describe.skip)('Filtros de contactos y tablero (PostgreSQL)', () => {
  let db: TestDb;
  let ds: DataSource;
  let service: RecordsService;
  const ids: Record<string, string> = {};

  const names = async (filters: F[], tenant = 'a') =>
    (await service.findAll(1, 100, ids[`tenant_${tenant}`], 'name', 'ASC', undefined, undefined, filters)).data.map((r) => r.firstName);

  beforeAll(async () => {
    db = await openTestDb();
    ds = db.ds;
    service = new RecordsService(ds.getRepository(ClientRecord), null as any, null as any, null as any, null as any, null as any, null as any, ds);
    const mk = async <T>(entity: any, data: Record<string, unknown>): Promise<T> =>
      ds.getRepository(entity).save(ds.getRepository(entity).create(data)) as Promise<T>;
    for (const [t, recruit] of [['a', true], ['b', true], ['c', false]] as const) {
      ids[`tenant_${t}`] = (await mk<Tenant>(Tenant, { name: `Cuenta ${t}`, slug: `cuenta-${t}`, isActive: true, features: { reclutamiento: recruit } })).id;
    }
    ids.p1 = (await mk<RecruitmentProject>(RecruitmentProject, { tenantId: ids.tenant_a, name: 'Uno', slug: 'uno' })).id;
    ids.p2 = (await mk<RecruitmentProject>(RecruitmentProject, { tenantId: ids.tenant_a, name: 'Dos', slug: 'dos' })).id;
    ids.pc = (await mk<RecruitmentProject>(RecruitmentProject, { tenantId: ids.tenant_c, name: 'Sin módulo', slug: 'sin-modulo' })).id;
    const person = async (t: string, data: Record<string, unknown>, prospects: Array<[string, string]> = []) => {
      const r = await mk<ClientRecord>(ClientRecord, { tenantId: ids[`tenant_${t}`], ...data });
      ids[String(data.firstName)] = r.id;
      for (const [p, status] of prospects)
        await mk(ProjectProspect, { tenantId: ids[`tenant_${t}`], projectId: ids[p], recordId: r.id, fullName: data.firstName, status, answers: [] });
      return r;
    };
    await person('a', { firstName: 'Ana', status: 'lead', company: 'Acme', score: 80, optInEmail: true, tags: ['vip', 'bogota'], customData: { estrato: '3', edad: '30', proyecto: 'Café' }, birthDate: '1990-05-10' }, [['p1', 'nuevo']]);
    await person('a', { firstName: 'Beto', status: 'cliente', company: 'Beta SAS', score: 20, optInEmail: false, tags: [], customData: { estrato: '5', edad: 'no sé' } }, [['p1', 'seleccionado'], ['p2', 'nuevo']]);
    await person('a', { firstName: 'Carla', status: 'lead', score: 50, language: 'en', customData: null }, [['p2', 'participo']]);
    const deleted = await person('a', { firstName: 'Borrado', status: 'lead' }, [['p1', 'nuevo']]);
    await ds.getRepository(ClientRecord).update(deleted.id, { deletedAt: new Date() });
    await person('c', { firstName: 'Ceci', status: 'lead' }, [['pc', 'nuevo']]);
  });

  afterAll(async () => {
    await db?.close();
  });

  it('columnas que antes se buscaban en custom_data (empresa, idioma)', async () => {
    expect(await names([{ field: 'company', operator: 'contains', value: 'acm' }])).toEqual(['Ana']);
    expect(await names([{ field: 'language', operator: 'equals', value: 'en' }])).toEqual(['Carla']);
  });

  it('texto sin distinguir mayúsculas, número, sí/no y fecha', async () => {
    expect(await names([{ field: 'status', operator: 'equals', value: 'LEAD' }])).toEqual(['Ana', 'Carla']);
    expect(await names([{ field: 'status', operator: 'not_equals', value: 'lead' }])).toEqual(['Beto']);
    expect(await names([{ field: 'score', operator: 'greater_than', value: '40' }])).toEqual(['Ana', 'Carla']);
    expect(await names([{ field: 'score', operator: 'equals', value: '20' }])).toEqual(['Beto']);
    expect(await names([{ field: 'score', operator: 'is_empty', value: '' }])).toEqual([]);
    expect(await names([{ field: 'optInEmail', operator: 'equals', value: 'no' }])).toEqual(['Beto']);
    expect(await names([{ field: 'birthDate', operator: 'equals', value: '1990-05-10' }])).toEqual(['Ana']);
    expect(await names([{ field: 'birthDate', operator: 'is_not_empty', value: '' }])).toEqual(['Ana']);
  });

  it('etiquetas: contiene, es igual, vacío', async () => {
    expect(await names([{ field: 'tags', operator: 'equals', value: 'vip' }])).toEqual(['Ana']);
    expect(await names([{ field: 'tags', operator: 'contains', value: 'bog' }])).toEqual(['Ana']);
    expect(await names([{ field: 'tags', operator: 'is_empty', value: '' }])).toEqual(['Beto', 'Carla']);
  });

  it('campos personalizados: número dentro de texto sin romper con valores no numéricos', async () => {
    expect(await names([{ field: 'edad', operator: 'greater_than', value: '18' }])).toEqual(['Ana']);
    expect(await names([{ field: 'estrato', operator: 'equals', value: '5' }])).toEqual(['Beto']);
    expect(await names([{ field: 'proyecto', operator: 'is_empty', value: '' }])).toEqual(['Beto', 'Carla']);
  });

  it('proyecto y estado en proyecto', async () => {
    expect(await names([{ field: '__project', operator: 'in_project', value: ids.p1 }])).toEqual(['Ana', 'Beto']);
    expect(await names([{ field: '__project', operator: 'not_in_project', value: ids.p1 }])).toEqual(['Carla']);
    expect(await names([{ field: '__project_status', operator: 'equals', value: `${ids.p1}:nuevo,en_contacto` }])).toEqual(['Ana']);
    expect(await names([{ field: '__project_status', operator: 'not_equals', value: `${ids.p1}:nuevo` }])).toEqual(['Beto']);
    // Proyecto de otra cuenta o cuenta sin el módulo: no encuentra nada.
    expect(await names([{ field: '__project', operator: 'in_project', value: ids.p2 }], 'b')).toEqual([]);
    expect(await names([{ field: '__project', operator: 'in_project', value: ids.pc }], 'c')).toEqual([]);
  });

  it('rechaza con 400 lo que no se puede evaluar', async () => {
    await expect(names([{ field: 'score', operator: 'greater_than', value: 'mucho' }])).rejects.toMatchObject({ status: 400 });
    await expect(names([{ field: 'status', operator: 'drop', value: '' }])).rejects.toMatchObject({ status: 400 });
    await expect(names([{ field: "x'; --", operator: 'equals', value: '1' }])).rejects.toMatchObject({ status: 400 });
    await expect(names([{ field: '__project_status', operator: 'equals', value: `${ids.p1}:inventado` }])).rejects.toMatchObject({ status: 400 });
  });

  it('el tablero respeta los filtros y no cuenta contactos eliminados', async () => {
    const t = ids.tenant_a;
    expect(await service.getKanbanCounts(t, 'status')).toEqual({ lead: 2, cliente: 1 });
    const filters = [{ field: 'company', operator: 'is_not_empty', value: '' }];
    expect(await service.getKanbanCounts(t, 'status', undefined, undefined, filters)).toEqual({ lead: 1, cliente: 1 });
    const col = await service.getKanbanColumn(t, 'status', 'lead', undefined, 'name', 'ASC', 1, 20, undefined, undefined, filters);
    expect(col.data.map((r) => r.firstName)).toEqual(['Ana']);
    // Agrupar por idioma usa la columna real.
    expect(await service.getKanbanCounts(t, 'language')).toMatchObject({ en: 1 });
  });

  it('tablero por estado en un proyecto, con el prospecto de cada tarjeta', async () => {
    const t = ids.tenant_a;
    const group = `project:${ids.p1}`;
    expect(await service.getKanbanCounts(t, group)).toEqual({ nuevo: 1, seleccionado: 1 });
    const initial = await service.getKanbanInitial(t, group, 20, undefined, undefined, [{ field: 'status', operator: 'equals', value: 'cliente' }]);
    expect(initial.counts).toEqual({ seleccionado: 1 });
    const card = initial.columns.seleccionado.data[0] as any;
    expect(card.firstName).toBe('Beto');
    const prospect = await ds.getRepository(ProjectProspect).findOneByOrFail({ projectId: ids.p1, recordId: ids.Beto });
    expect(card.projectProspectId).toBe(prospect.id);
    expect((await service.getKanbanColumn(t, group, '__unassigned__')).total).toBe(0);
    // Sin el módulo, el tablero del proyecto queda vacío.
    expect(await service.getKanbanCounts(ids.tenant_c, `project:${ids.pc}`)).toEqual({});
  });
});
