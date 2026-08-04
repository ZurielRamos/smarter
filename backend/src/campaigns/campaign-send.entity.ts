import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Campaign } from './campaign.entity';

@Entity('campaign_sends')
@Index(['campaignId', 'createdAt'])
@Index(['status'])
export class CampaignSend {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'campaign_id', type: 'uuid' })
  campaignId: string;

  @ManyToOne(() => Campaign)
  @JoinColumn({ name: 'campaign_id' })
  campaign: Campaign;

  @Column({ type: 'varchar', default: 'pending' })
  status: string; // pending, sending, completed, failed

  @Column({ name: 'total_recipients', type: 'integer', default: 0 })
  totalRecipients: number;

  @Column({ name: 'total_sent', type: 'integer', default: 0 })
  totalSent: number;

  @Column({ name: 'total_delivered', type: 'integer', default: 0 })
  totalDelivered: number;

  @Column({ name: 'total_failed', type: 'integer', default: 0 })
  totalFailed: number;

  /** Snapshot of recipient record IDs at execution time */
  @Column({ name: 'recipient_ids', type: 'jsonb', nullable: true })
  recipientIds: string[] | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
