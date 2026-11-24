import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import type { ProspectRole } from '../prospect-states';

export const PROJECT_STATUSES = ['draft', 'active', 'paused', 'ended'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/**
 * Proyecto de reclutamiento: una convocatoria con su propia dirección pública
 * (landing y formulario de registro). Las personas que se registran por esa
 * landing quedan como prospectos del proyecto (ver ProjectProspect).
 *
 * Es genérico a propósito: no depende de una cuenta cliente ni de estudios.
 * Eso llega en una etapa posterior.
 *
 * La cuenta no lleva clave foránea, igual que el resto del módulo.
 */
@Entity('recruitment_projects')
@Index(['tenantId'])
@Index('uq_recruitment_projects_slug', ['tenantId', 'slug'], { unique: true })
export class RecruitmentProject {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Cuenta reclutadora dueña del proyecto. */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ type: 'varchar', length: 80 })
  name: string;

  /** Parte de la dirección pública del proyecto. Único por cuenta. */
  @Column({ type: 'varchar', length: 40 })
  slug: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** Perfiles que acepta el proyecto (participant, surveyor, moderator). Al menos uno. */
  @Column({ type: 'jsonb', default: () => `'["participant"]'` })
  roles: ProspectRole[];

  /** Perfil con que entra quien se registra por la landing (si no elige otro). */
  @Column({ name: 'default_role', type: 'varchar', length: 12, default: 'participant' })
  defaultRole: ProspectRole;

  /** Quien se registra puede postularse como moderador (queda por aprobar). Solo si el proyecto acepta moderadores. */
  @Column({ name: 'moderator_signup', type: 'boolean', default: false })
  moderatorSignup: boolean;

  /** Informativo: las personas de este proyecto necesitan contrato firmado. Por ahora no dispara ninguna acción. */
  @Column({ name: 'requires_signed_contract', type: 'boolean', default: false })
  requiresSignedContract: boolean;

  // draft | active | paused | ended
  @Column({ type: 'varchar', length: 12, default: 'draft' })
  status: ProjectStatus;

  // ── Cara pública (landing y registro) ──

  /** Nombre que ven las personas en la landing. Si es nulo se usa `name`. */
  @Column({ name: 'public_name', type: 'varchar', length: 80, nullable: true })
  publicName: string | null;

  /** Interruptor del registro por la landing del proyecto. */
  @Column({ name: 'registration_open', type: 'boolean', default: false })
  registrationOpen: boolean;

  /** Landing del proyecto (mismo modelo que la general). Nulo = valores por defecto, sin publicar. */
  @Column({ type: 'jsonb', nullable: true })
  landing: Record<string, any> | null;

  /** Preguntas de selección propias del proyecto. */
  @Column({ type: 'jsonb', default: () => `'{"questions":[]}'` })
  form: { questions: any[] };

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ name: 'ended_at', type: 'timestamptz', nullable: true })
  endedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
