/**
 * Pruebas de integración de la importación de empresas desde archivo, sobre un
 * PostgreSQL real. Se omiten si no hay base de pruebas.
 *
 *   docker run -d --rm --name smarter-test-pg -e POSTGRES_PASSWORD=test -e POSTGRES_DB=smarter_test -p 127.0.0.1:55432:5432 postgres
 *   TEST_DATABASE_URL=postgres://postgres:test@127.0.0.1:55432/smarter_test npx jest companies-import.integration
 *
 * El almacén de archivos del ETL (que usa `uuid`, solo ESM) y el servicio ETL se
 * sustituyen por dobles en memoria; lo demás es el código real.
 */
import 'reflect-metadata';
jest.mock('../etl/file-store.service', () => ({ FileStoreService: class FileStoreService {} }));
jest.mock('../etl/etl.service', () => ({ EtlService: class EtlService {} }));
import { DataSource } from 'typeorm';
import { openTestDb, testDbEnabled, TestDb } from '../reclutamiento/testing/test-db';
import { Tenant } from '../tenants/tenant.entity';
import { TenantAuditLog } from '../audit/tenant-audit-log.entity';
import { TenantAuditService } from '../audit/tenant-audit.service';
import { ImportJob } from '../etl/entities/import-job.entity';
import { ImportError } from '../etl/entities/import-error.entity';
import { TransformProcessor } from '../etl/processors/transform.processor';
import { Organization } from './entities/organization.entity';
import { CompaniesImportService, SYNC_IMPORT_LIMIT, applyUpdate } from './companies-import.service';
import { COMPANY_FIELD_KEYS, COMPANY_TARGET_FIELDS } from './company-import-fields';

const suite = testDbEnabled ? describe : describe.skip;
const actor = { id: '00000000-0000-0000-0000-0000000000a1', email: 'ana@cuenta.test' };

const rejects = async (p: Promise<unknown>): Promise<any> => {
  try {
    await p;
    return null;
  } catch (e) {
    return e;
  }
};

type Row = Record<string, string>;

/** Almacén de archivos en memoria con la parte del contrato que usa la importación. */
class FakeFileStore {
  files = new Map<string, Row[]>();
  deleted: string[] = [];
  private n = 0;
  put(rows: Row[]) {
    const id = `file-${++this.n}`;
    this.files.set(id, rows);
    return id;
  }
  getMeta(id: string) {
    const rows = this.files.get(id);
    return rows ? { headers: Object.keys(rows[0] ?? {}), fileName: 'empresas.csv', fileSize: 1000, fileType: 'csv', totalRows: rows.length } : null;
  }
  exists(id: string) {
    return this.files.has(id);
  }
  readSlice(id: string, start: number, count: number) {
    return (this.files.get(id) ?? []).slice(Math.max(0, start), Math.max(0, start) + count);
  }
  async processChunked<T>(id: string, size: number, fn: (chunk: Row[], idx: number) => Promise<T>) {
    const rows = this.files.get(id) ?? [];
    const out: T[] = [];
    for (let i = 0; i < rows.length; i += size) out.push(await fn(rows.slice(i, i + size), i / size));
    return out;
  }
  delete(id: string) {
    this.deleted.push(id);
    this.files.delete(id);
  }
}

suite('Importación de empresas desde archivo (PostgreSQL)', () => {
  let db: TestDb;
  let ds: DataSource;
  let store: FakeFileStore;
  let imports: CompaniesImportService;
  let A: Tenant;
  let B: Tenant;
  const queued: Array<{ jobId: string; fileId: string }> = [];
  const savedTemplates: unknown[][] = [];

  /** Mapeo de campos destino a una columna del archivo con ese nombre. */
  const map = (fields: Record<string, string>) => Object.fromEntries(Object.entries(fields).map(([f, h]) => [f, [h]]));
  const cfg = (rows: Row[], mapping: Record<string, string>, extra: Record<string, unknown> = {}) =>
    imports.parseConfig({ fileId: store.put(rows), mapping: map(mapping), ...extra });
  const importFile = (tenant: Tenant, rows: Row[], mapping: Record<string, string>, extra: Record<string, unknown> = {}) =>
    imports.start(tenant.id, actor, cfg(rows, mapping, extra));
  const orgs = (tenant: Tenant) => ds.getRepository(Organization).find({ where: { tenantId: tenant.id }, order: { name: 'ASC' } });
  const byName = async (tenant: Tenant, name: string) => ds.getRepository(Organization).findOneByOrFail({ tenantId: tenant.id, name });
  const jobErrors = (jobId: string) => ds.getRepository(ImportError).find({ where: { jobId }, order: { rowNumber: 'ASC' } });
  const seed = (tenant: Tenant, data: Partial<Organization>) => {
    const repo = ds.getRepository(Organization);
    return repo.save(repo.create({ tenantId: tenant.id, name: 'Empresa', ...data }));
  };

  beforeAll(async () => {
    db = await openTestDb();
    ds = db.ds;
    store = new FakeFileStore();
    const etl: any = {
      registerEntityHandler: () => undefined,
      saveTemplate: async (...args: unknown[]) => void savedTemplates.push(args),
      enqueueImport: async (jobId: string, fileId: string) => void queued.push({ jobId, fileId }),
    };
    imports = new CompaniesImportService(
      ds.getRepository(ImportJob),
      ds.getRepository(ImportError),
      ds.getRepository(Organization),
      ds,
      new TenantAuditService(ds.getRepository(TenantAuditLog)),
      store as any,
      new TransformProcessor(),
      etl,
    );
    const tenants = ds.getRepository(Tenant);
    A = await tenants.save(tenants.create({ name: 'Cuenta A', slug: 'cuenta-a', features: { companies: true } } as any) as unknown as Tenant);
    B = await tenants.save(tenants.create({ name: 'Cuenta B', slug: 'cuenta-b', features: { companies: true } } as any) as unknown as Tenant);
  });

  afterAll(async () => {
    await db?.close();
  });

  beforeEach(async () => {
    await ds.query('DELETE FROM import_errors');
    await ds.query('DELETE FROM import_jobs');
    await ds.query('DELETE FROM organizations');
    await ds.getRepository(TenantAuditLog).clear();
    store.files.clear();
    store.deleted.length = 0;
    queued.length = 0;
    savedTemplates.length = 0;
  });

  describe('campos y configuración', () => {
    it('los campos destino son únicos, incluyen el nombre obligatorio y coinciden con los reconocidos', () => {
      const keys = COMPANY_TARGET_FIELDS.map((f) => f.field);
      expect(new Set(keys).size).toBe(keys.length);
      expect(COMPANY_TARGET_FIELDS.find((f) => f.field === 'name')).toMatchObject({ required: true, allowMultiple: true });
      expect(COMPANY_FIELD_KEYS.size).toBe(keys.length);
      expect(imports.getTargetFields()).toBe(COMPANY_TARGET_FIELDS);
    });

    it('rechaza configuraciones inválidas', () => {
      const ok = { fileId: 'f1', mapping: { name: ['Nombre'] } };
      const bad: unknown[] = [
        null,
        'texto',
        [],
        { ...ok, fileId: '' },
        { ...ok, fileId: 5 },
        { ...ok, mapping: null },
        { ...ok, mapping: [] },
        { ...ok, mapping: { name: 'Nombre' } },
        { ...ok, mapping: { name: [1] } },
        { ...ok, mapping: { name: ['x'.repeat(301)] } },
        { ...ok, mapping: { name: Array.from({ length: 11 }, (_, i) => `c${i}`) } },
        { ...ok, mapping: { campoRaro: ['x'] } },
        { ...ok, mapping: { city: ['Ciudad'] } },
        { ...ok, mapping: { name: [] } },
        { ...ok, matchFields: 'documentNumber' },
        { ...ok, matchFields: ['phone'] },
        { ...ok, matchFields: ['documentNumber'] },
        { ...ok, deduplicateStrategy: 'borrar_todo' },
        { ...ok, matchFields: [], overwriteFields: ['raro'] },
        { ...ok, mapping: { name: ['N'], documentNumber: ['D'] }, matchFields: ['documentNumber'], deduplicateStrategy: 'overwrite_selected', overwriteFields: [] },
        { ...ok, transforms: [] },
        { ...ok, transforms: { x: 'y'.repeat(21_000) } },
        { ...ok, headers: 'a' },
        { ...ok, headers: Array.from({ length: 501 }, () => 'h') },
      ];
      for (const body of bad) expect((() => { try { imports.parseConfig(body); return 200; } catch (e: any) { return e.getStatus?.(); } })()).toBe(400);
    });

    it('acepta una configuración válida y normaliza duplicados de criterios', () => {
      const c = imports.parseConfig({
        fileId: 'f1',
        mapping: { name: ['A', 'B'], documentNumber: ['NIT'], city: [] },
        matchFields: ['documentNumber', 'documentNumber'],
        deduplicateStrategy: 'overwrite_selected',
        overwriteFields: ['city'],
        templateName: 'x'.repeat(200),
      });
      expect(c).toMatchObject({ matchFields: ['documentNumber'], strategy: 'overwrite_selected', overwriteFields: ['city'] });
      expect(c.mapping).toEqual({ name: ['A', 'B'], documentNumber: ['NIT'] });
      expect(c.templateName).toHaveLength(100);
    });

    it('el trabajo nuevo queda como importación de contactos si no se indica otra cosa', async () => {
      const repo = ds.getRepository(ImportJob);
      const job = await repo.save(repo.create({ tenantId: A.id, fileName: 'x.csv', fileType: 'csv' }));
      expect(job.entity).toBe('contacts');
    });
  });

  describe('vista previa de validación', () => {
    it('cuenta filas válidas e inválidas e informa el campo de cada error', () => {
      const rows: Row[] = [
        { N: 'Tienda 1', C: 'a@b.co' },
        { N: 'x', C: 'sin-arroba' },
        { N: 'Tienda 3', C: 'malo', T: 'enorme' },
        { N: '', C: 'ok@ok.co' },
      ];
      const res = imports.validatePreview(cfg(rows, { name: 'N', email: 'C', size: 'T' }));
      expect(res).toMatchObject({ totalRows: 4, sampleSize: 4, valid: 1, invalid: 3, warnings: [] });
      const fields = res.errors.map((e) => `${e.rowNumber}:${e.field}`);
      expect(fields).toEqual(expect.arrayContaining(['2:name', '2:email', '3:email', '4:name']));
      expect(res.errors.find((e) => e.rowNumber === 2 && e.field === 'email')).toMatchObject({ originalValue: 'sin-arroba', severity: 'error' });
    });

    it('revisa solo las primeras 100 filas y limita los errores devueltos', () => {
      const rows = Array.from({ length: 300 }, (_, i) => ({ N: `Empresa ${i}`, C: 'mal' }));
      const res = imports.validatePreview(cfg(rows, { name: 'N', email: 'C' }));
      expect(res).toMatchObject({ totalRows: 300, sampleSize: 100, invalid: 100 });
      expect(res.errors).toHaveLength(50);
    });

    it('detecta documentos repetidos y coordenadas incompletas', () => {
      const rows: Row[] = [
        { N: 'Uno', D: 'x-1', La: '', Lo: '' },
        { N: 'Dos', D: 'X-1', La: '', Lo: '' },
        { N: 'Tres', D: '', La: '4.6', Lo: '' },
      ];
      const res = imports.validatePreview(cfg(rows, { name: 'N', documentNumber: 'D', lat: 'La', lng: 'Lo' }));
      expect(res).toMatchObject({ valid: 1, invalid: 2 });
      expect(res.errors.find((e) => e.rowNumber === 2)?.message).toMatch(/repetido en el archivo \(fila 1\)/);
      expect(res.errors.find((e) => e.rowNumber === 3)?.field).toBe('lat');
    });

    it('un documento repetido de una fila inválida no bloquea a la siguiente', () => {
      const rows: Row[] = [{ N: 'x', D: 'Q-1' }, { N: 'Buena', D: 'Q-1' }];
      expect(imports.validatePreview(cfg(rows, { name: 'N', documentNumber: 'D' }))).toMatchObject({ valid: 1, invalid: 1 });
    });

    it('un archivo vencido se informa con claridad', () => {
      expect(() => imports.validatePreview(imports.parseConfig({ fileId: 'no-existe', mapping: { name: ['N'] } }))).toThrow(/expirado/);
    });
  });

  describe('importación', () => {
    it('crea empresas traduciendo valores en español y juntando columnas', async () => {
      const rows: Row[] = [
        {
          Nombre: 'Supermercado La 14',
          Tipo: 'Cliente',
          Estado: 'Activa',
          Tam: 'Mediana',
          Emp: '501 a 1.000',
          T1: '+57 602 555 1234',
          T2: '(57) 300 111 2233',
          Etq: 'vip; Cadena ;',
          Calle: 'Calle 5',
          Num: '# 10-20',
          Lat: '3.4516',
          Lng: '-76.532',
          Web: 'www.la14.co',
          Mail: 'Compras@La14.CO',
        },
      ];
      const job = await importFile(A, rows, { name: 'Nombre', type: 'Tipo', status: 'Estado', size: 'Tam', employeeRange: 'Emp', phone1: 'T1', phone2: 'T2', tags: 'Etq', lat: 'Lat', lng: 'Lng', website: 'Web', email: 'Mail' });
      expect(job).toMatchObject({ entity: 'companies', status: 'completed', createdRecords: 1, errorRows: 0, validRows: 1, progress: 100 });
      expect(await store.exists(job.fileId!)).toBe(false);
      expect(await byName(A, 'Supermercado La 14')).toMatchObject({
        type: 'client',
        status: 'active',
        size: 'medium',
        employeeRange: '501-1000',
        phones: [{ number: '+57 602 555 1234' }, { number: '(57) 300 111 2233' }],
        tags: ['vip', 'Cadena'],
        lat: 3.4516,
        lng: -76.532,
        website: 'https://www.la14.co',
        email: 'compras@la14.co',
        tenantId: A.id,
      });
    });

    it('concatena varias columnas en un campo con el separador elegido', async () => {
      const job = await importFile(A, [{ Calle: 'Calle 5', Num: '10-20' }, { Calle: 'Av 6', Num: '' }], { name: 'Calle', address: 'Calle' }, {});
      expect(job.createdRecords).toBe(2);
      const c = cfg([{ Marca: 'La', Sede: '14' }], { name: 'Marca' });
      c.mapping.name = ['Marca', 'Sede'];
      c.transforms = { name: { type: 'concat', separator: ' ' } };
      const job2 = await imports.start(A.id, actor, c);
      expect(job2.createdRecords).toBe(1);
      expect((await orgs(A)).map((o) => o.name)).toContain('La 14');
    });

    it('importa las filas válidas, rechaza las inválidas y guarda cada error con su fila y campo', async () => {
      const rows: Row[] = [
        { N: 'Buena', E: 'a@b.co' },
        { N: 'Correo malo', E: 'malo' },
        { N: 'Otra buena', E: '' },
        { N: '', E: '' },
      ];
      const job = await importFile(A, rows, { name: 'N', email: 'E' });
      expect(job).toMatchObject({ status: 'completed_with_errors', createdRecords: 2, errorRows: 2, validRows: 2, totalRows: 4 });
      expect((await orgs(A)).map((o) => o.name)).toEqual(['Buena', 'Otra buena']);
      const errs = await jobErrors(job.id);
      expect(errs.map((e) => [e.rowNumber, e.field, e.phase, e.severity])).toEqual([
        [2, 'email', 'validation', 'error'],
        [4, 'name', 'validation', 'error'],
      ]);
      expect(errs[0].originalValue).toBe('malo');
    });

    it('guarda la plantilla de mapeo como de empresas', async () => {
      await importFile(A, [{ N: 'X1' }], { name: 'N' }, { headers: ['N'], templateName: 'auto' });
      expect(savedTemplates).toHaveLength(1);
      expect(savedTemplates[0][5]).toBe('companies');
      expect(savedTemplates[0][2]).toBe(A.id);
    });

    it('un archivo grande se encola en lugar de ejecutarse en la petición', async () => {
      const rows = Array.from({ length: SYNC_IMPORT_LIMIT + 1 }, (_, i) => ({ N: `Empresa ${i}` }));
      const job = await importFile(A, rows, { name: 'N' });
      expect(job.status).toBe('pending');
      expect(queued).toEqual([{ jobId: job.id, fileId: job.fileId }]);
      expect((await orgs(A)).length).toBe(0);
      // El worker llama a run(): ahora sí se procesa.
      await imports.run(job.id, job.fileId!);
      const done = await ds.getRepository(ImportJob).findOneByOrFail({ id: job.id });
      expect(done).toMatchObject({ status: 'completed', createdRecords: SYNC_IMPORT_LIMIT + 1 });
    });

    it('no ejecuta dos veces el mismo trabajo ni uno con archivo vencido', async () => {
      const job = await importFile(A, [{ N: 'Una' }], { name: 'N' });
      expect(job.status).toBe('completed');
      await imports.run(job.id, 'file-x');
      expect((await orgs(A)).length).toBe(1);

      const repo = ds.getRepository(ImportJob);
      const stale = await repo.save(repo.create({ tenantId: A.id, entity: 'companies', fileName: 'x.csv', fileType: 'csv', status: 'pending', mapping: { name: ['N'] }, totalRows: 1 }));
      await imports.run(stale.id, 'archivo-que-no-existe');
      expect(await repo.findOneByOrFail({ id: stale.id })).toMatchObject({ status: 'failed', errorMessage: expect.stringMatching(/expiró/) });
      await imports.run('00000000-0000-0000-0000-000000000099', 'x');
    });

    it('un lote grande con cadenas y sucursales se importa completo', async () => {
      const rows: Row[] = [];
      for (let c = 0; c < 100; c++) {
        rows.push({ N: `Cadena ${c}`, D: `C-${c}`, P: '' });
        for (let b = 0; b < 9; b++) rows.push({ N: `Cadena ${c} sucursal ${b}`, D: '', P: `C-${c}` });
      }
      const job = await importFile(A, rows, { name: 'N', documentNumber: 'D', parent: 'P' });
      expect(job).toMatchObject({ status: 'completed', createdRecords: 1000, errorRows: 0 });
      const roots = await ds.query('SELECT count(*)::int AS n FROM organizations WHERE tenant_id = $1 AND parent_id IS NULL', [A.id]);
      expect(roots[0].n).toBe(100);
      const branches = await ds.query('SELECT count(*)::int AS n FROM organizations WHERE tenant_id = $1 AND parent_id IS NOT NULL', [A.id]);
      expect(branches[0].n).toBe(900);
    });

    it('audita la importación con conteos y sin datos de las empresas', async () => {
      const job = await importFile(A, [{ N: 'Con doc', D: 'SECRETO-77' }, { N: 'x' }], { name: 'N', documentNumber: 'D' });
      const log = await ds.getRepository(TenantAuditLog).findOneByOrFail({ action: 'companies.organization.import-file' });
      expect(log.metadata).toEqual({ jobId: job.id, created: 1, updated: 0, skipped: 0, rejected: 1 });
      expect(JSON.stringify(log)).not.toContain('SECRETO-77');
      expect(log.tenantId).toBe(A.id);
    });
  });

  describe('matriz y sucursales', () => {
    it('une sucursales con su cadena por nombre o documento, dentro del archivo o ya existente', async () => {
      const existing = await seed(A, { name: 'Cadena Previa', documentNumber: 'CP-1' });
      const rows: Row[] = [
        { N: 'Sucursal Norte', P: 'cadena nueva' },
        { N: 'Cadena Nueva', P: '' },
        { N: 'Sucursal Previa', P: 'cp-1' },
        { N: 'Sucursal Previa 2', P: 'Cadena Previa' },
      ];
      const job = await importFile(A, rows, { name: 'N', parent: 'P' });
      expect(job).toMatchObject({ createdRecords: 4, errorRows: 0 });
      expect((await byName(A, 'Sucursal Norte')).parentId).toBe((await byName(A, 'Cadena Nueva')).id);
      expect((await byName(A, 'Sucursal Previa')).parentId).toBe(existing.id);
      expect((await byName(A, 'Sucursal Previa 2')).parentId).toBe(existing.id);
    });

    it('rechaza matriz inexistente, ambigua, de otra cuenta, que sea sucursal o con errores', async () => {
      await seed(A, { name: 'Repetida' });
      await seed(A, { name: 'Repetida' });
      await seed(B, { name: 'Solo de B' });
      const chain = await seed(A, { name: 'Cadena' });
      await seed(A, { name: 'Hija', parentId: chain.id });
      const rows: Row[] = [
        { N: 'S1', P: 'No existe' },
        { N: 'S2', P: 'Repetida' },
        { N: 'S3', P: 'Solo de B' },
        { N: 'S4', P: 'Hija' },
        { N: 'S5', P: 'Cadena mala' },
        { N: 'Cadena mala', P: '', E: 'malo' },
      ];
      const job = await importFile(A, rows, { name: 'N', parent: 'P', email: 'E' });
      expect(job).toMatchObject({ createdRecords: 0, errorRows: 6, status: 'completed_with_errors' });
      const msgs = Object.fromEntries((await jobErrors(job.id)).map((e) => [e.rowNumber, e.message]));
      expect(msgs[1]).toMatch(/No se encontró/);
      expect(msgs[2]).toMatch(/ambigua/);
      expect(msgs[3]).toMatch(/No se encontró/);
      expect(msgs[4]).toMatch(/No se encontró/);
      expect(msgs[5]).toMatch(/tiene errores/);
    });

    it('al reimportar, las sucursales cuelgan de la cadena que ya existía y no se duplica nada', async () => {
      const rows: Row[] = [
        { N: 'Cadena', D: 'CH-1', P: '' },
        { N: 'Sucursal Uno', D: '', P: 'CH-1' },
      ];
      await importFile(A, rows, { name: 'N', documentNumber: 'D', parent: 'P' }, { matchFields: ['documentNumber'] });
      const second = await importFile(
        A,
        [...rows, { N: 'Sucursal Dos', D: '', P: 'CH-1' }],
        { name: 'N', documentNumber: 'D', parent: 'P' },
        { matchFields: ['documentNumber'], deduplicateStrategy: 'keep_existing' },
      );
      expect(second).toMatchObject({ createdRecords: 2, skippedRecords: 1, errorRows: 0, duplicateRows: 1 });
      const chain = await byName(A, 'Cadena');
      expect((await byName(A, 'Sucursal Dos')).parentId).toBe(chain.id);
      expect((await orgs(A)).filter((o) => o.name === 'Sucursal Uno')).toHaveLength(2);
    });
  });

  describe('duplicados', () => {
    it('un documento que ya existe, sin elegirlo como criterio, es un error de esa fila', async () => {
      await seed(A, { name: 'Previa', documentNumber: 'D-1' });
      await seed(B, { name: 'De B', documentNumber: 'D-2' });
      const job = await importFile(A, [{ N: 'Nueva', D: 'd-1' }, { N: 'Otra', D: 'D-2' }], { name: 'N', documentNumber: 'D' });
      expect(job).toMatchObject({ createdRecords: 1, errorRows: 1 });
      expect((await jobErrors(job.id))[0]).toMatchObject({ rowNumber: 1, field: 'documentNumber', phase: 'deduplicate' });
      expect((await jobErrors(job.id))[0].message).toMatch(/Ya existe una empresa con ese documento: Previa/);
    });

    it('detecta por documento, correo, teléfono y nombre con ciudad', async () => {
      await seed(A, { name: 'Por documento', documentNumber: 'DOC-1' });
      await seed(A, { name: 'Por correo', email: 'hola@corr.co' });
      await seed(A, { name: 'Por telefono', phones: [{ number: '+57 300 111 2233' }] });
      await seed(A, { name: 'Tienda Centro', city: 'Cali' });
      const rows: Row[] = [
        { N: 'X1', D: 'doc-1' },
        { N: 'X2', C: 'HOLA@corr.co' },
        { N: 'X3', T: '(57) 300-111-2233' },
        { N: 'Tienda centro', Ci: 'cali' },
        { N: 'Tienda Centro', Ci: 'Bogotá' },
        { N: 'Nueva', D: 'N-1' },
      ];
      const job = await importFile(A, rows, { name: 'N', documentNumber: 'D', email: 'C', phone1: 'T', city: 'Ci' }, { matchFields: ['documentNumber', 'email', 'phone1', 'name'], deduplicateStrategy: 'keep_existing' });
      expect(job).toMatchObject({ duplicateRows: 4, skippedRecords: 4, createdRecords: 2 });
      expect((await orgs(A)).map((o) => o.name).sort()).toEqual(['Nueva', 'Por correo', 'Por documento', 'Por telefono', 'Tienda Centro', 'Tienda Centro'].sort());
    });

    it('no toca las empresas de otra cuenta aunque coincidan', async () => {
      const foreign = await seed(B, { name: 'Compartida', documentNumber: 'SAME-1', city: 'Lima' });
      const job = await importFile(A, [{ N: 'Compartida', D: 'SAME-1', Ci: 'Cali' }], { name: 'N', documentNumber: 'D', city: 'Ci' }, { matchFields: ['documentNumber'], deduplicateStrategy: 'overwrite' });
      expect(job).toMatchObject({ createdRecords: 1, updatedRecords: 0, duplicateRows: 0 });
      expect(await ds.getRepository(Organization).findOneByOrFail({ id: foreign.id })).toMatchObject({ city: 'Lima' });
    });

    it('exige mapear el campo usado para detectar duplicados', () => {
      expect(() => imports.parseConfig({ fileId: 'f', mapping: { name: ['N'] }, matchFields: ['email'] })).toThrow(/Mapea el campo/);
    });

    it('mantener existente no cambia nada', async () => {
      const o = await seed(A, { name: 'Previa', documentNumber: 'K-1', city: 'Cali' });
      const job = await importFile(A, [{ N: 'Previa', D: 'K-1', Ci: 'Bogotá', E: 'x@y.co' }], { name: 'N', documentNumber: 'D', city: 'Ci', email: 'E' }, { matchFields: ['documentNumber'], deduplicateStrategy: 'keep_existing' });
      expect(job).toMatchObject({ updatedRecords: 0, skippedRecords: 1, createdRecords: 0 });
      expect(await ds.getRepository(Organization).findOneByOrFail({ id: o.id })).toMatchObject({ city: 'Cali', email: null });
    });

    it('completar vacíos rellena lo que falta y suma teléfonos y etiquetas sin repetir', async () => {
      const o = await seed(A, { name: 'Previa', documentNumber: 'M-1', city: 'Cali', phones: [{ number: '3001112233' }], tags: ['vip'] });
      const job = await importFile(
        A,
        [{ N: 'Nombre distinto', D: 'M-1', Ci: 'Bogotá', E: 'x@y.co', T: '300-111-2233', T2: '602 555 1234', Etq: 'VIP;nuevo' }],
        { name: 'N', documentNumber: 'D', city: 'Ci', email: 'E', phone1: 'T', phone2: 'T2', tags: 'Etq' },
        { matchFields: ['documentNumber'], deduplicateStrategy: 'merge_non_empty' },
      );
      expect(job).toMatchObject({ updatedRecords: 1, createdRecords: 0 });
      expect(await ds.getRepository(Organization).findOneByOrFail({ id: o.id })).toMatchObject({
        name: 'Previa',
        city: 'Cali',
        email: 'x@y.co',
        phones: [{ number: '3001112233' }, { number: '602 555 1234' }],
        tags: ['vip', 'nuevo'],
      });
    });

    it('sobrescribir reemplaza lo que trae el archivo y no borra con celdas vacías', async () => {
      const o = await seed(A, { name: 'Previa', documentNumber: 'O-1', city: 'Cali', industry: 'Retail', phones: [{ number: '111111' }] });
      await importFile(A, [{ N: 'Previa SAS', D: 'O-1', Ci: 'Bogotá', I: '', T: '3009998877' }], { name: 'N', documentNumber: 'D', city: 'Ci', industry: 'I', phone1: 'T' }, { matchFields: ['documentNumber'], deduplicateStrategy: 'overwrite' });
      expect(await ds.getRepository(Organization).findOneByOrFail({ id: o.id })).toMatchObject({ name: 'Previa SAS', city: 'Bogotá', industry: 'Retail', phones: [{ number: '3009998877' }] });
    });

    it('sobrescribir campos elegidos solo toca esos', async () => {
      const o = await seed(A, { name: 'Previa', documentNumber: 'S-1', city: 'Cali', industry: 'Retail' });
      await importFile(A, [{ N: 'Otro', D: 'S-1', Ci: 'Bogotá', I: 'Moda' }], { name: 'N', documentNumber: 'D', city: 'Ci', industry: 'I' }, { matchFields: ['documentNumber'], deduplicateStrategy: 'overwrite_selected', overwriteFields: ['city'] });
      expect(await ds.getRepository(Organization).findOneByOrFail({ id: o.id })).toMatchObject({ name: 'Previa', city: 'Bogotá', industry: 'Retail' });
    });

    it('una actualización que choca con el documento de otra empresa se informa y no se aplica', async () => {
      await seed(A, { name: 'Dueña del documento', documentNumber: 'DUP-1' });
      const target = await seed(A, { name: 'Objetivo', email: 'obj@x.co', documentNumber: 'DUP-0' });
      const job = await importFile(A, [{ N: 'Objetivo', E: 'obj@x.co', D: 'DUP-1' }], { name: 'N', email: 'E', documentNumber: 'D' }, { matchFields: ['email'], deduplicateStrategy: 'overwrite' });
      expect(job).toMatchObject({ updatedRecords: 0, status: 'completed_with_errors' });
      expect((await jobErrors(job.id))[0]).toMatchObject({ phase: 'load' });
      expect(await ds.getRepository(Organization).findOneByOrFail({ id: target.id })).toMatchObject({ documentNumber: 'DUP-0' });
    });

    it('no repite el mismo documento dentro del archivo', async () => {
      const job = await importFile(A, [{ N: 'Uno', D: 'R-1' }, { N: 'Dos', D: 'r-1' }, { N: 'Tres', D: 'R-2' }], { name: 'N', documentNumber: 'D' });
      expect(job).toMatchObject({ createdRecords: 2, errorRows: 1 });
      expect((await jobErrors(job.id))[0]).toMatchObject({ rowNumber: 2, field: 'documentNumber' });
    });
  });

  describe('vista previa de duplicados', () => {
    it('cuenta nuevos y duplicados y muestra ejemplos', async () => {
      await seed(A, { name: 'Previa', documentNumber: 'P-1', city: 'Cali' });
      const rows: Row[] = [{ N: 'Previa', D: 'p-1' }, { N: 'Nueva', D: 'N-1' }, { N: 'x' }];
      const res = await imports.deduplicatePreview(A.id, cfg(rows, { name: 'N', documentNumber: 'D' }, { matchFields: ['documentNumber'] }));
      expect(res).toMatchObject({ totalRows: 3, total: 2, new: 1, duplicatesCount: 1, isEstimate: false, sampleDupRate: 50 });
      expect(res.duplicates).toHaveLength(1);
      expect(res.duplicates[0]).toMatchObject({ rowNumber: 1, matchedOn: ['documentNumber'], incoming: { name: 'Previa', documentNumber: 'P-1' }, existing: { name: 'Previa', city: 'Cali' } });
    });

    it('estima en archivos grandes y no mira otras cuentas', async () => {
      await seed(B, { name: 'Ajena', documentNumber: 'Z-0' });
      for (let i = 0; i < 50; i++) await seed(A, { name: `Previa ${i}`, documentNumber: `Z-${i}` });
      const rows = Array.from({ length: 1000 }, (_, i) => ({ N: `Empresa ${i}`, D: `Z-${i % 100}` }));
      const res = await imports.deduplicatePreview(A.id, cfg(rows, { name: 'N', documentNumber: 'D' }, { matchFields: ['documentNumber'] }));
      expect(res.isEstimate).toBe(true);
      expect(res.totalSample).toBeLessThanOrEqual(200);
      expect(res.duplicatesCount).toBeGreaterThan(0);
      expect(res.duplicatesCount).toBeLessThan(1000);
    });
  });

  describe('applyUpdate', () => {
    const base = () => ({ name: 'A', city: 'Cali', phones: [{ number: '111111' }], tags: ['a'], lat: null, lng: null }) as unknown as Organization;
    it('las coordenadas se aplican juntas o no se aplican', () => {
      const o = base();
      expect(applyUpdate(o, { lat: 4, lng: -74 }, 'merge_non_empty', [])).toEqual(['lat', 'lng']);
      const p = base();
      expect(applyUpdate(p, { lat: 4 } as any, 'overwrite', [])).toEqual([]);
      expect(p.lat).toBeNull();
      const q = { ...base(), lat: 1, lng: 2 } as unknown as Organization;
      expect(applyUpdate(q, { lat: 4, lng: -74 }, 'merge_non_empty', [])).toEqual([]);
      expect(applyUpdate(q, { lat: 4, lng: -74 }, 'overwrite', [])).toEqual(['lat', 'lng']);
    });

    it('nunca asigna la matriz y no cambia si no hay diferencias', () => {
      const o = base();
      expect(applyUpdate(o, { parentId: 'x', city: 'Cali' } as any, 'overwrite', [])).toEqual([]);
      expect((o as any).parentId).toBeUndefined();
    });

    it('sobrescribir teléfonos elegidos por phone1 o phone2 reemplaza la lista', () => {
      const o = base();
      expect(applyUpdate(o, { phones: [{ number: '222222' }] }, 'overwrite_selected', ['phone2'])).toEqual(['phones']);
      expect(o.phones).toEqual([{ number: '222222' }]);
    });
  });
});
