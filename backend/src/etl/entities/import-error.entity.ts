import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ImportJob } from './import-job.entity';

export type ImportErrorSeverity = 'error' | 'warning' | 'info';
export type ImportErrorPhase = 'validation' | 'transform' | 'deduplicate' | 'load';

@Entity('import_errors')
@Index(['jobId'])
@Index(['jobId', 'severity'])
export class ImportError {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'job_id', type: 'uuid' })
  jobId: string;

  @ManyToOne(() => ImportJob, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'job_id' })
  job: ImportJob;

  @Column({ name: 'row_number', type: 'integer' })
  rowNumber: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  field: string | null;

  @Column({ type: 'varchar', length: 20 })
  severity: ImportErrorSeverity;

  @Column({ type: 'varchar', length: 20 })
  phase: ImportErrorPhase;

  @Column({ type: 'text' })
  message: string;

  @Column({ name: 'original_value', type: 'text', nullable: true })
  originalValue: string | null;

  @Column({ name: 'suggested_value', type: 'text', nullable: true })
  suggestedValue: string | null;

  // Row data snapshot for reference
  @Column({ name: 'row_data', type: 'jsonb', nullable: true })
  rowData: Record<string, any> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
