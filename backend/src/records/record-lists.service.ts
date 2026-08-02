import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RecordList } from './record-list.entity';
import { ClientRecord } from './record.entity';

@Injectable()
export class RecordListsService {
  constructor(
    @InjectRepository(RecordList)
    private readonly listRepo: Repository<RecordList>,
    @InjectRepository(ClientRecord)
    private readonly recordRepo: Repository<ClientRecord>,
  ) {}

  async findAllByTenant(tenantId: string): Promise<RecordList[]> {
    return this.listRepo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<RecordList> {
    const list = await this.listRepo.findOne({ where: { id } });
    if (!list) throw new NotFoundException(`List ${id} not found`);
    return list;
  }

  async create(data: {
    tenantId: string;
    name: string;
    type: 'static' | 'dynamic';
    filters?: { logic: 'and' | 'or'; conditions: { field: string; operator: string; value: string }[] };
    color?: string;
  }): Promise<RecordList> {
    const list = this.listRepo.create({
      tenantId: data.tenantId,
      name: data.name,
      type: data.type,
      filters: data.type === 'dynamic' ? data.filters || null : null,
      recordIds: data.type === 'static' ? [] : null,
      color: data.color || null,
    });
    return this.listRepo.save(list);
  }

  async update(id: string, data: Partial<{ name: string; filters: any; color: string }>): Promise<RecordList> {
    const list = await this.findOne(id);
    Object.assign(list, data);
    return this.listRepo.save(list);
  }

  async remove(id: string): Promise<void> {
    const list = await this.findOne(id);
    await this.listRepo.remove(list);
  }

  // === Static list record management ===

  async addRecords(id: string, recordIds: string[]): Promise<RecordList> {
    const list = await this.findOne(id);
    if (list.type !== 'static') throw new NotFoundException('Cannot add records to a dynamic list');
    const current = list.recordIds || [];
    const unique = [...new Set([...current, ...recordIds])];
    list.recordIds = unique;
    return this.listRepo.save(list);
  }

  async removeRecords(id: string, recordIds: string[]): Promise<RecordList> {
    const list = await this.findOne(id);
    if (list.type !== 'static') throw new NotFoundException('Cannot remove records from a dynamic list');
    list.recordIds = (list.recordIds || []).filter((rid) => !recordIds.includes(rid));
    return this.listRepo.save(list);
  }

  // === Get records for a list ===

  async getRecords(id: string, page = 1, limit = 50): Promise<{ data: ClientRecord[]; total: number }> {
    const list = await this.findOne(id);

    if (list.type === 'static') {
      const ids = list.recordIds || [];
      if (ids.length === 0) return { data: [], total: 0 };
      const [data, total] = await this.recordRepo.findAndCount({
        where: ids.map((rid) => ({ id: rid })),
        skip: (page - 1) * limit,
        take: limit,
        order: { createdAt: 'DESC' },
      });
      return { data, total };
    }

    // Dynamic list — build query from filters
    const qb = this.recordRepo.createQueryBuilder('r')
      .where('r.tenant_id = :tenantId', { tenantId: list.tenantId });

    if (list.filters && list.filters.conditions.length > 0) {
      const { conditions, logic } = list.filters;
      const clauses: string[] = [];
      const params: Record<string, any> = {};

      conditions.forEach((cond, i) => {
        const paramKey = `val_${i}`;
        const clause = this.buildConditionClause(cond, paramKey, params);
        if (clause) clauses.push(clause);
      });

      if (clauses.length > 0) {
        const joined = clauses.join(logic === 'or' ? ' OR ' : ' AND ');
        qb.andWhere(`(${joined})`, params);
      }
    }

    const total = await qb.getCount();
    const data = await qb
      .orderBy('r.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return { data, total };
  }

  private buildConditionClause(
    cond: { field: string; operator: string; value: string },
    paramKey: string,
    params: Record<string, any>,
  ): string | null {
    const { field, operator, value } = cond;

    // Map system fields
    const SYSTEM_MAP: Record<string, string> = {
      firstName: 'r.first_name',
      lastName: 'r.last_name',
      fullName: 'r.full_name',
      documentType: 'r.document_type',
      documentNumber: 'r.document_number',
      phone: 'r.phone',
      countryCode: 'r.country_code',
      email: 'r.email',
      gender: 'r.gender',
      city: 'r.city',
      region: 'r.region',
      status: 'r.status',
      channelSource: 'r.channel_source',
      source: 'r.source',
      score: 'r.score',
      tags: 'r.tags',
    };

    const isSystem = field in SYSTEM_MAP;
    const col = isSystem ? SYSTEM_MAP[field] : `r.custom_data ->> '${field}'`;

    switch (operator) {
      case 'equals':
        params[paramKey] = value;
        return `${col} = :${paramKey}`;
      case 'not_equals':
        params[paramKey] = value;
        return `${col} != :${paramKey}`;
      case 'contains':
        params[paramKey] = `%${value}%`;
        return `${col} ILIKE :${paramKey}`;
      case 'starts_with':
        params[paramKey] = `${value}%`;
        return `${col} ILIKE :${paramKey}`;
      case 'ends_with':
        params[paramKey] = `%${value}`;
        return `${col} ILIKE :${paramKey}`;
      case 'is_empty':
        return `(${col} IS NULL OR ${col} = '')`;
      case 'is_not_empty':
        return `(${col} IS NOT NULL AND ${col} != '')`;
      case 'greater_than':
        params[paramKey] = value;
        return `(${col})::numeric > :${paramKey}`;
      case 'less_than':
        params[paramKey] = value;
        return `(${col})::numeric < :${paramKey}`;
      case 'in_list':
        params[paramKey] = value.split(',').map((v) => v.trim());
        return `${col} IN (:...${paramKey})`;
      default:
        return null;
    }
  }
}
