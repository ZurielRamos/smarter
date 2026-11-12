import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type AutomationRunStatus = 'running' | 'success' | 'error';

export interface AutomationStepLog {
  nodeId: string;
  type: string;
  label: string;
  status: 'success' | 'error' | 'skipped';
  startedAt: string;
  durationMs: number;
  attempts: number;
  /** Entrada resuelta (con las {{variables}} ya sustituidas), truncada. */
  input?: unknown;
  /** Salida del nodo, truncada. */
  output?: unknown;
  error?: string;
  /** Iteración del bucle en la que se ejecutó, si aplica. */
  iteration?: number;
}

@Entity('automation_runs')
@Index(['automationId', 'startedAt'])
@Index(['tenantId'])
export class AutomationRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'automation_id', type: 'uuid' })
  automationId: string;

  // running | success | error
  @Column({ type: 'varchar', length: 20, default: 'running' })
  status: AutomationRunStatus;

  // manual | webhook | schedule | test
  @Column({ name: 'trigger_type', type: 'varchar', length: 20 })
  triggerType: string;

  @Column({ name: 'trigger_data', type: 'jsonb', nullable: true })
  triggerData: unknown;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  steps: AutomationStepLog[];

  @Column({ type: 'text', nullable: true })
  error: string | null;

  /** Resultado del último nodo ejecutado (útil como respuesta del webhook). */
  @Column({ type: 'jsonb', nullable: true })
  result: unknown;

  @CreateDateColumn({ name: 'started_at', type: 'timestamptz' })
  startedAt: Date;

  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true })
  finishedAt: Date | null;

  @Column({ name: 'duration_ms', type: 'int', nullable: true })
  durationMs: number | null;
}
