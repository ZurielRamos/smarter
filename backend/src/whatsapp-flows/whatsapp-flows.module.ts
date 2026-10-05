import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FlowCryptoService } from './flow-crypto.service';
import { FlowDataService } from './flow-data.service';
import { FlowSubmissionsService } from './flow-submissions.service';
import { FlowsService } from './flows.service';
import { WhatsAppFlowsController } from './whatsapp-flows.controller';
import { FlowsController } from './flows.controller';
import { WhatsAppFlow } from './entities/whatsapp-flow.entity';
import { WhatsAppFlowSubmission } from './entities/whatsapp-flow-submission.entity';
import { ClientRecord } from '../records/record.entity';
import { Conversation } from '../chats/conversation.entity';
import { Inbox } from '../chats/inbox.entity';
import { FlowSenderService } from './flow-sender.service';
import { FlowSyncService } from './flow-sync.service';
import { FlowProvisioningService } from './flow-provisioning.service';

/**
 * Módulo del endpoint de WhatsApp Flows.
 *
 * El cuerpo crudo (req.rawBody), necesario para validar la firma HMAC
 * x-hub-signature-256, se captura en el parser JSON global de main.ts (el
 * único parser que procesa esta ruta). No se registra un parser adicional
 * aquí para evitar el doble parseo del stream, que dejaba el rawBody vacío.
 *
 * Persistencia: entidades WhatsAppFlow (definición) y WhatsAppFlowSubmission
 * (respuestas), más repos de ClientRecord, Conversation e Inbox para vincular
 * cada respuesta al contacto, a la conversación y al canal.
 */
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      WhatsAppFlow,
      WhatsAppFlowSubmission,
      ClientRecord,
      Conversation,
      Inbox,
    ]),
  ],
  controllers: [WhatsAppFlowsController, FlowsController],
  providers: [
    FlowCryptoService,
    FlowDataService,
    FlowSubmissionsService,
    FlowsService,
    FlowSenderService,
    FlowSyncService,
    FlowProvisioningService,
  ],
  exports: [
    FlowCryptoService,
    FlowDataService,
    FlowSubmissionsService,
    FlowsService,
    FlowSenderService,
    FlowSyncService,
    FlowProvisioningService,
  ],
})
export class WhatsAppFlowsModule {}
