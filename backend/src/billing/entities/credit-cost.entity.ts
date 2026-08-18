import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Define el costo en créditos por cada tipo de acción/canal.
 * Configuración global (aplica a todas las cuentas).
 */
@Entity('credit_costs')
export class CreditCost {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Identificador del canal/acción (ej: whatsapp_message, call_minute, campaign_sms) */
  @Column({ type: 'varchar', length: 50, unique: true })
  action: string;

  /** Nombre legible */
  @Column({ type: 'varchar', length: 100 })
  label: string;

  /** Costo en créditos */
  @Column({ type: 'decimal', precision: 12, scale: 4, transformer: { to: (v: number) => v, from: (v: string) => parseFloat(v) } })
  cost: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
