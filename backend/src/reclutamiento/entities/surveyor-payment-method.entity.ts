import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Tenant } from '../../tenants/tenant.entity';
import { ContactProfile } from './contact-profile.entity';

export const PAYMENT_METHODS = ['bank_transfer', 'wallet', 'other'] as const;
export type PaymentMethodType = (typeof PAYMENT_METHODS)[number];

/**
 * Método de pago de un encuestador. Los datos sensibles (cuenta, banco, etc.)
 * van cifrados en `details` (AES-256-GCM) y la columna NO se selecciona por
 * defecto: solo se lee de forma explícita al "revelar", que queda auditado.
 */
@Entity('surveyor_payment_methods')
@Index(['tenantId'])
@Index(['tenantId', 'profileId'])
export class SurveyorPaymentMethod {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ name: 'profile_id', type: 'uuid' })
  profileId: string;

  @ManyToOne(() => ContactProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'profile_id' })
  profile: ContactProfile;

  // bank_transfer | wallet | other
  @Column({ type: 'varchar', length: 30 })
  method: PaymentMethodType;

  @Column({ name: 'holder_name', type: 'varchar', length: 120 })
  holderName: string;

  /** Datos cifrados ("v1.<iv>.<tag>.<ciphertext>"). Nunca se selecciona por defecto. */
  @Column({ type: 'text', select: false })
  details: string;

  /** Pista enmascarada para listados (p. ej. "•••• 1234"). No es sensible. */
  @Column({ type: 'varchar', length: 30, nullable: true })
  hint: string | null;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault: boolean;

  @Column({ name: 'verified_by', type: 'uuid', nullable: true })
  verifiedBy: string | null;

  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
  verifiedAt: Date | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
