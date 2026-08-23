import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminAuditLog } from './admin-audit-log.entity';

export interface AuditLogParams {
  adminUserId: string;
  adminEmail: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  targetLabel?: string | null;
  metadata?: Record<string, any> | null;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AdminAuditLog)
    private readonly auditRepo: Repository<AdminAuditLog>,
  ) {}

  async log(params: AuditLogParams): Promise<AdminAuditLog> {
    const entry = this.auditRepo.create({
      adminUserId: params.adminUserId,
      adminEmail: params.adminEmail,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId ?? null,
      targetLabel: params.targetLabel ?? null,
      metadata: params.metadata ?? null,
    });
    return this.auditRepo.save(entry);
  }

  async findByTarget(targetId: string, options?: { limit?: number; offset?: number }) {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    const [data, total] = await this.auditRepo.findAndCount({
      where: { targetId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    return { data, total };
  }

  async findAll(options?: { limit?: number; offset?: number; targetType?: string }) {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    const where: any = {};
    if (options?.targetType) where.targetType = options.targetType;

    const [data, total] = await this.auditRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    return { data, total };
  }
}
