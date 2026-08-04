import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientRecord } from './record.entity';
import { WebhooksService } from '../webhooks/webhooks.service';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class RecordsService {
  constructor(
    @InjectRepository(ClientRecord)
    private readonly recordRepository: Repository<ClientRecord>,
    private readonly webhooksService: WebhooksService,
  ) {}

  // System field keys that are actual columns in the entity
  private readonly SYSTEM_COLUMNS = new Set([
    'id', 'firstName', 'lastName', 'fullName', 'documentType', 'documentNumber',
    'phone', 'countryCode', 'email', 'gender', 'birthDate',
    'city', 'region', 'status', 'channelSource', 'source', 'score',
    'optInWhatsapp', 'optInEmail', 'assignedTo',
    'lastContactAt', 'lastActivityAt', 'tags',
  ]);

  async createRecord(data: { tenantId: string; firstName?: string; lastName?: string; phone?: string; email?: string; status?: string; channelSource?: string; tags?: string[]; customData?: Record<string, any> }): Promise<ClientRecord> {
    const record = this.recordRepository.create({
      tenantId: data.tenantId,
      firstName: data.firstName || null,
      lastName: data.lastName || null,
      phone: data.phone || null,
      email: data.email || null,
      status: data.status || 'active',
      channelSource: data.channelSource || 'manual',
      tags: data.tags || null,
      customData: data.customData || null,
    } as Partial<ClientRecord>);
    const saved = await this.recordRepository.save(record) as ClientRecord;
    this.webhooksService.dispatch(data.tenantId, 'contact_created', saved).catch(() => {});
    return saved;
  }

  async findOneById(id: string): Promise<ClientRecord | null> {
    return this.recordRepository.findOne({ where: { id } });
  }

  async updateRecord(id: string, data: Partial<ClientRecord>): Promise<ClientRecord> {
    await this.recordRepository.update(id, data as any);
    const updated = await this.recordRepository.findOne({ where: { id } }) as ClientRecord;
    if (updated?.tenantId) {
      this.webhooksService.dispatch(updated.tenantId, 'contact_updated', updated).catch(() => {});
    }
    return updated;
  }

  async deleteRecord(id: string): Promise<void> {
    await this.recordRepository.delete(id);
  }

  async saveRecords(
    records: Record<string, unknown>[],
    tenantId?: string,
    matchField?: string,
  ): Promise<{ saved: number }> {
    const chunkSize = 500;
    let savedCount = 0;

    for (let i = 0; i < records.length; i += chunkSize) {
      const chunk = records.slice(i, i + chunkSize);

      const entities = chunk.map((record) => {
        const systemData: Partial<ClientRecord> = {};
        const customData: Record<string, unknown> = {};

        for (const [key, value] of Object.entries(record)) {
          if (this.SYSTEM_COLUMNS.has(key)) {
            (systemData as any)[key] = value;
          } else {
            customData[key] = value;
          }
        }

        const entity = this.recordRepository.create({
          ...systemData,
          tenantId: tenantId || (record as any).tenantId,
          channelSource: systemData.channelSource || 'import',
          customData: Object.keys(customData).length > 0 ? customData : null,
        } as Partial<ClientRecord>);
        return entity;
      });

      // If matchField is provided, upsert based on that field
      if (matchField && matchField !== 'none') {
        for (const entity of entities) {
          const matchValue = matchField === 'id'
            ? (entity as any).id
            : this.SYSTEM_COLUMNS.has(matchField)
              ? (entity as any)[matchField]
              : entity.customData?.[matchField];

          if (!matchValue) {
            // No match value, insert as new
            await this.recordRepository.save(entity);
          } else {
            // Find existing record
            let existing: ClientRecord | null = null;
            if (matchField === 'id') {
              // Only query by id if the value is a valid UUID
              if (UUID_REGEX.test(String(matchValue))) {
                existing = await this.recordRepository.findOne({ where: { id: matchValue as string, tenantId } as any });
              }
              // If not a valid UUID, store value in customData and insert as new
              if (!existing && !UUID_REGEX.test(String(matchValue))) {
                entity.customData = { ...(entity.customData || {}), externalId: matchValue };
                delete (entity as any).id;
              }
            } else if (this.SYSTEM_COLUMNS.has(matchField)) {
              existing = await this.recordRepository.findOne({ where: { [matchField]: matchValue, tenantId } as any });
            } else {
              // Match on custom data field
              const qb = this.recordRepository.createQueryBuilder('client')
                .where('client.tenant_id = :tenantId', { tenantId })
                .andWhere(`client.custom_data ->> :field = :value`, { field: matchField, value: String(matchValue) });
              existing = await qb.getOne();
            }

            if (existing) {
              // Only update fields that have a value (don't overwrite with null/undefined)
              for (const [key, val] of Object.entries(entity)) {
                if (key === 'id' || key === 'tenantId' || key === 'createdAt') continue;
                if (val === null || val === undefined) continue;
                if (key === 'customData') {
                  // Merge custom data instead of replacing
                  existing.customData = { ...(existing.customData || {}), ...(val as Record<string, any>) };
                } else {
                  (existing as any)[key] = val;
                }
              }
              await this.recordRepository.save(existing);
            } else {
              await this.recordRepository.save(entity);
            }
          }
        }
        savedCount += chunk.length;
      } else {
        await this.recordRepository.save(entities);
        savedCount += chunk.length;
      }
    }

    return { saved: savedCount };
  }

  async findAll(page = 1, limit = 50, tenantId?: string, sortBy?: string, sortOrder?: 'ASC' | 'DESC'): Promise<{ data: ClientRecord[]; total: number }> {
    const where: any = {};
    if (tenantId) where.tenantId = tenantId;

    const order: any = {};
    if (sortBy && sortOrder) {
      // Map column keys to entity fields
      const fieldMap: Record<string, string> = {
        name: 'firstName',
        email: 'email',
        phone: 'phone',
        status: 'status',
        channelSource: 'channelSource',
        lastContactAt: 'lastContactAt',
        id: 'id',
      };
      const dbField = fieldMap[sortBy] || sortBy;
      order[dbField] = sortOrder;
    } else {
      order.createdAt = 'DESC';
    }

    const [data, total] = await this.recordRepository.findAndCount({
      where,
      skip: (page - 1) * limit,
      take: limit,
      order,
    });
    return { data, total };
  }

  async getStats(tenantId?: string): Promise<{
    totalClients: number;
    totalMessagesSent: number;
    totalCampaigns: number;
    lastImportDate: string | null;
    recentSends: Array<{ id: string; campaignName: string; status: string; totalSent: number; totalFailed: number; createdAt: string }>;
  }> {
    const tenantFilter = tenantId ? { tenantId } : {};

    const totalClients = await this.recordRepository.count({ where: tenantFilter });

    const lastRecord = await this.recordRepository
      .createQueryBuilder('client')
      .where(tenantId ? 'client.tenant_id = :tenantId' : '1=1', { tenantId })
      .orderBy('client.created_at', 'DESC')
      .limit(1)
      .getOne();

    const campaignCountResult = await this.recordRepository.query(
      tenantId
        ? `SELECT COUNT(*) as count FROM campaigns WHERE tenant_id = $1`
        : `SELECT COUNT(*) as count FROM campaigns`,
      tenantId ? [tenantId] : [],
    );
    const totalCampaigns = parseInt(campaignCountResult[0]?.count || '0', 10);

    const sentResult = await this.recordRepository.query(
      tenantId
        ? `SELECT COALESCE(SUM(cs.total_sent), 0) as total FROM campaign_sends cs JOIN campaigns c ON c.id = cs.campaign_id WHERE cs.status = 'completed' AND c.tenant_id = $1`
        : `SELECT COALESCE(SUM(total_sent), 0) as total FROM campaign_sends WHERE status = 'completed'`,
      tenantId ? [tenantId] : [],
    );
    const totalMessagesSent = parseInt(sentResult[0]?.total || '0', 10);

    const recentSendsResult = await this.recordRepository.query(
      tenantId
        ? `SELECT cs.id, c.name as "campaignName", cs.status, cs.total_sent as "totalSent", cs.total_failed as "totalFailed", cs.created_at as "createdAt"
           FROM campaign_sends cs
           JOIN campaigns c ON c.id = cs.campaign_id
           WHERE c.tenant_id = $1
           ORDER BY cs.created_at DESC
           LIMIT 10`
        : `SELECT cs.id, c.name as "campaignName", cs.status, cs.total_sent as "totalSent", cs.total_failed as "totalFailed", cs.created_at as "createdAt"
           FROM campaign_sends cs
           JOIN campaigns c ON c.id = cs.campaign_id
           ORDER BY cs.created_at DESC
           LIMIT 10`,
      tenantId ? [tenantId] : [],
    );

    return {
      totalClients,
      totalMessagesSent,
      totalCampaigns,
      lastImportDate: lastRecord?.createdAt?.toISOString() || null,
      recentSends: recentSendsResult,
    };
  }

  async getDistinctValues(field: string): Promise<string[]> {
    const columnMap: Record<string, string> = {
      status: 'status',
      channelSource: 'channel_source',
    };

    const col = columnMap[field];
    if (!col) return [];

    const results = await this.recordRepository
      .createQueryBuilder('client')
      .select(`DISTINCT client.${col}`, 'value')
      .where(`client.${col} IS NOT NULL AND client.${col} != ''`)
      .orderBy('value', 'ASC')
      .getRawMany();

    return results.map((r) => r.value);
  }
}
