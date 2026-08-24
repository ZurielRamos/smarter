import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Bot } from './bot.entity';
import { BotTool } from './bot-tool.entity';
import { BotToolLog } from './bot-tool-log.entity';
import { BotKnowledge } from './bot-knowledge.entity';
import { BotsService } from './bots.service';
import { BotsController } from './bots.controller';
import { BillingModule } from '../billing/billing.module';
import { Message } from '../chats/message.entity';
import { Conversation } from '../chats/conversation.entity';
import { SequentialFlowEngine } from './sequential-flow.engine';

@Module({
  imports: [TypeOrmModule.forFeature([Bot, BotTool, BotToolLog, BotKnowledge, Message, Conversation]), BillingModule],
  controllers: [BotsController],
  providers: [BotsService, SequentialFlowEngine],
  exports: [BotsService, SequentialFlowEngine],
})
export class BotsModule {}
