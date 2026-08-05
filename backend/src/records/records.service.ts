import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientRecord } from './record.entity';
import { Note } from './note.entity';
import { WebhooksService } from '../webhooks/webhooks.service';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class RecordsService {
  constructor(
    @InjectRepository(ClientRecord)
    private readonly recordRepository: Repository<ClientRecord>,
    @InjectRepository(Note)
    private readonly noteRepository: Repository<Note>,
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

  async findAll(page = 1, limit = 50, tenantId?: string, sortBy?: string, sortOrder?: 'ASC' | 'DESC', assignedTo?: string, assignedTeamId?: string): Promise<{ data: ClientRecord[]; total: number }> {
    const where: any = {};
    if (tenantId) where.tenantId = tenantId;
    if (assignedTo) where.assignedTo = assignedTo;
    if (assignedTeamId) where.assignedTeamId = assignedTeamId;

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

  async getDashboardMetrics(tenantId?: string) {
    // 1. Contactos nuevos por día (últimos 30 días)
    const contactsByDay = await this.recordRepository.query(
      tenantId
        ? `SELECT DATE(created_at) as date, COUNT(*) as count FROM clients WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '30 days' GROUP BY DATE(created_at) ORDER BY date ASC`
        : `SELECT DATE(created_at) as date, COUNT(*) as count FROM clients WHERE created_at >= NOW() - INTERVAL '30 days' GROUP BY DATE(created_at) ORDER BY date ASC`,
      tenantId ? [tenantId] : [],
    );

    // 2. Mensajes enviados por día (últimos 14 días)
    const messagesByDay = await this.recordRepository.query(
      tenantId
        ? `SELECT DATE(cs.created_at) as date, COALESCE(SUM(cs.total_sent), 0) as sent, COALESCE(SUM(cs.total_failed), 0) as failed FROM campaign_sends cs JOIN campaigns c ON c.id = cs.campaign_id WHERE c.tenant_id = $1 AND cs.created_at >= NOW() - INTERVAL '14 days' GROUP BY DATE(cs.created_at) ORDER BY date ASC`
        : `SELECT DATE(cs.created_at) as date, COALESCE(SUM(cs.total_sent), 0) as sent, COALESCE(SUM(cs.total_failed), 0) as failed FROM campaign_sends cs WHERE cs.created_at >= NOW() - INTERVAL '14 days' GROUP BY DATE(cs.created_at) ORDER BY date ASC`,
      tenantId ? [tenantId] : [],
    );

    // 3. Distribución por canal de origen (resuelve UUIDs a nombres de inbox)
    const channelDistribution = await this.recordRepository.query(
      tenantId
        ? `SELECT channel, SUM(cnt)::int as count FROM (
            SELECT
              CASE
                WHEN c.channel_source ~ '^[0-9a-f]{8}-' THEN COALESCE(i.name, c.channel_source)
                ELSE COALESCE(c.channel_source, 'sin canal')
              END as channel,
              1 as cnt
            FROM clients c
            LEFT JOIN inboxes i ON c.channel_source = i.id::text
            WHERE c.tenant_id = $1
          ) sub
          GROUP BY channel
          ORDER BY count DESC`
        : `SELECT channel, SUM(cnt)::int as count FROM (
            SELECT
              CASE
                WHEN c.channel_source ~ '^[0-9a-f]{8}-' THEN COALESCE(i.name, c.channel_source)
                ELSE COALESCE(c.channel_source, 'sin canal')
              END as channel,
              1 as cnt
            FROM clients c
            LEFT JOIN inboxes i ON c.channel_source = i.id::text
          ) sub
          GROUP BY channel
          ORDER BY count DESC`,
      tenantId ? [tenantId] : [],
    );

    // 4. Contactos por estado
    const statusDistribution = await this.recordRepository.query(
      tenantId
        ? `SELECT COALESCE(status, 'unknown') as status, COUNT(*) as count FROM clients WHERE tenant_id = $1 GROUP BY status ORDER BY count DESC`
        : `SELECT COALESCE(status, 'unknown') as status, COUNT(*) as count FROM clients GROUP BY status ORDER BY count DESC`,
      tenantId ? [tenantId] : [],
    );

    // 5. Conversaciones abiertas vs cerradas
    const conversationStats = await this.recordRepository.query(
      tenantId
        ? `SELECT conv.status, COUNT(*) as count FROM conversations conv JOIN inboxes i ON i.id = conv.inbox_id WHERE i.tenant_id = $1 GROUP BY conv.status`
        : `SELECT status, COUNT(*) as count FROM conversations GROUP BY status`,
      tenantId ? [tenantId] : [],
    );

    // 6. Top campañas por rendimiento
    const topCampaigns = await this.recordRepository.query(
      tenantId
        ? `SELECT c.name, c.channel, COALESCE(SUM(cs.total_sent), 0) as "totalSent", COALESCE(SUM(cs.total_failed), 0) as "totalFailed", COALESCE(SUM(cs.total_delivered), 0) as "totalDelivered" FROM campaigns c LEFT JOIN campaign_sends cs ON cs.campaign_id = c.id WHERE c.tenant_id = $1 GROUP BY c.id, c.name, c.channel ORDER BY "totalSent" DESC LIMIT 5`
        : `SELECT c.name, c.channel, COALESCE(SUM(cs.total_sent), 0) as "totalSent", COALESCE(SUM(cs.total_failed), 0) as "totalFailed", COALESCE(SUM(cs.total_delivered), 0) as "totalDelivered" FROM campaigns c LEFT JOIN campaign_sends cs ON cs.campaign_id = c.id GROUP BY c.id, c.name, c.channel ORDER BY "totalSent" DESC LIMIT 5`,
      tenantId ? [tenantId] : [],
    );

    return {
      contactsByDay: contactsByDay.map((r: any) => ({ date: r.date, count: parseInt(r.count) })),
      messagesByDay: messagesByDay.map((r: any) => ({ date: r.date, sent: parseInt(r.sent), failed: parseInt(r.failed) })),
      channelDistribution: channelDistribution.map((r: any) => ({ channel: r.channel, count: parseInt(r.count) })),
      statusDistribution: statusDistribution.map((r: any) => ({ status: r.status, count: parseInt(r.count) })),
      conversationStats: conversationStats.map((r: any) => ({ status: r.status, count: parseInt(r.count) })),
      topCampaigns: topCampaigns.map((r: any) => ({ name: r.name, channel: r.channel, totalSent: parseInt(r.totalSent), totalFailed: parseInt(r.totalFailed), totalDelivered: parseInt(r.totalDelivered) })),
    };
  }

  async getKanbanColumn(
    tenantId: string,
    groupBy: string,
    columnValue: string,
    search?: string,
    sortBy?: string,
    sortOrder?: 'ASC' | 'DESC',
    page = 1,
    limit = 20,
    assignedTo?: string,
    assignedTeamId?: string,
  ): Promise<{ data: ClientRecord[]; total: number }> {
    const qb = this.recordRepository.createQueryBuilder('client')
      .where('client.tenant_id = :tenantId', { tenantId });

    // Owner filters
    if (assignedTo) qb.andWhere('client.assigned_to = :assignedTo', { assignedTo });
    if (assignedTeamId) qb.andWhere('client.assigned_team_id = :assignedTeamId', { assignedTeamId });

    // Filter by column value
    if (columnValue === '__unassigned__') {
      if (this.SYSTEM_COLUMNS.has(groupBy)) {
        qb.andWhere(`(client.${this.toSnakeCase(groupBy)} IS NULL OR client.${this.toSnakeCase(groupBy)} = '')`);
      } else {
        qb.andWhere(`(client.custom_data ->> :groupBy IS NULL OR client.custom_data ->> :groupBy = '')`, { groupBy });
      }
    } else {
      if (this.SYSTEM_COLUMNS.has(groupBy)) {
        qb.andWhere(`client.${this.toSnakeCase(groupBy)} = :columnValue`, { columnValue });
      } else {
        qb.andWhere(`client.custom_data ->> :groupBy = :columnValue`, { groupBy, columnValue });
      }
    }

    // Search filter
    if (search && search.trim()) {
      const q = `%${search.trim().toLowerCase()}%`;
      qb.andWhere(`(
        LOWER(client.first_name) LIKE :q OR
        LOWER(client.last_name) LIKE :q OR
        LOWER(client.email) LIKE :q OR
        client.phone LIKE :q
      )`, { q });
    }

    // Sort
    const orderField = this.getOrderField(sortBy || 'createdAt');
    qb.orderBy(`client.${orderField}`, sortOrder || 'DESC');

    // Pagination
    const [data, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total };
  }

  async getKanbanCounts(tenantId: string, groupBy: string, assignedTo?: string, assignedTeamId?: string): Promise<Record<string, number>> {
    let results: Array<{ value: string | null; count: string }>;

    const extraConditions: string[] = [];
    const params: any[] = [tenantId];
    let paramIdx = 2;

    if (assignedTo) { extraConditions.push(`assigned_to = $${paramIdx}`); params.push(assignedTo); paramIdx++; }
    if (assignedTeamId) { extraConditions.push(`assigned_team_id = $${paramIdx}`); params.push(assignedTeamId); paramIdx++; }
    const extraWhere = extraConditions.length > 0 ? ` AND ${extraConditions.join(' AND ')}` : '';

    if (this.SYSTEM_COLUMNS.has(groupBy)) {
      const col = this.toSnakeCase(groupBy);
      results = await this.recordRepository.query(
        `SELECT ${col} as value, COUNT(*) as count FROM clients WHERE tenant_id = $1${extraWhere} GROUP BY ${col}`,
        params,
      );
    } else {
      results = await this.recordRepository.query(
        `SELECT custom_data ->> $2 as value, COUNT(*) as count FROM clients WHERE tenant_id = $1${extraWhere} GROUP BY custom_data ->> $2`,
        [tenantId, groupBy, ...params.slice(1)],
      );
    }

    const counts: Record<string, number> = {};
    for (const r of results) {
      const key = r.value || '__unassigned__';
      counts[key] = parseInt(r.count);
    }
    return counts;
  }

  async getKanbanInitial(tenantId: string, groupBy: string, limit = 20, assignedTo?: string, assignedTeamId?: string): Promise<{
    counts: Record<string, number>;
    columns: Record<string, { data: ClientRecord[]; total: number }>;
  }> {
    // 1. Get counts per column
    const counts = await this.getKanbanCounts(tenantId, groupBy, assignedTo, assignedTeamId);

    // 2. For each column with data, get the first N records (in parallel)
    const columnKeys = Object.keys(counts);
    const columnPromises = columnKeys.map(async (colValue) => {
      const result = await this.getKanbanColumn(tenantId, groupBy, colValue, undefined, 'createdAt', 'DESC', 1, limit, assignedTo, assignedTeamId);
      return { key: colValue, ...result };
    });

    const results = await Promise.all(columnPromises);
    const columns: Record<string, { data: ClientRecord[]; total: number }> = {};
    for (const r of results) {
      columns[r.key] = { data: r.data, total: r.total };
    }

    return { counts, columns };
  }

  private toSnakeCase(field: string): string {
    const map: Record<string, string> = {
      firstName: 'first_name', lastName: 'last_name', fullName: 'full_name',
      documentType: 'document_type', documentNumber: 'document_number',
      countryCode: 'country_code', birthDate: 'birth_date',
      channelSource: 'channel_source', optInWhatsapp: 'opt_in_whatsapp',
      optInEmail: 'opt_in_email', assignedTo: 'assigned_to',
      lastContactAt: 'last_contact_at', lastActivityAt: 'last_activity_at',
      createdAt: 'created_at', updatedAt: 'updated_at', avatarUrl: 'avatar_url',
    };
    return map[field] || field;
  }

  private getOrderField(sortBy: string): string {
    const map: Record<string, string> = {
      name: 'first_name', score: 'score',
      lastContactAt: 'last_contact_at', createdAt: 'created_at',
    };
    return map[sortBy] || 'created_at';
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

  async getNotes(recordId: string, page = 1, limit = 20): Promise<{ data: Note[]; total: number }> {
    const [data, total] = await this.noteRepository.findAndCount({
      where: { recordId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: (page - 1) * limit,
    });
    return { data, total };
  }

  async createNote(data: { tenantId: string; recordId: string; content: string; authorId?: string; authorName?: string }): Promise<Note> {
    const note = this.noteRepository.create(data);
    return this.noteRepository.save(note);
  }

  async deleteNote(noteId: string): Promise<void> {
    await this.noteRepository.delete(noteId);
  }
}
