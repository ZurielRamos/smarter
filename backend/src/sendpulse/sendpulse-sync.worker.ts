import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { SendPulseSyncService } from './sendpulse-sync.service';

export const SENDPULSE_QUEUE = 'sendpulse-sync';

interface InitialSyncJobData {
  inboxId: string;
}

/**
 * Worker de sincronización inicial del histórico de SendPulse.
 *
 * concurrency 1: procesamos una sync a la vez para no saturar la API de
 * SendPulse ni la BD, y para evitar dos ejecuciones del mismo import en
 * paralelo. La idempotencia (dedupe por externalId de mensaje y por
 * (inboxId, contactId) de conversación) es la salvaguarda principal.
 */
@Processor(SENDPULSE_QUEUE, { concurrency: 1 })
export class SendPulseSyncWorker extends WorkerHost {
  private readonly logger = new Logger(SendPulseSyncWorker.name);

  constructor(private readonly syncService: SendPulseSyncService) {
    super();
  }

  async process(job: Job<InitialSyncJobData>): Promise<void> {
    const { inboxId } = job.data;
    this.logger.log(`Procesando sync inicial de SendPulse para inbox ${inboxId}`);

    try {
      await this.syncService.runInitialSync(inboxId);
      this.logger.log(`Sync de SendPulse completada para inbox ${inboxId}`);
    } catch (error: any) {
      this.logger.error(`Sync de SendPulse falló para inbox ${inboxId}: ${error.message}`, error.stack);
      throw error;
    }
  }
}
