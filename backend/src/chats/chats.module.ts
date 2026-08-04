import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Inbox } from './inbox.entity';
import { Conversation } from './conversation.entity';
import { Message } from './message.entity';
import { InboxCollaborator } from './inbox-collaborator.entity';
import { ClientRecord } from '../records/record.entity';
import { Label } from './label.entity';
import { Tenant } from '../tenants/tenant.entity';
import { ChatsService } from './chats.service';
import { ChatsController, WebhookController } from './chats.controller';
import { ApiConversationsController } from './api-conversations.controller';
import { ApiMessagesController } from './api-messages.controller';
import { ApiInboxesController } from './api-inboxes.controller';
import { ChatsGateway } from './chats.gateway';
import { WebhookForwarderService } from './webhook-forwarder.service';
import { BillingModule } from '../billing/billing.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Inbox, Conversation, Message, InboxCollaborator, ClientRecord, Label, Tenant]),
    BillingModule,
    WebhooksModule,
    UsersModule,
  ],
  providers: [ChatsService, ChatsGateway, WebhookForwarderService],
  controllers: [ChatsController, ApiConversationsController, ApiMessagesController, ApiInboxesController, WebhookController],
  exports: [ChatsService, ChatsGateway],
})
export class ChatsModule {}
