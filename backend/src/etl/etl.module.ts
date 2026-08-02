import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { DataSource } from 'typeorm';
import { EtlController } from './etl.controller';
import { EtlService } from './etl.service';
import { EtlWorker } from './etl.worker';
import { FileStoreService } from './file-store.service';
import { ImportJob } from './entities/import-job.entity';
import { ImportError } from './entities/import-error.entity';
import { MappingTemplate } from '../upload/mapping-template.entity';
import { ClientRecord } from '../records/record.entity';
import { ParseProcessor } from './processors/parse.processor';
import { TransformProcessor } from './processors/transform.processor';
import { ValidateProcessor } from './processors/validate.processor';
import { DeduplicateProcessor } from './processors/deduplicate.processor';
import { LoadProcessor } from './processors/load.processor';
import { createEtlIndexes } from './etl-indexes.migration';

@Module({
  imports: [
    TypeOrmModule.forFeature([ImportJob, ImportError, MappingTemplate, ClientRecord]),
    BullModule.registerQueue({ name: 'etl' }),
  ],
  controllers: [EtlController],
  providers: [
    EtlService,
    EtlWorker,
    FileStoreService,
    ParseProcessor,
    TransformProcessor,
    ValidateProcessor,
    DeduplicateProcessor,
    LoadProcessor,
  ],
  exports: [EtlService],
})
export class EtlModule implements OnModuleInit {
  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit() {
    try {
      await createEtlIndexes(this.dataSource);
    } catch (error) {
      console.warn('[ETL] Could not create indexes:', (error as Error).message);
    }
  }
}
