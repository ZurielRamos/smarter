import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { Tenant } from '../../tenants/tenant.entity';

/**
 * Override del costo en créditos por acción a nivel de tenant.
 * Si existe un registro aquí, tiene prioridad sobre el CreditCost global.
 */
@Entity('tenant_credit_costs')
@Unique(['tenantId', 'action'])
export class TenantCreditCost {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  /** Identificador del canal/acción (ej: whatsapp_message, call, sms) */
  @Column({ type: 'varchar', length: 50 })
  action: string;

  /** Nombre legible o metadata (para __config entries) */
  @Column({ type: 'varchar', length: 255, nullable: true })
  label: string | null;

  /** Costo en créditos (override del global) */
  @Column({ type: 'decimal', precision: 12, scale: 4, transformer: { to: (v: number) => v, from: (v: string) => parseFloat(v) } })
  cost: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
