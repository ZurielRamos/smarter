import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientRecord } from '../../records/record.entity';
import { DeduplicateConfig } from '../entities/import-job.entity';

export interface DeduplicateResult {
  newRecords: Record<string, unknown>[];
  duplicates: DuplicateMatch[];
  summary: {
    total: number;
    new: number;
    duplicates: number;
  };
}

export interface DuplicateMatch {
  incomingRecord: Record<string, unknown>;
  existingRecord: ClientRecord;
  matchedOn: string[];
  confidence: number;
  rowNumber: number;
}

const SYSTEM_COLUMNS = new Set([
  'id', 'firstName', 'lastName', 'fullName', 'documentType', 'documentNumber',
  'phone', 'countryCode', 'email', 'gender', 'birthDate',
  'city', 'region', 'status', 'channelSource', 'source', 'score',
  'optInWhatsapp', 'optInEmail', 'assignedTo',
  'lastContactAt', 'lastActivityAt', 'tags',
]);

const COLUMN_MAP: Record<string, string> = {
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

@Injectable()
export class DeduplicateProcessor {
  constructor(
    @InjectRepository(ClientRecord)
    private readonly recordRepo: Repository<ClientRecord>,
  ) {}

  /**
   * Detecta duplicados procesando en chunks para manejar archivos grandes.
   * 
   * Estrategia optimizada para 500K+ registros:
   * 1. Procesa el archivo en chunks de N filas
   * 2. Para cada chunk, extrae los valores únicos de matchFields
   * 3. Hace UNA query IN(...) por matchField para ese chunk
   * 4. Construye un Map temporal solo para ese chunk (no acumula 500K en RAM)
   * 5. Hace el matching en O(1) por fila
   * 
   * Complejidad: O(ceil(n/chunkSize)) queries por matchField
   * RAM: proporcional al chunkSize, no al tamaño total de la BD
   */
  async detectDuplicates(
    records: Record<string, unknown>[],
    config: DeduplicateConfig,
    tenantId: string,
    startRowOffset = 0,
    chunkSize = 2000,
  ): Promise<DeduplicateResult> {
    const { matchFields } = config;
    if (!matchFields || matchFields.length === 0) {
      return {
        newRecords: records,
        duplicates: [],
        summary: { total: records.length, new: records.length, duplicates: 0 },
      };
    }

    const newRecords: Record<string, unknown>[] = [];
    const duplicates: DuplicateMatch[] = [];

    // Process in chunks to limit memory usage
    for (let i = 0; i < records.length; i += chunkSize) {
      const chunk = records.slice(i, i + chunkSize);
      const chunkResult = await this.processChunk(chunk, matchFields, tenantId, i + startRowOffset);
      newRecords.push(...chunkResult.newRecords);
      duplicates.push(...chunkResult.duplicates);
    }

    return {
      newRecords,
      duplicates,
      summary: { total: records.length, new: newRecords.length, duplicates: duplicates.length },
    };
  }

  /**
   * Procesa un chunk de registros contra la BD.
   */
  private async processChunk(
    chunk: Record<string, unknown>[],
    matchFields: string[],
    tenantId: string,
    rowOffset: number,
  ): Promise<{ newRecords: Record<string, unknown>[]; duplicates: DuplicateMatch[] }> {
    // Build index only for values in this chunk
    const index = new Map<string, ClientRecord>();

    for (const field of matchFields) {
      // Collect unique lookup values from the chunk
      const lookupValues = new Set<string>();
      for (const record of chunk) {
        const val = record[field];
        if (val === null || val === undefined || val === '') continue;
        const strVal = String(val).toLowerCase().trim();
        if (!strVal) continue;

        lookupValues.add(strVal);
        if (field === 'phone') {
          for (const v of this.getPhoneVariants(strVal)) {
            lookupValues.add(v);
          }
        }
      }

      if (lookupValues.size === 0) continue;

      // Query in sub-batches of 500 (Postgres IN limit safe)
      const values = Array.from(lookupValues);
      const QUERY_BATCH = 500;

      for (let b = 0; b < values.length; b += QUERY_BATCH) {
        const batch = values.slice(b, b + QUERY_BATCH);
        const existingRecords = await this.queryExisting(field, batch, tenantId);

        for (const existing of existingRecords) {
          const existingVal = this.getFieldValue(existing, field);
          if (!existingVal) continue;

          const normalized = existingVal.toLowerCase().trim();
          const key = `${field}:${normalized}`;
          if (!index.has(key)) index.set(key, existing);

          // Index phone variants
          if (field === 'phone') {
            for (const variant of this.getPhoneVariants(normalized)) {
              const vKey = `${field}:${variant}`;
              if (!index.has(vKey)) index.set(vKey, existing);
            }
          }
        }
      }
    }

    // Match each record in the chunk against the index
    const newRecords: Record<string, unknown>[] = [];
    const duplicates: DuplicateMatch[] = [];

    for (let i = 0; i < chunk.length; i++) {
      const record = chunk[i];
      const match = this.matchRecord(record, matchFields, index);

      if (match) {
        duplicates.push({
          incomingRecord: record,
          existingRecord: match.record,
          matchedOn: match.matchedFields,
          confidence: 1.0,
          rowNumber: i + rowOffset + 1,
        });
      } else {
        newRecords.push(record);
      }
    }

    return { newRecords, duplicates };
  }

  /**
   * Query eficiente por campo: usa los índices compuestos (tenant_id, phone/email).
   */
  private async queryExisting(field: string, values: string[], tenantId: string): Promise<ClientRecord[]> {
    if (values.length === 0) return [];

    if (field === 'phone') {
      return this.recordRepo
        .createQueryBuilder('r')
        .where('r.tenant_id = :tenantId', { tenantId })
        .andWhere('LOWER(TRIM(r.phone)) IN (:...values)', { values })
        .getMany();
    }

    if (field === 'email') {
      return this.recordRepo
        .createQueryBuilder('r')
        .where('r.tenant_id = :tenantId', { tenantId })
        .andWhere('LOWER(TRIM(r.email)) IN (:...values)', { values })
        .getMany();
    }

    if (SYSTEM_COLUMNS.has(field)) {
      const col = COLUMN_MAP[field] || field;
      return this.recordRepo
        .createQueryBuilder('r')
        .where('r.tenant_id = :tenantId', { tenantId })
        .andWhere(`LOWER(TRIM(r.${col})) IN (:...values)`, { values })
        .getMany();
    }

    // Custom JSONB field
    return this.recordRepo
      .createQueryBuilder('r')
      .where('r.tenant_id = :tenantId', { tenantId })
      .andWhere(`LOWER(TRIM(r.custom_data ->> :field)) IN (:...values)`, { field, values })
      .getMany();
  }

  private getFieldValue(record: ClientRecord, field: string): string {
    if (SYSTEM_COLUMNS.has(field)) {
      return String((record as any)[field] || '').trim();
    }
    return String(record.customData?.[field] || '').trim();
  }

  private matchRecord(
    record: Record<string, unknown>,
    matchFields: string[],
    index: Map<string, ClientRecord>,
  ): { record: ClientRecord; matchedFields: string[] } | null {
    for (const field of matchFields) {
      const val = record[field];
      if (val === null || val === undefined || val === '') continue;
      const strVal = String(val).toLowerCase().trim();
      if (!strVal) continue;

      const key = `${field}:${strVal}`;
      const existing = index.get(key);
      if (existing) return { record: existing, matchedFields: [field] };

      if (field === 'phone') {
        for (const variant of this.getPhoneVariants(strVal)) {
          const vKey = `${field}:${variant}`;
          const found = index.get(vKey);
          if (found) return { record: found, matchedFields: [field] };
        }
      }
    }
    return null;
  }

  /**
   * Variantes de teléfono para matching flexible con/sin código de país.
   */
  private getPhoneVariants(phone: string): string[] {
    const cleaned = phone.replace(/[\s\-\(\)\.+]/g, '');
    if (!cleaned || !/^\d+$/.test(cleaned)) return [];

    const variants: string[] = [];

    // Códigos de país comunes ordenados de mayor a menor para evitar ambigüedad
    const codes3 = ['591','592','593','594','595','596','597','598','599','351','352','353','354','355','356','357','358','359','370','371','372','373','374','375','376','377','378','379','380','381','382','383','385','386','387','389','420','421','423','500','501','502','503','504','505','506','507','508','509','590','670','672','673','674','675','676','677','678','679','680','681','682','683','685','686','687','688','689','690','691','692','850','852','853','855','856','880','886','960','961','962','963','964','965','966','967','968','969','970','971','972','973','974','975','976','977','992','993','994','995','996','997','998'];
    const codes2 = ['20','27','30','31','32','33','34','36','39','40','41','43','44','45','46','47','48','49','51','52','53','54','55','56','57','58','60','61','62','63','64','65','66','70','71','72','73','74','75','76','77','78','79','81','82','84','86','90','91','92','93','94','95','98'];
    const codes1 = ['1','7'];

    // Try stripping country code
    let stripped = false;
    for (const code of codes3) {
      if (cleaned.startsWith(code) && cleaned.length >= code.length + 7) {
        variants.push(cleaned.slice(code.length));
        stripped = true;
        break;
      }
    }
    if (!stripped) {
      for (const code of codes2) {
        if (cleaned.startsWith(code) && cleaned.length >= code.length + 7) {
          variants.push(cleaned.slice(code.length));
          stripped = true;
          break;
        }
      }
    }
    if (!stripped) {
      for (const code of codes1) {
        if (cleaned.startsWith(code) && cleaned.length >= code.length + 7) {
          variants.push(cleaned.slice(code.length));
          stripped = true;
          break;
        }
      }
    }

    // If 7-10 digits, add with common prefixes
    if (cleaned.length >= 7 && cleaned.length <= 10) {
      if (cleaned.startsWith('3') || cleaned.startsWith('6')) variants.push(`57${cleaned}`);
      if (cleaned.length === 10) variants.push(`1${cleaned}`);
    }

    return variants;
  }
}
