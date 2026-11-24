import { Entity, PrimaryColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * Código de un solo uso del portal (ingreso, registro o firma de un
 * contrato). Solo se guarda un HMAC del código, ligado al id del registro.
 * El id se genera en la aplicación porque forma parte del HMAC.
 */
export type OtpPurpose = 'login' | 'sign' | 'register' | 'prospect' | 'project_login';

@Entity('recruit_otps')
@Index(['tenantId', 'profileId', 'createdAt'])
export class PortalOtp {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  /** Null en un código de registro: el perfil se crea al verificarlo. */
  @Column({ name: 'profile_id', type: 'uuid', nullable: true })
  profileId: string | null;

  // login | sign | register | prospect | project_login
  @Column({ type: 'varchar', length: 20 })
  purpose: OtpPurpose;

  /** Datos del registro en curso (purpose = register o prospect): nombre, consentimiento y, para un prospecto, el proyecto y sus respuestas. */
  @Column({ type: 'jsonb', nullable: true })
  payload: {
    fullName?: string;
    consentAt?: string;
    /** Registro por la landing de un proyecto: el proyecto, sus respuestas y los datos personales pedidos. */
    project?: {
      id: string;
      answers: Array<{ id: string; label: string; type: string; value: unknown }>;
      values?: Record<string, string>;
      /** El otro dato de contacto (correo si se verificó el teléfono, y al revés), sin verificar. */
      other?: { email?: string; phone?: string };
      /** Perfil elegido al registrarse. */
      role?: string;
    };
    /** Ingreso de un contacto sin perfil: su ficha. */
    recordId?: string;
  } | null;

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
