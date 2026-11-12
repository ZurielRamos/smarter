import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './notification.entity';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsGateway } from './notifications.gateway';
import { PresenceService } from './presence.service';
import { User } from '../users/user.entity';
import { DeviceToken } from './device-token.entity';
import { PushService } from './push.service';
import { DevicesController } from './devices.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Notification, User, DeviceToken])],
  providers: [NotificationsService, NotificationsGateway, PresenceService, PushService],
  controllers: [NotificationsController, DevicesController],
  exports: [NotificationsService, PresenceService],
})
export class NotificationsModule {}
