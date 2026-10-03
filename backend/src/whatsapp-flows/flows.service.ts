import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsAppFlow } from './entities/whatsapp-flow.entity';

/**
 * Gestión CRUD de las definiciones de WhatsApp Flows por tenant.
 */
@Injectable()
export class FlowsService {
  constructor(
    @InjectRepository(WhatsAppFlow)
    private readonly flowRepo: Repository<WhatsAppFlow>,
  ) {}

  findAll(tenantId: string): Promise<WhatsAppFlow[]> {
    return this.flowRepo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  findOne(id: string): Promise<WhatsAppFlow | null> {
    return this.flowRepo.findOne({ where: { id } });
  }

  create(data: {
    tenantId: string;
    name: string;
    inboxId?: string | null;
    metaFlowId?: string | null;
    status?: string;
    categories?: string[];
    dataApiVersion?: string;
    entryScreen?: string;
    flowJson?: Record<string, any>;
    metadata?: Record<string, any>;
  }): Promise<WhatsAppFlow> {
    const flow = this.flowRepo.create({
      tenantId: data.tenantId,
      name: data.name,
      inboxId: data.inboxId ?? null,
      metaFlowId: data.metaFlowId ?? null,
      status: data.status ?? 'draft',
      categories: data.categories ?? null,
      dataApiVersion: data.dataApiVersion ?? null,
      entryScreen: data.entryScreen ?? null,
      flowJson: data.flowJson ?? null,
      metadata: data.metadata ?? null,
    });
    return this.flowRepo.save(flow);
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      inboxId: string | null;
      metaFlowId: string | null;
      status: string;
      categories: string[];
      dataApiVersion: string;
      entryScreen: string;
      flowJson: Record<string, any>;
      metadata: Record<string, any>;
    }>,
  ): Promise<WhatsAppFlow | null> {
    await this.flowRepo.update(id, data as any);
    return this.flowRepo.findOne({ where: { id } });
  }

  async delete(id: string): Promise<void> {
    await this.flowRepo.softDelete(id);
  }
}
