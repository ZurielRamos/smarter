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

export enum PlanType {
  MONTHLY = 'monthly',
  PREPAID = 'prepaid',
}

@Entity('credit_plans')
export class CreditPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @OneToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ type: 'enum', enum: PlanType })
  type: PlanType;

  /** Créditos otorgados al inicio de cada mes (solo aplica para monthly) */
  @Column({ name: 'monthly_credits', type: 'int', default: 0 })
  monthlyCredits: number;

  /** Si los créditos no usados se acumulan al renovar */
  @Column({ type: 'boolean', default: false })
  rollover: boolean;

  /** Umbral para notificar saldo bajo */
  @Column({ name: 'low_balance_threshold', type: 'int', default: 100 })
  lowBalanceThreshold: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
