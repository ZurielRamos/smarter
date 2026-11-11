import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversationFlow } from './conversation-flow.entity';
import { FlowLink } from './flow-link.entity';
import { ConversationFlowsService } from './conversation-flows.service';
import { ConversationFlowsController } from './conversation-flows.controller';
import { ConversationFlowEngine } from './conversation-flow.engine';
import { FlowLinksService } from './flow-links.service';

/**
 * Flujos conversacionales con botones (tipo SendPulse). No depende de
 * ChatsModule: el motor devuelve mensajes/efectos y ChatsService los envía.
 */
@Module({
  imports: [TypeOrmModule.forFeature([ConversationFlow, FlowLink])],
  controllers: [ConversationFlowsController],
  providers: [
    ConversationFlowsService,
    ConversationFlowEngine,
    FlowLinksService,
  ],
  exports: [ConversationFlowsService, ConversationFlowEngine, FlowLinksService],
})
export class ConversationFlowsModule {}
