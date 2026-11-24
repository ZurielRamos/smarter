import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { FlowStart } from './flow-start.entity';
import { FlowTriggerFrequency } from './conversation-flow.entity';
import { FlowStartSource, frequencySince } from './flow-triggers.util';

@Injectable()
export class FlowStartsService {
  constructor(
    @InjectRepository(FlowStart)
    private readonly repo: Repository<FlowStart>,
  ) {}

  /**
   * ¿La regla de frecuencia permite iniciar el flujo? Se cuenta por contacto
   * del CRM y, sin contacto, por conversación.
   */
  async allows(
    flowId: string,
    frequency: FlowTriggerFrequency | null | undefined,
    target: { recordId: string | null; conversationId: string },
    now = new Date(),
  ): Promise<boolean> {
    const since = frequencySince(frequency, now);
    if (!since) return true;
    const count = await this.repo.count({
      where: {
        flowId,
        ...(target.recordId
          ? { recordId: target.recordId }
          : { conversationId: target.conversationId }),
        createdAt: MoreThanOrEqual(since),
      },
    });
    return count === 0;
  }

  async record(
    entries: {
      tenantId: string;
      flowId: string;
      conversationId: string;
      recordId: string | null;
      source: FlowStartSource;
      sourceRef?: string | null;
    }[],
  ): Promise<void> {
    if (!entries.length) return;
    await this.repo.insert(
      entries.map((e) => ({ ...e, sourceRef: e.sourceRef ?? null })),
    );
  }

  /** Inicios por origen en los últimos `days` días. */
  async countsBySource(
    tenantId: string,
    flowId: string,
    days: number,
  ): Promise<Record<string, number>> {
    const rows: { source: string; count: string }[] = await this.repo
      .createQueryBuilder('s')
      .select('s.source', 'source')
      .addSelect('COUNT(*)', 'count')
      .where('s.tenant_id = :tenantId AND s.flow_id = :flowId', {
        tenantId,
        flowId,
      })
      .andWhere('s.created_at >= now() - make_interval(days => :days)', {
        days,
      })
      .groupBy('s.source')
      .getRawMany();
    return Object.fromEntries(rows.map((r) => [r.source, Number(r.count)]));
  }
}
