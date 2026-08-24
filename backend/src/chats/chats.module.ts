import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Inbox } from './inbox.entity';
import { Conversation } from './conversation.entity';
import { Message } from './message.entity';
import { InboxCollaborator } from './inbox-collaborator.entity';
import { ClientRecord } from '../records/record.entity';
import { Label } from './label.entity';
import { Tenant } from '../tenants/tenant.entity';
import { Activity } from '../records/activity.entity';
import { CampaignSendLog } from '../campaigns/campaign-send-log.entity';
import { ChatsService } from './chats.service';
import { ChatsController, WebhookController } from './chats.controller';
import { ApiConversationsController } from './api-conversations.controller';
import { ApiMessagesController } from './api-messages.controller';
import { ApiInboxesController } from './api-inboxes.controller';
import { ChatWidgetController } from './chat-widget.controller';
import { MailgunWebhookController } from './mailgun-webhook.controller';
import { ApiEmailController } from './api-email.controller';
import { ChatsGateway } from './chats.gateway';
import { ChatWidgetGateway } from './chat-widget.gateway';
import { WebhookForwarderService } from './webhook-forwarder.service';
import { BillingModule } from '../billing/billing.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ConversionsModule } from '../conversions/conversions.module';
import { BotsModule } from '../bots/bots.module';
import { EvolutionModule } from '../evolution/evolution.module';
import { ProvidersModule } from '../providers/providers.module';
import { TemplatesModule } from '../templates/templates.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Inbox, Conversation, Message, InboxCollaborator, ClientRecord, Label, Tenant, Activity, CampaignSendLog]),
    BillingModule,
    WebhooksModule,
    UsersModule,
    NotificationsModule,
    ConversionsModule,
    BotsModule,
    forwardRef(() => EvolutionModule),
    ProvidersModule,
    TemplatesModule,
  ],
  providers: [ChatsService, ChatsGateway, ChatWidgetGateway, WebhookForwarderService],
  controllers: [ChatsController, ApiConversationsController, ApiMessagesController, ApiInboxesController, ChatWidgetController, WebhookController, MailgunWebhookController, ApiEmailController],
  exports: [ChatsService, ChatsGateway, ChatWidgetGateway],
})
export class ChatsModule {}
