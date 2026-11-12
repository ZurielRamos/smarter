import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversationFlow } from './conversation-flow.entity';
import { FlowLink } from './flow-link.entity';
import { CustomField } from '../records/custom-field.entity';
import { Bot } from '../bots/bot.entity';
import { ConversationFlowsService } from './conversation-flows.service';
import { ConversationFlowsController } from './conversation-flows.controller';
import { ConversationFlowEngine } from './conversation-flow.engine';
import { FlowLinksService } from './flow-links.service';
import { FlowAiService } from './flow-ai.service';
import { BillingModule } from '../billing/billing.module';
import { BotsModule } from '../bots/bots.module';

/**
 * Flujos conversacionales con botones (tipo SendPulse). No depende de
 * ChatsModule: el motor devuelve mensajes/efectos y ChatsService los envía.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ConversationFlow, FlowLink, CustomField, Bot]),
    // IA de los nodos Entrada (OpenRouter, créditos y transcripción de audio).
    BillingModule,
    BotsModule,
  ],
  controllers: [ConversationFlowsController],
  providers: [
    ConversationFlowsService,
    ConversationFlowEngine,
    FlowLinksService,
    FlowAiService,
  ],
  exports: [ConversationFlowsService, ConversationFlowEngine, FlowLinksService],
})
export class ConversationFlowsModule {}
