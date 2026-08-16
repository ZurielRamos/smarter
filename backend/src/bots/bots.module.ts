import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Bot } from './bot.entity';
import { BotTool } from './bot-tool.entity';
import { BotsService } from './bots.service';
import { BotsController } from './bots.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Bot, BotTool])],
  controllers: [BotsController],
  providers: [BotsService],
  exports: [BotsService],
})
export class BotsModule {}
