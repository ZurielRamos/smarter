import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * Historial de un prospecto: cada cambio de estado o de perfil, con quién y
 * cuándo. Es de solo agregar. Sirve para ver el recorrido de la persona en el
 * proyecto y para calcular su última participación.
 */
@Entity('prospect_status_events')
@Index(['tenantId', 'prospectId', 'createdAt'])
@Index(['tenantId', 'recordId', 'toStatus'])
export class ProspectStatusEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId: string;

  @Column({ name: 'prospect_id', type: 'uuid' })
  prospectId: string;

  /** Contacto en ese momento (para la historia de la persona entre proyectos). */
  @Column({ name: 'record_id', type: 'uuid', nullable: true })
  recordId: string | null;

  @Column({ type: 'varchar', length: 12 })
  role: string;

  /** Estado anterior; nulo al entrar al proyecto. */
  @Column({ name: 'from_status', type: 'varchar', length: 20, nullable: true })
  fromStatus: string | null;

  @Column({ name: 'to_status', type: 'varchar', length: 20 })
  toStatus: string;

  /** Perfil anterior, si el cambio fue de perfil. */
  @Column({ name: 'from_role', type: 'varchar', length: 12, nullable: true })
  fromRole: string | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  /** Usuario del equipo que hizo el cambio; nulo si lo hizo el sistema. */
  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId: string | null;

  /** Origen del cambio cuando no lo hizo una persona del equipo: landing | flow. */
  @Column({ type: 'varchar', length: 10, nullable: true })
  via: 'landing' | 'flow' | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
