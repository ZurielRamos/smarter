import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { Tenant } from '../../tenants/tenant.entity';

@Entity('credit_balances')
export class CreditBalance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid', unique: true })
  tenantId: string;

  @OneToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  /** Créditos disponibles para consumir */
  @Column({ type: 'int', default: 0 })
  available: number;

  /** Créditos reservados (en proceso de uso) */
  @Column({ type: 'int', default: 0 })
  reserved: number;

  /** Última fecha de renovación mensual */
  @Column({ name: 'last_renewal_at', type: 'timestamptz', nullable: true })
  lastRenewalAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
