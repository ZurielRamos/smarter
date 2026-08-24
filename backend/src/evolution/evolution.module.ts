import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EvolutionService } from './evolution.service';
import { EvolutionController, EvolutionWebhookController } from './evolution.controller';
import { ChatsModule } from '../chats/chats.module';

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => ChatsModule),
  ],
  providers: [EvolutionService],
  controllers: [EvolutionController, EvolutionWebhookController],
  exports: [EvolutionService],
})
export class EvolutionModule {}
