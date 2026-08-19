import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { BotTool } from './bot-tool.entity';
import { Bot } from './bot.entity';

@Entity('bot_tool_logs')
@Index(['botId'])
@Index(['toolId'])
@Index(['createdAt'])
export class BotToolLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'bot_id', type: 'uuid' })
  botId: string;

  @ManyToOne(() => Bot, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bot_id' })
  bot: Bot;

  @Column({ name: 'tool_id', type: 'uuid' })
  toolId: string;

  @ManyToOne(() => BotTool, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tool_id' })
  tool: BotTool;

  @Column({ name: 'tool_name', type: 'varchar', length: 100 })
  toolName: string;

  @Column({ name: 'conversation_id', type: 'uuid', nullable: true })
  conversationId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  args: Record<string, any> | null;

  @Column({ type: 'text', nullable: true })
  response: string | null;

  @Column({ type: 'boolean', default: true })
  success: boolean;

  @Column({ name: 'duration_ms', type: 'int', default: 0 })
  durationMs: number;

  @Column({ name: 'is_test', type: 'boolean', default: false })
  isTest: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
