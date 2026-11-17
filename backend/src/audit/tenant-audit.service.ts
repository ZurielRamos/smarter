import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { TenantAuditLog } from './tenant-audit-log.entity';

export interface TenantAuditParams {
  tenantId: string;
  actorType: 'user' | 'surveyor' | 'system';
  actorId?: string | null;
  actorLabel?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  scopeId?: string | null;
  metadata?: Record<string, any> | null;
}

@Injectable()
export class TenantAuditService {
  constructor(
    @InjectRepository(TenantAuditLog)
    private readonly repo: Repository<TenantAuditLog>,
  ) {}

  /**
   * Registra un hecho auditable. Si se pasa `manager`, el registro se escribe
   * dentro de la misma transacción que la acción auditada (si una falla, ambas
   * se revierten).
   */
  async log(params: TenantAuditParams, manager?: EntityManager): Promise<TenantAuditLog> {
    const repo = manager ? manager.getRepository(TenantAuditLog) : this.repo;
    const entry = repo.create({
      tenantId: params.tenantId,
      actorType: params.actorType,
      actorId: params.actorId ?? null,
      actorLabel: params.actorLabel ?? null,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId ?? null,
      scopeId: params.scopeId ?? null,
      metadata: params.metadata ?? null,
    });
    return repo.save(entry);
  }

  async find(
    tenantId: string,
    options: { scopeId?: string; targetType?: string; targetId?: string; limit?: number; offset?: number },
  ) {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const offset = Math.max(options.offset ?? 0, 0);

    const where: Record<string, any> = { tenantId };
    if (options.scopeId) where.scopeId = options.scopeId;
    if (options.targetType) where.targetType = options.targetType;
    if (options.targetId) where.targetId = options.targetId;

    const [data, total] = await this.repo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
    return { data, total };
  }
}
