import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from '../tenants/tenant.entity';
import { ClientRecord } from '../records/record.entity';
import { CustomField } from '../records/custom-field.entity';
import { Inbox } from '../chats/inbox.entity';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BillingModule } from '../billing/billing.module';
import { MailModule } from '../mail/mail.module';
import { WhatsAppService } from '../campaigns/whatsapp.service';
import {
  Course,
  CourseLesson,
  CourseQuiz,
  CourseQuestion,
  CourseEnrollment,
  CourseLessonProgress,
  CourseQuizAttempt,
  CourseOtp,
  CourseCertificate,
} from './entities';
import { CursosController } from './cursos.controller';
import { CursosService } from './cursos.service';
import { CursosScoringService } from './cursos-scoring.service';
import { CursosCrmService } from './cursos-crm.service';
import { CursosOtpService } from './cursos-otp.service';
import { CursosPortalService } from './cursos-portal.service';

/**
 * Módulo Cursos (academy): cursos con clases, material (YouTube/archivos/video
 * subido), preguntas ponderadas con tiempos límite, examen final, inscripciones
 * de participantes (contactos del CRM sin login, por token) y ranking con
 * premios. Cobra créditos por clase completada.
 *
 * Tenant se incluye en forFeature porque ModuleFeatureGuard inyecta su repo.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Course,
      CourseLesson,
      CourseQuiz,
      CourseQuestion,
      CourseEnrollment,
      CourseLessonProgress,
      CourseQuizAttempt,
      CourseOtp,
      CourseCertificate,
      Tenant,
      ClientRecord,
      CustomField,
      Inbox,
    ]),
    BillingModule,
    MailModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET', 'stratecast-super-secret-key'),
      }),
    }),
  ],
  controllers: [CursosController],
  providers: [
    CursosService,
    CursosScoringService,
    CursosCrmService,
    CursosOtpService,
    CursosPortalService,
    WhatsAppService,
  ],
  exports: [CursosService],
})
export class CursosModule {}
