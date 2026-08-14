import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';

@Entity('inboxes')
@Index(['tenantId'])
@Index(['pageId'])
@Index(['phoneNumberId'])
export class Inbox {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  // whatsapp | messenger | instagram
  @Column({ type: 'varchar', length: 20 })
  channel: string;

  // connected | disconnected | pending
  @Column({ type: 'varchar', length: 20, default: 'disconnected' })
  status: string;

  // For Messenger/Instagram — the Facebook Page ID
  @Column({ name: 'page_id', type: 'varchar', nullable: true })
  pageId: string | null;

  // For WhatsApp — the phone number ID
  @Column({ name: 'phone_number_id', type: 'varchar', nullable: true })
  phoneNumberId: string | null;

  // For WhatsApp — the WABA ID
  @Column({ name: 'waba_id', type: 'varchar', nullable: true })
  wabaId: string | null;

  // Long-lived token for this inbox's channel
  @Column({ name: 'access_token', type: 'text', nullable: true })
  accessToken: string | null;

  // Page name or phone number display
  @Column({ name: 'channel_name', type: 'varchar', nullable: true })
  channelName: string | null;

  // Bot assigned to this inbox (auto-reply)
  @Column({ name: 'bot_id', type: 'uuid', nullable: true })
  botId: string | null;

  // Extra metadata (avatar url, etc.)
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
