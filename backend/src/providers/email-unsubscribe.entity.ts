import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';

/**
 * Stores email opt-outs per tenant.
 * When an email is in this table for a given tenant, no emails should be sent to it.
 */
@Entity('email_unsubscribes')
@Unique(['tenantId', 'email'])
@Index(['tenantId'])
@Index(['email'])
export class EmailUnsubscribe {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  /** Reason: unsubscribe_link | manual | complained | bounced */
  @Column({ type: 'varchar', length: 30, default: 'unsubscribe_link' })
  reason: string;

  /** Source: campaign_id, api, manual */
  @Column({ type: 'varchar', length: 255, nullable: true })
  source: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
