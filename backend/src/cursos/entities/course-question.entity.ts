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

export interface QuestionOption {
  id: string;
  text: string;
  isCorrect: boolean;
  /** Peso relativo de la opción (para crédito parcial avanzado). Opcional. */
  weight?: number;
}

export interface QuestionCorrectAnswer {
  /** Respuesta esperada para short_text (comparación normalizada). */
  text?: string;
  /** Respuesta numérica esperada. */
  number?: number;
  /** Tolerancia +/- para numeric. */
  tolerance?: number;
  /** Valores alternativos aceptados (short_text/numeric). */
  acceptedValues?: Array<string | number>;
  /** Orden correcto de ids de opciones para type 'ordering'. */
  order?: string[];
}

export interface QuestionTimeBonus {
  enabled: boolean;
  /** Puntos extra máximos por responder rápido. */
  maxBonusPoints: number;
  /**
   * Cómo decae el bonus con el tiempo:
   *  - linear: proporcional al tiempo restante.
   *  - step: bonus completo si responde en la primera mitad del tiempo, 0 si no.
   */
  decayModel?: 'linear' | 'step';
}

const numericTransformer = {
  to: (v: number | null) => v,
  from: (v: string | null) => (v === null ? null : parseFloat(v)),
};

/**
 * Pregunta de un curso. Puede pertenecer a una clase (lessonId) o al examen
 * final (isFinalExam = true, lessonId null). Incluye un sistema de ponderación
 * detallado (puntos, penalización, crédito parcial) y tiempos límite con bonus
 * por rapidez.
 */
@Entity('course_questions')
@Index(['tenantId'])
@Index(['courseId'])
@Index(['courseId', 'lessonId'])
@Index(['quizId', 'order'])
export class CourseQuestion {
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

  /** Clase a la que pertenece (null si es del examen final). */
  @Column({ name: 'lesson_id', type: 'uuid', nullable: true })
  lessonId: string | null;

  /** Quiz al que pertenece (lesson_quiz o final_exam). */
  @Column({ name: 'quiz_id', type: 'uuid', nullable: true })
  quizId: string | null;

  /** True si es pregunta del examen final del curso. */
  @Column({ name: 'is_final_exam', type: 'boolean', default: false })
  isFinalExam: boolean;

  @Column({ type: 'integer', default: 0 })
  order: number;

  // single_choice | multiple_choice | true_false | short_text | numeric | ordering
  @Column({ type: 'varchar', length: 20, default: 'single_choice' })
  type: string;

  @Column({ type: 'text' })
  prompt: string;

  /** Imagen/recurso de apoyo del enunciado. */
  @Column({ name: 'media_url', type: 'varchar', nullable: true })
  mediaUrl: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  options: QuestionOption[];

  @Column({ name: 'correct_answer', type: 'jsonb', nullable: true })
  correctAnswer: QuestionCorrectAnswer | null;

  // === Ponderación ===

  /** Puntos base de la pregunta. */
  @Column({ type: 'decimal', precision: 8, scale: 2, default: 1, transformer: numericTransformer })
  points: number;

  /** Penalización por respuesta incorrecta (resta). 0 = sin penalización. */
  @Column({ name: 'negative_on_wrong', type: 'decimal', precision: 8, scale: 2, default: 0, transformer: numericTransformer })
  negativeOnWrong: number;

  /** En multiple_choice/ordering: puntúa proporcional a lo acertado. */
  @Column({ name: 'partial_credit', type: 'boolean', default: false })
  partialCredit: boolean;

  // === Tiempo ===

  /** Segundos para responder esta pregunta. null/0 = sin límite por pregunta. */
  @Column({ name: 'time_limit_sec', type: 'integer', nullable: true })
  timeLimitSec: number | null;

  /** Bonus por responder rápido. */
  @Column({ name: 'time_bonus', type: 'jsonb', nullable: true })
  timeBonus: QuestionTimeBonus | null;

  // === Feedback ===

  /** Explicación/feedback mostrado tras responder (según política del quiz). */
  @Column({ type: 'text', nullable: true })
  explanation: string | null;

  // easy | medium | hard
  @Column({ type: 'varchar', length: 10, nullable: true })
  difficulty: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
