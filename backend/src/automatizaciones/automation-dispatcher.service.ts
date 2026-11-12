import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';
import { Automation } from './automation.entity';

export const AUTOMATION_QUEUE = 'automation-run';

export interface AutomationJobData {
  automationId: string;
  tenantId: string;
  triggerType: string;
  triggerData: Record<string, unknown>;
  startNodeId?: string;
}

export type CrmEventType =
  | 'contact_created'
  | 'message_received'
  | 'conversation_created';

const MAX_QUEUE_DEPTH = 2000;
/** Tope de ejecuciones por evento y tenant en una ventana de 1 minuto. */
const EVENT_RATE_PER_MIN = 300;

/**
 * Punto único para encolar ejecuciones (webhook, programadas y eventos del CRM)
 * y para resolver qué automatizaciones reaccionan a un evento.
 */
@Injectable()
export class AutomationDispatcher {
  private readonly logger = new Logger(AutomationDispatcher.name);
  private readonly tenantEnabled = new Map<string, { at: number; ok: boolean }>();
  private readonly activeCache = new Map<string, { at: number; list: Automation[] }>();
  private readonly rate = new Map<string, { windowStart: number; count: number }>();

  constructor(
    @InjectQueue(AUTOMATION_QUEUE) private readonly queue: Queue<AutomationJobData>,
    @InjectRepository(Automation) private readonly repo: Repository<Automation>,
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
  ) {}

  async moduleEnabled(tenantId: string): Promise<boolean> {
    const hit = this.tenantEnabled.get(tenantId);
    if (hit && Date.now() - hit.at < 30_000) return hit.ok;
    const t = await this.tenantRepo.findOne({ where: { id: tenantId } });
    const ok = !!t?.features?.automatizaciones;
    this.tenantEnabled.set(tenantId, { at: Date.now(), ok });
    return ok;
  }

  /** Cuota de la cola: evita que un flujo de eventos sature Redis y el worker. */
  async assertCapacity() {
    const waiting = await this.queue.count();
    if (waiting >= MAX_QUEUE_DEPTH) {
      throw new HttpException('Cola de automatizaciones saturada', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  async enqueue(
    automation: Pick<Automation, 'id' | 'tenantId'>,
    triggerType: string,
    triggerData: Record<string, unknown>,
    startNodeId?: string,
    delayMs = 0,
  ) {
    await this.assertCapacity();
    await this.queue.add(
      'run',
      {
        automationId: automation.id,
        tenantId: automation.tenantId,
        triggerType,
        triggerData,
        startNodeId,
      },
      {
        // El motor ya reintenta por nodo: reintentar el job duplicaría efectos.
        attempts: 1,
        delay: delayMs,
        removeOnComplete: 200,
        removeOnFail: 200,
      },
    );
  }

  private async activeFor(tenantId: string): Promise<Automation[]> {
    const hit = this.activeCache.get(tenantId);
    if (hit && Date.now() - hit.at < 15_000) return hit.list;
    const list = await this.repo.find({ where: { tenantId, status: 'active' } });
    this.activeCache.set(tenantId, { at: Date.now(), list });
    if (this.activeCache.size > 2000) this.activeCache.clear();
    return list;
  }

  private rateLimited(tenantId: string, type: string): boolean {
    const key = `${tenantId}:${type}`;
    const now = Date.now();
    const cur = this.rate.get(key);
    if (!cur || now - cur.windowStart > 60_000) {
      this.rate.set(key, { windowStart: now, count: 1 });
      return false;
    }
    cur.count++;
    return cur.count > EVENT_RATE_PER_MIN;
  }

  private matches(
    type: CrmEventType,
    cfg: Record<string, unknown>,
    data: Record<string, unknown>,
  ): boolean {
    if ((type === 'message_received' || type === 'conversation_created') && cfg.inboxId) {
      if (cfg.inboxId !== data.inboxId) return false;
    }
    if (type === 'message_received') {
      const kws = String(cfg.keywords ?? '')
        .split(',')
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean);
      if (kws.length) {
        const content = String(data.content ?? '').trim().toLowerCase();
        if (!content) return false;
        return cfg.matchType === 'exact'
          ? kws.includes(content)
          : kws.some((k) => content.includes(k));
      }
    }
    return true;
  }

  /** Encola las automatizaciones activas del tenant cuyo disparador coincide. */
  async dispatchEvent(
    tenantId: string,
    type: CrmEventType,
    data: Record<string, unknown>,
    delayMs = 0,
  ) {
    if (!(await this.moduleEnabled(tenantId))) return;
    const list = await this.activeFor(tenantId);
    for (const a of list) {
      const trigger = a.nodes?.find((n) => n.type === `trigger_${type}`);
      if (!trigger || !this.matches(type, trigger.data ?? {}, data)) continue;
      if (this.rateLimited(tenantId, type)) {
        this.logger.warn(`Límite de eventos ${type} excedido para el tenant ${tenantId}`);
        return;
      }
      try {
        await this.enqueue(a, 'event', { ...data, event: type }, trigger.id, delayMs);
      } catch (err) {
        this.logger.error(`No se pudo encolar ${a.id}: ${(err as Error).message}`);
      }
    }
  }
}
