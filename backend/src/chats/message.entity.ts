import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Conversation } from './conversation.entity';
import { User } from '../users/user.entity';

@Entity('messages')
@Index(['conversationId', 'createdAt'])
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'conversation_id', type: 'uuid' })
  conversationId: string;

  @ManyToOne(() => Conversation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation: Conversation;

  // Who sent this outbound message (null for inbound)
  @Column({ name: 'sender_id', type: 'uuid', nullable: true })
  senderId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'sender_id' })
  sender: User | null;

  // inbound | outbound
  @Column({ type: 'varchar', length: 10 })
  direction: string;

  // text | image | video | audio | document | sticker | location | template
  @Column({ name: 'message_type', type: 'varchar', length: 20, default: 'text' })
  messageType: string;

  @Column({ type: 'text', nullable: true })
  content: string | null;

  // For media messages
  @Column({ name: 'media_url', type: 'text', nullable: true })
  mediaUrl: string | null;

  @Column({ name: 'media_mime_type', type: 'varchar', nullable: true })
  mediaMimeType: string | null;

  // External message ID from Meta
  @Column({ name: 'external_id', type: 'varchar', nullable: true })
  externalId: string | null;

  // Reply context — references another message's external_id
  @Column({ name: 'reply_to_external_id', type: 'varchar', nullable: true })
  replyToExternalId: string | null;

  // sent | delivered | read | failed
  @Column({ type: 'varchar', length: 20, default: 'sent' })
  status: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
