import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';

// ─── Modelo del grafo ────────────────────────────────────────────

export type AutomationNodeType =
  // Disparadores
  | 'trigger_manual'
  | 'trigger_webhook'
  | 'trigger_schedule'
  | 'trigger_contact_created'
  | 'trigger_message_received'
  | 'trigger_conversation_created'
  // Lógica
  | 'condition'
  | 'loop'
  | 'set_variable'
  | 'delay'
  | 'stop'
  // Integraciones
  | 'http_request'
  | 'send_email'
  | 'slack'
  | 'discord'
  | 'telegram'
  | 'ai_prompt'
  // CRM
  | 'send_message'
  | 'contact_upsert'
  | 'contact_find';

export interface AutomationNodeData {
  label?: string;
  /** Comportamiento ante error: detener (por defecto) o continuar por la salida «error». */
  onError?: 'stop' | 'continue';
  /** Reintentos automáticos (0-5) antes de considerar el nodo fallido. */
  retries?: number;
  /** Notas del autor, no afectan a la ejecución. */
  notes?: string;
  /** Configuración específica de cada tipo de nodo. */
  [key: string]: unknown;
}

export interface AutomationNode {
  id: string;
  type: AutomationNodeType;
  position: { x: number; y: number };
  data: AutomationNodeData;
}

/**
 * Conexión entre nodos. `sourceHandle` identifica la salida:
 *  - 'next'      → salida por defecto
 *  - 'error'     → ruta de error (si onError = continue)
 *  - 'cond:<id>' / 'else' → ramas de una Condición
 *  - 'each' / 'done'      → cuerpo y final de un Bucle
 */
export interface AutomationEdge {
  id: string;
  source: string;
  sourceHandle?: string | null;
  target: string;
}

export interface AutomationSettings {
  /** Zona horaria IANA para los disparadores programados. */
  timezone?: string;
}

// ─── Entidad ─────────────────────────────────────────────────────

@Entity('automations')
@Index(['tenantId'])
@Index(['webhookToken'], { unique: true })
export class Automation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  // draft | active | inactive
  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  nodes: AutomationNode[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  edges: AutomationEdge[];

  @Column({ type: 'jsonb', nullable: true })
  settings: AutomationSettings | null;

  /** Token secreto de la URL pública del disparador webhook. */
  @Column({ name: 'webhook_token', type: 'varchar', length: 64 })
  webhookToken: string;

  @Column({ name: 'run_count', type: 'int', default: 0 })
  runCount: number;

  @Column({ name: 'last_run_at', type: 'timestamptz', nullable: true })
  lastRunAt: Date | null;

  /** Última marca programada ya disparada (evita doble disparo del cron). */
  @Column({ name: 'last_scheduled_at', type: 'timestamptz', nullable: true })
  lastScheduledAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
