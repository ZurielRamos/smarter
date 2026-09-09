import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Inbox } from '../chats/inbox.entity';
import { Conversation } from '../chats/conversation.entity';
import { Message } from '../chats/message.entity';
import { ClientRecord } from '../records/record.entity';
import { ChatsModule } from '../chats/chats.module';
import { SendPulseService } from './sendpulse.service';
import { SendPulseSyncService } from './sendpulse-sync.service';
import { SendPulseSyncWorker, SENDPULSE_QUEUE } from './sendpulse-sync.worker';
import { SendPulseBridgeService } from './sendpulse-bridge.service';
import { SendPulseBridgeController } from './sendpulse-bridge.controller';
import { SendPulseWebhookController } from './sendpulse-webhook.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Inbox, Conversation, Message, ClientRecord]),
    BullModule.registerQueue({ name: SENDPULSE_QUEUE }),
    forwardRef(() => ChatsModule),
  ],
  providers: [
    SendPulseService,
    SendPulseSyncService,
    SendPulseSyncWorker,
    SendPulseBridgeService,
  ],
  controllers: [SendPulseBridgeController, SendPulseWebhookController],
  exports: [SendPulseService],
})
export class SendPulseModule {}
