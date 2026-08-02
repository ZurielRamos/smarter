import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';

@Entity('labels')
@Index(['tenantId'])
@Index(['tenantId', 'slug'], { unique: true })
export class Label {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ type: 'varchar', length: 50 })
  slug: string;

  @Column({ type: 'varchar', length: 100 })
  label: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 7, default: '#6b7280' })
  color: string;

  @Column({ name: 'show_in_sidebar', type: 'boolean', default: false })
  showInSidebar: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
