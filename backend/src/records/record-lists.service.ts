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

    if (list.filters) {
      const filters = list.filters as any;
      const allParams: Record<string, any> = {};

      if (filters.groups) {
        // New format: { groups: [...], groupLogic }
        const groupClauses: string[] = [];
        filters.groups.forEach((group: any, gi: number) => {
          const condClauses: string[] = [];
          group.conditions.forEach((cond: any, ci: number) => {
            const paramKey = `g${gi}_c${ci}`;
            const clause = this.buildConditionClause(cond, paramKey, allParams);
            if (clause) condClauses.push(clause);
          });
          if (condClauses.length > 0) {
            const joined = condClauses.join(group.logic === 'or' ? ' OR ' : ' AND ');
            groupClauses.push(`(${joined})`);
          }
        });
        if (groupClauses.length > 0) {
          const finalClause = groupClauses.join(filters.groupLogic === 'or' ? ' OR ' : ' AND ');
          qb.andWhere(`(${finalClause})`, allParams);
        }
      } else if (filters.conditions && filters.conditions.length > 0) {
        // Legacy format: { logic, conditions }
        const clauses: string[] = [];
        filters.conditions.forEach((cond: any, i: number) => {
          const paramKey = `val_${i}`;
          const clause = this.buildConditionClause(cond, paramKey, allParams);
          if (clause) clauses.push(clause);
        });
        if (clauses.length > 0) {
          const joined = clauses.join(filters.logic === 'or' ? ' OR ' : ' AND ');
          qb.andWhere(`(${joined})`, allParams);
        }
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
      whatsappId: 'r.whatsapp_id',
      countryCode: 'r.country_code',
      email: 'r.email',
      gender: 'r.gender',
      birthDate: 'r.birth_date',
      city: 'r.city',
      region: 'r.region',
      status: 'r.status',
      channelSource: 'r.channel_source',
      source: 'r.source',
      score: 'r.score',
      tags: 'r.tags',
      optInWhatsapp: 'r.opt_in_whatsapp',
      optInEmail: 'r.opt_in_email',
      assignedTo: 'r.assigned_to',
      lastContactAt: 'r.last_contact_at',
      lastActivityAt: 'r.last_activity_at',
      createdAt: 'r.created_at',
      updatedAt: 'r.updated_at',
    };

    const TIMESTAMP_FIELDS = new Set(['lastContactAt', 'lastActivityAt', 'birthDate', 'createdAt', 'updatedAt']);

    const isSystem = field in SYSTEM_MAP;
    const col = isSystem ? SYSTEM_MAP[field] : `r.custom_data ->> '${field}'`;
    const isTimestamp = TIMESTAMP_FIELDS.has(field);

    switch (operator) {
      case 'equals':
        if (!value || value.trim() === '') {
          return `${col} IS NULL`;
        }
        params[paramKey] = value;
        return `${col} = :${paramKey}`;
      case 'not_equals':
        if (!value || value.trim() === '') {
          return `${col} IS NOT NULL`;
        }
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
        if (isTimestamp) {
          return `${col} IS NULL`;
        }
        return `(${col} IS NULL OR ${col} = '')`;
      case 'is_not_empty':
        if (isTimestamp) {
          return `${col} IS NOT NULL`;
        }
        return `(${col} IS NOT NULL AND ${col} != '')`;
      case 'greater_than':
        if (!value || value.trim() === '') return null;
        params[paramKey] = value;
        if (isTimestamp) {
          return `${col} > :${paramKey}`;
        }
        return `(${col})::numeric > :${paramKey}`;
      case 'less_than':
        if (!value || value.trim() === '') return null;
        params[paramKey] = value;
        if (isTimestamp) {
          return `${col} < :${paramKey}`;
        }
        return `(${col})::numeric < :${paramKey}`;
      case 'in_list':
        params[paramKey] = value.split(',').map((v) => v.trim());
        return `${col} IN (:...${paramKey})`;
      default:
        return null;
    }
  }

  // === Match: resolve pasted values (documents, phones, etc.) to client IDs ===

  // Columns allowed for matching, mapped from the frontend field key to the DB column.
  private static readonly MATCH_COLUMNS: Record<string, string> = {
    documentNumber: 'r.document_number',
    phone: 'r.phone',
    email: 'r.email',
    whatsappId: 'r.whatsapp_id',
  };

  /**
   * Normalizes a single pasted value for matching.
   * - phone: keeps only digits (strips spaces, dashes, parentheses, leading +).
   * - email: trims + lowercases.
   * - others (documentNumber, whatsappId): trims.
   */
  private normalizeMatchValue(field: string, raw: string): string {
    const v = (raw || '').trim();
    if (!v) return '';
    if (field === 'phone') return v.replace(/\D/g, '');
    if (field === 'email') return v.toLowerCase();
    return v;
  }

  async matchRecords(
    tenantId: string,
    field: string,
    values: string[],
  ): Promise<{ matchedIds: string[]; matchedCount: number; unmatched: string[]; totalProvided: number }> {
    const col = RecordListsService.MATCH_COLUMNS[field];
    if (!col) {
      throw new NotFoundException(`Field "${field}" is not supported for matching`);
    }

    // Normalize + dedupe the provided values, keeping a map back to the original input.
    const normalizedToOriginal = new Map<string, string>();
    for (const raw of values || []) {
      const norm = this.normalizeMatchValue(field, raw);
      if (norm && !normalizedToOriginal.has(norm)) {
        normalizedToOriginal.set(norm, (raw || '').trim());
      }
    }

    const totalProvided = normalizedToOriginal.size;
    if (totalProvided === 0) {
      return { matchedIds: [], matchedCount: 0, unmatched: [], totalProvided: 0 };
    }

    const normalizedValues = [...normalizedToOriginal.keys()];

    // For phone matching we compare against a digits-only version of the stored column
    // so formatting differences (spaces, +, dashes) don't prevent a match.
    const comparison =
      field === 'phone'
        ? `regexp_replace(${col}, '\\D', '', 'g')`
        : field === 'email'
          ? `LOWER(${col})`
          : col;

    // Chunk to stay well under Postgres parameter limits even for very large pastes.
    const CHUNK = 1000;
    const matchedIds: string[] = [];
    const foundNormalized = new Set<string>();

    for (let i = 0; i < normalizedValues.length; i += CHUNK) {
      const chunk = normalizedValues.slice(i, i + CHUNK);
      const rows = await this.recordRepo
        .createQueryBuilder('r')
        .select(['r.id AS id', `${comparison} AS matchval`])
        .where('r.tenant_id = :tenantId', { tenantId })
        .andWhere('r.deleted_at IS NULL')
        .andWhere(`${comparison} IN (:...vals)`, { vals: chunk })
        .getRawMany<{ id: string; matchval: string }>();

      for (const row of rows) {
        matchedIds.push(row.id);
        if (row.matchval != null) foundNormalized.add(String(row.matchval));
      }
    }

    // Dedupe IDs (a normalized value could match multiple clients; keep all unique clients).
    const uniqueIds = [...new Set(matchedIds)];

    const unmatched: string[] = [];
    for (const [norm, original] of normalizedToOriginal.entries()) {
      if (!foundNormalized.has(norm)) unmatched.push(original);
    }

    return {
      matchedIds: uniqueIds,
      matchedCount: uniqueIds.length,
      unmatched,
      totalProvided,
    };
  }

  // === Preview: count records matching filters ===
  async previewCount(tenantId: string, filters: { groups: { logic: 'and' | 'or'; conditions: { field: string; operator: string; value: string }[] }[]; groupLogic: 'and' | 'or' }): Promise<{ count: number }> {
    const qb = this.recordRepo.createQueryBuilder('r')
      .where('r.tenant_id = :tenantId', { tenantId })
      .andWhere('r.deleted_at IS NULL');

    if (filters.groups && filters.groups.length > 0) {
      const groupClauses: string[] = [];
      const allParams: Record<string, any> = {};

      filters.groups.forEach((group, gi) => {
        const condClauses: string[] = [];
        group.conditions.forEach((cond, ci) => {
          const paramKey = `g${gi}_c${ci}`;
          const clause = this.buildConditionClause(cond, paramKey, allParams);
          if (clause) condClauses.push(clause);
        });
        if (condClauses.length > 0) {
          const joined = condClauses.join(group.logic === 'or' ? ' OR ' : ' AND ');
          groupClauses.push(`(${joined})`);
        }
      });

      if (groupClauses.length > 0) {
        const finalClause = groupClauses.join(filters.groupLogic === 'or' ? ' OR ' : ' AND ');
        qb.andWhere(`(${finalClause})`, allParams);
      }
    }

    const count = await qb.getCount();
    return { count };
  }
}
