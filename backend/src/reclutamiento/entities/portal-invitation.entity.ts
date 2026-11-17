import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * Invitación al portal. El enlace lleva un token aleatorio; aquí solo se guarda
 * su hash. El token NO inicia sesión: solo identifica a qué encuestador se le
 * enviará el código de verificación.
 */
@Entity('recruit_invitations')
@Index(['tenantId', 'profileId'])
@Index(['tokenHash'], { unique: true })
export class PortalInvitation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'profile_id', type: 'uuid' })
  profileId: string;

  @Column({ name: 'token_hash', type: 'varchar', length: 64 })
  tokenHash: string;

  /** Canales por los que se envió (sin datos personales): ['email', 'whatsapp']. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  channels: string[];

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
