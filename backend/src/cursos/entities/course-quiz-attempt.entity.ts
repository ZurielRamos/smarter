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

export interface AttemptAnswer {
  questionId: string;
  /** Respuesta del participante (ids de opciones, texto o número). */
  answer: string[] | string | number | null;
  isCorrect: boolean;
  pointsAwarded: number;
  timeTakenSec: number;
  timeBonusAwarded: number;
}

/**
 * Intento de resolver un quiz (de clase o examen final). El reloj y la
 * corrección se controlan en servidor: startedAt se fija al iniciar y los
 * tiempos se validan contra él en el submit (anti-trampa).
 */
@Entity('course_quiz_attempts')
@Index(['tenantId'])
@Index(['enrollmentId'])
@Index(['enrollmentId', 'quizId'])
@Index(['courseId'])
export class CourseQuizAttempt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'enrollment_id', type: 'uuid' })
  enrollmentId: string;

  @Column({ name: 'course_id', type: 'uuid' })
  courseId: string;

  @Column({ name: 'quiz_id', type: 'uuid' })
  quizId: string;

  @Column({ name: 'lesson_id', type: 'uuid', nullable: true })
  lessonId: string | null;

  @Column({ name: 'record_id', type: 'uuid', nullable: true })
  recordId: string | null;

  @Column({ name: 'attempt_number', type: 'integer', default: 1 })
  attemptNumber: number;

  // in_progress | submitted | expired | graded
  @Column({ type: 'varchar', length: 20, default: 'in_progress' })
  status: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0, transformer: numericTransformer })
  score: number;

  @Column({ name: 'max_score', type: 'decimal', precision: 10, scale: 2, default: 0, transformer: numericTransformer })
  maxScore: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0, transformer: numericTransformer })
  percentage: number;

  @Column({ type: 'boolean', default: false })
  passed: boolean;

  /**
   * Orden barajado de ids de preguntas servido en el start (para corregir
   * respetando el barajado y evitar que el cliente altere el conjunto).
   */
  @Column({ name: 'served_question_ids', type: 'jsonb', default: () => "'[]'" })
  servedQuestionIds: string[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  answers: AttemptAnswer[];

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt: Date | null;

  @Column({ name: 'duration_sec', type: 'integer', default: 0 })
  durationSec: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
