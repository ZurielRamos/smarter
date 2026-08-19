import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Bot } from './bot.entity';

@Entity('bot_knowledge')
@Index(['botId'])
export class BotKnowledge {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'bot_id', type: 'uuid' })
  botId: string;

  @ManyToOne(() => Bot, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bot_id' })
  bot: Bot;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  // text | file
  @Column({ type: 'varchar', length: 20, default: 'text' })
  type: string;

  // Original content (full text or file URL)
  @Column({ type: 'text' })
  content: string;

  // Content split into chunks for context injection
  @Column({ type: 'jsonb', nullable: true })
  chunks: string[] | null;

  // Number of tokens in total content
  @Column({ name: 'token_count', type: 'int', default: 0 })
  tokenCount: number;

  @Column({ name: 'is_enabled', type: 'boolean', default: true })
  isEnabled: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
