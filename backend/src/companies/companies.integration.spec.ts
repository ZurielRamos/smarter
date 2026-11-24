/**
 * Pruebas de integración de Empresas sobre un PostgreSQL real. Se omiten si no
 * hay base de pruebas.
 *
 *   docker run -d --rm --name smarter-test-pg -e POSTGRES_PASSWORD=test -e POSTGRES_DB=smarter_test -p 127.0.0.1:55432:5432 postgres
 *   TEST_DATABASE_URL=postgres://postgres:test@127.0.0.1:55432/smarter_test npx jest companies.integration
 *
 * Borra y recrea el esquema: se niega a correr si el nombre de la base no
 * contiene «test» (ver reclutamiento/testing/test-db.ts).
 */
import 'reflect-metadata';
// El ETL usa `uuid` (solo ESM, que Jest no carga); aquí no se ejecuta.
jest.mock('../etl/file-store.service', () => ({ FileStoreService: class FileStoreService {} }));
jest.mock('../etl/etl.service', () => ({ EtlService: class EtlService {} }));
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { openTestDb, testDbEnabled, TestDb } from '../reclutamiento/testing/test-db';
import { Tenant } from '../tenants/tenant.entity';
import { ClientRecord } from '../records/record.entity';
import { TenantAuditLog } from '../audit/tenant-audit-log.entity';
import { TenantAuditService } from '../audit/tenant-audit.service';
import { REQUIRES_FEATURE_KEY } from '../auth/requires-feature.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantAccessGuard } from '../auth/tenant-access.guard';
import { ModuleFeatureGuard } from '../auth/module-feature.guard';
import { CompaniesAccessGuard } from './companies-access.guard';
import { CompaniesController } from './companies.controller';
import { CompaniesImportController } from './companies-import.controller';
import { CompaniesService } from './companies.service';
import { CompaniesBulkService } from './companies-bulk.service';
import { Organization } from './entities/organization.entity';
import { ContactOrganization } from './entities/contact-organization.entity';

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

suite('Empresas (PostgreSQL)', () => {
  let db: TestDb;
  let ds: DataSource;
  let svc: CompaniesService;
  let bulk: CompaniesBulkService;
  let A: Tenant;
  let B: Tenant;

  const mkRecord = async (tenant: Tenant, fullName: string) => {
    const repo = ds.getRepository(ClientRecord);
    return repo.save(repo.create({ tenantId: tenant.id, fullName, phone: `+57${Math.floor(Math.random() * 1e9)}` } as any) as unknown as ClientRecord);
  };
  const mkOrg = (tenant: Tenant, body: Record<string, unknown>) => svc.create(tenant.id, actor, { name: 'Empresa', ...body });

  beforeAll(async () => {
    db = await openTestDb();
    ds = db.ds;
    svc = new CompaniesService(
      ds.getRepository(Organization),
      ds.getRepository(ContactOrganization),
      ds.getRepository(ClientRecord),
      ds,
      new TenantAuditService(ds.getRepository(TenantAuditLog)),
    );
    bulk = new CompaniesBulkService(ds.getRepository(Organization), ds, new TenantAuditService(ds.getRepository(TenantAuditLog)));
    const tenants = ds.getRepository(Tenant);
    A = await tenants.save(tenants.create({ name: 'Cuenta A', slug: 'cuenta-a', features: { companies: true } } as any) as unknown as Tenant);
    B = await tenants.save(tenants.create({ name: 'Cuenta B', slug: 'cuenta-b', features: { companies: true } } as any) as unknown as Tenant);
  });

  afterAll(async () => {
    await db?.close();
  });

  beforeEach(async () => {
    await ds.query('DELETE FROM contact_organizations');
    await ds.query('DELETE FROM clients');
    await ds.query('DELETE FROM organizations');
    await ds.getRepository(TenantAuditLog).clear();
  });

  describe('crear y leer', () => {
    it('crea con valores por defecto y normaliza el documento', async () => {
      const o = await mkOrg(A, { name: '  Supermercado La 14  ', documentNumber: ' 900.123-4 ', countryCode: 'co', lat: 4.6, lng: -74.08 });
      expect(o).toMatchObject({ name: 'Supermercado La 14', type: 'establishment', status: 'active', documentNumber: '900.123-4', countryCode: 'CO', lat: 4.6, lng: -74.08, parentId: null });
    });

    it('lista solo las empresas de la cuenta, con búsqueda literal', async () => {
      await mkOrg(A, { name: 'Alfa 100% Fresh', city: 'Cali' });
      await mkOrg(A, { name: 'Beta' });
      await mkOrg(B, { name: 'Alfa de otra cuenta' });
      const all = await svc.list(A.id, {});
      expect(all.total).toBe(2);
      expect((await svc.list(A.id, { search: '100%' })).data.map((o) => o.name)).toEqual(['Alfa 100% Fresh']);
      // `%` y `_` se buscan de forma literal, no como comodines.
      expect((await svc.list(A.id, { search: '%' })).total).toBe(1);
      expect((await svc.list(A.id, { search: '_' })).total).toBe(0);
      expect((await svc.list(A.id, { search: "'; DROP TABLE organizations;--" })).total).toBe(0);
      expect((await svc.list(A.id, {})).total).toBe(2);
    });

    it('filtra por tipo, estado y matriz, y pagina', async () => {
      const chain = await mkOrg(A, { name: 'Cadena', type: 'client' });
      await mkOrg(A, { name: 'Sucursal 1', parentId: chain.id });
      await mkOrg(A, { name: 'Sucursal 2', parentId: chain.id, status: 'inactive' });
      expect((await svc.list(A.id, { type: 'client' })).total).toBe(1);
      expect((await svc.list(A.id, { status: 'inactive' })).total).toBe(1);
      expect((await svc.list(A.id, { parentId: 'root' })).total).toBe(1);
      expect((await svc.list(A.id, { parentId: chain.id })).total).toBe(2);
      const p = await svc.list(A.id, { limit: 2, page: 2 });
      expect(p.data).toHaveLength(1);
      expect(p.total).toBe(3);
      expect((await rejects(svc.list(A.id, { type: 'nope' })))?.getStatus()).toBe(400);
      expect((await rejects(svc.list(A.id, { parentId: 'no-uuid' })))?.getStatus()).toBe(400);
    });

    it('la lista trae matriz, sucursales y contactos', async () => {
      const chain = await mkOrg(A, { name: 'Cadena' });
      const br = await mkOrg(A, { name: 'Sucursal', parentId: chain.id });
      const r = await mkRecord(A, 'Luis');
      await svc.linkContact(A.id, actor, chain.id, { recordId: r.id, role: 'owner' });
      await svc.linkContact(A.id, actor, chain.id, { recordId: r.id, role: 'manager' });
      const rows = (await svc.list(A.id, {})).data;
      expect(rows.find((o) => o.id === chain.id)).toMatchObject({ childCount: 1, contactCount: 1, parentName: null });
      expect(rows.find((o) => o.id === br.id)).toMatchObject({ childCount: 0, contactCount: 0, parentName: 'Cadena' });
    });
  });

  describe('documento único', () => {
    it('rechaza repetir el documento en la misma cuenta, sin importar mayúsculas ni espacios', async () => {
      const first = await mkOrg(A, { name: 'Uno', documentNumber: 'abc-1' });
      const e = await rejects(mkOrg(A, { name: 'Dos', documentNumber: '  ABC-1 ' }));
      expect(e?.getStatus()).toBe(409);
      expect(e.getResponse()).toMatchObject({ code: 'DUPLICATE_DOCUMENT', organizationId: first.id });
      expect(await ds.getRepository(Organization).count({ where: { tenantId: A.id } })).toBe(1);
    });

    it('permite varias empresas sin documento y el mismo documento en otra cuenta', async () => {
      await mkOrg(A, { name: 'Sin doc 1' });
      await mkOrg(A, { name: 'Sin doc 2' });
      await mkOrg(A, { name: 'Con doc', documentNumber: 'X-1' });
      await mkOrg(B, { name: 'Otra cuenta', documentNumber: 'X-1' });
    });

    it('en edición rechaza el de otra empresa y acepta conservar el propio', async () => {
      const a = await mkOrg(A, { name: 'Empresa A', documentNumber: 'D-1' });
      await mkOrg(A, { name: 'Empresa B', documentNumber: 'D-2' });
      expect((await rejects(svc.update(A.id, actor, a.id, { documentNumber: 'd-2' })))?.getStatus()).toBe(409);
      const same = await svc.update(A.id, actor, a.id, { documentNumber: 'd-1', city: 'Cali' });
      expect(same).toMatchObject({ documentNumber: 'D-1', city: 'Cali' });
    });

    it('el documento queda libre al eliminar la empresa', async () => {
      const a = await mkOrg(A, { name: 'Empresa A', documentNumber: 'D-9' });
      await svc.remove(A.id, actor, a.id);
      const again = await mkOrg(A, { name: 'A nueva', documentNumber: 'D-9' });
      expect(again.id).not.toBe(a.id);
    });

    it('la base lo impone aunque se salte la comprobación previa', async () => {
      await mkOrg(A, { name: 'Empresa A', documentNumber: 'R-1' });
      const repo = ds.getRepository(Organization);
      const e = await rejects(repo.save(repo.create({ tenantId: A.id, name: 'Directa', documentNumber: 'R-1' })));
      expect(e?.code ?? e?.driverError?.code).toBe('23505');
    });
  });

  describe('jerarquía', () => {
    it('una sucursal cuelga de una cadena; no hay tercer nivel', async () => {
      const chain = await mkOrg(A, { name: 'Cadena' });
      const br = await mkOrg(A, { name: 'Sucursal', parentId: chain.id });
      expect((await rejects(mkOrg(A, { name: 'Nieta', parentId: br.id })))?.getStatus()).toBe(400);
    });

    it('una empresa no es su propia matriz y una cadena con sucursales no pasa a sucursal', async () => {
      const chain = await mkOrg(A, { name: 'Cadena' });
      const other = await mkOrg(A, { name: 'Otra' });
      await mkOrg(A, { name: 'Sucursal', parentId: chain.id });
      expect((await rejects(svc.update(A.id, actor, chain.id, { parentId: chain.id })))?.getStatus()).toBe(400);
      expect((await rejects(svc.update(A.id, actor, chain.id, { parentId: other.id })))?.getStatus()).toBe(400);
      const moved = await svc.update(A.id, actor, other.id, { parentId: chain.id });
      expect(moved.parentId).toBe(chain.id);
      expect((await svc.update(A.id, actor, other.id, { parentId: null })).parentId).toBeNull();
    });

    it('la matriz debe ser de la misma cuenta', async () => {
      const foreign = await mkOrg(B, { name: 'Cadena de B' });
      expect((await rejects(mkOrg(A, { name: 'Sucursal', parentId: foreign.id })))?.getStatus()).toBe(404);
      const mine = await mkOrg(A, { name: 'Mía' });
      expect((await rejects(svc.update(A.id, actor, mine.id, { parentId: foreign.id })))?.getStatus()).toBe(404);
    });

    it('no se elimina una empresa con sucursales', async () => {
      const chain = await mkOrg(A, { name: 'Cadena' });
      const br = await mkOrg(A, { name: 'Sucursal', parentId: chain.id });
      const e = await rejects(svc.remove(A.id, actor, chain.id));
      expect(e?.getStatus()).toBe(409);
      expect(e.getResponse()).toMatchObject({ code: 'HAS_CHILDREN', childCount: 1 });
      await svc.remove(A.id, actor, br.id);
      await svc.remove(A.id, actor, chain.id);
      expect((await svc.list(A.id, {})).total).toBe(0);
    });
  });

  describe('aislamiento entre cuentas', () => {
    it('otra cuenta no puede leer, editar, eliminar ni vincular', async () => {
      const mine = await mkOrg(A, { name: 'Privada', documentNumber: 'P-1' });
      const foreignRecord = await mkRecord(B, 'Ajeno');
      expect((await rejects(svc.detail(B.id, mine.id)))?.getStatus()).toBe(404);
      expect((await rejects(svc.update(B.id, actor, mine.id, { name: 'Hack' })))?.getStatus()).toBe(404);
      expect((await rejects(svc.remove(B.id, actor, mine.id)))?.getStatus()).toBe(404);
      expect((await rejects(svc.linkContact(B.id, actor, mine.id, { recordId: foreignRecord.id })))?.getStatus()).toBe(404);
      expect(await ds.getRepository(Organization).findOneByOrFail({ id: mine.id })).toMatchObject({ name: 'Privada', deletedAt: null });
    });

    it('no se vincula un contacto de otra cuenta a una empresa propia', async () => {
      const mine = await mkOrg(A, { name: 'Mía' });
      const foreign = await mkRecord(B, 'Ajeno');
      const e = await rejects(svc.linkContact(A.id, actor, mine.id, { recordId: foreign.id }));
      expect(e?.getStatus()).toBe(404);
      expect(await ds.getRepository(ContactOrganization).count()).toBe(0);
    });

    it('no se desvincula un vínculo de otra empresa o de otra cuenta', async () => {
      const o1 = await mkOrg(A, { name: 'O1' });
      const o2 = await mkOrg(A, { name: 'O2' });
      const r = await mkRecord(A, 'Luis');
      const link = await svc.linkContact(A.id, actor, o1.id, { recordId: r.id });
      expect((await rejects(svc.unlinkContact(A.id, actor, o2.id, link.id)))?.getStatus()).toBe(404);
      expect((await rejects(svc.unlinkContact(B.id, actor, o1.id, link.id)))?.getStatus()).toBe(404);
      expect(await ds.getRepository(ContactOrganization).count()).toBe(1);
    });
  });

  describe('contactos vinculados', () => {
    it('vincula, muestra en el detalle y desvincula', async () => {
      const o = await mkOrg(A, { name: 'Tienda' });
      const r = await mkRecord(A, 'Luis Pérez');
      const link = await svc.linkContact(A.id, actor, o.id, { recordId: r.id, role: 'manager' });
      const d = await svc.detail(A.id, o.id);
      expect(d.contacts).toEqual([expect.objectContaining({ linkId: link.id, role: 'manager', recordId: r.id, name: 'Luis Pérez' })]);
      await svc.unlinkContact(A.id, actor, o.id, link.id);
      expect((await svc.detail(A.id, o.id)).contacts).toEqual([]);
    });

    it('el mismo contacto puede tener varios roles pero no repetir uno', async () => {
      const o = await mkOrg(A, { name: 'Tienda' });
      const r = await mkRecord(A, 'Luis');
      await svc.linkContact(A.id, actor, o.id, { recordId: r.id, role: 'owner' });
      await svc.linkContact(A.id, actor, o.id, { recordId: r.id, role: 'manager' });
      const dup = await rejects(svc.linkContact(A.id, actor, o.id, { recordId: r.id, role: 'owner' }));
      expect(dup?.getStatus()).toBe(409);
      // Rol por defecto: empleado.
      expect((await svc.linkContact(A.id, actor, o.id, { recordId: (await mkRecord(A, 'Eva')).id })).role).toBe('employee');
    });

    it('un contacto eliminado deja de aparecer y no cuenta', async () => {
      const o = await mkOrg(A, { name: 'Tienda' });
      const r = await mkRecord(A, 'Luis');
      await svc.linkContact(A.id, actor, o.id, { recordId: r.id });
      await ds.getRepository(ClientRecord).update({ id: r.id }, { deletedAt: new Date() });
      expect((await svc.detail(A.id, o.id)).contacts).toEqual([]);
      expect((await svc.list(A.id, {})).data[0].contactCount).toBe(0);
      expect((await rejects(svc.linkContact(A.id, actor, o.id, { recordId: r.id })))?.getStatus()).toBe(404);
    });

    it('al eliminar la empresa se borran sus vínculos', async () => {
      const o = await mkOrg(A, { name: 'Tienda' });
      await svc.linkContact(A.id, actor, o.id, { recordId: (await mkRecord(A, 'Luis')).id });
      await svc.remove(A.id, actor, o.id);
      expect(await ds.getRepository(ContactOrganization).count()).toBe(0);
    });

    it('rechaza rol o contacto inválidos', async () => {
      const o = await mkOrg(A, { name: 'Tienda' });
      const r = await mkRecord(A, 'Luis');
      expect((await rejects(svc.linkContact(A.id, actor, o.id, { recordId: r.id, role: 'jefe' })))?.getStatus()).toBe(400);
      expect((await rejects(svc.linkContact(A.id, actor, o.id, { recordId: 'x' })))?.getStatus()).toBe(400);
      expect((await rejects(svc.linkContact(A.id, actor, o.id, null)))?.getStatus()).toBe(400);
    });
  });

  describe('validación de entrada', () => {
    it('rechaza datos inválidos y no crea nada', async () => {
      const bad: Array<Record<string, unknown>> = [
        { name: 'a' },
        { name: 'x'.repeat(201) },
        { name: undefined },
        { type: 'otro-tipo' },
        { status: 'borrado' },
        { countryCode: 'COL' },
        { lat: 4.6 },
        { lng: 10 },
        { lat: 91, lng: 0 },
        { lat: 0, lng: 181 },
        { lat: 'abc', lng: 0 },
        { parentId: 'no-uuid' },
        { address: 'x'.repeat(301) },
        { documentNumber: 'x'.repeat(51) },
        { customData: 'texto' },
        { customData: { anidado: { a: 1 } } },
        { customData: { 'clave inválida!': 1 } },
        { customData: Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`k${i}`, 1])) },
        { customData: { grande: 'x'.repeat(9000) } },
      ];
      for (const extra of bad) {
        const body = { name: 'Empresa válida', ...extra };
        if ('name' in extra && extra.name === undefined) delete (body as any).name;
        const e = await rejects(svc.create(A.id, actor, body));
        expect(e?.getStatus?.()).toBe(400);
      }
      expect(await ds.getRepository(Organization).count()).toBe(0);
    });

    it('descarta claves reservadas en los campos personalizados', async () => {
      const o = await mkOrg(A, { customData: { __interno: 'x', horario: '8-18', tags: ['a', 'b'] } });
      expect(o.customData).toEqual({ horario: '8-18', tags: ['a', 'b'] });
    });

    it('un PATCH solo cambia lo enviado y puede vaciar campos', async () => {
      const o = await mkOrg(A, { name: 'Tienda', city: 'Cali', address: 'Calle 1', lat: 3.4, lng: -76.5 });
      const u = await svc.update(A.id, actor, o.id, { city: null, lat: null, lng: null });
      expect(u).toMatchObject({ name: 'Tienda', city: null, address: 'Calle 1', lat: null, lng: null });
      expect((await rejects(svc.update(A.id, actor, o.id, {})))?.getStatus()).toBe(400);
      expect((await rejects(svc.update(A.id, actor, o.id, { lat: 5 })))?.getStatus()).toBe(400);
    });

    it('no permite cambiar la cuenta ni el id desde el cuerpo', async () => {
      const o = await mkOrg(A, { name: 'Tienda' });
      const u = await svc.update(A.id, actor, o.id, { name: 'Renombrada', tenantId: B.id, id: '00000000-0000-0000-0000-000000000001' });
      expect(u).toMatchObject({ id: o.id, tenantId: A.id, name: 'Renombrada' });
      const c = await svc.create(A.id, actor, { name: 'Nueva', tenantId: B.id });
      expect(c.tenantId).toBe(A.id);
    });
  });

  describe('perfil de la empresa (contacto, tamaño y sector)', () => {
    it('guarda y normaliza los campos de perfil', async () => {
      const o = await mkOrg(A, {
        legalName: ' Distribuidora La 14 S.A.S. ',
        industry: 'Supermercados',
        size: 'medium',
        employeeRange: '51-200',
        phones: [{ number: '+57 602 555 1234', label: 'Oficina' }, '+57 300 111 2233', { number: '(57) 3001112233' }, { number: '' }],
        email: ' Compras@La14.CO ',
        website: 'www.la14.co/tiendas',
        postalCode: '760001',
        openingHours: 'L-S 8:00-20:00',
        tags: ['VIP', 'vip', ' Cadena ', ''],
        notes: 'Pedir cita con gerencia.',
      });
      expect(o).toMatchObject({
        legalName: 'Distribuidora La 14 S.A.S.',
        industry: 'Supermercados',
        size: 'medium',
        employeeRange: '51-200',
        email: 'compras@la14.co',
        website: 'https://www.la14.co/tiendas',
        postalCode: '760001',
        openingHours: 'L-S 8:00-20:00',
        tags: ['VIP', 'Cadena'],
        notes: 'Pedir cita con gerencia.',
      });
      // El mismo número escrito de otra forma no se repite.
      expect(o.phones).toEqual([{ number: '+57 602 555 1234', label: 'Oficina' }, { number: '+57 300 111 2233' }]);
    });

    it('rechaza valores inválidos de perfil', async () => {
      const bad: Array<Record<string, unknown>> = [
        { size: 'gigante' },
        { employeeRange: '10-20' },
        { phones: 'texto' },
        { phones: ['abc'] },
        { phones: [{ number: '123' }] },
        { phones: Array.from({ length: 6 }, (_, i) => `30011122${i}0`) },
        { phones: [{ number: '3001112233', label: 'x'.repeat(31) }] },
        { email: 'sin-arroba' },
        { website: 'ftp://sitio.co' },
        { website: 'javascript:alert(1)' },
        { website: 'localhost' },
        { tags: 'a,b' },
        { tags: Array.from({ length: 21 }, (_, i) => `t${i}`) },
        { tags: ['x'.repeat(51)] },
        { notes: 'x'.repeat(2001) },
        { legalName: 'x'.repeat(201) },
        { industry: 'x'.repeat(101) },
        { openingHours: 'x'.repeat(301) },
        { postalCode: 'x'.repeat(21) },
      ];
      for (const extra of bad) {
        expect((await rejects(mkOrg(A, extra)))?.getStatus?.()).toBe(400);
      }
      expect(await ds.getRepository(Organization).count()).toBe(0);
    });

    it('un PATCH puede vaciar los campos de perfil', async () => {
      const o = await mkOrg(A, { phones: ['3001112233'], email: 'a@b.co', tags: ['x'], size: 'small', notes: 'n' });
      const u = await svc.update(A.id, actor, o.id, { phones: [], email: null, tags: [], size: null, notes: '' });
      expect(u).toMatchObject({ phones: null, email: null, tags: null, size: null, notes: null });
    });

    it('la búsqueda encuentra por razón social, correo, sector y teléfono', async () => {
      await mkOrg(A, { name: 'Tienda Uno', legalName: 'Inversiones Andinas', email: 'info@andinas.co', industry: 'Ferretería', phones: ['+57 300 999 8877'] });
      await mkOrg(A, { name: 'Tienda Dos' });
      for (const term of ['andinas', 'info@andinas', 'ferret', '999 8877']) {
        expect((await svc.list(A.id, { search: term })).data.map((o) => o.name)).toEqual(['Tienda Uno']);
      }
      expect((await svc.list(A.id, { search: 'zzz' })).total).toBe(0);
    });
  });

  describe('auditoría', () => {
    it('registra crear, editar, vincular, desvincular y eliminar sin datos sensibles', async () => {
      const o = await mkOrg(A, { name: 'Tienda', documentNumber: 'SECRETO-1' });
      await svc.update(A.id, actor, o.id, { city: 'Cali' });
      const link = await svc.linkContact(A.id, actor, o.id, { recordId: (await mkRecord(A, 'Luis')).id });
      await svc.unlinkContact(A.id, actor, o.id, link.id);
      await svc.remove(A.id, actor, o.id);
      const logs = await ds.getRepository(TenantAuditLog).find({ where: { tenantId: A.id }, order: { createdAt: 'ASC' } });
      expect(logs.map((l) => l.action)).toEqual([
        'companies.organization.create',
        'companies.organization.update',
        'companies.contact.link',
        'companies.contact.unlink',
        'companies.organization.delete',
      ]);
      expect(logs[1].metadata).toEqual({ fields: ['city'] });
      expect(JSON.stringify(logs)).not.toContain('SECRETO-1');
    });

    it('no audita una edición sin cambios reales', async () => {
      const o = await mkOrg(A, { name: 'Tienda', city: 'Cali' });
      await svc.update(A.id, actor, o.id, { city: 'Cali' });
      expect(await ds.getRepository(TenantAuditLog).count({ where: { action: 'companies.organization.update' } })).toBe(0);
    });

    it('una falla revierte la acción y su auditoría', async () => {
      await mkOrg(A, { name: 'Uno', documentNumber: 'T-1' });
      const before = await ds.getRepository(TenantAuditLog).count();
      await rejects(mkOrg(A, { name: 'Dos', documentNumber: 'T-1' }));
      expect(await ds.getRepository(TenantAuditLog).count()).toBe(before);
    });
  });

  describe('empresas de un contacto y mapa', () => {
    it('lista las empresas de un contacto, ordenadas, sin las eliminadas ni las de otra cuenta', async () => {
      const r = await mkRecord(A, 'Luis');
      const zeta = await mkOrg(A, { name: 'Zeta' });
      const alfa = await mkOrg(A, { name: 'Alfa' });
      const gone = await mkOrg(A, { name: 'Borrada' });
      for (const o of [zeta, alfa, gone]) await svc.linkContact(A.id, actor, o.id, { recordId: r.id, role: 'manager' });
      await ds.getRepository(Organization).update({ id: gone.id }, { deletedAt: new Date() });
      expect((await svc.byContact(A.id, r.id)).data.map((x) => x.name)).toEqual(['Alfa', 'Zeta']);
      expect((await svc.byContact(B.id, r.id)).data).toEqual([]);
      expect((await rejects(svc.byContact(A.id, 'no-uuid')))?.getStatus()).toBe(400);
    });

    it('el mapa devuelve solo empresas con coordenadas de la cuenta y respeta filtros', async () => {
      await mkOrg(A, { name: 'Con punto', lat: 4.6, lng: -74.1, type: 'client' });
      await mkOrg(A, { name: 'Sin punto' });
      await mkOrg(A, { name: 'Otro punto', lat: 6.2, lng: -75.5 });
      await mkOrg(B, { name: 'De B', lat: 1, lng: 1 });
      const all = await svc.mapPoints(A.id, {});
      expect(all.data.map((o) => o.name)).toEqual(['Con punto', 'Otro punto']);
      expect(all.truncated).toBe(false);
      expect((await svc.mapPoints(A.id, { type: 'client' })).data).toHaveLength(1);
      expect((await svc.mapPoints(A.id, { search: 'otro' })).data[0]).toMatchObject({ name: 'Otro punto', lat: 6.2, lng: -75.5 });
    });
  });

  describe('migración desde el campo empresa de los contactos', () => {
    const mk = async (tenant: Tenant, name: string, company: string | null) => {
      const repo = ds.getRepository(ClientRecord);
      return repo.save(repo.create({ tenantId: tenant.id, fullName: name, company, phone: `+57${Math.floor(Math.random() * 1e9)}` } as any) as unknown as ClientRecord);
    };

    it('la vista previa cuenta sin escribir, agrupando mayúsculas y espacios', async () => {
      await mk(A, 'a', 'Acme');
      await mk(A, 'b', '  ACME ');
      await mk(A, 'c', 'Globex');
      await mk(A, 'd', '');
      await mk(A, 'e', null);
      await mk(A, 'f', 'X');
      await mk(B, 'g', 'Otra cuenta');
      const rep = await bulk.migrateFromContacts(A.id, actor, true);
      expect(rep).toEqual({ dryRun: true, distinctNames: 3, toCreate: 2, existing: 0, contactsToLink: 3, skipped: 1 });
      expect(await ds.getRepository(Organization).count()).toBe(0);
      expect(await ds.getRepository(ContactOrganization).count()).toBe(0);
    });

    it('crea clientes, vincula como empleados y conserva el texto del contacto', async () => {
      const a = await mk(A, 'a', 'Acme');
      const b = await mk(A, 'b', 'acme');
      await mk(A, 'c', 'Globex');
      const rep = await bulk.migrateFromContacts(A.id, actor, false);
      expect(rep).toMatchObject({ dryRun: false, toCreate: 2, existing: 0, contactsToLink: 3 });
      const orgs = await ds.getRepository(Organization).find({ where: { tenantId: A.id }, order: { name: 'ASC' } });
      expect(orgs.map((o) => [o.name, o.type, o.parentId])).toEqual([['Acme', 'client', null], ['Globex', 'client', null]]);
      const links = await ds.getRepository(ContactOrganization).find({ where: { tenantId: A.id } });
      expect(links.every((l) => l.role === 'employee')).toBe(true);
      expect(links.filter((l) => l.organizationId === orgs[0].id).map((l) => l.recordId).sort()).toEqual([a.id, b.id].sort());
      expect((await ds.getRepository(ClientRecord).findOneByOrFail({ id: a.id })).company).toBe('Acme');
    });

    it('se puede repetir sin duplicar empresas ni vínculos', async () => {
      await mk(A, 'a', 'Acme');
      await bulk.migrateFromContacts(A.id, actor, false);
      const again = await bulk.migrateFromContacts(A.id, actor, false);
      expect(again).toMatchObject({ toCreate: 0, existing: 1, contactsToLink: 0 });
      await mk(A, 'nuevo', 'ACME');
      const third = await bulk.migrateFromContacts(A.id, actor, true);
      expect(third).toMatchObject({ toCreate: 0, existing: 1, contactsToLink: 1 });
      expect(await ds.getRepository(Organization).count()).toBe(1);
      expect(await ds.getRepository(ContactOrganization).count()).toBe(1);
    });

    it('reutiliza una empresa raíz existente con el mismo nombre y respeta vínculos previos', async () => {
      const acme = await mkOrg(A, { name: 'acme', type: 'establishment' });
      const a = await mk(A, 'a', 'Acme');
      await svc.linkContact(A.id, actor, acme.id, { recordId: a.id, role: 'owner' });
      await mk(A, 'b', 'ACME');
      const rep = await bulk.migrateFromContacts(A.id, actor, false);
      expect(rep).toMatchObject({ toCreate: 0, existing: 1, contactsToLink: 1 });
      expect(await ds.getRepository(Organization).count()).toBe(1);
      const links = await ds.getRepository(ContactOrganization).find({ where: { organizationId: acme.id } });
      expect(links.find((l) => l.recordId === a.id)?.role).toBe('owner');
      expect(links).toHaveLength(2);
    });

    it('no toca contactos eliminados ni de otra cuenta, y no usa sucursales como destino', async () => {
      const del = await mk(A, 'borrado', 'Acme');
      await ds.getRepository(ClientRecord).update({ id: del.id }, { deletedAt: new Date() });
      await mk(B, 'de B', 'Acme');
      const chain = await mkOrg(A, { name: 'Cadena' });
      await mkOrg(A, { name: 'Acme', parentId: chain.id });
      await mk(A, 'a', 'Acme');
      const rep = await bulk.migrateFromContacts(A.id, actor, false);
      expect(rep).toMatchObject({ toCreate: 1, contactsToLink: 1 });
      expect(await ds.getRepository(Organization).count({ where: { tenantId: B.id } })).toBe(0);
      const created = await ds.getRepository(Organization).findOneByOrFail({ tenantId: A.id, name: 'Acme', type: 'client' });
      expect(created.parentId).toBeNull();
    });

    it('audita la migración y rechaza más nombres de los permitidos', async () => {
      await mk(A, 'a', 'Acme');
      await bulk.migrateFromContacts(A.id, actor, false);
      const log = await ds.getRepository(TenantAuditLog).findOneByOrFail({ action: 'companies.migrate-from-contacts' });
      expect(log.metadata).toEqual({ created: 1, reused: 0, linked: 1 });
      await ds.getRepository(Organization).createQueryBuilder().delete().execute();
      await ds.query(`INSERT INTO clients (id, tenant_id, full_name, company, phone) SELECT gen_random_uuid(), $1, 'n' || g, 'Empresa ' || g, '+1' || g FROM generate_series(1, 5001) g`, [A.id]);
      expect((await rejects(bulk.migrateFromContacts(A.id, actor, true)))?.getStatus()).toBe(400);
      await ds.query('DELETE FROM clients WHERE tenant_id = $1', [A.id]);
    });
  });

  describe('guards del controlador', () => {
    const guard = new CompaniesAccessGuard(new Reflector());
    const ctx = (method: string, user: any, params: Record<string, string> = { tenantId: A.id }, handler: unknown = () => undefined) =>
      ({
        getHandler: () => handler,
        getClass: () => CompaniesController,
        switchToHttp: () => ({ getRequest: () => ({ method, user, params }) }),
      }) as unknown as ExecutionContext;
    const member = (role: string, tenantId = A.id) => ({ tenantRoles: [{ tenantId, role, tenant: { id: tenantId } }] });
    const status = (fn: () => unknown) => {
      try {
        fn();
        return 200;
      } catch (e: any) {
        return e.getStatus();
      }
    };

    it('el controlador exige sesión, pertenencia, rol y flag, en ese orden', () => {
      expect(Reflect.getMetadata(GUARDS_METADATA, CompaniesController)).toEqual([JwtAuthGuard, TenantAccessGuard, CompaniesAccessGuard, ModuleFeatureGuard]);
      expect(Reflect.getMetadata(REQUIRES_FEATURE_KEY, CompaniesController)).toBe('companies');
    });

    it('lectura para cualquier miembro; no para quien no pertenece', () => {
      for (const role of ['owner', 'admin', 'agent', 'viewer']) expect(status(() => guard.canActivate(ctx('GET', member(role))))).toBe(200);
      expect(status(() => guard.canActivate(ctx('GET', member('admin', B.id))))).toBe(403);
      expect(status(() => guard.canActivate(ctx('GET', { tenantRoles: [] })))).toBe(403);
    });

    it('el viewer no escribe y el agente sí', () => {
      for (const m of ['POST', 'PATCH', 'DELETE']) expect(status(() => guard.canActivate(ctx(m, member('viewer'))))).toBe(403);
      for (const m of ['POST', 'PATCH']) expect(status(() => guard.canActivate(ctx(m, member('agent'))))).toBe(200);
    });

    it('eliminar una empresa exige admin; desvincular un contacto no', () => {
      expect(status(() => guard.canActivate(ctx('DELETE', member('agent'))))).toBe(403);
      expect(status(() => guard.canActivate(ctx('DELETE', member('admin'))))).toBe(200);
      expect(status(() => guard.canActivate(ctx('DELETE', member('owner'))))).toBe(200);
      const unlink = { tenantId: A.id, id: 'x', linkId: 'y' };
      expect(status(() => guard.canActivate(ctx('DELETE', member('agent'), unlink)))).toBe(200);
      expect(status(() => guard.canActivate(ctx('DELETE', member('viewer'), unlink)))).toBe(403);
    });

    it('la migración desde contactos exige admin; el agente puede importar', () => {
      const migrate = CompaniesController.prototype.migrate;
      const imp = CompaniesImportController.prototype.execute;
      expect(status(() => guard.canActivate(ctx('POST', member('agent'), undefined, migrate)))).toBe(403);
      expect(status(() => guard.canActivate(ctx('POST', member('viewer'), undefined, migrate)))).toBe(403);
      expect(status(() => guard.canActivate(ctx('POST', member('admin'), undefined, migrate)))).toBe(200);
      expect(status(() => guard.canActivate(ctx('POST', member('agent'), undefined, imp)))).toBe(200);
      expect(status(() => guard.canActivate(ctx('POST', member('viewer'), undefined, imp)))).toBe(403);
    });

    it('rechaza tenantId ausente o inválido y deja pasar al superadmin', () => {
      expect(status(() => guard.canActivate(ctx('GET', member('admin'), {})))).toBe(403);
      expect(status(() => guard.canActivate(ctx('GET', member('admin'), { tenantId: 'no-uuid' })))).toBe(400);
      expect(status(() => guard.canActivate(ctx('DELETE', { isSuperAdmin: true, tenantRoles: [] })))).toBe(200);
    });

    it('el flag apagado bloquea el módulo; sin definir también (apagado por defecto)', async () => {
      const mfg = new ModuleFeatureGuard({ getAllAndOverride: () => 'companies' } as any, ds.getRepository(Tenant));
      const run = (tenantId: string) =>
        mfg.canActivate({ getHandler: () => null, getClass: () => null, switchToHttp: () => ({ getRequest: () => ({ params: { tenantId } }) }) } as any);
      expect(await run(A.id)).toBe(true);
      const off = await ds.getRepository(Tenant).save(ds.getRepository(Tenant).create({ name: 'Sin flag', slug: 'sin-flag' } as any) as unknown as Tenant);
      expect((await rejects(run(off.id)))?.getStatus()).toBe(403);
      await ds.getRepository(Tenant).update(A.id, { features: { companies: false } });
      expect((await rejects(run(A.id)))?.getStatus()).toBe(403);
      await ds.getRepository(Tenant).update(A.id, { features: { companies: true } });
    });
  });
});
