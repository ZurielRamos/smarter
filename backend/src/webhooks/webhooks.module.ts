import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Webhook } from './webhook.entity';
import { WebhooksService } from './webhooks.service';
import { WebhooksController } from './webhooks.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Webhook])],
  providers: [WebhooksService],
  controllers: [WebhooksController],
  exports: [WebhooksService],
})
export class WebhooksModule {}
