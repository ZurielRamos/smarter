import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Campaign } from './campaign.entity';
import { CampaignSend } from './campaign-send.entity';
import { CampaignSendLog } from './campaign-send-log.entity';
import { ClientRecord } from '../records/record.entity';
import { ChannelConfig } from '../tenants/channel-config.entity';
import { RecordList } from '../records/record-list.entity';
import { CustomField } from '../records/custom-field.entity';
import { CampaignsService } from './campaigns.service';
import { CampaignsController } from './campaigns.controller';
import { WhatsAppService } from './whatsapp.service';
import { CallService } from './call.service';

@Module({
  imports: [TypeOrmModule.forFeature([Campaign, CampaignSend, CampaignSendLog, ClientRecord, ChannelConfig, RecordList, CustomField])],
  providers: [CampaignsService, WhatsAppService, CallService],
  controllers: [CampaignsController],
})
export class CampaignsModule {}
