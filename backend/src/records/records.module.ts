import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientRecord } from './record.entity';
import { CustomField } from './custom-field.entity';
import { RecordList } from './record-list.entity';
import { Note } from './note.entity';
import { Activity } from './activity.entity';
import { Tenant } from '../tenants/tenant.entity';
import { RecordsService } from './records.service';
import { RecordsController } from './records.controller';
import { ApiRecordsController } from './api-records.controller';
import { CustomFieldsService } from './custom-fields.service';
import { CustomFieldsController } from './custom-fields.controller';
import { RecordListsService } from './record-lists.service';
import { RecordListsController } from './record-lists.controller';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [TypeOrmModule.forFeature([ClientRecord, CustomField, RecordList, Note, Activity, Tenant]), WebhooksModule, UsersModule, NotificationsModule],
  providers: [RecordsService, CustomFieldsService, RecordListsService],
  controllers: [RecordsController, ApiRecordsController, CustomFieldsController, RecordListsController],
  exports: [RecordsService, CustomFieldsService, RecordListsService],
})
export class RecordsModule {}
