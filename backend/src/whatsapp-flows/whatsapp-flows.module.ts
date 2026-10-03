import { Module, NestModule, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as express from 'express';
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

/**
 * Módulo del endpoint de WhatsApp Flows.
 *
 * Registra un parser JSON específico para la ruta del Flow que, además de
 * parsear el cuerpo, guarda el buffer crudo en `req.rawBody`. Ese raw body
 * es imprescindible para validar la firma HMAC `x-hub-signature-256`, ya que
 * cualquier re-serialización del JSON cambiaría los bytes y rompería el HMAC.
 *
 * Persistencia: entidades WhatsAppFlow (definición) y WhatsAppFlowSubmission
 * (respuestas), más repos de ClientRecord y Conversation para vincular cada
 * respuesta al contacto y a la conversación.
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
  ],
  exports: [
    FlowCryptoService,
    FlowDataService,
    FlowSubmissionsService,
    FlowsService,
    FlowSenderService,
  ],
})
export class WhatsAppFlowsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(
        express.json({
          type: () => true, // Meta puede enviar Content-Type variado.
          verify: (req: any, _res, buf: Buffer) => {
            req.rawBody = buf;
          },
        }),
      )
      .forRoutes({
        path: 'webhooks/whatsapp-flow',
        method: RequestMethod.POST,
      });
  }
}
