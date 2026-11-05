import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Tenant } from '../../tenants/tenant.entity';
import { Course } from './course.entity';

const numericTransformer = {
  to: (v: number | null) => v,
  from: (v: string | null) => (v === null ? null : parseFloat(v)),
};

/**
 * Inscripción de un participante a un curso. El participante es un contacto del
 * CRM (ClientRecord) que accede por un enlace público con token, sin login. Los
 * datos del participante se recogen en el flujo y se vinculan a un ClientRecord
 * (creado o emparejado) mediante recordId.
 *
 * Los agregados de puntaje/tiempo se desnormalizan aquí para ordenar el ranking
 * sin recomputar, siguiendo el patrón de alto volumen del CRM.
 */
@Entity('course_enrollments')
@Index(['tenantId'])
@Index(['tenantId', 'courseId'])
@Index(['courseId', 'weightedScore'])
@Index(['courseId', 'recordId'])
@Index(['accessToken'], { unique: true })
@Index(['campaignId'])
export class CourseEnrollment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ name: 'course_id', type: 'uuid' })
  courseId: string;

  @ManyToOne(() => Course, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'course_id' })
  course: Course;

  /** Contacto del CRM asociado. Null hasta que el participante entrega sus datos. */
  @Column({ name: 'record_id', type: 'uuid', nullable: true })
  recordId: string | null;

  /** Campaña de origen (si la inscripción se sembró desde una campaña). */
  @Column({ name: 'campaign_id', type: 'uuid', nullable: true })
  campaignId: string | null;

  /** Token opaco para el enlace público del participante (/c/:slug?t=token). */
  @Column({ name: 'access_token', type: 'varchar', length: 64, unique: true })
  accessToken: string;

  /** Datos del participante recogidos en el flujo (nombre, email, documento...). */
  @Column({ name: 'participant_data', type: 'jsonb', default: () => "'{}'" })
  participantData: Record<string, any>;

  // invited | in_progress | completed | passed | failed | disqualified
  @Column({ type: 'varchar', length: 20, default: 'invited' })
  status: string;

  // === Agregados de puntaje/ranking (desnormalizados) ===

  @Column({ name: 'total_score', type: 'decimal', precision: 10, scale: 2, default: 0, transformer: numericTransformer })
  totalScore: number;

  @Column({ name: 'weighted_score', type: 'decimal', precision: 10, scale: 2, default: 0, transformer: numericTransformer })
  weightedScore: number;

  @Column({ name: 'max_possible_score', type: 'decimal', precision: 10, scale: 2, default: 0, transformer: numericTransformer })
  maxPossibleScore: number;

  @Column({ name: 'accuracy_pct', type: 'decimal', precision: 5, scale: 2, default: 0, transformer: numericTransformer })
  accuracyPct: number;

  @Column({ name: 'completed_lessons', type: 'integer', default: 0 })
  completedLessons: number;

  @Column({ name: 'total_time_spent_sec', type: 'integer', default: 0 })
  totalTimeSpentSec: number;

  /** Posición en el ranking (recalculada). Null si aún no se ha calculado. */
  @Column({ type: 'integer', nullable: true })
  rank: number | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
