import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('admin_audit_logs')
@Index(['targetType', 'targetId'])
@Index(['adminUserId'])
@Index(['createdAt'])
export class AdminAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'admin_user_id', type: 'uuid' })
  adminUserId: string;

  @Column({ name: 'admin_email', type: 'varchar', length: 255 })
  adminEmail: string;

  /** e.g. tenant.create, tenant.update, tenant.delete, billing.plan.update, billing.costs.update, billing.recharge */
  @Column({ type: 'varchar', length: 100 })
  action: string;

  /** e.g. tenant, user, billing, platform */
  @Column({ name: 'target_type', type: 'varchar', length: 50 })
  targetType: string;

  /** ID of the affected resource. Null for global actions. */
  @Column({ name: 'target_id', type: 'uuid', nullable: true })
  targetId: string | null;

  /** Human-readable name of the target (e.g. tenant name) for display without joins */
  @Column({ name: 'target_label', type: 'varchar', length: 200, nullable: true })
  targetLabel: string | null;

  /** Relevant data: changes, previous values, submitted payload, etc. */
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
