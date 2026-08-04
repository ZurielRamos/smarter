import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Campaign } from './campaign.entity';
import { CampaignSend } from './campaign-send.entity';
import { CampaignSendLog } from './campaign-send-log.entity';
import { ClientRecord } from '../records/record.entity';
import { ChannelConfig } from '../tenants/channel-config.entity';
import { RecordList } from '../records/record-list.entity';
import { CustomField } from '../records/custom-field.entity';
import { Inbox } from '../chats/inbox.entity';
import { Conversation } from '../chats/conversation.entity';
import { Message } from '../chats/message.entity';
import { CampaignsService } from './campaigns.service';
import { CampaignsController } from './campaigns.controller';
import { CampaignsGateway } from './campaigns.gateway';
import { CampaignSendWorker } from './campaign-send.worker';
import { CampaignSchedulerService } from './campaign-scheduler.service';
import { WhatsAppService } from './whatsapp.service';
import { CallService } from './call.service';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Campaign, CampaignSend, CampaignSendLog, ClientRecord, ChannelConfig, RecordList, CustomField, Inbox, Conversation, Message]),
    BullModule.registerQueue({ name: 'campaign-send' }),
    BillingModule,
  ],
  providers: [CampaignsService, WhatsAppService, CallService, CampaignsGateway, CampaignSendWorker, CampaignSchedulerService],
  controllers: [CampaignsController],
  exports: [CampaignsGateway],
})
export class CampaignsModule {}
