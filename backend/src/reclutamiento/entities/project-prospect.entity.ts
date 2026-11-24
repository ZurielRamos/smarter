import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export type ProspectLinkMethod = 'auto' | 'manual';

/** Cómo llegó al proyecto: registrándose por la landing o agregado por el equipo (p. ej. desde un chat). */
export type ProspectSource = 'landing' | 'manual';

import type { ProspectRole } from '../prospect-states';

/**
 * Prospecto: la participación de una persona en un proyecto, creada al
 * registrarse por su landing. La persona queda además como contacto del CRM
 * (`recordId`): se reutiliza el contacto cuyo correo o teléfono verificado
 * coincide, y si no existe se crea. Un contacto puede tener prospectos en varios
 * proyectos. Los prospectos anteriores a este modelo pueden no tener contacto y
 * se vinculan a mano o con «Buscar coincidencias».
 *
 * `recordId` no lleva clave foránea (igual que el resto del módulo); la
 * existencia del contacto en la cuenta se valida en el servicio.
 *
 * `email` y `phone` son los datos con que se registró (uno verificado con el
 * código de un solo uso). El teléfono va solo con dígitos, con el indicativo.
 *
 * `answers` es una copia de las respuestas del formulario con el texto de cada
 * pregunta al momento del registro.
 */
@Entity('project_prospects')
@Index(['tenantId', 'projectId', 'createdAt'])
@Index(['tenantId', 'recordId'])
// Una persona (contacto) es un solo prospecto por proyecto.
@Index('uq_project_prospects_record', ['projectId', 'recordId'], { unique: true, where: `"record_id" IS NOT NULL` })
export class ProjectProspect {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId: string;

  @Column({ name: 'full_name', type: 'varchar', length: 100 })
  fullName: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 15, nullable: true })
  phone: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  answers: Array<{ id: string; label: string; type: string; value: unknown }>;

  /** Cuándo aceptó el tratamiento de datos en la landing. Nulo si lo agregó el equipo. */
  @Column({ name: 'consent_at', type: 'timestamptz', nullable: true })
  consentAt: Date | null;

  // landing | manual
  @Column({ type: 'varchar', length: 10, default: 'landing' })
  source: ProspectSource;

  /** Quién lo agregó, si fue el equipo. */
  @Column({ name: 'added_by', type: 'uuid', nullable: true })
  addedBy: string | null;

  /** Perfil de la persona en este proyecto: participant | surveyor | moderator (ver prospect-states.ts). */
  @Column({ type: 'varchar', length: 12, default: 'participant' })
  role: ProspectRole;

  /** Estado (ver PROSPECT_STATES; el mismo catálogo para todos los perfiles). */
  @Column({ type: 'varchar', length: 20, default: 'nuevo' })
  status: string;

  /** Motivo del último descarte (interno: la persona no lo ve). */
  @Column({ name: 'status_reason', type: 'text', nullable: true })
  statusReason: string | null;

  @Column({ name: 'decided_by', type: 'uuid', nullable: true })
  decidedBy: string | null;

  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true })
  decidedAt: Date | null;

  // ── Calificación del equipo en este proyecto (una sola) ──

  @Column({ type: 'smallint', nullable: true })
  rating: number | null;

  @Column({ name: 'rating_note', type: 'text', nullable: true })
  ratingNote: string | null;

  @Column({ name: 'rated_by', type: 'uuid', nullable: true })
  ratedBy: string | null;

  @Column({ name: 'rated_at', type: 'timestamptz', nullable: true })
  ratedAt: Date | null;

  /** Contacto del CRM vinculado, si lo hay. */
  @Column({ name: 'record_id', type: 'uuid', nullable: true })
  recordId: string | null;

  // auto | manual
  @Column({ name: 'link_method', type: 'varchar', length: 6, nullable: true })
  linkMethod: ProspectLinkMethod | null;

  @Column({ name: 'linked_by', type: 'uuid', nullable: true })
  linkedBy: string | null;

  @Column({ name: 'linked_at', type: 'timestamptz', nullable: true })
  linkedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
