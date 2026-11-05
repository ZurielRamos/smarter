import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

const numericTransformer = {
  to: (v: number | null) => v,
  from: (v: string | null) => (v === null ? null : parseFloat(v)),
};

/**
 * Progreso de una inscripción en una clase concreta: material visto, tiempo
 * invertido y resultado del quiz de la clase.
 */
@Entity('course_lesson_progress')
@Index(['tenantId'])
@Index(['enrollmentId'])
@Index(['courseId'])
@Index(['enrollmentId', 'lessonId'], { unique: true })
export class CourseLessonProgress {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'enrollment_id', type: 'uuid' })
  enrollmentId: string;

  @Column({ name: 'course_id', type: 'uuid' })
  courseId: string;

  @Column({ name: 'lesson_id', type: 'uuid' })
  lessonId: string;

  @Column({ name: 'record_id', type: 'uuid', nullable: true })
  recordId: string | null;

  // not_started | material_viewed | quiz_completed
  @Column({ type: 'varchar', length: 20, default: 'not_started' })
  status: string;

  @Column({ name: 'material_seconds_spent', type: 'integer', default: 0 })
  materialSecondsSpent: number;

  @Column({ name: 'material_viewed_at', type: 'timestamptz', nullable: true })
  materialViewedAt: Date | null;

  /**
   * Ids de los materiales que el participante ya consumió (video visto al ~90%,
   * documento/lectura marcado como visto). Sirve para completar clases SIN quiz
   * cuando todos los materiales requeridos están consumidos.
   */
  @Column({ name: 'watched_materials', type: 'jsonb', default: () => "'[]'" })
  watchedMaterials: string[];

  @Column({ name: 'quiz_score', type: 'decimal', precision: 10, scale: 2, nullable: true, transformer: numericTransformer })
  quizScore: number | null;

  @Column({ name: 'quiz_max_score', type: 'decimal', precision: 10, scale: 2, nullable: true, transformer: numericTransformer })
  quizMaxScore: number | null;

  @Column({ name: 'attempts_used', type: 'integer', default: 0 })
  attemptsUsed: number;

  @Column({ name: 'quiz_completed_at', type: 'timestamptz', nullable: true })
  quizCompletedAt: Date | null;

  /** Si ya se cobró el crédito por completar esta clase (evita doble cobro). */
  @Column({ name: 'credit_charged', type: 'boolean', default: false })
  creditCharged: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
