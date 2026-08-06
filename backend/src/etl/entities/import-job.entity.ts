import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Tenant } from '../../tenants/tenant.entity';

export type ImportJobStatus =
  | 'pending'
  | 'parsing'
  | 'awaiting_mapping'
  | 'validating'
  | 'transforming'
  | 'deduplicating'
  | 'loading'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'completed_with_errors';

export type DeduplicateStrategy = 'keep_existing' | 'overwrite' | 'merge_non_empty' | 'append_tags' | 'overwrite_selected';

export interface DeduplicateConfig {
  matchFields: string[];        // Campos para detectar duplicados
  strategy: DeduplicateStrategy;
  overwriteFields?: string[];   // Solo para 'overwrite_selected': campos a sobreescribir
  fuzzyMatch?: boolean;         // Usar fuzzy matching para nombres
  fuzzyThreshold?: number;      // 0-1, default 0.8
}

export interface ValidationRule {
  field: string;
  type: 'required' | 'regex' | 'email' | 'phone' | 'min_length' | 'max_length' | 'in_list' | 'unique';
  value?: string;
  message?: string;
}

@Entity('import_jobs')
@Index(['tenantId'])
@Index(['status'])
@Index(['tenantId', 'status'])
@Index(['createdAt'])
export class ImportJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  // === Estado ===
  @Column({ type: 'varchar', length: 30, default: 'pending' })
  status: ImportJobStatus;

  @Column({ name: 'current_phase', type: 'varchar', length: 30, nullable: true })
  currentPhase: string | null;

  @Column({ type: 'integer', default: 0 })
  progress: number; // 0-100

  // === Archivo fuente ===
  @Column({ name: 'file_name', type: 'varchar' })
  fileName: string;

  @Column({ name: 'file_size', type: 'integer', default: 0 })
  fileSize: number;

  @Column({ name: 'file_type', type: 'varchar', length: 10 })
  fileType: string; // csv, xlsx, xls

  // === Parsed data reference (for async parse flow) ===
  @Column({ name: 'file_id', type: 'varchar', nullable: true })
  fileId: string | null;

  @Column({ name: 'parsed_headers', type: 'jsonb', nullable: true })
  parsedHeaders: string[] | null;

  @Column({ name: 'parsed_preview', type: 'jsonb', nullable: true })
  parsedPreview: Record<string, string>[] | null;

  // === Configuración del mapeo ===
  @Column({ type: 'jsonb', nullable: true })
  mapping: Record<string, string[]> | null;

  @Column({ type: 'jsonb', nullable: true })
  transforms: Record<string, any> | null;

  // === Configuración de deduplicación ===
  @Column({ name: 'deduplicate_config', type: 'jsonb', nullable: true })
  deduplicateConfig: DeduplicateConfig | null;

  // === Reglas de validación ===
  @Column({ name: 'validation_rules', type: 'jsonb', nullable: true })
  validationRules: ValidationRule[] | null;

  // === Métricas ===
  @Column({ name: 'total_rows', type: 'integer', default: 0 })
  totalRows: number;

  @Column({ name: 'valid_rows', type: 'integer', default: 0 })
  validRows: number;

  @Column({ name: 'error_rows', type: 'integer', default: 0 })
  errorRows: number;

  @Column({ name: 'duplicate_rows', type: 'integer', default: 0 })
  duplicateRows: number;

  @Column({ name: 'created_records', type: 'integer', default: 0 })
  createdRecords: number;

  @Column({ name: 'updated_records', type: 'integer', default: 0 })
  updatedRecords: number;

  @Column({ name: 'skipped_records', type: 'integer', default: 0 })
  skippedRecords: number;

  // === Timing ===
  @Column({ name: 'started_at', type: 'timestamp', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'duration_ms', type: 'integer', nullable: true })
  durationMs: number | null;

  // === Error general ===
  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  // === Auditoría ===
  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
