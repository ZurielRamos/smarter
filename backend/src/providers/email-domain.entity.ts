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
import { Tenant } from '../tenants/tenant.entity';

export enum DomainStatus {
  PENDING = 'pending',
  VERIFIED = 'verified',
  FAILED = 'failed',
}

@Entity('email_domain_configs')
@Index(['tenantId'])
@Index(['inboxId'])
export class EmailDomainConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  /** Inbox al que pertenece esta config de email */
  @Column({ name: 'inbox_id', type: 'uuid', unique: true })
  inboxId: string;

  /** Provider: mandrill | mailgun */
  @Column({ type: 'varchar', length: 30, default: 'mandrill' })
  provider: string;

  @Column({ name: 'from_email', type: 'varchar', length: 255 })
  fromEmail: string;

  @Column({ name: 'from_name', type: 'varchar', length: 100 })
  fromName: string;

  @Column({ type: 'varchar', length: 255 })
  domain: string;

  @Column({ name: 'domain_status', type: 'enum', enum: DomainStatus, default: DomainStatus.PENDING })
  domainStatus: DomainStatus;

  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
  verifiedAt: Date | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
