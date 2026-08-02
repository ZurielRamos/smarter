import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { MappingTemplate } from './mapping-template.entity';
import { RecordsModule } from '../records/records.module';

@Module({
  imports: [RecordsModule, TypeOrmModule.forFeature([MappingTemplate])],
  controllers: [UploadController],
  providers: [UploadService],
})
export class UploadModule {}
