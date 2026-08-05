import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdEvent } from './ad-event.entity';
import { ConversionEvent } from './conversion-event.entity';
import { AdPlatform } from './ad-platform.entity';
import { ConversionLog } from './conversion-log.entity';
import { Tenant } from '../tenants/tenant.entity';
import { ConversionsService } from './conversions.service';
import { ConversionsController } from './conversions.controller';
import { LinkTrackerController } from './link-tracker.controller';
import { MetaDispatcher } from './dispatchers/meta.dispatcher';

@Module({
  imports: [TypeOrmModule.forFeature([AdEvent, ConversionEvent, AdPlatform, ConversionLog, Tenant])],
  providers: [ConversionsService, MetaDispatcher],
  controllers: [ConversionsController, LinkTrackerController],
  exports: [ConversionsService],
})
export class ConversionsModule {}
