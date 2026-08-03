import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Tenant } from '../../tenants/tenant.entity';

export enum TransactionType {
  /** Otorgamiento de créditos (renovación mensual) */
  GRANT = 'grant',
  /** Compra/recarga de créditos (prepago) */
  PURCHASE = 'purchase',
  /** Consumo de créditos */
  CONSUME = 'consume',
  /** Devolución por fallo en operación */
  REFUND = 'refund',
  /** Expiración de créditos no usados (si rollover = false) */
  EXPIRE = 'expire',
  /** Ajuste manual por admin */
  ADJUSTMENT = 'adjustment',
}

@Entity('credit_transactions')
@Index(['tenantId', 'createdAt'])
export class CreditTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ type: 'enum', enum: TransactionType })
  type: TransactionType;

  /** Cantidad de créditos (positivo para ingreso, negativo para egreso) */
  @Column({ type: 'int' })
  amount: number;

  /** Balance resultante después de esta transacción */
  @Column({ name: 'balance_after', type: 'int' })
  balanceAfter: number;

  /** Fuente/acción que generó la transacción (ej: whatsapp, call, campaign) */
  @Column({ type: 'varchar', length: 50, nullable: true })
  source: string | null;

  /** ID de referencia a la entidad que originó el consumo */
  @Column({ name: 'reference_id', type: 'varchar', length: 100, nullable: true })
  referenceId: string | null;

  /** Descripción legible */
  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  /** ID del usuario que ejecutó la acción (null = sistema) */
  @Column({ name: 'performed_by', type: 'uuid', nullable: true })
  performedBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
