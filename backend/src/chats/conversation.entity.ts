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
import { Inbox } from './inbox.entity';
import { ClientRecord } from '../records/record.entity';

@Entity('conversations')
@Index(['inboxId'])
@Index(['contactId'])
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'inbox_id', type: 'uuid' })
  inboxId: string;

  @ManyToOne(() => Inbox, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'inbox_id' })
  inbox: Inbox;

  // Link to client record
  @Column({ name: 'record_id', type: 'uuid', nullable: true })
  recordId: string | null;

  @ManyToOne(() => ClientRecord, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'record_id' })
  record: ClientRecord | null;

  // External contact identifier (phone for WA, PSID for Messenger, IGSID for IG)
  @Column({ name: 'contact_id', type: 'varchar' })
  contactId: string;

  @Column({ name: 'contact_name', type: 'varchar', nullable: true })
  contactName: string | null;

  @Column({ name: 'contact_avatar', type: 'varchar', nullable: true })
  contactAvatar: string | null;

  // open | closed | archived
  @Column({ type: 'varchar', length: 20, default: 'open' })
  status: string;

  // Last message snippet for preview
  @Column({ name: 'last_message', type: 'text', nullable: true })
  lastMessage: string | null;

  @Column({ name: 'last_message_at', type: 'timestamptz', nullable: true })
  lastMessageAt: Date | null;

  // Source of the last message: null | 'campaign' | 'manual' | 'api'
  @Column({ name: 'last_message_source', type: 'varchar', length: 20, nullable: true, default: null })
  lastMessageSource: string | null;

  @Column({ name: 'unread_count', type: 'integer', default: 0 })
  unreadCount: number;

  // Label IDs assigned to this conversation
  @Column({ name: 'label_ids', type: 'jsonb', nullable: true, default: [] })
  labelIds: string[];

  /** Whether this conversation's contact has active ad tracking events */
  @Column({ name: 'has_ad_tracking', type: 'boolean', default: false })
  hasAdTracking: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
