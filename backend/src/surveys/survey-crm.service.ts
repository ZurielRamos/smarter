import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientRecord } from '../records/record.entity';
import { CustomField } from '../records/custom-field.entity';
import { Survey } from './survey.entity';

/**
 * Columnas reales de la entidad ClientRecord. Los campos del CRM cuyo field_key
 * NO está aquí se persisten dentro de custom_data (jsonb). Así el catálogo de
 * campos (tabla custom_fields) es la única fuente de verdad y no duplicamos
 * ninguna lista hardcodeada.
 */
const CLIENT_RECORD_COLUMNS = new Set<string>([
  'firstName', 'lastName', 'fullName', 'documentType', 'documentNumber',
  'company', 'jobTitle', 'phone', 'countryCode', 'whatsappId', 'email',
  'website', 'gender', 'birthDate', 'city', 'region', 'address', 'status',
  'channelSource', 'source', 'score', 'language', 'optInWhatsapp', 'optInEmail',
  'avatarUrl', 'notes', 'tags',
]);

/** Campos por los que tiene sentido hacer match de un contacto existente. */
const MATCHABLE_FIELDS = new Set(['email', 'phone', 'documentNumber', 'whatsappId']);

/**
 * Campos del CRM que NO deben ofrecerse para mapeo de encuestas (metadatos de
 * sistema que no se rellenan desde una respuesta).
 */
const EXCLUDED_FROM_MAPPING = new Set([
  'createdAt', 'lastContactAt', 'lastActivityAt', 'score', 'status', 'tags',
  'channelSource', 'source',
]);

@Injectable()
export class SurveyCrmService {
  private readonly logger = new Logger(SurveyCrmService.name);

  constructor(
    @InjectRepository(ClientRecord)
    private readonly recordRepo: Repository<ClientRecord>,
    @InjectRepository(CustomField)
    private readonly customFieldRepo: Repository<CustomField>,
  ) {}

  /**
   * Catálogo de campos del CRM para el selector del UI, leído de la tabla
   * custom_fields (única fuente de verdad: incluye campos de sistema y
   * personalizados). Separa en `system` (columnas de ClientRecord) y `custom`
   * (viven en custom_data), SIN duplicar. El `value` es siempre el fieldKey;
   * los no-columna se persisten como custom_data[fieldKey].
   */
  async listTargets(tenantId: string): Promise<{
    system: Array<{ value: string; label: string; group: string }>;
    custom: Array<{ value: string; label: string; group: string }>;
    matchable: string[];
  }> {
    const fields = await this.customFieldRepo.find({
      where: { tenantId },
      order: { sortOrder: 'ASC' },
    });

    const system: Array<{ value: string; label: string; group: string }> = [];
    const custom: Array<{ value: string; label: string; group: string }> = [];

    for (const f of fields) {
      if (EXCLUDED_FROM_MAPPING.has(f.fieldKey)) continue;
      const entry = { value: f.fieldKey, label: f.fieldLabel, group: f.fieldGroup || 'general' };
      if (CLIENT_RECORD_COLUMNS.has(f.fieldKey)) system.push(entry);
      else custom.push(entry);
    }

    return { system, custom, matchable: Array.from(MATCHABLE_FIELDS) };
  }

  /**
   * Atribuye una respuesta a un contacto del CRM según el mapeo de la encuesta.
   * Devuelve el id del ClientRecord creado/actualizado, o null si la encuesta
   * no tiene mapeo configurado.
   *
   * Lógica:
   *   1) Resolver los valores mapeados (campoEncuesta -> campoCRM).
   *   2) Si hay matchField, buscar un contacto por el valor de ese campo
   *      (resuelto a su target CRM). Si existe, actualizarlo (sin pisar datos
   *      salvo los mapeados). Si no, crear uno nuevo.
   *   3) Guardar los valores no reconocidos del CRM en custom_data de respaldo.
   */
  async attribute(
    survey: Survey,
    responseData: Record<string, any>,
    channel: string,
  ): Promise<string | null> {
    const mapping = survey.crmMapping;
    if (!mapping?.fields || Object.keys(mapping.fields).length === 0) {
      return null; // sin mapeo => no se toca el CRM
    }

    // 1) Resolver valores por target del CRM. El target es el fieldKey: si es
    //    columna de ClientRecord va a systemValues; si no, a custom_data.
    const systemValues: Record<string, any> = {};
    const customValues: Record<string, any> = {};
    for (const [surveyField, crmTarget] of Object.entries(mapping.fields)) {
      if (!crmTarget) continue;
      const raw = responseData[surveyField];
      if (raw === undefined || raw === null || raw === '') continue;
      const value = Array.isArray(raw) ? raw.join(', ') : raw;
      if (CLIENT_RECORD_COLUMNS.has(crmTarget)) {
        systemValues[crmTarget] = value;
      } else {
        customValues[crmTarget] = value;
      }
    }

    if (Object.keys(systemValues).length === 0 && Object.keys(customValues).length === 0) {
      return null;
    }

    // 2) Buscar contacto existente según la regla de match (AND/OR sobre varios
    //    campos). Soporta el formato legado matchField (un solo campo).
    let record: ClientRecord | null = null;
    const rule = this.resolveMatchRule(mapping);
    if (rule.fields.length > 0) {
      // Resolver cada campo de match a { target, value }.
      const criteria = rule.fields
        .map((surveyField) => {
          const target = mapping.fields![surveyField];
          const value = this.normalizeMatch(target, responseData[surveyField]);
          return target && value ? { target, value } : null;
        })
        .filter((c): c is { target: string; value: string } => c !== null);

      if (criteria.length > 0) {
        record = await this.findByCriteria(survey.tenantId, criteria, rule.logic);
      }
    }

    // 3) Crear o actualizar.
    if (!record) {
      record = this.recordRepo.create({
        tenantId: survey.tenantId,
        status: 'lead',
        channelSource: channel === 'whatsapp' ? 'whatsapp' : 'survey',
        source: `survey:${survey.name}`,
        lastContactAt: new Date(),
      } as Partial<ClientRecord>);
    }

    this.applySystemValues(record, systemValues);

    if (Object.keys(customValues).length > 0) {
      record.customData = { ...(record.customData || {}), ...customValues };
    }
    record.lastContactAt = new Date();

    const saved = await this.recordRepo.save(record);
    return saved.id;
  }

  // ---- Helpers ----

  /** Normaliza el valor de match (teléfono sin +, email en minúsculas). */
  private normalizeMatch(target: string | undefined, raw: any): string | null {
    if (raw === undefined || raw === null || raw === '') return null;
    let value = String(Array.isArray(raw) ? raw[0] : raw).trim();
    if (target === 'phone') value = value.replace(/^\+/, '');
    if (target === 'email') value = value.toLowerCase();
    return value || null;
  }

  /**
   * Normaliza la regla de match desde el mapeo, soportando el formato legado
   * (matchField: un solo campo => OR de un elemento).
   */
  private resolveMatchRule(mapping: {
    matchRules?: { logic: 'and' | 'or'; fields: string[] };
    matchField?: string | null;
  }): { logic: 'and' | 'or'; fields: string[] } {
    if (mapping.matchRules && Array.isArray(mapping.matchRules.fields)) {
      return {
        logic: mapping.matchRules.logic === 'and' ? 'and' : 'or',
        fields: mapping.matchRules.fields.filter(Boolean),
      };
    }
    if (mapping.matchField) {
      return { logic: 'or', fields: [mapping.matchField] };
    }
    return { logic: 'or', fields: [] };
  }

  /**
   * Busca un contacto por una lista de criterios combinados con AND u OR.
   * Cada criterio compara una columna de ClientRecord o una clave de custom_data.
   */
  private async findByCriteria(
    tenantId: string,
    criteria: Array<{ target: string; value: string }>,
    logic: 'and' | 'or',
  ): Promise<ClientRecord | null> {
    const qb = this.recordRepo
      .createQueryBuilder('r')
      .where('r.tenant_id = :tenantId', { tenantId });

    const conditions: string[] = [];
    const params: Record<string, any> = {};
    criteria.forEach((c, i) => {
      if (CLIENT_RECORD_COLUMNS.has(c.target)) {
        // Nombre físico de la columna (snake_case) para el SQL crudo.
        const col = this.columnName(c.target);
        conditions.push(`r.${col} = :v${i}`);
        params[`v${i}`] = c.value;
      } else {
        conditions.push(`r.custom_data ->> :k${i} = :v${i}`);
        params[`k${i}`] = c.target;
        params[`v${i}`] = c.value;
      }
    });

    if (conditions.length === 0) return null;
    const joiner = logic === 'and' ? ' AND ' : ' OR ';
    qb.andWhere(`(${conditions.join(joiner)})`, params);
    return qb.getOne();
  }

  /** Mapea una propiedad de ClientRecord a su nombre de columna (snake_case). */
  private columnName(prop: string): string {
    const overrides: Record<string, string> = {
      firstName: 'first_name',
      lastName: 'last_name',
      fullName: 'full_name',
      documentType: 'document_type',
      documentNumber: 'document_number',
      jobTitle: 'job_title',
      countryCode: 'country_code',
      whatsappId: 'whatsapp_id',
      channelSource: 'channel_source',
      birthDate: 'birth_date',
      optInWhatsapp: 'opt_in_whatsapp',
      optInEmail: 'opt_in_email',
      avatarUrl: 'avatar_url',
    };
    return overrides[prop] || prop;
  }

  /** Aplica los valores de sistema al record, con normalización ligera. */
  private applySystemValues(record: ClientRecord, values: Record<string, any>): void {
    for (const [key, raw] of Object.entries(values)) {
      let value: any = raw;
      if (key === 'phone') value = String(raw).replace(/^\+/, '');
      if (key === 'email') value = String(raw).toLowerCase();
      if (key === 'birthDate') {
        const d = new Date(raw);
        value = isNaN(d.getTime()) ? null : d;
        if (value === null) continue;
      }
      (record as any)[key] = value;
    }
    // Derivar fullName si vienen nombre/apellidos y no hay fullName explícito.
    if (!values.fullName && (record.firstName || record.lastName)) {
      record.fullName = [record.firstName, record.lastName].filter(Boolean).join(' ') || record.fullName;
    }
  }
}
