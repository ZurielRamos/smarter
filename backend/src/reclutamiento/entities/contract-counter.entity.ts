import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

/**
 * Consecutivo de numeración de contratos. Una fila por cuenta y por serie
 * («CT-2026»); se incrementa de forma atómica al emitir cada contrato.
 */
@Entity('contract_counters')
@Index(['tenantId', 'series'], { unique: true })
export class ContractCounter {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  /** Prefijo y año, p. ej. «CT-2026». */
  @Column({ type: 'varchar', length: 40 })
  series: string;

  @Column({ type: 'integer', default: 0 })
  value: number;
}
