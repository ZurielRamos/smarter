import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { Repository } from 'typeorm';
import { Automation } from './automation.entity';
import { AutomationEngine } from './automation-engine.service';
import { AutomationCrmService } from './automation-crm.service';
import { AUTOMATION_QUEUE, AutomationJobData } from './automation-dispatcher.service';
import { Conversation } from '../chats/conversation.entity';

/**
 * Ejecuta en segundo plano las automatizaciones encoladas (webhook, programadas
 * y eventos del CRM). Los trabajos sobreviven a reinicios del servidor.
 */
@Processor(AUTOMATION_QUEUE, { concurrency: 5 })
export class AutomationRunWorker extends WorkerHost {
  private readonly logger = new Logger(AutomationRunWorker.name);

  constructor(
    @InjectRepository(Automation) private readonly repo: Repository<Automation>,
    @InjectRepository(Conversation) private readonly convRepo: Repository<Conversation>,
    private readonly engine: AutomationEngine,
    private readonly crm: AutomationCrmService,
  ) {
    super();
  }

  async process(job: Job<AutomationJobData>): Promise<void> {
    const { automationId, tenantId, triggerType, triggerData, startNodeId } = job.data;
    const automation = await this.repo.findOne({ where: { id: automationId, tenantId } });
    // Si se desactivó o eliminó mientras esperaba en cola, no se ejecuta.
    if (!automation || automation.status !== 'active') return;

    const data = await this.enrich(tenantId, triggerData);
    await this.engine.execute(automation, triggerType, data, startNodeId);
  }

  /** Añade `contact` (resumen del contacto) a los eventos del CRM. */
  private async enrich(tenantId: string, data: Record<string, unknown>) {
    try {
      let recordId = (data.contactId && data.event === 'contact_created' ? data.contactId : null) as string | null;
      if (!recordId && typeof data.conversationId === 'string') {
        const conv = await this.convRepo.findOne({
          where: { id: data.conversationId },
          select: { id: true, recordId: true },
        });
        recordId = conv?.recordId ?? null;
      }
      if (!recordId) return data;
      const contact = await this.crm.getSummary(recordId, tenantId);
      return contact ? { ...data, contact } : data;
    } catch (err) {
      this.logger.warn(`No se pudo enriquecer el evento: ${(err as Error).message}`);
      return data;
    }
  }
}
