import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ImportJob, ImportJobStatus, DeduplicateConfig, ValidationRule } from './entities/import-job.entity';
import { ImportError } from './entities/import-error.entity';
import { MappingTemplate } from '../upload/mapping-template.entity';
import { FileStoreService } from './file-store.service';
import { ParseProcessor } from './processors/parse.processor';
import { TransformProcessor } from './processors/transform.processor';
import { ValidateProcessor } from './processors/validate.processor';
import { DeduplicateProcessor, DuplicateMatch } from './processors/deduplicate.processor';
import { LoadProcessor } from './processors/load.processor';

@Injectable()
export class EtlService {
  constructor(
    @InjectRepository(ImportJob)
    private readonly jobRepo: Repository<ImportJob>,
    @InjectRepository(ImportError)
    private readonly errorRepo: Repository<ImportError>,
    @InjectRepository(MappingTemplate)
    private readonly templateRepo: Repository<MappingTemplate>,
    @InjectQueue('etl')
    private readonly etlQueue: Queue,
    private readonly fileStore: FileStoreService,
    private readonly parseProcessor: ParseProcessor,
    private readonly transformProcessor: TransformProcessor,
    private readonly validateProcessor: ValidateProcessor,
    private readonly deduplicateProcessor: DeduplicateProcessor,
    private readonly loadProcessor: LoadProcessor,
  ) {}

  // ===========================
  // FILE MANAGEMENT
  // ===========================

  parseFile(file: Express.Multer.File): { headers: string[]; preview: Record<string, string>[]; totalRows: number; fileId: string } {
    const result = this.parseProcessor.parseFile(file.buffer, file.originalname);

    // Store to disk, not RAM
    const fileId = this.fileStore.store(result.data, {
      headers: result.headers,
      fileName: file.originalname,
      fileSize: file.size,
      fileType: file.originalname.split('.').pop()?.toLowerCase() || 'csv',
    });

    return {
      headers: result.headers,
      preview: result.data.slice(0, 10),
      totalRows: result.totalRows,
      fileId,
    };
  }

  /** Async parse: saves raw file to disk, creates a job, and queues parsing */
  async parseFileAsync(file: Express.Multer.File, tenantId?: string): Promise<ImportJob> {
    const fileType = file.originalname.split('.').pop()?.toLowerCase() || 'csv';

    // Create job in 'parsing' state
    const job = this.jobRepo.create({
      tenantId: tenantId || '',
      status: 'parsing' as any,
      currentPhase: 'parsing',
      progress: 0,
      fileName: file.originalname,
      fileSize: file.size,
      fileType,
      totalRows: 0,
    });
    const savedJob = await this.jobRepo.save(job);

    // Queue the parse work
    await this.etlQueue.add('parse-file', {
      jobId: savedJob.id,
      buffer: file.buffer.toString('base64'),
      originalname: file.originalname,
      size: file.size,
    }, { attempts: 1, removeOnComplete: true, removeOnFail: false });

    return savedJob;
  }

  /** Called by worker after parsing is done */
  async completeParseJob(jobId: string, fileId: string, headers: string[], totalRows: number, preview: Record<string, string>[]): Promise<void> {
    const job = await this.jobRepo.findOneBy({ id: jobId });
    if (!job) return;

    job.status = 'awaiting_mapping' as any;
    job.currentPhase = null;
    job.progress = 100;
    job.fileId = fileId;
    job.parsedHeaders = headers;
    job.parsedPreview = preview;
    job.totalRows = totalRows;
    await this.jobRepo.save(job);
  }

  /** Get the active (parsing or awaiting_mapping) job for a tenant — only recent (last 6 hours) */
  async getActiveJob(tenantId: string): Promise<ImportJob | null> {
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const job = await this.jobRepo
      .createQueryBuilder('job')
      .where('job.tenant_id = :tenantId', { tenantId })
      .andWhere('job.status IN (:...statuses)', {
        statuses: ['parsing', 'awaiting_mapping', 'pending', 'transforming', 'validating', 'deduplicating', 'loading'],
      })
      .andWhere('job.created_at > :since', { since: sixHoursAgo })
      .orderBy('job.created_at', 'DESC')
      .getOne();

    if (!job) return null;

    // If the job needs its file and the file has expired, auto-cancel it
    if (job.status === 'awaiting_mapping' && job.fileId && !this.fileStore.exists(job.fileId)) {
      job.status = 'cancelled' as any;
      job.errorMessage = 'Archivo expiró. Sube el archivo nuevamente.';
      job.completedAt = new Date();
      job.currentPhase = null;
      await this.jobRepo.save(job);
      return null;
    }

    return job;
  }

  /** Mark a parse job as failed */
  async failParseJob(jobId: string, message: string): Promise<void> {
    const job = await this.jobRepo.findOneBy({ id: jobId });
    if (!job) return;
    job.status = 'failed';
    job.errorMessage = message;
    job.completedAt = new Date();
    job.currentPhase = null;
    await this.jobRepo.save(job);
  }

  getTargetFields() {
    return this.transformProcessor.getTargetFields();
  }

  getFileRowCount(fileId: string): number {
    const meta = this.fileStore.getMeta(fileId);
    return meta?.totalRows || 0;
  }

  // ===========================
  // PREVIEW & VALIDATION
  // ===========================

  validatePreview(
    fileId: string,
    tenantId: string,
    mapping: Record<string, string[]>,
    transforms?: Record<string, any>,
    validationRules?: ValidationRule[],
  ) {
    const meta = this.fileStore.getMeta(fileId);
    if (!meta) throw new BadRequestException('Archivo no encontrado. Puede haber expirado.');

    // Read only first 100 rows for preview
    const sampleRows = this.fileStore.readSlice(fileId, 0, 100);
    const transformed = this.transformProcessor.transformBatch(sampleRows, mapping, transforms);

    const rules = validationRules || this.validateProcessor.generateDefaultRules(Object.keys(mapping));
    const result = this.validateProcessor.validateBatch(transformed, rules);

    return {
      totalRows: meta.totalRows,
      sampleSize: sampleRows.length,
      ...result.summary,
      errors: result.errors.slice(0, 50),
      warnings: result.warnings.slice(0, 50),
      validationRules: rules,
    };
  }

  async deduplicatePreview(
    fileId: string,
    tenantId: string,
    mapping: Record<string, string[]>,
    transforms?: Record<string, any>,
    matchFields?: string[],
    fuzzyMatch?: boolean,
    fuzzyThreshold?: number,
  ) {
    const meta = this.fileStore.getMeta(fileId);
    if (!meta) throw new BadRequestException('Archivo no encontrado. Puede haber expirado.');

    // Smart sampling: analyze up to 200 rows spread across the file
    const totalRows = meta.totalRows;
    const sampleSize = Math.min(200, totalRows);
    let sampleRows: Record<string, string>[];

    if (totalRows <= 200) {
      // Small file: analyze everything
      sampleRows = this.fileStore.readSlice(fileId, 0, totalRows);
    } else {
      // Large file: take rows from beginning, middle, and end for representative sample
      const headCount = Math.ceil(sampleSize * 0.4);
      const midStart = Math.floor(totalRows / 2) - Math.ceil(sampleSize * 0.2);
      const midCount = Math.ceil(sampleSize * 0.3);
      const tailStart = totalRows - Math.ceil(sampleSize * 0.3);
      const tailCount = Math.ceil(sampleSize * 0.3);

      const head = this.fileStore.readSlice(fileId, 0, headCount);
      const mid = this.fileStore.readSlice(fileId, midStart, midCount);
      const tail = this.fileStore.readSlice(fileId, tailStart, tailCount);
      sampleRows = [...head, ...mid, ...tail];
    }

    const transformed = this.transformProcessor.transformBatch(sampleRows, mapping, transforms);

    const config: DeduplicateConfig = {
      matchFields: matchFields || ['phone', 'email'],
      strategy: 'merge_non_empty',
      fuzzyMatch: fuzzyMatch || false,
      fuzzyThreshold: fuzzyThreshold || 0.8,
    };

    const result = await this.deduplicateProcessor.detectDuplicates(transformed, config, tenantId);

    // Extrapolate to full file if we only sampled
    const dupRate = sampleRows.length > 0 ? result.summary.duplicates / sampleRows.length : 0;
    const estimatedTotalDuplicates = totalRows <= 200
      ? result.summary.duplicates
      : Math.round(dupRate * totalRows);
    const estimatedNew = totalRows - estimatedTotalDuplicates;

    return {
      totalSample: sampleRows.length,
      totalRows,
      total: result.summary.total,
      new: totalRows <= 200 ? result.summary.new : estimatedNew,
      duplicatesCount: totalRows <= 200 ? result.summary.duplicates : estimatedTotalDuplicates,
      isEstimate: totalRows > 200,
      sampleDupRate: Math.round(dupRate * 100),
      duplicates: result.duplicates.slice(0, 5).map((d) => ({
        rowNumber: d.rowNumber,
        matchedOn: d.matchedOn,
        confidence: d.confidence,
        incoming: d.incomingRecord,
        existing: {
          id: d.existingRecord.id,
          firstName: d.existingRecord.firstName,
          lastName: d.existingRecord.lastName,
          phone: d.existingRecord.phone,
          email: d.existingRecord.email,
        },
      })),
    };
  }

  // ===========================
  // JOB EXECUTION
  // ===========================

  async createImportJob(params: {
    tenantId: string;
    fileId: string;
    mapping: Record<string, string[]>;
    transforms?: Record<string, any>;
    matchFields?: string[];
    deduplicateStrategy?: string;
    overwriteFields?: string[];
    fuzzyMatch?: boolean;
    fuzzyThreshold?: number;
    validationRules?: ValidationRule[];
    templateName?: string;
    headers?: string[];
    createdBy?: string;
  }): Promise<ImportJob> {
    const meta = this.fileStore.getMeta(params.fileId);
    if (!meta) throw new BadRequestException('Archivo no encontrado. Puede haber expirado.');

    // Save template if applicable
    if (params.templateName && params.headers) {
      await this.saveTemplate(params.templateName, params.mapping, params.tenantId, params.headers, params.transforms);
    }

    const deduplicateConfig: DeduplicateConfig | null = params.matchFields && params.matchFields.length > 0
      ? {
          matchFields: params.matchFields,
          strategy: (params.deduplicateStrategy as any) || 'merge_non_empty',
          overwriteFields: params.overwriteFields,
          fuzzyMatch: params.fuzzyMatch || false,
          fuzzyThreshold: params.fuzzyThreshold || 0.8,
        }
      : null;

    const job = this.jobRepo.create({
      tenantId: params.tenantId,
      status: 'pending' as ImportJobStatus,
      fileName: meta.fileName,
      fileSize: meta.fileSize,
      fileType: meta.fileType,
      mapping: params.mapping,
      transforms: params.transforms || null,
      deduplicateConfig,
      validationRules: params.validationRules || null,
      totalRows: meta.totalRows,
      createdBy: params.createdBy || null,
    });

    const savedJob = await this.jobRepo.save(job);

    await this.etlQueue.add('process-import', {
      jobId: savedJob.id,
      fileId: params.fileId,
    }, { attempts: 1, removeOnComplete: true, removeOnFail: false });

    return savedJob;
  }

  /**
   * Ejecuta el pipeline ETL procesando el archivo en chunks.
   * Nunca carga todo el archivo en RAM de una sola vez.
   */
  async executeJob(jobId: string, fileId: string): Promise<void> {
    const job = await this.jobRepo.findOneBy({ id: jobId });
    if (!job) throw new NotFoundException(`Job ${jobId} not found`);

    if (!this.fileStore.exists(fileId)) {
      await this.failJob(job, 'Archivo expiró antes de procesarse. Reintente la importación.');
      return;
    }

    const startTime = Date.now();
    job.startedAt = new Date();
    job.status = 'transforming';
    job.currentPhase = 'transforming';
    job.progress = 5;
    await this.jobRepo.save(job);

    try {
      const meta = this.fileStore.getMeta(fileId)!;
      const CHUNK_SIZE = 5000;
      const totalChunks = Math.ceil(meta.totalRows / CHUNK_SIZE);

      let allValid: Record<string, unknown>[] = [];
      let totalErrors = 0;
      let totalWarnings = 0;
      const rules = job.validationRules || this.validateProcessor.generateDefaultRules(Object.keys(job.mapping!));

      // === PHASES 1 & 2: Transform + Validate (chunked) ===
      job.status = 'validating';
      job.currentPhase = 'validating';
      await this.jobRepo.save(job);

      const allErrors: any[] = [];

      await this.fileStore.processChunked(fileId, CHUNK_SIZE, async (chunk, chunkIdx) => {
        // Transform
        const transformed = this.transformProcessor.transformBatch(chunk, job.mapping!, job.transforms || undefined);

        // Validate
        const validation = this.validateProcessor.validateBatch(transformed, rules, chunkIdx * CHUNK_SIZE);
        allValid.push(...validation.validRecords);
        totalErrors += validation.summary.invalid;
        totalWarnings += validation.summary.warnings;

        // Collect errors (capped)
        if (allErrors.length < 500) {
          allErrors.push(...validation.errors.slice(0, 500 - allErrors.length));
        }

        // Update progress
        const progress = Math.round(5 + ((chunkIdx + 1) / totalChunks) * 40);
        job.progress = progress;
        await this.jobRepo.save(job);
      });

      job.validRows = allValid.length;
      job.errorRows = totalErrors;

      // Save validation errors
      if (allErrors.length > 0) {
        const errorEntities = allErrors.map((err) =>
          this.errorRepo.create({
            jobId: job.id,
            rowNumber: err.rowNumber,
            field: err.field,
            severity: err.severity,
            phase: 'validation',
            message: err.message,
            originalValue: err.originalValue,
            suggestedValue: err.suggestedValue,
          }),
        );
        // Save in batches of 200
        for (let i = 0; i < errorEntities.length; i += 200) {
          await this.errorRepo.save(errorEntities.slice(i, i + 200));
        }
      }

      // === PHASE 3: Deduplicate ===
      job.status = 'deduplicating';
      job.currentPhase = 'deduplicating';
      job.progress = 50;
      await this.jobRepo.save(job);

      let recordsToLoad = allValid;
      let duplicatesToResolve: DuplicateMatch[] = [];

      if (job.deduplicateConfig && job.deduplicateConfig.matchFields.length > 0) {
        const dedup = await this.deduplicateProcessor.detectDuplicates(
          recordsToLoad,
          job.deduplicateConfig,
          job.tenantId,
        );
        recordsToLoad = dedup.newRecords;
        duplicatesToResolve = dedup.duplicates;
        job.duplicateRows = dedup.summary.duplicates;
        job.progress = 65;
        await this.jobRepo.save(job);
      }

      // === PHASE 4: Load ===
      job.status = 'loading';
      job.currentPhase = 'loading';
      job.progress = 70;
      await this.jobRepo.save(job);

      // Load new records
      const loadResult = await this.loadProcessor.loadNewRecords(recordsToLoad, job.tenantId);
      job.createdRecords = loadResult.created;
      job.progress = 85;
      await this.jobRepo.save(job);

      // Resolve duplicates
      if (duplicatesToResolve.length > 0 && job.deduplicateConfig) {
        const dupResult = await this.loadProcessor.loadDuplicateUpdates(
          duplicatesToResolve,
          job.deduplicateConfig.strategy,
          job.deduplicateConfig.overwriteFields,
        );
        job.updatedRecords = dupResult.updated;
        job.skippedRecords = dupResult.skipped;

        if (dupResult.errors.length > 0) {
          const loadErrors = dupResult.errors.slice(0, 200).map((err) =>
            this.errorRepo.create({
              jobId: job.id, rowNumber: err.rowNumber, field: null,
              severity: 'error', phase: 'load', message: err.message,
              originalValue: null, suggestedValue: null,
            }),
          );
          await this.errorRepo.save(loadErrors);
        }
      }

      if (loadResult.errors.length > 0) {
        const newLoadErrors = loadResult.errors.slice(0, 200).map((err) =>
          this.errorRepo.create({
            jobId: job.id, rowNumber: err.rowNumber, field: null,
            severity: 'error', phase: 'load', message: err.message,
            originalValue: null, suggestedValue: null,
          }),
        );
        await this.errorRepo.save(newLoadErrors);
      }

      // === COMPLETE ===
      job.completedAt = new Date();
      job.durationMs = Date.now() - startTime;
      job.progress = 100;
      job.currentPhase = null;
      job.status = (job.errorRows > 0 || loadResult.errors.length > 0) ? 'completed_with_errors' : 'completed';
      await this.jobRepo.save(job);

    } catch (error: any) {
      await this.failJob(job, error.message || 'Error desconocido durante el procesamiento');
    } finally {
      this.fileStore.delete(fileId);
    }
  }

  async executeSynchronous(params: {
    tenantId: string;
    fileId: string;
    mapping: Record<string, string[]>;
    transforms?: Record<string, any>;
    matchFields?: string[];
    deduplicateStrategy?: string;
    overwriteFields?: string[];
    fuzzyMatch?: boolean;
    fuzzyThreshold?: number;
    validationRules?: ValidationRule[];
    templateName?: string;
    headers?: string[];
  }): Promise<ImportJob> {
    const job = await this.createImportJob(params);
    await this.executeJob(job.id, params.fileId);
    return this.jobRepo.findOneByOrFail({ id: job.id });
  }

  // ===========================
  // JOB MANAGEMENT
  // ===========================

  async getJob(jobId: string): Promise<ImportJob> {
    const job = await this.jobRepo.findOneBy({ id: jobId });
    if (!job) throw new NotFoundException(`Job ${jobId} not found`);
    return job;
  }

  async getJobErrors(jobId: string, page = 1, limit = 50): Promise<{ data: ImportError[]; total: number }> {
    const [data, total] = await this.errorRepo.findAndCount({
      where: { jobId },
      order: { rowNumber: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total };
  }

  async getJobHistory(tenantId: string, page = 1, limit = 20): Promise<{ data: ImportJob[]; total: number }> {
    const [data, total] = await this.jobRepo.findAndCount({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total };
  }

  async cancelJob(jobId: string): Promise<ImportJob> {
    const job = await this.getJob(jobId);
    if (['completed', 'failed', 'cancelled'].includes(job.status)) {
      throw new BadRequestException('No se puede cancelar un job que ya finalizó');
    }
    job.status = 'cancelled';
    job.completedAt = new Date();
    job.currentPhase = null;
    return this.jobRepo.save(job);
  }

  // ===========================
  // TEMPLATES
  // ===========================

  async getTemplates(tenantId?: string): Promise<MappingTemplate[]> {
    const where: any = {};
    if (tenantId) where.tenantId = tenantId;
    return this.templateRepo.find({ where, order: { isDefault: 'DESC', updatedAt: 'DESC' } });
  }

  async getTemplateByStructure(tenantId: string, headers: string[]): Promise<MappingTemplate | null> {
    const structureHash = this.generateStructureHash(headers);
    return this.templateRepo.findOne({ where: { tenantId, structureHash }, order: { updatedAt: 'DESC' } });
  }

  async saveTemplate(
    name: string,
    mapping: Record<string, string[]>,
    tenantId?: string,
    headers?: string[],
    transforms?: Record<string, any>,
  ): Promise<MappingTemplate> {
    const structureHash = headers ? this.generateStructureHash(headers) : null;

    if (structureHash && tenantId) {
      const existing = await this.templateRepo.findOne({ where: { tenantId, structureHash } });
      if (existing) {
        existing.mapping = mapping;
        existing.name = name;
        existing.structureHeaders = headers || null as any;
        existing.transforms = transforms || null;
        return this.templateRepo.save(existing);
      }
    }

    const template = this.templateRepo.create({
      name, mapping,
      tenantId: tenantId || undefined,
      structureHash: structureHash || undefined,
      structureHeaders: headers || undefined,
      transforms: transforms || undefined,
    });
    return this.templateRepo.save(template as MappingTemplate);
  }

  async deleteTemplate(id: string): Promise<{ deleted: boolean }> {
    await this.templateRepo.delete(id);
    return { deleted: true };
  }

  // ===========================
  // HELPERS
  // ===========================

  private async failJob(job: ImportJob, message: string): Promise<void> {
    job.status = 'failed';
    job.errorMessage = message;
    job.completedAt = new Date();
    job.currentPhase = null;
    if (job.startedAt) job.durationMs = Date.now() - job.startedAt.getTime();
    await this.jobRepo.save(job);
  }

  private generateStructureHash(headers: string[]): string {
    const sorted = [...headers].sort().join('|');
    let hash = 0;
    for (let i = 0; i < sorted.length; i++) {
      const char = sorted.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }
}
