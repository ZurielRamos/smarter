import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EtlService } from './etl.service';

@Processor('etl')
export class EtlWorker extends WorkerHost {
  private readonly logger = new Logger(EtlWorker.name);

  constructor(private readonly etlService: EtlService) {
    super();
  }

  async process(job: Job<{ jobId: string; fileId: string }>): Promise<void> {
    const { jobId, fileId } = job.data;
    this.logger.log(`Processing ETL job ${jobId}`);

    try {
      await this.etlService.executeJob(jobId, fileId);
      this.logger.log(`ETL job ${jobId} completed`);
    } catch (error: any) {
      this.logger.error(`ETL job ${jobId} failed: ${error.message}`, error.stack);
      throw error;
    }
  }
}
