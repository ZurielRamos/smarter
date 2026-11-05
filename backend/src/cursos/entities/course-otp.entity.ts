import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Código de verificación (OTP) para la inscripción a un curso. Se envía por
 * email o WhatsApp y valida la propiedad del correo/teléfono del participante
 * antes de inscribirlo. Es de vida corta (expiresAt) y se almacena hasheado.
 */
@Entity('course_otps')
@Index(['courseId'])
@Index(['enrollmentId'])
@Index(['destination'])
export class CourseOtp {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'course_id', type: 'uuid', nullable: true })
  courseId: string | null;

  @Column({ name: 'enrollment_id', type: 'uuid', nullable: true })
  enrollmentId: string | null;

  // email | phone
  @Column({ type: 'varchar', length: 10 })
  channel: string;

  /** Destino normalizado (email en minúsculas, teléfono sin +). */
  @Column({ type: 'varchar', length: 255 })
  destination: string;

  /** Hash SHA-256 del código (nunca se guarda en claro). */
  @Column({ name: 'code_hash', type: 'varchar', length: 64 })
  codeHash: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
  verifiedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
