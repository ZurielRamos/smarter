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

export interface LessonMaterial {
  id: string;
  /**
   * Tipo de material:
   *  - youtube: enlace de YouTube (se incrusta).
   *  - video_url: enlace directo a video externo.
   *  - video_upload: video subido a R2 (url propia).
   *  - document: PDF u otro archivo de lectura (url propia).
   *  - image: imagen de apoyo.
   *  - link: enlace externo.
   *  - text: contenido de lectura embebido (HTML/markdown).
   */
  type:
    | 'youtube'
    | 'video_url'
    | 'video_upload'
    | 'document'
    | 'image'
    | 'link'
    | 'text';
  title: string;
  /** URL del recurso (YouTube, enlace, o URL pública en R2). */
  url?: string;
  /** Ruta de almacenamiento en R2 (para poder borrar el objeto). */
  storagePath?: string;
  /** Contenido embebido para type 'text'. */
  content?: string;
  /** Duración estimada en segundos (video). */
  durationSec?: number;
  /** MIME del archivo subido. */
  mimeType?: string;
  /** Tamaño en bytes del archivo subido. */
  sizeBytes?: number;
  /** Debe consumirse para poder avanzar. */
  required?: boolean;
  order: number;
}

/**
 * Clase dentro de un curso. Contiene material didáctico (video YouTube, video
 * subido, archivos de lectura, texto) y, opcionalmente, un quiz de clase.
 */
@Entity('course_lessons')
@Index(['tenantId'])
@Index(['courseId'])
@Index(['courseId', 'order'])
export class CourseLesson {
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

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** Orden dentro del curso. */
  @Column({ type: 'integer', default: 0 })
  order: number;

  // draft | published
  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: string;

  /** Material didáctico ordenado. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  materials: LessonMaterial[];

  /**
   * Tiempo mínimo (segundos) que el participante debe permanecer en el material
   * antes de poder iniciar el quiz de la clase. Anti-trampa. 0 = sin mínimo.
   */
  @Column({ name: 'min_seconds_before_quiz', type: 'integer', default: 0 })
  minSecondsBeforeQuiz: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
