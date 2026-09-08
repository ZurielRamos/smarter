import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull, DataSource } from 'typeorm';
import { ClientRecord } from './record.entity';
import { Note } from './note.entity';
import { Activity } from './activity.entity';
import { WebhooksService } from '../webhooks/webhooks.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ConversionsService } from '../conversions/conversions.service';
import { PhoneValidator } from '../etl/validators/phone.validator';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Países soportados para normalización de teléfonos (para validar input). */
const SUPPORTED_PHONE_COUNTRIES = new Set(['CO', 'MX', 'US']);

@Injectable()
export class RecordsService {
  private readonly logger = new Logger(RecordsService.name);

  constructor(
    @InjectRepository(ClientRecord)
    private readonly recordRepository: Repository<ClientRecord>,
    @InjectRepository(Note)
    private readonly noteRepository: Repository<Note>,
    @InjectRepository(Activity)
    private readonly activityRepository: Repository<Activity>,
    private readonly webhooksService: WebhooksService,
    private readonly notificationsService: NotificationsService,
    private readonly conversionsService: ConversionsService,
    private readonly dataSource: DataSource,
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
      status: data.status || 'lead',
      channelSource: data.channelSource || 'manual',
      tags: data.tags || null,
      customData: data.customData || null,
      optInWhatsapp: true,
      optInEmail: true,
    } as Partial<ClientRecord>);
    const saved = await this.recordRepository.save(record) as ClientRecord;
    this.webhooksService.dispatch(data.tenantId, 'contact_created', saved).catch(() => {});
    this.logActivity({ tenantId: data.tenantId, recordId: saved.id, type: 'contact_created', description: 'Contacto creado' }).catch(() => {});
    return saved;
  }

  async findOneById(id: string): Promise<ClientRecord | null> {
    return this.recordRepository.findOne({ where: { id } });
  }

  async updateRecord(id: string, data: Partial<ClientRecord>, actor?: { actorId?: string; actorName?: string }): Promise<ClientRecord> {
    const before = await this.recordRepository.findOne({ where: { id } });
    await this.recordRepository.update(id, data as any);
    const updated = await this.recordRepository.findOne({ where: { id } }) as ClientRecord;
    if (updated?.tenantId) {
      this.webhooksService.dispatch(updated.tenantId, 'contact_updated', updated).catch(() => {});
      // Log activity for status changes
      if (data.status && before && before.status !== data.status) {
        this.logActivity({ tenantId: updated.tenantId, recordId: id, type: 'status_changed', description: `Estado cambiado de ${before.status} a ${data.status}`, metadata: { from: before.status, to: data.status }, actorId: actor?.actorId, actorName: actor?.actorName }).catch(() => {});
        // Dispatch conversion event to ad platforms
        this.conversionsService.dispatchConversion({
          tenantId: updated.tenantId,
          recordId: id,
          triggerType: 'status_changed',
          triggerValue: data.status,
          email: updated.email || undefined,
          phone: updated.phone || undefined,
        }).catch(() => {});
      }
      // Log activity for assignment changes
      if (data.assignedTo !== undefined && before && before.assignedTo !== data.assignedTo) {
        this.logActivity({ tenantId: updated.tenantId, recordId: id, type: 'assigned', description: data.assignedTo ? 'Agente asignado' : 'Asignación removida', metadata: { assignedTo: data.assignedTo }, actorId: actor?.actorId, actorName: actor?.actorName }).catch(() => {});
        // Notify the newly assigned agent
        if (data.assignedTo) {
          const contactName = updated.firstName || updated.lastName ? `${updated.firstName || ''} ${updated.lastName || ''}`.trim() : (updated.phone || 'Contacto');
          this.notificationsService.notify({
            tenantId: updated.tenantId,
            userId: data.assignedTo,
            type: 'contact_assigned',
            title: `Te asignaron a ${contactName}`,
            link: `/${updated.tenantId}/clients/${id}`,
            metadata: { recordId: id },
          }).catch(() => {});
        }
      }
      if (data.assignedTeamId !== undefined && before && before.assignedTeamId !== data.assignedTeamId) {
        this.logActivity({ tenantId: updated.tenantId, recordId: id, type: 'assigned', description: data.assignedTeamId ? 'Equipo asignado' : 'Equipo removido', metadata: { assignedTeamId: data.assignedTeamId }, actorId: actor?.actorId, actorName: actor?.actorName }).catch(() => {});
      }
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

  async findAll(page = 1, limit = 50, tenantId?: string, sortBy?: string, sortOrder?: 'ASC' | 'DESC', assignedTo?: string, assignedTeamId?: string, filters?: Array<{ field: string; operator: string; value: string }>): Promise<{ data: ClientRecord[]; total: number }> {
    const qb = this.recordRepository.createQueryBuilder('client');

    if (tenantId) qb.where('client.tenant_id = :tenantId', { tenantId });
    qb.andWhere('client.deleted_at IS NULL');
    if (assignedTo) qb.andWhere('client.assigned_to = :assignedTo', { assignedTo });
    if (assignedTeamId) qb.andWhere('client.assigned_team_id = :assignedTeamId', { assignedTeamId });

    // Advanced filters
    if (filters && filters.length > 0) {
      this.applyFilters(qb, filters);
    }

    // Sort
    const fieldMap: Record<string, string> = {
      name: 'first_name', email: 'email', phone: 'phone',
      status: 'status', channelSource: 'channel_source',
      lastContactAt: 'last_contact_at', id: 'id', createdAt: 'created_at',
      score: 'score',
    };
    if (sortBy && sortOrder) {
      const dbField = fieldMap[sortBy] || this.toSnakeCase(sortBy);
      qb.orderBy(`client.${dbField}`, sortOrder);
    } else {
      qb.orderBy('client.created_at', 'DESC');
    }

    const [data, total] = await qb.skip((page - 1) * limit).take(limit).getManyAndCount();
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
      .where('client.tenant_id = :tenantId', { tenantId })
      .andWhere('client.deleted_at IS NULL');

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

  private readonly TIMESTAMP_FIELDS = new Set(['lastContactAt', 'lastActivityAt', 'birthDate', 'createdAt', 'updatedAt']);

  private applyFilters(qb: any, filters: Array<{ field: string; operator: string; value: string }>): void {
    filters.forEach((f, idx) => {
      const paramKey = `fv_${idx}`;
      const isCustom = !this.SYSTEM_COLUMNS.has(f.field);
      const col = isCustom ? `client.custom_data ->> '${f.field}'` : `client.${this.toSnakeCase(f.field)}`;
      const isTimestamp = this.TIMESTAMP_FIELDS.has(f.field);

      switch (f.operator) {
        case 'equals':
          if (!f.value || f.value.trim() === '') {
            qb.andWhere(`${col} IS NULL`);
          } else {
            qb.andWhere(`${col} = :${paramKey}`, { [paramKey]: f.value });
          }
          break;
        case 'not_equals':
          if (!f.value || f.value.trim() === '') {
            qb.andWhere(`${col} IS NOT NULL`);
          } else {
            qb.andWhere(`${col} != :${paramKey}`, { [paramKey]: f.value });
          }
          break;
        case 'contains':
          qb.andWhere(`LOWER(${col}::text) LIKE :${paramKey}`, { [paramKey]: `%${f.value.toLowerCase()}%` });
          break;
        case 'starts_with':
          qb.andWhere(`LOWER(${col}::text) LIKE :${paramKey}`, { [paramKey]: `${f.value.toLowerCase()}%` });
          break;
        case 'greater_than':
          if (!f.value || f.value.trim() === '') break;
          if (isTimestamp) {
            qb.andWhere(`${col} > :${paramKey}`, { [paramKey]: f.value });
          } else {
            qb.andWhere(`${col}::numeric > :${paramKey}`, { [paramKey]: Number(f.value) });
          }
          break;
        case 'less_than':
          if (!f.value || f.value.trim() === '') break;
          if (isTimestamp) {
            qb.andWhere(`${col} < :${paramKey}`, { [paramKey]: f.value });
          } else {
            qb.andWhere(`${col}::numeric < :${paramKey}`, { [paramKey]: Number(f.value) });
          }
          break;
        case 'is_empty':
          if (isTimestamp) {
            qb.andWhere(`${col} IS NULL`);
          } else {
            qb.andWhere(`(${col} IS NULL OR ${col} = '')`);
          }
          break;
        case 'is_not_empty':
          if (isTimestamp) {
            qb.andWhere(`${col} IS NOT NULL`);
          } else {
            qb.andWhere(`(${col} IS NOT NULL AND ${col} != '')`);
          }
          break;
      }
    });
  }

  private getOrderField(sortBy: string): string {
    const map: Record<string, string> = {
      name: 'first_name', score: 'score',
      lastContactAt: 'last_contact_at', createdAt: 'created_at',
    };
    return map[sortBy] || 'created_at';
  }

  async exportCsv(params: {
    tenantId: string;
    fields: Array<{ key: string; label: string }>;
    filters?: Array<{ field: string; operator: string; value: string }>;
    assignedTo?: string;
    assignedTeamId?: string;
    separator?: string;
    includeHeaders?: boolean;
    dateFormat?: string;
  }): Promise<string> {
    const { tenantId, fields, filters, assignedTo, assignedTeamId, separator = ',', includeHeaders = true } = params;

    const qb = this.recordRepository.createQueryBuilder('client')
      .where('client.tenant_id = :tenantId', { tenantId })
      .andWhere('client.deleted_at IS NULL');

    if (assignedTo) qb.andWhere('client.assigned_to = :assignedTo', { assignedTo });
    if (assignedTeamId) qb.andWhere('client.assigned_team_id = :assignedTeamId', { assignedTeamId });

    if (filters && filters.length > 0) {
      this.applyFilters(qb, filters);
    }

    qb.orderBy('client.created_at', 'DESC');
    const records = await qb.getMany();

    const escape = (val: string) => {
      if (val.includes(separator) || val.includes('"') || val.includes('\n')) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    };

    const rows: string[] = [];

    if (includeHeaders) {
      rows.push(fields.map((f) => escape(f.label)).join(separator));
    }

    for (const record of records) {
      const row = fields.map((f) => {
        let value: any;
        if (this.SYSTEM_COLUMNS.has(f.key) || ['id', 'createdAt', 'updatedAt', 'tenantId', 'deletedAt', 'assignedTo', 'assignedTeamId', 'fullName', 'avatarUrl'].includes(f.key)) {
          value = (record as any)[f.key];
        } else {
          value = record.customData?.[f.key];
        }

        if (value === null || value === undefined) return '';
        if (value instanceof Date) return value.toISOString().split('T')[0];
        if (typeof value === 'boolean') return value ? 'Sí' : 'No';
        if (Array.isArray(value)) return escape(value.join(', '));
        return escape(String(value));
      });
      rows.push(row.join(separator));
    }

    return rows.join('\n');
  }

  async getDeleted(tenantId: string, page = 1, limit = 25, search?: string): Promise<{ data: ClientRecord[]; total: number }> {
    const qb = this.recordRepository.createQueryBuilder('client')
      .where('client.tenant_id = :tenantId', { tenantId })
      .andWhere('client.deleted_at IS NOT NULL');

    if (search && search.trim()) {
      const q = `%${search.trim().toLowerCase()}%`;
      qb.andWhere(`(LOWER(client.first_name) LIKE :q OR LOWER(client.last_name) LIKE :q OR LOWER(client.email) LIKE :q OR client.phone LIKE :q)`, { q });
    }

    qb.orderBy('client.deleted_at', 'DESC');

    const [data, total] = await qb.skip((page - 1) * limit).take(limit).getManyAndCount();
    return { data, total };
  }

  async globalSearch(tenantId: string, query: string, limit = 10): Promise<{
    contacts: Array<{ id: string; firstName: string | null; lastName: string | null; phone: string | null; email: string | null; status: string | null; avatarUrl: string | null }>;
    messages: Array<{ id: string; conversationId: string; content: string; direction: string; createdAt: Date; contactName: string | null; inboxName: string | null }>;
  }> {
    if (!query || query.trim().length < 2) return { contacts: [], messages: [] };

    const q = `%${query.trim().toLowerCase()}%`;

    // Search contacts
    const contacts = await this.recordRepository.query(
      `SELECT id, first_name as "firstName", last_name as "lastName", phone, email, status, avatar_url as "avatarUrl"
       FROM clients
       WHERE tenant_id = $1
         AND (LOWER(first_name) LIKE $2 OR LOWER(last_name) LIKE $2 OR LOWER(email) LIKE $2 OR phone LIKE $2)
       ORDER BY last_contact_at DESC NULLS LAST
       LIMIT $3`,
      [tenantId, q, limit],
    );

    // Search messages in conversations belonging to this tenant's inboxes
    const messages = await this.recordRepository.query(
      `SELECT m.id, m.conversation_id as "conversationId", m.content, m.direction, m.created_at as "createdAt",
              conv.contact_name as "contactName", i.name as "inboxName"
       FROM messages m
       JOIN conversations conv ON conv.id = m.conversation_id
       JOIN inboxes i ON i.id = conv.inbox_id
       WHERE i.tenant_id = $1
         AND LOWER(m.content) LIKE $2
         AND m.message_type != 'note'
       ORDER BY m.created_at DESC
       LIMIT $3`,
      [tenantId, q, limit],
    );

    return { contacts, messages };
  }

  async bulkUpdate(ids: string[], updates: Partial<{ status: string; assignedTo: string | null; assignedTeamId: string | null; tags: string[] }>, actorId?: string, actorName?: string): Promise<{ updated: number }> {
    if (ids.length === 0) return { updated: 0 };

    // Get tenant from first record for activity logging
    const sample = await this.recordRepository.findOne({ where: { id: ids[0] } });
    const tenantId = sample?.tenantId;

    // Process in batches to avoid PostgreSQL parameter limit (~32767)
    const BATCH_SIZE = 5000;
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batch = ids.slice(i, i + BATCH_SIZE);
      await this.recordRepository.update(batch, updates as any);
    }

    // Log activities in bulk (async, non-blocking)
    if (tenantId) {
      const activities: Array<{ tenantId: string; recordId: string; type: string; description: string; metadata?: Record<string, any>; actorId?: string; actorName?: string }> = [];

      for (const id of ids) {
        if (updates.status) {
          activities.push({ tenantId, recordId: id, type: 'status_changed', description: `Estado cambiado a ${updates.status}`, metadata: { to: updates.status, bulk: true }, actorId, actorName });
        }
        if (updates.assignedTo !== undefined) {
          activities.push({ tenantId, recordId: id, type: 'assigned', description: updates.assignedTo ? 'Agente asignado (lote)' : 'Asignación removida (lote)', metadata: { assignedTo: updates.assignedTo, bulk: true }, actorId, actorName });
        }
        if (updates.assignedTeamId !== undefined) {
          activities.push({ tenantId, recordId: id, type: 'assigned', description: updates.assignedTeamId ? 'Equipo asignado (lote)' : 'Equipo removido (lote)', metadata: { assignedTeamId: updates.assignedTeamId, bulk: true }, actorId, actorName });
        }
      }

      if (activities.length > 0) {
        // Batch activity saves to avoid memory issues with large sets
        const ACT_BATCH = 2000;
        for (let i = 0; i < activities.length; i += ACT_BATCH) {
          const batch = activities.slice(i, i + ACT_BATCH);
          this.activityRepository.save(batch.map((a) => this.activityRepository.create(a))).catch(() => {});
        }
      }
    }

    return { updated: ids.length };
  }

  async bulkDelete(ids: string[]): Promise<{ softDeleted: number; hardDeleted: number }> {
    if (ids.length === 0) return { softDeleted: 0, hardDeleted: 0 };

    // For large batches, process in chunks to avoid memory/query limits
    const CHUNK_SIZE = 5000;
    let totalSoftDeleted = 0;
    let totalHardDeleted = 0;

    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
      const chunk = ids.slice(i, i + CHUNK_SIZE);

      // Find which contacts have related records (conversations, notes)
      const withRelations = await this.recordRepository.query(
        `SELECT DISTINCT c.id FROM clients c
         LEFT JOIN conversations conv ON conv.record_id = c.id
         LEFT JOIN notes n ON n.record_id = c.id
         WHERE c.id = ANY($1) AND (conv.id IS NOT NULL OR n.id IS NOT NULL)`,
        [chunk],
      );
      const withRelationIds = new Set(withRelations.map((r: any) => r.id));
      const softDeleteIds = chunk.filter((id) => withRelationIds.has(id));
      const hardDeleteIds = chunk.filter((id) => !withRelationIds.has(id));

      if (softDeleteIds.length > 0) {
        await this.recordRepository.update(softDeleteIds, { deletedAt: new Date() } as any);
      }
      if (hardDeleteIds.length > 0) {
        await this.recordRepository.delete(hardDeleteIds);
      }

      totalSoftDeleted += softDeleteIds.length;
      totalHardDeleted += hardDeleteIds.length;
    }

    return { softDeleted: totalSoftDeleted, hardDeleted: totalHardDeleted };
  }

  async bulkDeleteByFilter(tenantId: string, filters?: Array<{ field: string; operator: string; value: string }>, assignedTo?: string, assignedTeamId?: string): Promise<{ softDeleted: number; hardDeleted: number }> {
    const qb = this.buildFilterQuery(tenantId, filters, assignedTo, assignedTeamId);

    // For large datasets, use streaming approach: get count first, then delete in batches
    const total = await qb.getCount();
    if (total === 0) return { softDeleted: 0, hardDeleted: 0 };

    // If small enough, use the ID-based approach
    if (total <= 10000) {
      const records = await qb.select('client.id').getRawMany();
      const ids = records.map((r: any) => r.client_id);
      return this.bulkDelete(ids);
    }

    // For large datasets, do direct SQL delete in batches using a subquery
    let softDeleted = 0;
    let hardDeleted = 0;
    const BATCH = 5000;

    while (true) {
      // Get a batch of IDs
      const batch = await qb.select('client.id').limit(BATCH).getRawMany();
      if (batch.length === 0) break;

      const ids = batch.map((r: any) => r.client_id);
      const result = await this.bulkDelete(ids);
      softDeleted += result.softDeleted;
      hardDeleted += result.hardDeleted;
    }

    return { softDeleted, hardDeleted };
  }

  async getDeletePreview(ids: string[]): Promise<{ withHistory: number; withoutHistory: number; total: number }> {
    if (ids.length === 0) return { withHistory: 0, withoutHistory: 0, total: 0 };

    // For large sets, sample to avoid timeout
    const sampleIds = ids.length > 10000 ? ids.slice(0, 1000) : ids;
    const withRelations = await this.recordRepository.query(
      `SELECT DISTINCT c.id FROM clients c
       LEFT JOIN conversations conv ON conv.record_id = c.id
       LEFT JOIN notes n ON n.record_id = c.id
       WHERE c.id = ANY($1) AND (conv.id IS NOT NULL OR n.id IS NOT NULL)`,
      [sampleIds],
    );

    if (ids.length > 10000) {
      // Extrapolate from sample
      const rate = sampleIds.length > 0 ? withRelations.length / sampleIds.length : 0;
      const estimatedWithHistory = Math.round(rate * ids.length);
      return { withHistory: estimatedWithHistory, withoutHistory: ids.length - estimatedWithHistory, total: ids.length };
    }

    const withHistory = withRelations.length;
    return { withHistory, withoutHistory: ids.length - withHistory, total: ids.length };
  }

  async getDeletePreviewByFilter(tenantId: string, filters?: Array<{ field: string; operator: string; value: string }>, assignedTo?: string, assignedTeamId?: string): Promise<{ withHistory: number; withoutHistory: number; total: number }> {
    const qb = this.buildFilterQuery(tenantId, filters, assignedTo, assignedTeamId);
    const total = await qb.getCount();
    if (total === 0) return { withHistory: 0, withoutHistory: 0, total: 0 };

    // For large sets, sample
    if (total > 10000) {
      const sample = await qb.select('client.id').limit(1000).getRawMany();
      const sampleIds = sample.map((r: any) => r.client_id);
      const preview = await this.getDeletePreview(sampleIds);
      const rate = sampleIds.length > 0 ? preview.withHistory / sampleIds.length : 0;
      return { withHistory: Math.round(rate * total), withoutHistory: total - Math.round(rate * total), total };
    }

    const records = await qb.select('client.id').getRawMany();
    return this.getDeletePreview(records.map((r: any) => r.client_id));
  }

  async restoreDeleted(ids: string[]): Promise<{ restored: number }> {
    if (ids.length === 0) return { restored: 0 };
    await this.recordRepository.update(ids, { deletedAt: null } as any);
    return { restored: ids.length };
  }

  async permanentDelete(ids: string[]): Promise<{ deleted: number }> {
    if (ids.length === 0) return { deleted: 0 };
    await this.recordRepository.delete(ids);
    return { deleted: ids.length };
  }

  private buildFilterQuery(tenantId: string, filters?: Array<{ field: string; operator: string; value: string }>, assignedTo?: string, assignedTeamId?: string) {
    const qb = this.recordRepository.createQueryBuilder('client')
      .where('client.tenant_id = :tenantId', { tenantId })
      .andWhere('client.deleted_at IS NULL');

    if (assignedTo) qb.andWhere('client.assigned_to = :assignedTo', { assignedTo });
    if (assignedTeamId) qb.andWhere('client.assigned_team_id = :assignedTeamId', { assignedTeamId });

    if (filters && filters.length > 0) {
      this.applyFilters(qb, filters);
    }
    return qb;
  }

  async bulkUpdateByFilter(tenantId: string, updates: Partial<{ status: string; assignedTo: string | null; assignedTeamId: string | null; tags: string[] }>, filters?: Array<{ field: string; operator: string; value: string }>, assignedTo?: string, assignedTeamId?: string, actorId?: string, actorName?: string): Promise<{ updated: number }> {
    const qb = this.buildFilterQuery(tenantId, filters, assignedTo, assignedTeamId);
    const ids = await qb.select('client.id').getRawMany();
    if (ids.length === 0) return { updated: 0 };
    const idList = ids.map((r: any) => r.client_id);
    return this.bulkUpdate(idList, updates, actorId, actorName);
  }

  async getActivities(recordId: string, page = 1, limit = 30): Promise<{ data: Activity[]; total: number }> {
    const [data, total] = await this.activityRepository.findAndCount({
      where: { recordId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: (page - 1) * limit,
    });
    return { data, total };
  }

  async logActivity(data: { tenantId: string; recordId: string; type: string; description?: string; metadata?: Record<string, any>; actorId?: string; actorName?: string }): Promise<Activity> {
    const activity = this.activityRepository.create(data);
    return this.activityRepository.save(activity);
  }

  async getDistinctValues(field: string, tenantId?: string): Promise<string[]> {
    // System columns mapping
    const columnMap: Record<string, string> = {
      status: 'status',
      channelSource: 'channel_source',
      city: 'city',
      region: 'region',
      gender: 'gender',
      documentType: 'document_type',
      source: 'source',
      countryCode: 'country_code',
      language: 'language',
    };

    const col = columnMap[field];

    if (col) {
      // System field: query column directly
      const qb = this.recordRepository
        .createQueryBuilder('client')
        .select(`DISTINCT client.${col}`, 'value')
        .where(`client.${col} IS NOT NULL AND client.${col} != ''`);

      if (tenantId) {
        qb.andWhere('client.tenant_id = :tenantId', { tenantId });
      }

      const results = await qb.orderBy('value', 'ASC').limit(100).getRawMany();
      return results.map((r) => r.value);
    }

    // Custom field: query from custom_data JSONB
    const qb = this.recordRepository
      .createQueryBuilder('client')
      .select(`DISTINCT client.custom_data->>'${field}'`, 'value')
      .where(`client.custom_data->>'${field}' IS NOT NULL AND client.custom_data->>'${field}' != ''`);

    if (tenantId) {
      qb.andWhere('client.tenant_id = :tenantId', { tenantId });
    }

    const results = await qb.orderBy('value', 'ASC').limit(100).getRawMany();
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
    const saved = await this.noteRepository.save(note);
    // Log activity
    this.logActivity({ tenantId: data.tenantId, recordId: data.recordId, type: 'note_created', description: 'Nota creada', actorId: data.authorId, actorName: data.authorName }).catch(() => {});
    // Notify the assigned agent (if different from the author)
    this.recordRepository.findOne({ where: { id: data.recordId } }).then((record) => {
      if (record?.assignedTo && record.assignedTo !== data.authorId) {
        const contactName = record.firstName || record.lastName ? `${record.firstName || ''} ${record.lastName || ''}`.trim() : (record.phone || 'Contacto');
        this.notificationsService.notify({
          tenantId: data.tenantId,
          userId: record.assignedTo,
          type: 'note_created',
          title: `${data.authorName || 'Alguien'} dejó una nota en ${contactName}`,
          body: data.content.substring(0, 120),
          link: `/${data.tenantId}/clients/${data.recordId}`,
          metadata: { recordId: data.recordId, noteId: saved.id },
        }).catch(() => {});
      }
    }).catch(() => {});
    return saved;
  }

  async deleteNote(noteId: string): Promise<void> {
    await this.noteRepository.delete(noteId);
  }

  // ============================================================
  // === NORMALIZACIÓN DE TELÉFONOS ===
  // ============================================================

  /**
   * Analiza los teléfonos del tenant y clasifica cuáles necesitan que se les
   * agregue el prefijo de país. No modifica nada (dry-run).
   *
   * - country: código de país por defecto para números locales (CO, MX, US).
   * - cleanFormat: si true, la limpieza de formato (quitar +, espacios, guiones)
   *   también se aplica a los números que ya tienen prefijo pero traen basura.
   *
   * Devuelve un resumen con conteos, ejemplos de cambios y colisiones potenciales.
   */
  /**
   * Resuelve el patrón a usar. Si country es 'CUSTOM', exige un `custom` válido
   * con prefijo (solo dígitos) y al menos una longitud nacional. Para países
   * predefinidos valida que estén soportados y devuelve undefined (usa el
   * patrón interno del validador).
   */
  private resolvePhonePattern(
    country: string,
    custom?: { code?: string; digits?: number[] },
  ): { code: string; digits: number[] } | undefined {
    if (country === 'CUSTOM') {
      const code = (custom?.code || '').replace(/[^\d]/g, '');
      const digits = (custom?.digits || []).filter((d) => Number.isInteger(d) && d >= 4 && d <= 15);
      if (!code) {
        throw new BadRequestException('El prefijo personalizado no es válido (solo dígitos, ej. 54).');
      }
      if (digits.length === 0) {
        throw new BadRequestException('Debe indicar al menos una longitud nacional válida (entre 4 y 15 dígitos).');
      }
      return { code, digits };
    }

    if (!SUPPORTED_PHONE_COUNTRIES.has(country)) {
      throw new BadRequestException(`País no soportado: ${country}`);
    }
    return undefined;
  }

  async previewPhoneNormalization(
    tenantId: string,
    country = 'CO',
    cleanFormat = true,
    custom?: { code?: string; digits?: number[] },
  ): Promise<{
    country: string;
    total: number;
    counts: { ok: number; needsPrefix: number; ambiguous: number; empty: number; cleanupOnly: number };
    willChange: number;
    collisions: number;
    samples: {
      needsPrefix: Array<{ id: string; before: string; after: string }>;
      ambiguous: Array<{ id: string; value: string; reason: string }>;
      collisions: Array<{ id: string; before: string; after: string }>;
    };
  }> {
    const customPattern = this.resolvePhonePattern(country, custom);

    const records = await this.recordRepository.find({
      where: { tenantId },
      select: { id: true, phone: true },
    });

    // Conjunto de teléfonos "canónicos" existentes para detectar colisiones al
    // agregar prefijo (dos contactos que terminarían con el mismo número).
    const existingCanonical = new Map<string, string>(); // canonical -> recordId
    for (const r of records) {
      if (r.phone) {
        const a = PhoneValidator.analyze(r.phone, country, customPattern);
        const key = a.status === 'ok' ? a.normalized! : null;
        if (key && !existingCanonical.has(key)) existingCanonical.set(key, r.id);
      }
    }

    const counts = { ok: 0, needsPrefix: 0, ambiguous: 0, empty: 0, cleanupOnly: 0 };
    const samples = {
      needsPrefix: [] as Array<{ id: string; before: string; after: string }>,
      ambiguous: [] as Array<{ id: string; value: string; reason: string }>,
      collisions: [] as Array<{ id: string; before: string; after: string }>,
    };
    let willChange = 0;
    let collisions = 0;

    for (const r of records) {
      const a = PhoneValidator.analyze(r.phone, country, customPattern);

      if (a.status === 'empty') {
        counts.empty++;
        continue;
      }

      if (a.status === 'ambiguous') {
        counts.ambiguous++;
        if (samples.ambiguous.length < 20) {
          samples.ambiguous.push({ id: r.id, value: r.phone || '', reason: a.reason || 'No reconocido' });
        }
        continue;
      }

      if (a.status === 'ok') {
        counts.ok++;
        // Si se pidió limpiar formato y el valor guardado difiere del limpio,
        // cuenta como cambio de solo-limpieza.
        if (cleanFormat && a.normalized !== r.phone) {
          counts.cleanupOnly++;
          willChange++;
        }
        continue;
      }

      // needs_prefix
      counts.needsPrefix++;
      const target = a.normalized!;
      const collidesWith = existingCanonical.get(target);
      if (collidesWith && collidesWith !== r.id) {
        collisions++;
        if (samples.collisions.length < 20) {
          samples.collisions.push({ id: r.id, before: r.phone || '', after: target });
        }
        // No se aplicará por colisión: se reporta pero no se cuenta como cambio.
        continue;
      }
      willChange++;
      if (samples.needsPrefix.length < 20) {
        samples.needsPrefix.push({ id: r.id, before: r.phone || '', after: target });
      }
    }

    return {
      country: customPattern ? `+${customPattern.code}` : country,
      total: records.length,
      counts,
      willChange,
      collisions,
      samples,
    };
  }

  /**
   * Aplica la normalización: agrega el prefijo de país a los números locales
   * (needs_prefix) y opcionalmente limpia el formato de los que ya tienen
   * prefijo. Omite ambiguos y colisiones. Actualiza en lotes.
   */
  async applyPhoneNormalization(
    tenantId: string,
    country = 'CO',
    cleanFormat = true,
    actor?: { actorId?: string; actorName?: string },
    custom?: { code?: string; digits?: number[] },
  ): Promise<{ updated: number; skippedAmbiguous: number; skippedCollisions: number }> {
    const customPattern = this.resolvePhonePattern(country, custom);

    const records = await this.recordRepository.find({
      where: { tenantId },
      select: { id: true, phone: true },
    });

    // Mapa de teléfonos canónicos existentes para no crear duplicados.
    const existingCanonical = new Map<string, string>();
    for (const r of records) {
      if (r.phone) {
        const a = PhoneValidator.analyze(r.phone, country, customPattern);
        const key = a.status === 'ok' ? a.normalized! : null;
        if (key && !existingCanonical.has(key)) existingCanonical.set(key, r.id);
      }
    }

    const updates: Array<{ id: string; phone: string }> = [];
    let skippedAmbiguous = 0;
    let skippedCollisions = 0;

    for (const r of records) {
      const a = PhoneValidator.analyze(r.phone, country, customPattern);

      if (a.status === 'empty') continue;
      if (a.status === 'ambiguous') { skippedAmbiguous++; continue; }

      if (a.status === 'ok') {
        if (cleanFormat && a.normalized && a.normalized !== r.phone) {
          updates.push({ id: r.id, phone: a.normalized });
        }
        continue;
      }

      // needs_prefix
      const target = a.normalized!;
      const collidesWith = existingCanonical.get(target);
      if (collidesWith && collidesWith !== r.id) { skippedCollisions++; continue; }
      updates.push({ id: r.id, phone: target });
      // Reservar el canónico para evitar que otro registro colisione en el mismo lote.
      existingCanonical.set(target, r.id);
    }

    // Actualización en lotes.
    const chunkSize = 500;
    let updated = 0;
    for (let i = 0; i < updates.length; i += chunkSize) {
      const chunk = updates.slice(i, i + chunkSize);
      await Promise.all(
        chunk.map((u) => this.recordRepository.update(u.id, { phone: u.phone })),
      );
      updated += chunk.length;
    }

    if (updated > 0) {
      this.logger.log(
        `Normalización de teléfonos tenant=${tenantId} país=${country} por=${actor?.actorName || actor?.actorId || 'desconocido'}: ${updated} actualizados, ${skippedAmbiguous} ambiguos, ${skippedCollisions} colisiones omitidas`,
      );
    }

    return { updated, skippedAmbiguous, skippedCollisions };
  }

  // ============================================================
  // === DETECCIÓN Y MERGE DE DUPLICADOS ===
  // ============================================================

  /** Tablas que referencian un contacto por record_id y deben reapuntarse en el merge. */
  private static readonly RECORD_FK_TABLES = [
    'conversations',
    'notes',
    'activities',
    'contact_events',
    'ad_events',
    'conversion_logs',
    'campaign_send_logs',
  ];

  /**
   * Detecta grupos de contactos duplicados dentro del tenant según los criterios
   * seleccionados. Solo considera contactos activos (deletedAt IS NULL).
   *
   * criteria: subconjunto de ['email','document','whatsappId','phone'].
   * Un grupo se forma cuando 2+ contactos comparten el mismo valor normalizado
   * en alguno de los criterios elegidos.
   */
  async detectDuplicates(
    tenantId: string,
    criteria: string[] = ['email', 'document', 'whatsappId', 'phone'],
  ): Promise<{
    groups: Array<{
      key: string;
      criterion: string;
      value: string;
      members: Array<{
        id: string;
        firstName: string | null;
        lastName: string | null;
        fullName: string | null;
        email: string | null;
        phone: string | null;
        documentNumber: string | null;
        whatsappId: string | null;
        status: string | null;
        createdAt: Date;
        relatedCount: number;
        filledFields: number;
      }>;
      suggestedWinnerId: string;
    }>;
    totalGroups: number;
    totalDuplicates: number;
  }> {
    const allowed = new Set(['email', 'document', 'whatsappId', 'phone']);
    const active = (criteria || []).filter((c) => allowed.has(c));
    if (active.length === 0) {
      return { groups: [], totalGroups: 0, totalDuplicates: 0 };
    }

    const records = await this.recordRepository.find({
      where: { tenantId, deletedAt: IsNull() },
    });

    // Conteo de datos relacionados por record (para sugerir ganador y mostrar).
    const relatedCounts = await this.getRelatedCounts(records.map((r) => r.id));

    // Normalizadores por criterio.
    const keyForCriterion = (r: ClientRecord, criterion: string): string | null => {
      switch (criterion) {
        case 'email':
          return r.email ? r.email.trim().toLowerCase() : null;
        case 'phone':
          return r.phone ? r.phone.replace(/[^\d]/g, '') : null;
        case 'whatsappId':
          return r.whatsappId ? r.whatsappId.trim().toLowerCase() : null;
        case 'document':
          return r.documentNumber ? r.documentNumber.trim().toLowerCase() : null;
        default:
          return null;
      }
    };

    // Agrupa por criterio+valor. Un record puede caer en varios grupos si comparte
    // distintos criterios, pero evitamos duplicar el mismo par exacto de contactos:
    // usamos la primera coincidencia por conjunto de miembros.
    const buckets = new Map<string, { criterion: string; value: string; ids: Set<string> }>();
    for (const criterion of active) {
      for (const r of records) {
        const value = keyForCriterion(r, criterion);
        if (!value) continue;
        const key = `${criterion}:${value}`;
        if (!buckets.has(key)) buckets.set(key, { criterion, value, ids: new Set() });
        buckets.get(key)!.ids.add(r.id);
      }
    }

    const filledFields = (r: ClientRecord): number => {
      const fields = [r.firstName, r.lastName, r.fullName, r.email, r.phone, r.documentNumber, r.whatsappId, r.company, r.city, r.address, r.avatarUrl];
      let n = fields.filter((f) => f != null && String(f).trim() !== '').length;
      if (r.tags && r.tags.length > 0) n++;
      if (r.customData && Object.keys(r.customData).length > 0) n++;
      return n;
    };

    const recordById = new Map(records.map((r) => [r.id, r]));
    const groups: any[] = [];
    // Evita mostrar el mismo conjunto de miembros dos veces (p. ej. si dos criterios
    // agrupan exactamente los mismos contactos).
    const seenMemberSets = new Set<string>();

    for (const { criterion, value, ids } of buckets.values()) {
      if (ids.size < 2) continue;
      const memberKey = [...ids].sort().join(',');
      if (seenMemberSets.has(memberKey)) continue;
      seenMemberSets.add(memberKey);

      const members = [...ids].map((id) => {
        const r = recordById.get(id)!;
        return {
          id: r.id,
          firstName: r.firstName ?? null,
          lastName: r.lastName ?? null,
          fullName: r.fullName ?? null,
          email: r.email ?? null,
          phone: r.phone ?? null,
          documentNumber: r.documentNumber ?? null,
          whatsappId: r.whatsappId ?? null,
          status: r.status ?? null,
          createdAt: r.createdAt,
          relatedCount: relatedCounts.get(r.id) ?? 0,
          filledFields: filledFields(r),
        };
      });

      // Ganador sugerido: más datos relacionados, luego más campos completos,
      // luego el más antiguo (createdAt ascendente).
      const suggested = [...members].sort((a, b) => {
        if (b.relatedCount !== a.relatedCount) return b.relatedCount - a.relatedCount;
        if (b.filledFields !== a.filledFields) return b.filledFields - a.filledFields;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      })[0];

      groups.push({
        key: `${criterion}:${value}`,
        criterion,
        value,
        members,
        suggestedWinnerId: suggested.id,
      });
    }

    const totalDuplicates = groups.reduce((acc, g) => acc + (g.members.length - 1), 0);
    return { groups, totalGroups: groups.length, totalDuplicates };
  }

  /** Cuenta filas relacionadas (conversaciones, notas, actividades) por record. */
  private async getRelatedCounts(ids: string[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (ids.length === 0) return counts;
    const rows = await this.recordRepository.query(
      `SELECT c.id,
         (SELECT COUNT(*) FROM conversations WHERE record_id = c.id)
       + (SELECT COUNT(*) FROM notes WHERE record_id = c.id)
       + (SELECT COUNT(*) FROM activities WHERE record_id = c.id) AS cnt
       FROM clients c WHERE c.id = ANY($1)`,
      [ids],
    );
    for (const row of rows) counts.set(row.id, Number(row.cnt) || 0);
    return counts;
  }

  /**
   * Fusiona uno o varios contactos "perdedores" en un "ganador". Reapunta todas
   * las referencias por record_id, consolida listas estáticas, rellena campos
   * vacíos del ganador con datos de los perdedores y hace soft delete de estos.
   * Todo en una transacción.
   */
  async mergeRecords(
    tenantId: string,
    winnerId: string,
    loserIds: string[],
    actor?: { actorId?: string; actorName?: string },
  ): Promise<{ merged: number; winnerId: string }> {
    const losers = (loserIds || []).filter((id) => id && id !== winnerId);
    if (losers.length === 0) {
      throw new BadRequestException('No hay contactos perdedores válidos para fusionar.');
    }

    const winner = await this.recordRepository.findOne({ where: { id: winnerId, tenantId } });
    if (!winner) throw new BadRequestException('El contacto ganador no existe en este tenant.');

    const loserRecords = await this.recordRepository.find({
      where: losers.map((id) => ({ id, tenantId })),
    });
    if (loserRecords.length !== losers.length) {
      throw new BadRequestException('Alguno de los contactos a fusionar no existe en este tenant.');
    }

    await this.dataSource.transaction(async (manager) => {
      // 1. Reapuntar todas las tablas con record_id de los perdedores al ganador.
      for (const table of RecordsService.RECORD_FK_TABLES) {
        await manager.query(
          `UPDATE ${table} SET record_id = $1 WHERE record_id = ANY($2)`,
          [winnerId, losers],
        );
      }

      // 2. Consolidar listas estáticas: reemplazar cada perdedor por el ganador (dedup).
      const lists = await manager.query(
        `SELECT id, record_ids FROM record_lists
         WHERE tenant_id = $1 AND type = 'static' AND record_ids IS NOT NULL`,
        [tenantId],
      );
      const loserSet = new Set(losers);
      for (const list of lists) {
        const current: string[] = Array.isArray(list.record_ids) ? list.record_ids : [];
        if (!current.some((id) => loserSet.has(id))) continue;
        const next = Array.from(new Set(current.map((id) => (loserSet.has(id) ? winnerId : id))));
        await manager.query(
          `UPDATE record_lists SET record_ids = $1::jsonb, updated_at = NOW() WHERE id = $2`,
          [JSON.stringify(next), list.id],
        );
      }

      // 3. Consolidar campos del ganador con los de los perdedores.
      const merged = this.mergeFieldValues(winner, loserRecords);

      // 4. Soft delete de los perdedores ANTES de asignar el phone al ganador,
      //    para no violar el índice único (tenant, phone) si se copia.
      await manager.query(
        `UPDATE clients SET deleted_at = NOW(), updated_at = NOW() WHERE id = ANY($1)`,
        [losers],
      );

      // 5. Persistir los campos consolidados del ganador.
      await manager.query(
        `UPDATE clients SET
           first_name = $1, last_name = $2, full_name = $3, email = $4, phone = $5,
           country_code = $6, whatsapp_id = $7, document_type = $8, document_number = $9,
           company = $10, job_title = $11, city = $12, region = $13, address = $14,
           avatar_url = $15, tags = $16::jsonb, custom_data = $17::jsonb,
           score = $18, ad_touchpoints = $19,
           last_contact_at = $20, last_activity_at = $21, updated_at = NOW()
         WHERE id = $22`,
        [
          merged.firstName, merged.lastName, merged.fullName, merged.email, merged.phone,
          merged.countryCode, merged.whatsappId, merged.documentType, merged.documentNumber,
          merged.company, merged.jobTitle, merged.city, merged.region, merged.address,
          merged.avatarUrl,
          merged.tags ? JSON.stringify(merged.tags) : null,
          merged.customData ? JSON.stringify(merged.customData) : null,
          merged.score, merged.adTouchpoints,
          merged.lastContactAt, merged.lastActivityAt,
          winnerId,
        ],
      );
    });

    this.logActivity({
      tenantId,
      recordId: winnerId,
      type: 'contacts_merged',
      description: `${losers.length} contacto(s) duplicado(s) fusionado(s) en este registro`,
      metadata: { loserIds: losers },
      actorId: actor?.actorId,
      actorName: actor?.actorName,
    }).catch(() => {});

    this.logger.log(
      `Merge de contactos tenant=${tenantId} ganador=${winnerId} perdedores=[${losers.join(',')}] por=${actor?.actorName || actor?.actorId || 'desconocido'}`,
    );

    return { merged: losers.length, winnerId };
  }

  /**
   * Consolida los valores escalares/jsonb del ganador rellenando huecos con los
   * de los perdedores (en orden). No pisa valores que el ganador ya tenga.
   */
  private mergeFieldValues(winner: ClientRecord, losers: ClientRecord[]): ClientRecord {
    const isEmpty = (v: any) => v == null || (typeof v === 'string' && v.trim() === '');
    const result: any = { ...winner };

    const scalarFields = [
      'firstName', 'lastName', 'fullName', 'email', 'phone', 'countryCode', 'whatsappId',
      'documentType', 'documentNumber', 'company', 'jobTitle', 'city', 'region', 'address', 'avatarUrl',
    ];

    for (const loser of losers) {
      // Rellenar escalares vacíos del ganador.
      for (const f of scalarFields) {
        if (isEmpty(result[f]) && !isEmpty((loser as any)[f])) {
          result[f] = (loser as any)[f];
        }
      }
      // Tags: unión sin duplicados.
      const winnerTags = Array.isArray(result.tags) ? result.tags : [];
      const loserTags = Array.isArray(loser.tags) ? loser.tags : [];
      if (loserTags.length > 0) {
        result.tags = Array.from(new Set([...winnerTags, ...loserTags]));
      }
      // customData: fusionar sin pisar claves existentes del ganador.
      if (loser.customData && Object.keys(loser.customData).length > 0) {
        result.customData = { ...(loser.customData || {}), ...(result.customData || {}) };
      }
      // Fechas: la más reciente.
      result.lastContactAt = this.maxDate(result.lastContactAt, loser.lastContactAt);
      result.lastActivityAt = this.maxDate(result.lastActivityAt, loser.lastActivityAt);
      // Score: el máximo.
      result.score = Math.max(result.score || 0, loser.score || 0);
      // Ad touchpoints: suma.
      result.adTouchpoints = (result.adTouchpoints || 0) + (loser.adTouchpoints || 0);
    }

    return result as ClientRecord;
  }

  private maxDate(a: Date | null | undefined, b: Date | null | undefined): Date | null {
    if (!a) return b ?? null;
    if (!b) return a ?? null;
    return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
  }
}
