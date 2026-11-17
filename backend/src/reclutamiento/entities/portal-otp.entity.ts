import { Entity, PrimaryColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * Código de un solo uso del portal del encuestador (ingreso o firma de un
 * contrato). Solo se guarda un HMAC del código, ligado al id del registro.
 * El id se genera en la aplicación porque forma parte del HMAC.
 */
@Entity('recruit_otps')
@Index(['tenantId', 'profileId', 'createdAt'])
export class PortalOtp {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'profile_id', type: 'uuid' })
  profileId: string;

  // login | sign
  @Column({ type: 'varchar', length: 10 })
  purpose: 'login' | 'sign';

  /** Contrato que se firma (solo purpose = sign). */
  @Column({ name: 'contract_id', type: 'uuid', nullable: true })
  contractId: string | null;

  // email | phone
  @Column({ type: 'varchar', length: 10 })
  channel: 'email' | 'phone';

  @Column({ type: 'varchar', length: 200 })
  destination: string;

  @Column({ name: 'code_hash', type: 'varchar', length: 64 })
  codeHash: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'integer', default: 0 })
  attempts: number;

  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
  verifiedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
