import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';
import { Inbox } from '../chats/inbox.entity';

export interface SegmentCondition {
  field: string;
  operator: string;
  value: string | number | boolean;
}

export interface SegmentGroup {
  logic: 'AND' | 'OR';
  conditions: SegmentCondition[];
}

@Entity('campaigns')
@Index(['tenantId'])
export class Campaign {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // === TENANT ===
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar', nullable: true })
  description: string;

  @Column({ type: 'varchar', default: 'draft' })
  status: string; // draft, active, completed, paused

  @Column({ type: 'jsonb' })
  segments: SegmentGroup[];

  // Optional: use a pre-defined record list instead of segments
  @Column({ name: 'list_id', type: 'uuid', nullable: true })
  listId: string | null;

  // === INBOX ===
  @Column({ name: 'inbox_id', type: 'uuid', nullable: true })
  inboxId: string | null;

  @ManyToOne(() => Inbox, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'inbox_id' })
  inbox: Inbox;

  @Column({ type: 'varchar', nullable: true })
  channel: string; // sms, whatsapp, llamada, email

  @Column({ name: 'max_sends', type: 'integer', nullable: true })
  maxSends: number;

  @Column({ name: 'is_recurring', type: 'boolean', default: false })
  isRecurring: boolean;

  @Column({ name: 'send_date', type: 'timestamp', nullable: true })
  sendDate: Date;

  @Column({ name: 'send_time', type: 'varchar', nullable: true })
  sendTime: string; // HH:mm format

  @Column({ name: 'recurrence_days', type: 'jsonb', nullable: true })
  recurrenceDays: Record<string, string> | null; // { 'lunes': '09:00', 'miercoles': '14:00' }

  @Column({ name: 'matched_count', type: 'integer', default: 0 })
  matchedCount: number;

  @Column({ name: 'message_template', type: 'text', nullable: true })
  messageTemplate: string;

  @Column({ name: 'whatsapp_template_name', type: 'varchar', nullable: true })
  whatsappTemplateName: string;

  @Column({ name: 'whatsapp_template_language', type: 'varchar', nullable: true })
  whatsappTemplateLanguage: string;

  @Column({ name: 'whatsapp_variable_mapping', type: 'jsonb', nullable: true })
  whatsappVariableMapping: Record<string, string>; // { "1": "nombreCompleto", "2": "ciudad" }

  // === CALL (Llamada) fields ===
  @Column({ name: 'call_voice', type: 'varchar', nullable: true })
  callVoice: string; // Mariana, Penelope, Conchita, Mia, Lucia, Enrique, Miguel

  @Column({ name: 'call_retries', type: 'varchar', nullable: true })
  callRetries: string; // max 3

  @Column({ name: 'call_leave_voicemail', type: 'boolean', nullable: true, default: true })
  callLeaveVoicemail: boolean;

  @Column({ name: 'call_audio_code', type: 'varchar', nullable: true })
  callAudioCode: string; // ID of uploaded audio in Onurix

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
