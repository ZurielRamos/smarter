import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Campaign } from './campaign.entity';
import { CampaignSend } from './campaign-send.entity';
import { CampaignSendLog } from './campaign-send-log.entity';
import { ClientRecord } from '../records/record.entity';
import { Activity } from '../records/activity.entity';
import { ChannelConfig } from '../tenants/channel-config.entity';
import { RecordList } from '../records/record-list.entity';
import { CustomField } from '../records/custom-field.entity';
import { Inbox } from '../chats/inbox.entity';
import { Conversation } from '../chats/conversation.entity';
import { Message } from '../chats/message.entity';
import { Tenant } from '../tenants/tenant.entity';
import { CampaignsService } from './campaigns.service';
import { CampaignsController } from './campaigns.controller';
import { ApiCampaignsController } from './api-campaigns.controller';
import { CampaignsGateway } from './campaigns.gateway';
import { CampaignSendWorker } from './campaign-send.worker';
import { CampaignSchedulerService } from './campaign-scheduler.service';
import { WhatsAppService } from './whatsapp.service';
import { CallService } from './call.service';
import { SmsService } from './sms.service';
import { EmailService } from './email.service';
import { BillingModule } from '../billing/billing.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TemplatesModule } from '../templates/templates.module';
import { ProvidersModule } from '../providers/providers.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Campaign, CampaignSend, CampaignSendLog, ClientRecord, Activity, ChannelConfig, RecordList, CustomField, Inbox, Conversation, Message, Tenant]),
    BullModule.registerQueue({ name: 'campaign-send' }),
    BillingModule,
    WebhooksModule,
    UsersModule,
    NotificationsModule,
    TemplatesModule,
    ProvidersModule,
  ],
  providers: [CampaignsService, WhatsAppService, CallService, SmsService, EmailService, CampaignsGateway, CampaignSendWorker, CampaignSchedulerService],
  controllers: [CampaignsController, ApiCampaignsController],
  exports: [CampaignsGateway],
})
export class CampaignsModule {}
