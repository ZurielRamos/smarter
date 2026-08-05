import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { AdEvent } from './ad-event.entity';
import { ConversionEvent } from './conversion-event.entity';
import { AdPlatform } from './ad-platform.entity';
import { ConversionLog } from './conversion-log.entity';
import { ContactEvent } from './contact-event.entity';
import { Tenant } from '../tenants/tenant.entity';
import { ConversionsService } from './conversions.service';
import { ContactEventsService } from './contact-events.service';
import { ConversionsController } from './conversions.controller';
import { ContactEventsController } from './contact-events.controller';
import { ApiContactEventsController } from './api-contact-events.controller';
import { LinkTrackerController } from './link-tracker.controller';
import { GoogleOAuthController } from './google-oauth.controller';
import { MetaOAuthController } from './meta-oauth.controller';
import { MetaDispatcher } from './dispatchers/meta.dispatcher';
import { GoogleDispatcher } from './dispatchers/google.dispatcher';
import { TikTokDispatcher } from './dispatchers/tiktok.dispatcher';
import { ConversionDispatchWorker } from './conversion-dispatch.worker';

@Module({
  imports: [
    TypeOrmModule.forFeature([AdEvent, ConversionEvent, AdPlatform, ConversionLog, ContactEvent, Tenant]),
    BullModule.registerQueue({ name: 'conversion-dispatch' }),
  ],
  providers: [ConversionsService, ContactEventsService, MetaDispatcher, GoogleDispatcher, TikTokDispatcher, ConversionDispatchWorker],
  controllers: [ConversionsController, ContactEventsController, ApiContactEventsController, LinkTrackerController, GoogleOAuthController, MetaOAuthController],
  exports: [ConversionsService, ContactEventsService],
})
export class ConversionsModule {}
