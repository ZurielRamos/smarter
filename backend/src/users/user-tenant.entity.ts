import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Unique,
} from 'typeorm';
import { User } from './user.entity';
import { Tenant } from '../tenants/tenant.entity';

@Entity('user_tenants')
@Unique(['userId', 'tenantId'])
export class UserTenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ type: 'varchar', length: 30, default: 'agent' })
  role: string; // admin | agent

  /** pending = invitado, no ha aceptado | active = confirmado | removed = desvinculado */
  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: string; // pending | active | removed

  @ManyToOne(() => User, (user) => user.tenantRoles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE', eager: true })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
