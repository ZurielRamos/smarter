import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdEvent } from './ad-event.entity';
import { ConversionEvent } from './conversion-event.entity';
import { AdPlatform } from './ad-platform.entity';
import { ConversionLog } from './conversion-log.entity';
import { ConversionsService } from './conversions.service';
import { ConversionsController } from './conversions.controller';
import { MetaDispatcher } from './dispatchers/meta.dispatcher';

@Module({
  imports: [TypeOrmModule.forFeature([AdEvent, ConversionEvent, AdPlatform, ConversionLog])],
  providers: [ConversionsService, MetaDispatcher],
  controllers: [ConversionsController],
  exports: [ConversionsService],
})
export class ConversionsModule {}
