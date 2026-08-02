import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Inbox } from './inbox.entity';
import { Conversation } from './conversation.entity';
import { Message } from './message.entity';
import { ClientRecord } from '../records/record.entity';
import { Label } from './label.entity';
import { ChatsService } from './chats.service';
import { ChatsController, WebhookController } from './chats.controller';
import { ChatsGateway } from './chats.gateway';

@Module({
  imports: [TypeOrmModule.forFeature([Inbox, Conversation, Message, ClientRecord, Label])],
  providers: [ChatsService, ChatsGateway],
  controllers: [ChatsController, WebhookController],
  exports: [ChatsService, ChatsGateway],
})
export class ChatsModule {}
