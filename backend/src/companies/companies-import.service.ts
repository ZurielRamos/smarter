import { BadRequestException, ConflictException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { TenantAuditService } from '../audit/tenant-audit.service';
import { EtlService } from '../etl/etl.service';
import { FileStoreService } from '../etl/file-store.service';
import { TransformProcessor } from '../etl/processors/transform.processor';
import { ImportJob, ImportJobStatus } from '../etl/entities/import-job.entity';
import { ImportError, ImportErrorPhase } from '../etl/entities/import-error.entity';
import { Actor } from '../reclutamiento/validation';
import { Organization } from './entities/organization.entity';
import { OrganizationInput } from './organization-input';
import {
  COMPANY_FIELD_KEYS,
  COMPANY_MATCH_FIELDS,
  COMPANY_TARGET_FIELDS,
  CompanyMatchField,
  validateCompanyRecord,
} from './company-import-fields';

/** Hasta este número de filas la importación corre en la misma petición; por encima, en segundo plano. */
export const SYNC_IMPORT_LIMIT = 5000;
const CHUNK_SIZE = 5000;
const MAX_STORED_ERRORS = 1000;
const MAX_MAPPING_SOURCES = 10;

export const COMPANY_DEDUPE_STRATEGIES = ['keep_existing', 'overwrite', 'merge_non_empty', 'append_tags', 'overwrite_selected'] as const;
export type CompanyDedupeStrategy = (typeof COMPANY_DEDUPE_STRATEGIES)[number];

export interface CompanyImportConfig {
  fileId: string;
  mapping: Record<string, string[]>;
  transforms?: Record<string, any>;
  matchFields: CompanyMatchField[];
  strategy: CompanyDedupeStrategy;
  overwriteFields: string[];
  headers?: string[];
  templateName?: string;
}

interface ValidRow {
  rowNumber: number;
  input: OrganizationInput;
  parentRef: string | null;
}

interface PendingError {
  rowNumber: number;
  field: string | null;
  message: string;
  originalValue: string | null;
  phase: ImportErrorPhase;
}

const norm = (v: string) => v.trim().toLowerCase();
const digits = (v: string) => v.replace(/\D/g, '');
const isEmpty = (v: unknown) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);

/** Campo de importación → clave de la empresa que se actualiza. */
const FIELD_TO_KEY: Record<string, string> = { phone1: 'phones', phone2: 'phones' };

/**
 * Importación de empresas desde archivo (CSV o Excel). Reutiliza del ETL la
 * lectura del archivo, el mapeo, las plantillas y los trabajos con progreso, y
 * aplica a cada fila las mismas reglas que el formulario de empresa.
 *
 * Toda consulta lleva `tenantId`.
 */
@Injectable()
export class CompaniesImportService implements OnModuleInit {
  private readonly logger = new Logger(CompaniesImportService.name);

  constructor(
    @InjectRepository(ImportJob) private readonly jobs: Repository<ImportJob>,
    @InjectRepository(ImportError) private readonly errors: Repository<ImportError>,
    @InjectRepository(Organization) private readonly orgs: Repository<Organization>,
    private readonly dataSource: DataSource,
    private readonly audit: TenantAuditService,
    private readonly fileStore: FileStoreService,
    private readonly transform: TransformProcessor,
    private readonly etl: EtlService,
  ) {}

  onModuleInit() {
    this.etl.registerEntityHandler('companies', { execute: (jobId, fileId) => this.run(jobId, fileId) });
  }

  getTargetFields() {
    return COMPANY_TARGET_FIELDS;
  }

  // ───────────────────────────── Entrada ─────────────────────────────

  /** Valida y limpia lo que envía el cliente: nada llega al pipeline sin pasar por aquí. */
  parseConfig(body: unknown): CompanyImportConfig {
    if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Solicitud inválida');
    const b = body as Record<string, unknown>;
    if (typeof b.fileId !== 'string' || !b.fileId || b.fileId.length > 100) throw new BadRequestException('Archivo inválido');

    if (b.mapping === null || typeof b.mapping !== 'object' || Array.isArray(b.mapping)) {
      throw new BadRequestException('Mapeo inválido');
    }
    const mapping: Record<string, string[]> = {};
    for (const [field, sources] of Object.entries(b.mapping as Record<string, unknown>)) {
      if (!COMPANY_FIELD_KEYS.has(field)) throw new BadRequestException(`Campo desconocido: ${field}`);
      if (!Array.isArray(sources) || sources.length > MAX_MAPPING_SOURCES || sources.some((s) => typeof s !== 'string' || s.length > 300)) {
        throw new BadRequestException(`Mapeo inválido para "${field}"`);
      }
      if (sources.length) mapping[field] = sources as string[];
    }
    if (!mapping.name?.length) throw new BadRequestException('Debes mapear el nombre de la empresa.');

    let transforms: Record<string, any> | undefined;
    if (b.transforms !== undefined && b.transforms !== null) {
      if (typeof b.transforms !== 'object' || Array.isArray(b.transforms)) throw new BadRequestException('Transformaciones inválidas');
      if (JSON.stringify(b.transforms).length > 20_000) throw new BadRequestException('Transformaciones demasiado grandes');
      transforms = b.transforms as Record<string, any>;
    }

    const matchRaw = b.matchFields ?? [];
    if (!Array.isArray(matchRaw) || matchRaw.some((m) => !(COMPANY_MATCH_FIELDS as readonly string[]).includes(m as string))) {
      throw new BadRequestException('Campo de duplicados inválido');
    }
    const matchFields = [...new Set(matchRaw as CompanyMatchField[])];
    for (const m of matchFields) {
      if (!mapping[m]?.length) throw new BadRequestException(`Mapea el campo "${m}" para usarlo en la detección de duplicados.`);
    }

    const strategy = (b.deduplicateStrategy ?? 'merge_non_empty') as string;
    if (!(COMPANY_DEDUPE_STRATEGIES as readonly string[]).includes(strategy)) throw new BadRequestException('Estrategia inválida');

    const overwriteRaw = b.overwriteFields ?? [];
    if (!Array.isArray(overwriteRaw) || overwriteRaw.some((f) => !COMPANY_FIELD_KEYS.has(f as string))) {
      throw new BadRequestException('Campos a sobrescribir inválidos');
    }
    if (matchFields.length && strategy === 'overwrite_selected' && overwriteRaw.length === 0) {
      throw new BadRequestException('Elige al menos un campo para sobrescribir.');
    }

    let headers: string[] | undefined;
    if (b.headers !== undefined && b.headers !== null) {
      if (!Array.isArray(b.headers) || b.headers.length > 500 || b.headers.some((h) => typeof h !== 'string' || h.length > 300)) {
        throw new BadRequestException('Cabeceras inválidas');
      }
      headers = b.headers as string[];
    }
    const templateName = typeof b.templateName === 'string' ? b.templateName.slice(0, 100) : undefined;

    return {
      fileId: b.fileId,
      mapping,
      transforms,
      matchFields,
      strategy: strategy as CompanyDedupeStrategy,
      overwriteFields: overwriteRaw as string[],
      headers,
      templateName,
    };
  }

  // ───────────────────────────── Vistas previas ─────────────────────────────

  validatePreview(config: CompanyImportConfig) {
    const meta = this.requireFile(config.fileId);
    const sample = this.fileStore.readSlice(config.fileId, 0, 100);
    const records = this.transform.transformBatch(sample, config.mapping, config.transforms, COMPANY_TARGET_FIELDS);

    const errors: {
      rowNumber: number;
      field: string;
      message: string;
      originalValue: string | null;
      suggestedValue: string | null;
      severity: 'error';
    }[] = [];
    let valid = 0;
    let invalid = 0;
    const docs = new Map<string, number>();
    records.forEach((rec, i) => {
      const rowNumber = i + 1;
      const result = validateCompanyRecord(rec);
      const rowErrors = result.errors.map((e) => ({ rowNumber, ...e, suggestedValue: null, severity: 'error' as const }));
      const doc = result.input?.documentNumber;
      if (doc && docs.has(doc)) {
        rowErrors.push({ rowNumber, field: 'documentNumber', message: `Documento repetido en el archivo (fila ${docs.get(doc)})`, originalValue: doc, suggestedValue: null, severity: 'error' });
      } else if (doc && rowErrors.length === 0) {
        docs.set(doc, rowNumber);
      }
      if (rowErrors.length) {
        invalid++;
        errors.push(...rowErrors);
      } else {
        valid++;
      }
    });

    return {
      totalRows: meta.totalRows,
      sampleSize: sample.length,
      totalProcessed: sample.length,
      valid,
      invalid,
      // Igual que la importación de contactos: la lista de advertencias (hoy vacía).
      warnings: [] as unknown[],
      errors: errors.slice(0, 50),
      validationRules: [],
    };
  }

  async deduplicatePreview(tenantId: string, config: CompanyImportConfig) {
    const meta = this.requireFile(config.fileId);
    const total = meta.totalRows;
    const sampleSize = Math.min(200, total);
    let sample: Record<string, string>[];
    if (total <= 200) {
      sample = this.fileStore.readSlice(config.fileId, 0, total);
    } else {
      // Muestra del inicio, el medio y el final, como en contactos.
      const head = this.fileStore.readSlice(config.fileId, 0, Math.ceil(sampleSize * 0.4));
      const mid = this.fileStore.readSlice(config.fileId, Math.floor(total / 2) - Math.ceil(sampleSize * 0.2), Math.ceil(sampleSize * 0.3));
      const tail = this.fileStore.readSlice(config.fileId, total - Math.ceil(sampleSize * 0.3), Math.ceil(sampleSize * 0.3));
      sample = [...head, ...mid, ...tail];
    }
    const records = this.transform.transformBatch(sample, config.mapping, config.transforms, COMPANY_TARGET_FIELDS);
    const rows: ValidRow[] = [];
    records.forEach((rec, i) => {
      const r = validateCompanyRecord(rec);
      if (r.input) rows.push({ rowNumber: i + 1, input: r.input, parentRef: r.parentRef });
    });

    const matches = await this.findMatches(tenantId, rows, config.matchFields);
    const ids = [...new Set([...matches.values()].map((m) => m.orgId))];
    const existing = ids.length ? await this.orgs.find({ where: { tenantId, id: In(ids) } }) : [];
    const byId = new Map(existing.map((o) => [o.id, o]));

    const duplicates = matches.size;
    const rate = rows.length > 0 ? duplicates / rows.length : 0;
    const estimated = total <= 200 ? duplicates : Math.round(rate * total);
    const brief = (i: OrganizationInput | Organization) => ({
      name: i.name ?? null,
      documentNumber: i.documentNumber ?? null,
      city: i.city ?? null,
      phone: i.phones?.[0]?.number ?? null,
      email: i.email ?? null,
    });

    return {
      totalSample: sample.length,
      totalRows: total,
      total: rows.length,
      new: total <= 200 ? rows.length - duplicates : total - estimated,
      duplicatesCount: estimated,
      isEstimate: total > 200,
      sampleDupRate: Math.round(rate * 100),
      duplicates: [...matches.entries()].slice(0, 5).map(([rowNumber, m]) => ({
        rowNumber,
        matchedOn: m.matchedOn,
        confidence: 1,
        incoming: brief(rows.find((r) => r.rowNumber === rowNumber)!.input),
        existing: { id: m.orgId, ...brief(byId.get(m.orgId)!) },
      })),
    };
  }

  // ───────────────────────────── Ejecución ─────────────────────────────

  /** Crea el trabajo y lo ejecuta ya (archivos pequeños) o lo deja en cola. */
  async start(tenantId: string, actor: Actor, config: CompanyImportConfig): Promise<ImportJob> {
    const meta = this.requireFile(config.fileId);
    if (config.templateName && config.headers) {
      await this.etl.saveTemplate(config.templateName, config.mapping, tenantId, config.headers, config.transforms, 'companies');
    }
    const job = await this.jobs.save(
      this.jobs.create({
        tenantId,
        entity: 'companies',
        status: 'pending',
        fileName: meta.fileName,
        fileSize: meta.fileSize,
        fileType: meta.fileType,
        fileId: config.fileId,
        mapping: config.mapping,
        transforms: config.transforms ?? null,
        deduplicateConfig: config.matchFields.length
          ? { matchFields: config.matchFields, strategy: config.strategy, overwriteFields: config.overwriteFields }
          : null,
        totalRows: meta.totalRows,
        createdBy: actor.id,
      }),
    );
    if (meta.totalRows <= SYNC_IMPORT_LIMIT) {
      await this.run(job.id, config.fileId);
      return this.jobs.findOneByOrFail({ id: job.id });
    }
    await this.etl.enqueueImport(job.id, config.fileId);
    return job;
  }

  async run(jobId: string, fileId: string): Promise<void> {
    const job = await this.jobs.findOneBy({ id: jobId });
    if (!job) return;

    // BullMQ puede entregar dos veces un trabajo detenido. Solo se ejecuta uno pendiente.
    const done: ImportJobStatus[] = ['completed', 'completed_with_errors', 'failed', 'cancelled'];
    const running: ImportJobStatus[] = ['transforming', 'validating', 'deduplicating', 'loading'];
    if (done.includes(job.status) || running.includes(job.status)) {
      this.logger.warn(`Importación ${jobId} en estado '${job.status}': se omite la re-ejecución`);
      return;
    }
    if (!this.fileStore.exists(fileId)) {
      await this.fail(job, 'Archivo expiró antes de procesarse. Reintente la importación.');
      return;
    }

    const started = Date.now();
    job.startedAt = new Date();
    try {
      await this.pipeline(job, fileId);
    } catch (e: any) {
      this.logger.error(`Importación ${jobId} falló: ${e?.message}`, e?.stack);
      await this.fail(job, e instanceof ConflictException ? e.message : 'Error durante el procesamiento de la importación');
      return;
    } finally {
      this.fileStore.delete(fileId);
    }
    job.completedAt = new Date();
    job.durationMs = Date.now() - started;
    job.progress = 100;
    job.currentPhase = null;
    await this.jobs.save(job);
  }

  private async pipeline(job: ImportJob, fileId: string): Promise<void> {
    const tenantId = job.tenantId;
    const mapping = job.mapping ?? {};
    const cfg = job.deduplicateConfig;
    const pending: PendingError[] = [];
    const setPhase = async (status: ImportJobStatus, progress: number) => {
      job.status = status;
      job.currentPhase = status;
      job.progress = progress;
      await this.jobs.save(job);
    };

    // 1. Transformar y validar (por tandas).
    await setPhase('validating', 5);
    const valid: ValidRow[] = [];
    const invalidNames = new Set<string>();
    const docSeen = new Map<string, number>();
    let invalid = 0;
    const totalChunks = Math.max(1, Math.ceil(job.totalRows / CHUNK_SIZE));
    await this.fileStore.processChunked(fileId, CHUNK_SIZE, async (chunk, idx) => {
      const records = this.transform.transformBatch(chunk, mapping, job.transforms ?? undefined, COMPANY_TARGET_FIELDS);
      records.forEach((rec, i) => {
        const rowNumber = idx * CHUNK_SIZE + i + 1;
        const r = validateCompanyRecord(rec);
        const errs: PendingError[] = r.errors.map((e) => ({ rowNumber, field: e.field || null, message: e.message, originalValue: e.originalValue, phase: 'validation' }));
        const doc = r.input?.documentNumber;
        if (doc && docSeen.has(doc)) {
          errs.push({ rowNumber, field: 'documentNumber', message: `Documento repetido en el archivo (fila ${docSeen.get(doc)})`, originalValue: doc, phase: 'validation' });
        }
        if (errs.length) {
          invalid++;
          pending.push(...errs);
          if (typeof rec.name === 'string') invalidNames.add(norm(rec.name));
          return;
        }
        if (doc) docSeen.set(doc, rowNumber);
        valid.push({ rowNumber, input: r.input!, parentRef: r.parentRef });
      });
      job.progress = Math.round(5 + ((idx + 1) / totalChunks) * 35);
      await this.jobs.save(job);
    });
    job.validRows = valid.length;

    // 2. Duplicados contra las empresas que ya existen.
    await setPhase('deduplicating', 45);
    const matches = cfg?.matchFields?.length
      ? await this.findMatches(tenantId, valid, cfg.matchFields as CompanyMatchField[])
      : new Map<number, Match>();
    job.duplicateRows = matches.size;
    let toCreate = valid.filter((r) => !matches.has(r.rowNumber));
    const toUpdate = valid.filter((r) => matches.has(r.rowNumber));

    // Un documento que ya existe y no se eligió como criterio de duplicado es un error de esa fila.
    const taken = await this.takenDocuments(tenantId, toCreate.map((r) => r.input.documentNumber).filter((d): d is string => !!d));
    toCreate = toCreate.filter((r) => {
      const owner = r.input.documentNumber ? taken.get(r.input.documentNumber) : undefined;
      if (!owner) return true;
      invalid++;
      invalidNames.add(norm(r.input.name!));
      pending.push({ rowNumber: r.rowNumber, field: 'documentNumber', message: `Ya existe una empresa con ese documento: ${owner}`, originalValue: r.input.documentNumber!, phase: 'deduplicate' });
      return false;
    });

    // 3. Matriz de cada sucursal: nombre o documento, dentro del archivo o ya existente.
    const parentOf = new Map<number, string>();
    const dbRoots: { id: string; name: string; documentNumber: string | null }[] = await this.dataSource.query(
      `SELECT id, name, document_number AS "documentNumber" FROM organizations
        WHERE tenant_id = $1 AND deleted_at IS NULL AND parent_id IS NULL`,
      [tenantId],
    );
    const dbRootIds = new Set(dbRoots.map((c) => c.id));
    const fileRoots = [...toCreate, ...toUpdate]
      // Una fila que coincide con una sucursal existente no puede ser matriz de otras.
      .filter((r) => !r.parentRef && (!matches.has(r.rowNumber) || dbRootIds.has(matches.get(r.rowNumber)!.orgId)))
      .map((r) => ({ key: matches.get(r.rowNumber)?.orgId ?? `row:${r.rowNumber}`, name: r.input.name!, doc: r.input.documentNumber ?? null }));
    const matchesRef = (ref: string, name: string, doc: string | null) =>
      norm(ref) === norm(name) || (!!doc && ref.trim().toUpperCase() === doc.toUpperCase());
    toCreate = toCreate.filter((r) => {
      if (!r.parentRef) return true;
      const keys = new Set<string>();
      for (const c of dbRoots) if (matchesRef(r.parentRef, c.name, c.documentNumber)) keys.add(c.id);
      for (const c of fileRoots) if (matchesRef(r.parentRef, c.name, c.doc)) keys.add(c.key);
      let message: string | null = null;
      if (keys.size === 0) {
        message = invalidNames.has(norm(r.parentRef)) ? `La matriz "${r.parentRef}" tiene errores en el archivo` : `No se encontró la matriz "${r.parentRef}"`;
      } else if (keys.size > 1) {
        message = `La matriz "${r.parentRef}" es ambigua (hay ${keys.size} con ese nombre o documento)`;
      }
      if (message) {
        invalid++;
        pending.push({ rowNumber: r.rowNumber, field: 'parent', message, originalValue: r.parentRef, phase: 'deduplicate' });
        return false;
      }
      parentOf.set(r.rowNumber, [...keys][0]);
      return true;
    });
    job.errorRows = invalid;

    // 4. Cargar: primero las cadenas, luego las sucursales. Todo o nada.
    await setPhase('loading', 65);
    const created = await this.createAll(tenantId, toCreate, parentOf);
    job.createdRecords = created;
    job.progress = 85;
    await this.jobs.save(job);

    // 5. Actualizar las que ya existían, según la estrategia elegida.
    let updated = 0;
    let skipped = 0;
    if (toUpdate.length && cfg) {
      const orgs = await this.orgs.find({ where: { tenantId, id: In([...new Set(toUpdate.map((r) => matches.get(r.rowNumber)!.orgId))]) } });
      const byId = new Map(orgs.map((o) => [o.id, o]));
      for (const r of toUpdate) {
        const org = byId.get(matches.get(r.rowNumber)!.orgId);
        if (!org) {
          skipped++;
          continue;
        }
        const changed = applyUpdate(org, r.input, cfg.strategy, cfg.overwriteFields ?? []);
        if (changed.length === 0) {
          skipped++;
          continue;
        }
        try {
          if (changed.includes('documentNumber') && org.documentNumber) {
            const owner = (await this.takenDocuments(tenantId, [org.documentNumber])).get(org.documentNumber);
            if (owner && owner !== org.name) throw new Error(`Ya existe una empresa con ese documento: ${owner}`);
          }
          await this.orgs.save(org);
          updated++;
        } catch (e: any) {
          invalid++;
          pending.push({ rowNumber: r.rowNumber, field: null, message: e?.message?.startsWith('Ya existe') ? e.message : 'No se pudo actualizar la empresa', originalValue: null, phase: 'load' });
        }
      }
    }
    job.updatedRecords = updated;
    job.skippedRecords = skipped;
    job.errorRows = invalid;

    await this.saveErrors(job.id, pending);
    await this.audit.log({
      tenantId,
      actorType: 'user',
      actorId: job.createdBy,
      action: 'companies.organization.import-file',
      targetType: 'organization',
      metadata: { jobId: job.id, created, updated, skipped, rejected: invalid },
    });
    job.status = invalid > 0 ? 'completed_with_errors' : 'completed';
  }

  private async createAll(tenantId: string, rows: ValidRow[], parentOf: Map<number, string>): Promise<number> {
    if (rows.length === 0) return 0;
    try {
      return await this.dataSource.transaction(async (em) => {
        const repo = em.getRepository(Organization);
        const make = (r: ValidRow, parentId: string | null) =>
          repo.create({ ...fieldsFor(r.input), tenantId, parentId });
        const roots = rows.filter((r) => !parentOf.has(r.rowNumber));
        const branches = rows.filter((r) => parentOf.has(r.rowNumber));
        const idByRow = new Map<number, string>();
        const savedRoots = await repo.save(roots.map((r) => make(r, null)), { chunk: 500 });
        roots.forEach((r, i) => idByRow.set(r.rowNumber, savedRoots[i].id));
        await repo.save(
          branches.map((r) => {
            const key = parentOf.get(r.rowNumber)!;
            return make(r, key.startsWith('row:') ? idByRow.get(Number(key.slice(4)))! : key);
          }),
          { chunk: 500 },
        );
        return rows.length;
      });
    } catch (e) {
      if ((e as { code?: string })?.code === '23505') {
        throw new ConflictException('Un documento del archivo se registró mientras se importaba. No se creó ninguna empresa nueva; vuelve a intentarlo.');
      }
      throw e;
    }
  }

  // ───────────────────────────── Duplicados ─────────────────────────────

  /**
   * Empresa existente que corresponde a cada fila, según los criterios elegidos
   * (el primero que coincide gana). Nombre: mismo nombre y, si ambas tienen
   * ciudad, la misma ciudad, para no confundir sucursales de ciudades distintas.
   */
  private async findMatches(tenantId: string, rows: ValidRow[], fields: CompanyMatchField[]): Promise<Map<number, Match>> {
    const out = new Map<number, Match>();
    const open = () => rows.filter((r) => !out.has(r.rowNumber));
    for (const field of fields) {
      const todo = open();
      if (todo.length === 0) break;
      if (field === 'documentNumber') {
        const docs = [...new Set(todo.map((r) => r.input.documentNumber).filter((d): d is string => !!d))];
        if (!docs.length) continue;
        const found: { id: string; doc: string }[] = await this.dataSource.query(
          `SELECT id, document_number AS doc FROM organizations WHERE tenant_id = $1 AND deleted_at IS NULL AND document_number = ANY($2)`,
          [tenantId, docs],
        );
        const byDoc = new Map(found.map((f) => [f.doc, f.id]));
        for (const r of todo) {
          const id = r.input.documentNumber ? byDoc.get(r.input.documentNumber) : undefined;
          if (id) out.set(r.rowNumber, { orgId: id, matchedOn: [field] });
        }
      } else if (field === 'email') {
        const emails = [...new Set(todo.map((r) => r.input.email).filter((e): e is string => !!e))];
        if (!emails.length) continue;
        const found: { id: string; email: string }[] = await this.dataSource.query(
          `SELECT DISTINCT ON (lower(email)) id, lower(email) AS email FROM organizations
            WHERE tenant_id = $1 AND deleted_at IS NULL AND lower(email) = ANY($2) ORDER BY lower(email), created_at ASC`,
          [tenantId, emails],
        );
        const byEmail = new Map(found.map((f) => [f.email, f.id]));
        for (const r of todo) {
          const id = r.input.email ? byEmail.get(r.input.email.toLowerCase()) : undefined;
          if (id) out.set(r.rowNumber, { orgId: id, matchedOn: [field] });
        }
      } else if (field === 'name') {
        const names = [...new Set(todo.map((r) => norm(r.input.name!)))];
        const found: { id: string; name: string; city: string | null }[] = await this.dataSource.query(
          `SELECT id, lower(btrim(name)) AS name, lower(btrim(city)) AS city FROM organizations
            WHERE tenant_id = $1 AND deleted_at IS NULL AND lower(btrim(name)) = ANY($2) ORDER BY created_at ASC`,
          [tenantId, names],
        );
        for (const r of todo) {
          const city = r.input.city ? norm(r.input.city) : null;
          const hit = found.find((f) => f.name === norm(r.input.name!) && (!city || !f.city || f.city === city));
          if (hit) out.set(r.rowNumber, { orgId: hit.id, matchedOn: [field] });
        }
      } else if (field === 'phone1') {
        const wanted = [...new Set(todo.flatMap((r) => (r.input.phones ?? []).map((p) => digits(p.number))))].filter((d) => d.length >= 6);
        if (!wanted.length) continue;
        const found: { id: string; digits: string }[] = await this.dataSource.query(
          `SELECT o.id, regexp_replace(p->>'number', '\\D', '', 'g') AS digits
             FROM organizations o,
                jsonb_array_elements(CASE WHEN jsonb_typeof(o.phones) = 'array' THEN o.phones ELSE '[]'::jsonb END) p
            WHERE o.tenant_id = $1 AND o.deleted_at IS NULL
              AND regexp_replace(p->>'number', '\\D', '', 'g') = ANY($2)
            ORDER BY o.created_at ASC`,
          [tenantId, wanted],
        );
        const byPhone = new Map<string, string>();
        for (const f of found) if (!byPhone.has(f.digits)) byPhone.set(f.digits, f.id);
        for (const r of todo) {
          const id = (r.input.phones ?? []).map((p) => byPhone.get(digits(p.number))).find(Boolean);
          if (id) out.set(r.rowNumber, { orgId: id, matchedOn: [field] });
        }
      }
    }
    return out;
  }

  /** Documento → nombre de la empresa que ya lo tiene. */
  private async takenDocuments(tenantId: string, docs: string[]): Promise<Map<string, string>> {
    if (!docs.length) return new Map();
    const rows: { doc: string; name: string }[] = await this.dataSource.query(
      `SELECT document_number AS doc, name FROM organizations WHERE tenant_id = $1 AND deleted_at IS NULL AND document_number = ANY($2)`,
      [tenantId, [...new Set(docs)]],
    );
    return new Map(rows.map((r) => [r.doc, r.name]));
  }

  // ───────────────────────────── Auxiliares ─────────────────────────────

  private requireFile(fileId: string) {
    const meta = this.fileStore.getMeta(fileId);
    if (!meta) throw new BadRequestException('Archivo no encontrado. Puede haber expirado.');
    return meta;
  }

  private async saveErrors(jobId: string, list: PendingError[]) {
    const kept = list.sort((a, b) => a.rowNumber - b.rowNumber).slice(0, MAX_STORED_ERRORS);
    for (let i = 0; i < kept.length; i += 200) {
      await this.errors.save(
        kept.slice(i, i + 200).map((e) =>
          this.errors.create({ jobId, rowNumber: e.rowNumber, field: e.field, severity: 'error', phase: e.phase, message: e.message, originalValue: e.originalValue, suggestedValue: null }),
        ),
      );
    }
  }

  private async fail(job: ImportJob, message: string) {
    job.status = 'failed';
    job.errorMessage = message;
    job.completedAt = new Date();
    job.currentPhase = null;
    if (job.startedAt) job.durationMs = Date.now() - job.startedAt.getTime();
    await this.jobs.save(job);
  }
}

interface Match {
  orgId: string;
  matchedOn: string[];
}

/** Columnas de la empresa que salen de una fila validada. */
function fieldsFor(input: OrganizationInput) {
  return {
    name: input.name!,
    type: input.type ?? 'establishment',
    status: input.status ?? 'active',
    legalName: input.legalName ?? null,
    industry: input.industry ?? null,
    size: input.size ?? null,
    employeeRange: input.employeeRange ?? null,
    documentType: input.documentType ?? null,
    documentNumber: input.documentNumber ?? null,
    phones: input.phones ?? null,
    email: input.email ?? null,
    website: input.website ?? null,
    address: input.address ?? null,
    postalCode: input.postalCode ?? null,
    city: input.city ?? null,
    region: input.region ?? null,
    countryCode: input.countryCode ?? null,
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    openingHours: input.openingHours ?? null,
    tags: input.tags ?? null,
    notes: input.notes ?? null,
    customData: input.customData ?? null,
  };
}

/**
 * Aplica una fila a una empresa existente según la estrategia y devuelve las
 * claves que cambiaron. Nunca borra datos: un valor vacío del archivo no pisa
 * uno existente. La matriz solo se asigna al crear.
 */
export function applyUpdate(
  org: Organization,
  input: OrganizationInput,
  strategy: string,
  overwriteFields: string[],
): string[] {
  if (strategy === 'keep_existing') return [];
  const selected = new Set(overwriteFields.map((f) => FIELD_TO_KEY[f] ?? f));
  const changed: string[] = [];
  const target = org as unknown as Record<string, unknown>;

  const set = (key: string, value: unknown) => {
    if (JSON.stringify(target[key] ?? null) === JSON.stringify(value ?? null)) return;
    target[key] = value;
    changed.push(key);
  };

  for (const [key, incoming] of Object.entries(input) as [string, unknown][]) {
    // La matriz solo se asigna al crear; las coordenadas se tratan juntas más abajo.
    if (key === 'parentId' || key === 'lat' || key === 'lng' || isEmpty(incoming)) continue;
    const current = target[key];
    const list = key === 'phones' || key === 'tags';

    if (strategy === 'overwrite' || (strategy === 'overwrite_selected' && selected.has(key))) {
      set(key, incoming);
    } else if (strategy === 'overwrite_selected') {
      continue;
    } else if (list) {
      // Completar vacíos y fusionar etiquetas: se suma lo nuevo, sin repetir ni quitar.
      set(key, key === 'phones' ? mergePhones(current as any, incoming as any) : mergeTags(current as any, incoming as any));
    } else if (isEmpty(current)) {
      set(key, incoming);
    }
  }

  // Latitud y longitud siempre van juntas.
  if (typeof input.lat === 'number' && typeof input.lng === 'number') {
    const overwrite = strategy === 'overwrite' || (strategy === 'overwrite_selected' && (selected.has('lat') || selected.has('lng')));
    const fill = strategy !== 'overwrite_selected' && org.lat == null && org.lng == null;
    if (overwrite || fill) {
      set('lat', input.lat);
      set('lng', input.lng);
    }
  }
  return changed;
}

function mergePhones(current: { number: string; label?: string | null }[] | null, incoming: { number: string; label?: string | null }[]) {
  const out = [...(current ?? [])];
  const seen = new Set(out.map((p) => digits(p.number)));
  for (const p of incoming) {
    if (out.length >= 5) break;
    if (!seen.has(digits(p.number))) {
      out.push(p);
      seen.add(digits(p.number));
    }
  }
  return out;
}

function mergeTags(current: string[] | null, incoming: string[]) {
  const out = [...(current ?? [])];
  for (const t of incoming) {
    if (out.length >= 20) break;
    if (!out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  return out;
}
