import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { ClientRecord } from './record.entity';

@Entity('activities')
@Index(['recordId'])
@Index(['tenantId', 'recordId'])
export class Activity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'record_id', type: 'uuid' })
  recordId: string;

  @ManyToOne(() => ClientRecord, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'record_id' })
  record: ClientRecord;

  @Column({ type: 'varchar', length: 50 })
  type: string; // status_changed, assigned, note_created, message_received, message_sent, contact_created, contact_updated, tag_added, tag_removed

  @Column({ type: 'varchar', nullable: true })
  description: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null; // { from: "lead", to: "contactado" } or { agentName: "Juan" } etc.

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId: string | null;

  @Column({ name: 'actor_name', type: 'varchar', nullable: true })
  actorName: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
