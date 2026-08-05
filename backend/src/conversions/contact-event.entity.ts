import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ClientRecord } from '../records/record.entity';

@Entity('contact_events')
@Index(['tenantId', 'recordId', 'createdAt'])
@Index(['tenantId', 'type'])
export class ContactEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'record_id', type: 'uuid' })
  recordId: string;

  @ManyToOne(() => ClientRecord, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'record_id' })
  record: ClientRecord;

  /** Event type: purchase, appointment, demo, qualified, proposal, registration, subscription, custom */
  @Column({ type: 'varchar', length: 30 })
  type: string;

  /** Display name: "Compra", "Reunión agendada", "Demo completada" */
  @Column({ type: 'varchar', length: 150 })
  name: string;

  /** Monetary value if applicable */
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  value: number | null;

  /** Currency code */
  @Column({ type: 'varchar', length: 3, default: 'COP' })
  currency: string;

  /** Event-specific data */
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null;

  /** What created this event: manual, automation, status_change, api */
  @Column({ type: 'varchar', length: 20, default: 'manual' })
  source: string;

  /** Agent who registered it (if manual) */
  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId: string | null;

  @Column({ name: 'actor_name', type: 'varchar', nullable: true })
  actorName: string | null;

  /** Whether this event was dispatched to ad platforms */
  @Column({ type: 'boolean', default: false })
  dispatched: boolean;

  @Column({ name: 'dispatched_at', type: 'timestamptz', nullable: true })
  dispatchedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
