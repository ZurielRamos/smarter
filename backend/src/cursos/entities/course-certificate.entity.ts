import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Course, CourseCertificateConfig } from './course.entity';
import { CourseEnrollment } from './course-enrollment.entity';

/**
 * Certificado emitido a un participante cuando aprueba un curso. Se genera una
 * sola vez (idempotente por courseId+recordId) al transicionar la inscripción a
 * 'passed'. Guarda un snapshot del participante y del curso para que el
 * certificado siga siendo válido aunque el contacto o el curso cambien después.
 *
 * El `serial` es público y permite verificar la autenticidad del certificado
 * sin exponer datos internos (endpoint público de verificación).
 */
@Entity('course_certificates')
@Index(['tenantId'])
@Index(['tenantId', 'recordId'])
@Index(['courseId', 'recordId'], { unique: true })
@Index(['serial'], { unique: true })
export class CourseCertificate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'course_id', type: 'uuid' })
  courseId: string;

  @ManyToOne(() => Course, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'course_id' })
  course: Course;

  @Column({ name: 'enrollment_id', type: 'uuid' })
  enrollmentId: string;

  @ManyToOne(() => CourseEnrollment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'enrollment_id' })
  enrollment: CourseEnrollment;

  /** Contacto del CRM al que pertenece el certificado. */
  @Column({ name: 'record_id', type: 'uuid' })
  recordId: string;

  /** Código público de verificación (único, legible). Ej: CERT-7F3A-2K9D. */
  @Column({ type: 'varchar', length: 40, unique: true })
  serial: string;

  /** Snapshot del nombre del participante al emitir. */
  @Column({ name: 'participant_name', type: 'varchar', length: 200 })
  participantName: string;

  /** Snapshot del nombre del curso al emitir. */
  @Column({ name: 'course_name', type: 'varchar', length: 200 })
  courseName: string;

  /** Snapshot del nombre del tenant (emisor) al emitir. */
  @Column({ name: 'tenant_name', type: 'varchar', length: 200 })
  tenantName: string;

  /** Calificación final (weightedScore, 0-100) con la que aprobó. */
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  score: number;

  /** Posición en el ranking del curso al emitir (si existía). */
  @Column({ type: 'integer', nullable: true })
  rank: number | null;

  /** Snapshot de la configuración del certificado al momento de emitir. */
  @Column({ type: 'jsonb', nullable: true })
  config: CourseCertificateConfig | null;

  @Column({ name: 'issued_at', type: 'timestamptz' })
  issuedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
