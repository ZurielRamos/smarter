import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Bot } from './bot.entity';
import { BotTool } from './bot-tool.entity';
import { BotsService } from './bots.service';
import { BotsController } from './bots.controller';
import { BillingModule } from '../billing/billing.module';
import { Message } from '../chats/message.entity';
import { Conversation } from '../chats/conversation.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Bot, BotTool, Message, Conversation]), BillingModule],
  controllers: [BotsController],
  providers: [BotsService],
  exports: [BotsService],
})
export class BotsModule {}
