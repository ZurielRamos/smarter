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
 * Evaluación de un curso. Hay un quiz por clase (kind = lesson_quiz, con
 * lessonId) y un examen final por curso (kind = final_exam, lessonId null).
 * Centraliza reglas de tiempo, intentos y el peso de la evaluación dentro del
 * puntaje total del curso.
 */
@Entity('course_quizzes')
@Index(['tenantId'])
@Index(['courseId'])
@Index(['courseId', 'lessonId'])
export class CourseQuiz {
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

  /** Clase asociada (null si es examen final). */
  @Column({ name: 'lesson_id', type: 'uuid', nullable: true })
  lessonId: string | null;

  // lesson_quiz | final_exam
  @Column({ type: 'varchar', length: 20, default: 'lesson_quiz' })
  kind: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  title: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** Tiempo total del quiz en segundos (además del límite por pregunta). null = sin límite global. */
  @Column({ name: 'total_time_limit_sec', type: 'integer', nullable: true })
  totalTimeLimitSec: number | null;

  /** % para aprobar este quiz (0-100). */
  @Column({ name: 'passing_score', type: 'decimal', precision: 5, scale: 2, default: 60, transformer: numericTransformer })
  passingScore: number;

  /**
   * Peso de este quiz dentro del puntaje total del curso. Se normaliza entre
   * todos los quizzes al calcular el weightedScore (p. ej. clases 60 / final 40).
   */
  @Column({ name: 'weight_in_course', type: 'decimal', precision: 5, scale: 2, default: 1, transformer: numericTransformer })
  weightInCourse: number;

  @Column({ name: 'max_attempts', type: 'integer', default: 1 })
  maxAttempts: number;

  @Column({ name: 'shuffle_questions', type: 'boolean', default: false })
  shuffleQuestions: boolean;

  @Column({ name: 'shuffle_options', type: 'boolean', default: false })
  shuffleOptions: boolean;

  // immediately | after_close | never
  @Column({ name: 'show_results_policy', type: 'varchar', length: 20, default: 'immediately' })
  showResultsPolicy: string;

  // draft | active
  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
