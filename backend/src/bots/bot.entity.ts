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

@Entity('bots')
@Index(['tenantId'])
export class Bot {
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

  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: string; // draft, active, inactive

  // === Identity ===

  @Column({ type: 'varchar', length: 255, nullable: true })
  persona: string | null; // "Laura", "Carlos", etc.

  @Column({ type: 'varchar', length: 50, nullable: true })
  role: string | null; // soporte, ventas, recepcionista, agendamiento, custom

  @Column({ type: 'text', nullable: true })
  objective: string | null; // what the bot should accomplish

  @Column({ type: 'jsonb', nullable: true, default: '[]' })
  tone: string[]; // ["formal", "amigable", "tecnico"]

  @Column({ type: 'varchar', length: 10, default: 'es' })
  language: string;

  // === Instructions ===

  @Column({ type: 'jsonb', nullable: true, default: '[]' })
  rules: string[]; // list of rules

  // === Knowledge ===

  @Column({ name: 'business_context', type: 'text', nullable: true })
  businessContext: string | null;

  // === Behavior ===

  @Column({ name: 'welcome_message', type: 'text', nullable: true })
  welcomeMessage: string | null;

  @Column({ name: 'fallback_message', type: 'text', nullable: true })
  fallbackMessage: string | null;

  // === AI Configuration ===

  @Column({ name: 'system_prompt', type: 'text', nullable: true })
  systemPrompt: string | null; // advanced: manual override

  @Column({ type: 'varchar', length: 100, nullable: true })
  model: string | null;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0.7 })
  temperature: number;

  @Column({ name: 'max_tokens', type: 'int', default: 1024 })
  maxTokens: number;

  @Column({ name: 'reply_delay', type: 'int', default: 4 })
  replyDelay: number; // seconds to wait before responding (debounce)

  @Column({ name: 'context_messages', type: 'int', default: 20 })
  contextMessages: number; // how many recent messages to send as context

  // === Conversation Control ===

  @Column({ name: 'max_bot_messages', type: 'int', default: 0 })
  maxBotMessages: number; // 0 = unlimited

  @Column({ name: 'handoff_keywords', type: 'jsonb', nullable: true, default: '[]' })
  handoffKeywords: string[];

  @Column({ name: 'handoff_message', type: 'text', nullable: true })
  handoffMessage: string | null;

  // === Usage tracking ===

  @Column({ name: 'total_prompt_tokens', type: 'int', default: 0 })
  totalPromptTokens: number;

  @Column({ name: 'total_completion_tokens', type: 'int', default: 0 })
  totalCompletionTokens: number;

  @Column({ name: 'total_requests', type: 'int', default: 0 })
  totalRequests: number;

  // === Data Collection ===

  @Column({ name: 'data_collection_enabled', type: 'boolean', default: false })
  dataCollectionEnabled: boolean;

  @Column({ name: 'data_collection_mode', type: 'varchar', length: 10, default: 'passive' })
  dataCollectionMode: string; // '1' to '5' intensity level

  @Column({ name: 'data_collection_fields', type: 'jsonb', nullable: true, default: '[]' })
  dataCollectionFields: { field: string; label: string; instructions: string; priority: number }[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
