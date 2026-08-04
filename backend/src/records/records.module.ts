import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientRecord } from './record.entity';
import { CustomField } from './custom-field.entity';
import { RecordList } from './record-list.entity';
import { RecordsService } from './records.service';
import { RecordsController } from './records.controller';
import { CustomFieldsService } from './custom-fields.service';
import { CustomFieldsController } from './custom-fields.controller';
import { RecordListsService } from './record-lists.service';
import { RecordListsController } from './record-lists.controller';
import { WebhooksModule } from '../webhooks/webhooks.module';

@Module({
  imports: [TypeOrmModule.forFeature([ClientRecord, CustomField, RecordList]), WebhooksModule],
  providers: [RecordsService, CustomFieldsService, RecordListsService],
  controllers: [RecordsController, CustomFieldsController, RecordListsController],
  exports: [RecordsService, CustomFieldsService, RecordListsService],
})
export class RecordsModule {}
