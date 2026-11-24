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
import { Tenant } from '../tenants/tenant.entity';
import { Survey } from './survey.entity';

/**
 * Respuesta a una encuesta, independientemente del canal.
 *
 * Se crea tanto cuando alguien completa la encuesta por el enlace público web
 * como cuando responde el Flow de WhatsApp (si la encuesta se publicó en Meta).
 * `channel` distingue el origen y `responseData` guarda los valores por nombre
 * de campo (las mismas claves que el flowJson), de modo que las analíticas
 * agregan ambos canales de forma homogénea.
 */
@Entity('survey_responses')
@Index(['tenantId'])
@Index(['surveyId'])
@Index(['surveyId', 'createdAt'])
export class SurveyResponse {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ name: 'survey_id', type: 'uuid' })
  surveyId: string;

  @ManyToOne(() => Survey, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'survey_id' })
  survey: Survey;

  // web | whatsapp | api
  @Column({ type: 'varchar', length: 20, default: 'web' })
  channel: string;

  // completed | partial
  @Column({ type: 'varchar', length: 20, default: 'completed' })
  status: string;

  // Valores de la respuesta: { nombre_campo: valor }. Mismas claves que el
  // flowJson de la encuesta.
  @Column({ name: 'response_data', type: 'jsonb', default: () => "'{}'" })
  responseData: Record<string, any>;

  // Identificador opcional de quien responde (teléfono de WhatsApp, email del
  // formulario web, etc.) para trazabilidad.
  @Column({ name: 'respondent_identifier', type: 'varchar', nullable: true })
  respondentIdentifier: string | null;

  // Contacto del CRM al que se atribuyó la respuesta (si hubo mapeo/match).
  @Column({ name: 'record_id', type: 'uuid', nullable: true })
  recordId: string | null;

  /**
   * Agente al que se atribuye esta respuesta, resuelto a partir del enlace por
   * agente usado para responder (modelo de enlaces por agente). Null si se
   * respondió por el enlace general.
   */
  @Column({ name: 'attributed_user_id', type: 'uuid', nullable: true })
  attributedUserId: string | null;

  // ── Trabajo de campo (encuestas de un estudio, respondidas desde el portal) ──
  /** Encuestador (perfil de la cuenta reclutadora) que hizo la encuesta. */
  @Column({ name: 'profile_id', type: 'uuid', nullable: true })
  profileId: string | null;

  /** Asignación del estudio al socio (`project_studies.id`). */
  @Column({ name: 'study_link_id', type: 'uuid', nullable: true })
  studyLinkId: string | null;

  /** Lote y fila (posición en `study_batches.rows`) a los que cuenta la encuesta. */
  @Index()
  @Column({ name: 'batch_id', type: 'uuid', nullable: true })
  batchId: string | null;

  @Column({ name: 'batch_row', type: 'integer', nullable: true })
  batchRow: number | null;

  /**
   * Revisión en dos etapas (solo respuestas de trabajo de campo): primero la
   * reclutadora y luego el cliente. Nulo en las demás encuestas.
   *  pending_recruiter → pending_client → approved, o rejected en cualquiera.
   */
  @Index()
  @Column({ name: 'review_status', type: 'varchar', length: 20, nullable: true })
  reviewStatus: 'pending_recruiter' | 'pending_client' | 'approved' | 'rejected' | null;

  /** Quién rechazó: la reclutadora o el cliente. */
  @Column({ name: 'rejected_by', type: 'varchar', length: 10, nullable: true })
  rejectedBy: 'recruiter' | 'client' | null;

  @Column({ name: 'reject_reason', type: 'text', nullable: true })
  rejectReason: string | null;

  @Column({ name: 'recruiter_reviewed_by', type: 'uuid', nullable: true })
  recruiterReviewedBy: string | null;

  @Column({ name: 'recruiter_reviewed_at', type: 'timestamptz', nullable: true })
  recruiterReviewedAt: Date | null;

  @Column({ name: 'client_reviewed_by', type: 'uuid', nullable: true })
  clientReviewedBy: string | null;

  @Column({ name: 'client_reviewed_at', type: 'timestamptz', nullable: true })
  clientReviewedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
