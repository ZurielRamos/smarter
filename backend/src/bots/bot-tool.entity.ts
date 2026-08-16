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
import { Bot } from './bot.entity';

@Entity('bot_tools')
@Index(['botId'])
export class BotTool {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'bot_id', type: 'uuid' })
  botId: string;

  @ManyToOne(() => Bot, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bot_id' })
  bot: Bot;

  @Column({ type: 'varchar', length: 100 })
  name: string; // function name: buscar_producto

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'jsonb', default: '{"type":"object","properties":{}}' })
  parameters: object; // JSON Schema for function parameters

  // webhook | static | internal
  @Column({ name: 'execution_type', type: 'varchar', length: 20 })
  executionType: string;

  // Webhook config
  @Column({ name: 'webhook_url', type: 'text', nullable: true })
  webhookUrl: string | null;

  @Column({ name: 'webhook_method', type: 'varchar', length: 10, nullable: true, default: 'POST' })
  webhookMethod: string | null;

  @Column({ name: 'webhook_headers', type: 'jsonb', nullable: true })
  webhookHeaders: Record<string, string> | null;

  // Static response
  @Column({ name: 'static_response', type: 'text', nullable: true })
  staticResponse: string | null;

  // Internal action
  @Column({ name: 'internal_action', type: 'varchar', length: 50, nullable: true })
  internalAction: string | null;

  @Column({ name: 'is_enabled', type: 'boolean', default: true })
  isEnabled: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
