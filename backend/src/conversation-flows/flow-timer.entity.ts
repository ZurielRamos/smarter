import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type FlowTimerKind = 'reminder' | 'timeout';
export type FlowTimerStatus =
  'pending' | 'running' | 'done' | 'cancelled' | 'failed';

/**
 * Temporizador de un flujo conversacional: un recordatorio o el «Sin respuesta»
 * de un nodo que espera al contacto. Es la fuente de verdad (no depende de
 * Redis): el worker toma los vencidos con FOR UPDATE SKIP LOCKED, así varios
 * servidores pueden procesarlos sin duplicarlos.
 *
 * `token` es la ficha de la espera (ConversationFlowState.token): al disparar,
 * solo actúa si la conversación sigue esperando con esa misma ficha.
 */
@Entity('flow_timers')
@Index('idx_flow_timers_conversation', ['conversationId'])
export class FlowTimer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'conversation_id', type: 'uuid' })
  conversationId: string;

  @Column({ name: 'flow_id', type: 'uuid' })
  flowId: string;

  @Column({ name: 'node_id', type: 'varchar', length: 64 })
  nodeId: string;

  @Column({ type: 'varchar', length: 16 })
  kind: FlowTimerKind;

  /** Recordatorio: posición en la lista del nodo */
  @Column({ type: 'int', default: 0 })
  step: number;

  @Column({ type: 'varchar', length: 40 })
  token: string;

  @Column({ name: 'fire_at', type: 'timestamptz' })
  fireAt: Date;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status: FlowTimerStatus;

  @Column({ name: 'locked_until', type: 'timestamptz', nullable: true })
  lockedUntil: Date | null;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'fired_at', type: 'timestamptz', nullable: true })
  firedAt: Date | null;
}
