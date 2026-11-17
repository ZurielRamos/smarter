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

export const PROFILE_TYPES = ['surveyor'] as const;
export type ProfileType = (typeof PROFILE_TYPES)[number];

export const PROFILE_STATUSES = ['candidate', 'active', 'suspended', 'ended'] as const;
export type ProfileStatus = (typeof PROFILE_STATUSES)[number];

const numericTransformer = {
  to: (v: number | null) => v,
  from: (v: string | null) => (v === null || v === undefined ? null : parseFloat(v)),
};

/**
 * Capacidad (rol operativo) de un contacto dentro de una cuenta. La persona es
 * siempre un ClientRecord; el perfil indica qué puede hacer en la plataforma y
 * guarda el ciclo de vida de ese rol (candidato → activo → suspendido/terminado).
 *
 * `recordId` no lleva clave foránea, igual que el resto de entidades que
 * referencian contactos (p. ej. course_enrollments). La existencia del contacto
 * en el tenant se valida en el servicio.
 */
@Entity('contact_profiles')
@Index(['tenantId'])
@Index(['tenantId', 'type', 'status'])
@Index(['tenantId', 'recordId', 'type'], { unique: true })
export class ContactProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ name: 'record_id', type: 'uuid' })
  recordId: string;

  // surveyor (luego: panelist)
  @Column({ type: 'varchar', length: 30 })
  type: ProfileType;

  // candidate | active | suspended | ended
  @Column({ type: 'varchar', length: 20, default: 'candidate' })
  status: ProfileStatus;

  /** Motivo de la última suspensión o terminación. */
  @Column({ name: 'status_reason', type: 'text', nullable: true })
  statusReason: string | null;

  @Column({ name: 'enabled_by', type: 'uuid', nullable: true })
  enabledBy: string | null;

  @Column({ name: 'enabled_at', type: 'timestamptz', nullable: true })
  enabledAt: Date | null;

  /** Datos NO sensibles del rol (zona, idiomas, disponibilidad...). */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  data: Record<string, any>;

  @Column({ name: 'quality_score', type: 'decimal', precision: 5, scale: 2, nullable: true, transformer: numericTransformer })
  qualityScore: number | null;

  /**
   * Se incrementa al suspender o terminar el perfil. Las sesiones del
   * encuestador llevan esta versión y se invalidan al cambiar.
   */
  @Column({ name: 'token_version', type: 'integer', default: 0 })
  tokenVersion: number;

  /** Último ingreso del encuestador al portal. */
  @Column({ name: 'last_portal_login_at', type: 'timestamptz', nullable: true })
  lastPortalLoginAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
