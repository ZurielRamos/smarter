import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from '../tenants/tenant.entity';
import { BullModule } from '@nestjs/bullmq';
import { MailModule } from '../mail/mail.module';
import { BillingModule } from '../billing/billing.module';
import { RecordsModule } from '../records/records.module';
import { ChatsModule } from '../chats/chats.module';
import { ClientRecord } from '../records/record.entity';
import { Inbox } from '../chats/inbox.entity';
import { Conversation } from '../chats/conversation.entity';
import { AUTOMATION_QUEUE, AutomationDispatcher } from './automation-dispatcher.service';
import { AutomationRunWorker } from './automation-run.worker';
import { AutomationCrmService } from './automation-crm.service';
import { AutomationEventsSubscriber } from './automation-events.subscriber';
import { Automation } from './automation.entity';
import { AutomationRun } from './automation-run.entity';
import { AutomationConnection } from './automation-connection.entity';
import { AutomationEngine } from './automation-engine.service';
import { AutomatizacionesService } from './automatizaciones.service';
import {
  AutomatizacionesController,
  AutomationHooksController,
} from './automatizaciones.controller';

/**
 * Módulo Automatizaciones: canvas de flujos con disparadores (manual,
 * webhook, programado, eventos del CRM), lógica (condición, bucle, variables, espera) e
 * integraciones (HTTP, email, Slack, Discord, Telegram, IA) y acciones del CRM
 * (enviar mensajes, buscar/crear contactos). Las ejecuciones en segundo plano
 * corren en una cola BullMQ y cada ejecución puede cobrar créditos
 * (acción `automation_run`).
 * Requiere el feature flag `automatizaciones` en el tenant.
 */
@Module({
  imports: [
    // Tenant: lo necesita ModuleFeatureGuard.
    TypeOrmModule.forFeature([
      Automation,
      AutomationRun,
      AutomationConnection,
      Tenant,
      ClientRecord,
      Inbox,
      Conversation,
    ]),
    BullModule.registerQueue({ name: AUTOMATION_QUEUE }),
    MailModule,
    BillingModule,
    RecordsModule,
    ChatsModule,
  ],
  controllers: [
    // El controlador público de hooks va primero para que `hooks/:token`
    // no se confunda con `:id`.
    AutomationHooksController,
    AutomatizacionesController,
  ],
  providers: [
    AutomatizacionesService,
    AutomationEngine,
    AutomationDispatcher,
    AutomationCrmService,
    AutomationRunWorker,
    AutomationEventsSubscriber,
  ],
})
export class AutomatizacionesModule {}
