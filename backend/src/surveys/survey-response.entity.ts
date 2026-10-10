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

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
