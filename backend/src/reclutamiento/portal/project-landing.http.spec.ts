/**
 * La landing de un proyecto por HTTP, como la usa el navegador: registro, sesión
 * y estado. Se omite si no hay base de pruebas (ver projects.integration.spec.ts).
 */
import 'reflect-metadata';
jest.mock('../../media/media-storage.service', () => ({ MediaStorageService: class MediaStorageService {} }));
import { INestApplication, Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { openTestDb, testDbEnabled, testDbUrl, TestDb } from '../testing/test-db';
import { AuditModule } from '../../audit/audit.module';
import { MediaStorageService } from '../../media/media-storage.service';
import { MailService } from '../../mail/mail.service';
import { Tenant } from '../../tenants/tenant.entity';
import { RecruitmentProject } from '../entities/recruitment-project.entity';
import { ReclutamientoModule } from '../reclutamiento.module';
import { PortalMessengerService } from './portal-messenger.service';

@Global()
@Module({ providers: [{ provide: MediaStorageService, useValue: {} }, { provide: MailService, useValue: {} }], exports: [MediaStorageService, MailService] })
class StubsModule {}

(testDbEnabled ? describe : describe.skip)('Landing de un proyecto por HTTP', () => {
  let db: TestDb;
  let app: INestApplication;
  const codes: string[] = [];

  beforeAll(async () => {
    db = await openTestDb();
    const mod = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), TypeOrmModule.forRoot({ type: 'postgres', url: testDbUrl, autoLoadEntities: true, synchronize: false }), StubsModule, AuditModule, ReclutamientoModule],
    })
      .overrideProvider(PortalMessengerService)
      .useValue({ sendEmail: async (_to: string, _s: string, body: string) => void codes.push(/\b(\d{6})\b/.exec(body)![1]), sendWhatsApp: async () => undefined })
      .compile();
    app = mod.createNestApplication();
    await app.init();
    const tenants = db.ds.getRepository(Tenant);
    const tenant = await tenants.save(tenants.create({ name: 'Research Control', slug: 'research-control', isActive: true, features: { reclutamiento: true } } as any) as unknown as Tenant);
    await db.ds.getRepository(RecruitmentProject).save(
      db.ds.getRepository(RecruitmentProject).create({ tenantId: tenant.id, name: 'Focus Group', slug: 'focus-group', status: 'active', registrationOpen: true }),
    );
  });

  afterAll(async () => {
    await app?.close();
    await db?.close();
  });

  const base = '/recruit-portal/research-control/projects/focus-group';

  it('registrarse deja una sesión que vale para ver el estado, sin volver al formulario', async () => {
    const http = request(app.getHttpServer());
    const req = await http.post(`${base}/register/request`).send({ fullName: 'Camila Torres', channel: 'email', destination: 'camila@correo.test', phone: '573001230000', consent: true, answers: {}, values: {} });
    expect(req.status).toBe(201);
    const verify = await http.post(`${base}/register/verify`).send({ otpId: req.body.otpId, code: codes.pop() });
    expect(verify.status).toBe(201);
    expect(verify.body).toMatchObject({ status: 'applied', sessionToken: expect.any(String) });

    const me = await http.get(`${base}/me`).set('x-portal-token', verify.body.sessionToken);
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ project: { name: 'Focus Group' }, person: { name: 'Camila Torres' }, role: 'participant', status: 'received' });
    // Sin token, o con uno ajeno, no se entra.
    expect((await http.get(`${base}/me`)).status).toBe(401);
    expect((await http.get(`${base}/me`).set('x-portal-token', 'basura')).status).toBe(401);
  });
});
