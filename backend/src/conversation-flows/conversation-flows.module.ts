import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversationFlow } from './conversation-flow.entity';
import { ConversationFlowsService } from './conversation-flows.service';
import { ConversationFlowsController } from './conversation-flows.controller';
import { ConversationFlowEngine } from './conversation-flow.engine';

/**
 * Flujos conversacionales con botones (tipo SendPulse). No depende de
 * ChatsModule: el motor devuelve mensajes/efectos y ChatsService los envía.
 */
@Module({
  imports: [TypeOrmModule.forFeature([ConversationFlow])],
  controllers: [ConversationFlowsController],
  providers: [ConversationFlowsService, ConversationFlowEngine],
  exports: [ConversationFlowsService, ConversationFlowEngine],
})
export class ConversationFlowsModule {}
