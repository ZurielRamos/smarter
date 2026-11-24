import 'reflect-metadata';
jest.mock('../media/media-storage.service', () => ({ MediaStorageService: class MediaStorageService {} }));
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Global, Module } from '@nestjs/common';
import { testDbEnabled, testDbUrl } from './testing/test-db';
import { AuditModule } from '../audit/audit.module';
import { MediaStorageService } from '../media/media-storage.service';
import { MailService } from '../mail/mail.service';
import { ReclutamientoModule } from './reclutamiento.module';

@Global()
@Module({ providers: [{ provide: MediaStorageService, useValue: {} }, { provide: MailService, useValue: {} }], exports: [MediaStorageService, MailService] })
class StubsModule {}

(testDbEnabled ? describe : describe.skip)('ReclutamientoModule', () => {
  it('resuelve todas sus dependencias', async () => {
    const mod = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), TypeOrmModule.forRoot({ type: 'postgres', url: testDbUrl, autoLoadEntities: true, synchronize: false }), StubsModule, AuditModule, ReclutamientoModule],
    })
      .overrideProvider(MailService).useValue({})
      .compile();
    await mod.close();
  });
});
