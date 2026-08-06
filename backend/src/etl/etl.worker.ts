import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EtlService } from './etl.service';
import { FileStoreService } from './file-store.service';
import { ParseProcessor } from './processors/parse.processor';

@Processor('etl')
export class EtlWorker extends WorkerHost {
  private readonly logger = new Logger(EtlWorker.name);

  constructor(
    private readonly etlService: EtlService,
    private readonly fileStore: FileStoreService,
    private readonly parseProcessor: ParseProcessor,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === 'parse-file') {
      return this.handleParseFile(job);
    }

    // Default: process-import
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

  private async handleParseFile(job: Job): Promise<void> {
    const { jobId, buffer, originalname, size } = job.data;
    this.logger.log(`Parsing file for job ${jobId}: ${originalname}`);

    try {
      const fileBuffer = Buffer.from(buffer, 'base64');
      const result = this.parseProcessor.parseFile(fileBuffer, originalname);

      // Store parsed data to disk
      const fileId = this.fileStore.store(result.data, {
        headers: result.headers,
        fileName: originalname,
        fileSize: size,
        fileType: originalname.split('.').pop()?.toLowerCase() || 'csv',
      });

      // Update job with parse results
      await this.etlService.completeParseJob(
        jobId,
        fileId,
        result.headers,
        result.totalRows,
        result.data.slice(0, 10),
      );

      this.logger.log(`Parse completed for job ${jobId}: ${result.totalRows} rows`);
    } catch (error: any) {
      this.logger.error(`Parse failed for job ${jobId}: ${error.message}`, error.stack);
      // Mark job as failed
      await this.etlService.failParseJob(jobId, error.message);
      throw error;
    }
  }
}
