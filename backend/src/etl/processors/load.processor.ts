import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientRecord } from '../../records/record.entity';
import { DuplicateMatch } from './deduplicate.processor';
import { DeduplicateStrategy } from '../entities/import-job.entity';

export interface LoadResult {
  created: number;
  updated: number;
  skipped: number;
  errors: { rowNumber: number; message: string }[];
}

@Injectable()
export class LoadProcessor {
  // System field keys that map to actual columns
  private readonly SYSTEM_COLUMNS = new Set([
    'id', 'firstName', 'lastName', 'fullName', 'documentType', 'documentNumber',
    'phone', 'countryCode', 'email', 'gender', 'birthDate',
    'city', 'region', 'status', 'channelSource', 'source', 'score',
    'optInWhatsapp', 'optInEmail', 'assignedTo',
    'lastContactAt', 'lastActivityAt', 'tags',
  ]);

  constructor(
    @InjectRepository(ClientRecord)
    private readonly recordRepo: Repository<ClientRecord>,
  ) {}

  /**
   * Carga registros nuevos en la base de datos.
   * Usa insertación batch directa para máximo rendimiento.
   */
  async loadNewRecords(
    records: Record<string, unknown>[],
    tenantId: string,
    chunkSize = 1000,
  ): Promise<LoadResult> {
    const result: LoadResult = { created: 0, updated: 0, skipped: 0, errors: [] };

    for (let i = 0; i < records.length; i += chunkSize) {
      const chunk = records.slice(i, i + chunkSize);
      const entities = chunk.map((record) => this.buildEntity(record, tenantId));

      try {
        // Use insert() instead of save() — skips SELECT, does direct INSERT
        await this.recordRepo
          .createQueryBuilder()
          .insert()
          .into(ClientRecord)
          .values(entities)
          .execute();
        result.created += entities.length;
      } catch (error: any) {
        // If batch insert fails, fallback to individual inserts
        for (let j = 0; j < entities.length; j++) {
          try {
            await this.recordRepo.save(entities[j]);
            result.created++;
          } catch (innerError: any) {
            result.errors.push({
              rowNumber: i + j + 1,
              message: innerError.message || 'Error al insertar registro',
            });
          }
        }
      }
    }

    return result;
  }

  /**
   * Actualiza registros existentes basándose en los duplicados resueltos.
   * Para merge_non_empty y overwrite: actualiza TODOS los registros que coincidan
   * con el mismo valor del matchField, no solo el primero encontrado.
   */
  async loadDuplicateUpdates(
    duplicates: DuplicateMatch[],
    strategy: DeduplicateStrategy,
    overwriteFields?: string[],
    chunkSize = 200,
  ): Promise<LoadResult> {
    const result: LoadResult = { created: 0, updated: 0, skipped: 0, errors: [] };

    if (strategy === 'keep_existing') {
      result.skipped = duplicates.length;
      return result;
    }

    // Group duplicates by their incoming data to avoid redundant updates
    // (same incoming record may match multiple DB records with same value)
    const seen = new Set<string>();

    for (let i = 0; i < duplicates.length; i += chunkSize) {
      const chunk = duplicates.slice(i, i + chunkSize);

      for (const dup of chunk) {
        try {
          // Build a unique key from match fields to avoid updating same group twice
          const matchKey = dup.matchedOn.map((f) => `${f}:${String(dup.existingRecord[f as keyof typeof dup.existingRecord] || '').toString().toLowerCase().trim()}`).join('|');
          if (seen.has(matchKey)) {
            result.skipped++;
            continue;
          }
          seen.add(matchKey);

          // Build SET clause based on strategy
          const setClauses: string[] = [];
          const params: any[] = [];
          let paramIdx = 1;

          for (const [key, val] of Object.entries(dup.incomingRecord)) {
            if (key === 'id' || key === 'tenantId') continue;
            if (val === null || val === undefined || val === '') continue;

            // For overwrite_selected, only update specified fields
            if (strategy === 'overwrite_selected' && overwriteFields && !overwriteFields.includes(key)) continue;

            if (!this.SYSTEM_COLUMNS.has(key)) continue; // Custom data handled separately

            const col = this.getColumnName(key);
            if (!col) continue;

            if (strategy === 'merge_non_empty') {
              // Only update if existing value is empty
              setClauses.push(`${col} = CASE WHEN (${col} IS NULL OR ${col} = '') THEN $${paramIdx} ELSE ${col} END`);
            } else {
              // overwrite or overwrite_selected: always update
              setClauses.push(`${col} = $${paramIdx}`);
            }
            params.push(val);
            paramIdx++;
          }

          if (setClauses.length === 0) {
            result.skipped++;
            continue;
          }

          // Build WHERE clause from matched fields
          const whereClauses: string[] = [`tenant_id = $${paramIdx}`];
          params.push(dup.existingRecord.tenantId);
          paramIdx++;

          for (const matchField of dup.matchedOn) {
            const col = this.getColumnName(matchField);
            if (!col) continue;
            const matchVal = String((dup.existingRecord as any)[matchField] || '').trim();
            whereClauses.push(`LOWER(TRIM(${col})) = LOWER($${paramIdx})`);
            params.push(matchVal);
            paramIdx++;
          }

          // Execute bulk UPDATE for all matching records
          const query = `UPDATE clients SET ${setClauses.join(', ')}, updated_at = NOW() WHERE ${whereClauses.join(' AND ')}`;
          const updateResult = await this.recordRepo.query(query, params);
          const affected = updateResult[1] || 0;
          result.updated += affected;
        } catch (error: any) {
          result.errors.push({
            rowNumber: dup.rowNumber,
            message: error.message || 'Error al actualizar registro duplicado',
          });
        }
      }
    }

    return result;
  }

  private getColumnName(field: string): string | null {
    const map: Record<string, string> = {
      firstName: 'first_name',
      lastName: 'last_name',
      fullName: 'full_name',
      documentType: 'document_type',
      documentNumber: 'document_number',
      phone: 'phone',
      countryCode: 'country_code',
      email: 'email',
      gender: 'gender',
      birthDate: 'birth_date',
      city: 'city',
      region: 'region',
      status: 'status',
      channelSource: 'channel_source',
      source: 'source',
      score: 'score',
      optInWhatsapp: 'opt_in_whatsapp',
      optInEmail: 'opt_in_email',
      assignedTo: 'assigned_to',
      lastContactAt: 'last_contact_at',
      lastActivityAt: 'last_activity_at',
    };
    return map[field] || null;
  }

  private buildEntity(record: Record<string, unknown>, tenantId: string): ClientRecord {
    const systemData: Partial<ClientRecord> = {};
    const customData: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(record)) {
      if (this.SYSTEM_COLUMNS.has(key)) {
        (systemData as any)[key] = value;
      } else {
        customData[key] = value;
      }
    }

    return this.recordRepo.create({
      ...systemData,
      tenantId,
      channelSource: systemData.channelSource || 'import',
      customData: Object.keys(customData).length > 0 ? customData : null,
    } as Partial<ClientRecord>);
  }
}
