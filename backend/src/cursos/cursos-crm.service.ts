import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientRecord } from '../records/record.entity';
import { CustomField } from '../records/custom-field.entity';
import { Course } from './entities/course.entity';

/**
 * Columnas reales de ClientRecord. Los campos cuyo fieldKey no esté aquí se
 * guardan en custom_data (jsonb). Replica el criterio de SurveyCrmService.
 */
const CLIENT_RECORD_COLUMNS = new Set<string>([
  'firstName', 'lastName', 'fullName', 'documentType', 'documentNumber',
  'company', 'jobTitle', 'phone', 'countryCode', 'whatsappId', 'email',
  'website', 'gender', 'birthDate', 'city', 'region', 'address', 'status',
  'channelSource', 'source', 'score', 'language', 'optInWhatsapp', 'optInEmail',
  'avatarUrl', 'notes', 'tags',
]);

const COLUMN_OVERRIDES: Record<string, string> = {
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

/**
 * Convierte los datos que entrega un participante del curso en un contacto del
 * CRM (ClientRecord), creándolo o emparejándolo con uno existente según el
 * mapeo configurado en el curso. Devuelve el recordId resultante para vincular
 * la inscripción.
 */
@Injectable()
export class CursosCrmService {
  private readonly logger = new Logger(CursosCrmService.name);

  constructor(
    @InjectRepository(ClientRecord)
    private readonly recordRepo: Repository<ClientRecord>,
    @InjectRepository(CustomField)
    private readonly customFieldRepo: Repository<CustomField>,
  ) {}

  /**
   * Catálogo de campos del CRM para mapear los datos de inscripción del curso.
   * Separa columnas de sistema (ClientRecord) de campos personalizados
   * (custom_data). El value es siempre el fieldKey.
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
      const entry = { value: f.fieldKey, label: f.fieldLabel, group: f.fieldGroup || 'general' };
      if (CLIENT_RECORD_COLUMNS.has(f.fieldKey)) system.push(entry);
      else custom.push(entry);
    }
    return { system, custom, matchable: ['email', 'phone', 'documentNumber', 'whatsappId'] };
  }

  /**
   * Enriquece los campos de inscripción del portal con el tipo y las opciones
   * del campo del CRM al que apuntan. Si el campo del CRM es de selección, el
   * campo del formulario pasa a `type: 'select'` con sus `options`, para que el
   * portal muestre un desplegable con las opciones disponibles.
   */
  async enrichEnrollmentFields<
    T extends { crmField: string; type?: string; options?: string[] },
  >(tenantId: string, fields: T[] | undefined): Promise<T[]> {
    if (!fields || fields.length === 0) return fields ?? [];
    const defs = await this.customFieldRepo.find({ where: { tenantId } });
    const byKey = new Map(defs.map((d) => [d.fieldKey, d]));
    return fields.map((f) => {
      const def = byKey.get(f.crmField);
      if (!def) return f;
      // Un campo es de selección si así está definido en el CRM o si ya trae
      // opciones. Preferimos siempre las opciones vigentes del CRM.
      const isSelect = def.fieldType === 'select' || (def.options?.length ?? 0) > 0;
      if (isSelect && def.options?.length) {
        return { ...f, type: 'select', options: def.options };
      }
      // Propaga otros tipos útiles (date/number/email) si el formulario no los
      // definió, respetando lo que ya tenga configurado el admin.
      if (!f.type && ['date', 'number', 'email'].includes(def.fieldType)) {
        return { ...f, type: def.fieldType };
      }
      return f;
    });
  }

  /**
   * Atribuye los datos del participante a un contacto del CRM.
   * @returns recordId creado/actualizado, o null si no hay mapeo ni datos.
   */
  async attributeParticipant(
    course: Course,
    participantData: Record<string, any>,
  ): Promise<string | null> {
    const mapping = course.crmMapping;

    // Resolver valores: si hay mapeo explícito, úsalo; si no, intenta campos
    // directos cuyo nombre coincida con una columna/clave del CRM.
    const systemValues: Record<string, any> = {};
    const customValues: Record<string, any> = {};

    const fieldMap = mapping?.fields;
    if (fieldMap && Object.keys(fieldMap).length > 0) {
      for (const [participantField, crmTarget] of Object.entries(fieldMap)) {
        if (!crmTarget) continue;
        const raw = participantData[participantField];
        if (raw === undefined || raw === null || raw === '') continue;
        const value = Array.isArray(raw) ? raw.join(', ') : raw;
        if (CLIENT_RECORD_COLUMNS.has(crmTarget)) systemValues[crmTarget] = value;
        else customValues[crmTarget] = value;
      }
    } else {
      // Sin mapeo: aceptar directamente claves que sean columnas conocidas.
      for (const [key, raw] of Object.entries(participantData)) {
        if (raw === undefined || raw === null || raw === '') continue;
        const value = Array.isArray(raw) ? raw.join(', ') : raw;
        if (CLIENT_RECORD_COLUMNS.has(key)) systemValues[key] = value;
      }
    }

    if (Object.keys(systemValues).length === 0 && Object.keys(customValues).length === 0) {
      return null;
    }

    // Buscar contacto existente por la regla de match (default: email luego phone/documento).
    const rule = this.resolveMatchRule(mapping, fieldMap);
    let record: ClientRecord | null = null;
    if (rule.fields.length > 0) {
      const criteria = rule.fields
        .map((participantField) => {
          const target = fieldMap?.[participantField] ?? participantField;
          const value = this.normalizeMatch(target, participantData[participantField]);
          return target && value ? { target, value } : null;
        })
        .filter((c): c is { target: string; value: string } => c !== null);
      if (criteria.length > 0) {
        record = await this.findByCriteria(course.tenantId, criteria, rule.logic);
      }
    }

    if (!record) {
      record = this.recordRepo.create({
        tenantId: course.tenantId,
        status: 'lead',
        channelSource: 'course',
        source: `course:${course.name}`,
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

  /** Carga un ClientRecord por id (o null). */
  findRecordById(id: string): Promise<ClientRecord | null> {
    return this.recordRepo.findOne({ where: { id } });
  }

  /**
   * Busca un contacto del tenant por email o teléfono (ya verificado por OTP).
   * Devuelve el ClientRecord si existe, o null.
   */
  async findByEmailOrPhone(
    tenantId: string,
    channel: 'email' | 'phone',
    destination: string,
  ): Promise<ClientRecord | null> {
    const target = channel === 'email' ? 'email' : 'phone';
    const value = this.normalizeMatch(target, destination);
    if (!value) return null;
    return this.findByCriteria(tenantId, [{ target, value }], 'or');
  }

  /**
   * Crea (o actualiza) un contacto a partir de los datos del participante y los
   * campos de inscripción configurados. Si ya se resolvió un record existente,
   * se pasa para actualizarlo en vez de crear uno nuevo.
   */
  async upsertFromParticipant(
    course: Course,
    participantData: Record<string, any>,
    existing?: ClientRecord | null,
  ): Promise<string> {
    const systemValues: Record<string, any> = {};
    const customValues: Record<string, any> = {};

    // 1) Mapear según enrollmentFields (crmField -> valor por f.key).
    const fields = course.settings?.enrollmentFields;
    const mappedKeys = new Set<string>();
    if (fields && fields.length > 0) {
      for (const f of fields) {
        mappedKeys.add(f.key);
        const raw = participantData[f.key];
        if (raw === undefined || raw === null || raw === '') continue;
        const value = Array.isArray(raw) ? raw.join(', ') : raw;
        if (CLIENT_RECORD_COLUMNS.has(f.crmField)) systemValues[f.crmField] = value;
        else customValues[f.crmField] = value;
      }
    }

    // 2) SIEMPRE aceptar claves directas que coincidan con una columna conocida
    //    (email/phone verificados, documentNumber, etc.) aunque no estén en
    //    enrollmentFields. Así el dato verificado se persiste siempre.
    for (const [key, raw] of Object.entries(participantData)) {
      if (mappedKeys.has(key)) continue; // ya mapeado arriba
      if (raw === undefined || raw === null || raw === '') continue;
      const value = Array.isArray(raw) ? raw.join(', ') : raw;
      if (CLIENT_RECORD_COLUMNS.has(key)) systemValues[key] = value;
    }

    let record =
      existing ??
      this.recordRepo.create({
        tenantId: course.tenantId,
        status: 'lead',
        channelSource: 'course',
        source: `course:${course.name}`,
        lastContactAt: new Date(),
      } as Partial<ClientRecord>);

    this.applySystemValues(record, systemValues);
    if (Object.keys(customValues).length > 0) {
      record.customData = { ...(record.customData || {}), ...customValues };
    }
    record.lastContactAt = new Date();

    const saved = await this.recordRepo.save(record);
    return saved.id;
  }

  private resolveMatchRule(
    mapping: Course['crmMapping'],
    fieldMap?: Record<string, string>,
  ): { logic: 'and' | 'or'; fields: string[] } {
    if (mapping?.matchRules && Array.isArray(mapping.matchRules.fields) && mapping.matchRules.fields.length > 0) {
      return {
        logic: mapping.matchRules.logic === 'and' ? 'and' : 'or',
        fields: mapping.matchRules.fields.filter(Boolean),
      };
    }
    // Default inteligente: emparejar por los campos matcheables presentes.
    const matchable = ['email', 'phone', 'documentNumber', 'whatsappId'];
    const source = fieldMap
      ? Object.entries(fieldMap)
          .filter(([, target]) => matchable.includes(target))
          .map(([participantField]) => participantField)
      : matchable;
    return { logic: 'or', fields: source };
  }

  private normalizeMatch(target: string | undefined, raw: any): string | null {
    if (raw === undefined || raw === null || raw === '') return null;
    let value = String(Array.isArray(raw) ? raw[0] : raw).trim();
    // Teléfono: solo dígitos (consistente con el OTP del portal y la persistencia).
    if (target === 'phone') value = value.replace(/[^\d]/g, '');
    if (target === 'email') value = value.toLowerCase();
    return value || null;
  }

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
        const col = COLUMN_OVERRIDES[c.target] || c.target;
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

  private applySystemValues(record: ClientRecord, values: Record<string, any>): void {
    for (const [key, raw] of Object.entries(values)) {
      let value: any = raw;
      if (key === 'phone') value = String(raw).replace(/[^\d]/g, '');
      if (key === 'email') value = String(raw).toLowerCase();
      if (key === 'birthDate') {
        const d = new Date(raw);
        if (isNaN(d.getTime())) continue;
        value = d;
      }
      (record as any)[key] = value;
    }
    if (!values.fullName && (record.firstName || record.lastName)) {
      record.fullName =
        [record.firstName, record.lastName].filter(Boolean).join(' ') || record.fullName;
    }
  }
}
