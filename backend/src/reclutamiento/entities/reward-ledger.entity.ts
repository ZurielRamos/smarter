import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

const numericTransformer = {
  to: (v: number | null) => v,
  from: (v: string | null) => (v === null ? null : Number(v)),
};

/**
 * accrual = encuesta aprobada por la reclutadora (se le debe a la persona);
 * reversal = el cliente la rechazó después (se descuenta);
 * payout = pago registrado por la reclutadora; adjustment = corrección manual.
 */
export const LEDGER_TYPES = ['accrual', 'reversal', 'payout', 'adjustment'] as const;
export type LedgerType = (typeof LEDGER_TYPES)[number];

/**
 * Libro de lo que la cuenta reclutadora le debe a cada encuestador. Es de solo
 * agregar: un asiento por movimiento, con signo, que no se edita ni se borra.
 * El saldo es la suma de los asientos. La plataforma no mueve dinero: calcula
 * lo que se debe y registra lo que la reclutadora pagó por fuera.
 */
@Entity('reward_ledger')
@Index(['tenantId', 'profileId', 'createdAt'])
// Una encuesta se causa y se revierte a lo sumo una vez.
@Index('uq_reward_ledger_response', ['responseId', 'type'], { unique: true, where: `"response_id" IS NOT NULL` })
export class RewardLedgerEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Cuenta reclutadora (quien paga). */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'profile_id', type: 'uuid' })
  profileId: string;

  @Column({ type: 'varchar', length: 12 })
  type: LedgerType;

  /** Con signo: positivo suma a lo que se le debe, negativo resta. */
  @Column({ type: 'decimal', precision: 14, scale: 2, transformer: numericTransformer })
  amount: number;

  @Column({ type: 'varchar', length: 3 })
  currency: string;

  /** Encuesta que origina el asiento (causación o reversa). */
  @Column({ name: 'response_id', type: 'uuid', nullable: true })
  responseId: string | null;

  /** Contrato del que sale la tarifa. */
  @Column({ name: 'contract_id', type: 'uuid', nullable: true })
  contractId: string | null;

  @Column({ name: 'study_link_id', type: 'uuid', nullable: true })
  studyLinkId: string | null;

  /** Pago: método usado, referencia (transferencia, comprobante) y fecha. */
  @Column({ name: 'payment_method_id', type: 'uuid', nullable: true })
  paymentMethodId: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  reference: string | null;

  @Column({ name: 'paid_at', type: 'date', nullable: true })
  paidAt: string | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
