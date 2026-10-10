import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsAppFlowsModule } from '../whatsapp-flows/whatsapp-flows.module';
import { FlowSubmissionsService } from '../whatsapp-flows/flow-submissions.service';
import { Survey } from './survey.entity';
import { SurveyResponse } from './survey-response.entity';
import { ClientRecord } from '../records/record.entity';
import { CustomField } from '../records/custom-field.entity';
import { SurveysController } from './surveys.controller';
import { SurveysService } from './surveys.service';
import { SurveyCrmService } from './survey-crm.service';

/**
 * Módulo de Encuestas.
 *
 * Entidades propias (Survey, SurveyResponse) para gestionar encuestas LOCALES
 * y sus respuestas (web + WhatsApp). El contenido se guarda en formato Meta
 * Flow JSON para ser 100% compatible, de modo que una encuesta pueda
 * convertirse en WhatsApp Flow de Meta reutilizando FlowProvisioningService
 * (de WhatsAppFlowsModule) sin reimplementar el provisioning.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Survey, SurveyResponse, ClientRecord, CustomField]),
    WhatsAppFlowsModule,
  ],
  controllers: [SurveysController],
  providers: [SurveysService, SurveyCrmService],
  exports: [SurveysService],
})
export class SurveysModule implements OnModuleInit {
  constructor(
    private readonly surveys: SurveysService,
    private readonly flowSubmissions: FlowSubmissionsService,
  ) {}

  /**
   * Registra el gancho para que las respuestas de encuestas enviadas por
   * WhatsApp Flows se reflejen como SurveyResponse con atribución al agente.
   * Se hace aquí (y no por inyección directa) para evitar dependencia circular
   * entre WhatsAppFlowsModule y SurveysModule.
   */
  onModuleInit(): void {
    this.flowSubmissions.setSurveyIngestor({
      ingestWhatsAppSubmission: (s) => this.surveys.ingestWhatsAppSubmission(s),
    });
  }
}
