import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * Auditoría por tenant (a diferencia de AdminAuditLog, que es de superadmin).
 * Registra acciones sensibles dentro de una cuenta: aprobaciones, cambios de
 * contratos, lectura de datos de pago, etc.
 *
 * NUNCA debe guardarse en `metadata` información sensible (datos de pago,
 * documentos). Solo identificadores y valores no secretos.
 */
@Entity('tenant_audit_logs')
@Index(['tenantId', 'createdAt'])
@Index(['tenantId', 'scopeId', 'createdAt'])
@Index(['tenantId', 'targetType', 'targetId'])
export class TenantAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  // user | surveyor | system
  @Column({ name: 'actor_type', type: 'varchar', length: 20 })
  actorType: string;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId: string | null;

  /** Etiqueta legible del actor (p. ej. email) para mostrar sin joins. */
  @Column({ name: 'actor_label', type: 'varchar', length: 255, nullable: true })
  actorLabel: string | null;

  /** p. ej. reclutamiento.profile.activate */
  @Column({ type: 'varchar', length: 100 })
  action: string;

  @Column({ name: 'target_type', type: 'varchar', length: 50 })
  targetType: string;

  @Column({ name: 'target_id', type: 'uuid', nullable: true })
  targetId: string | null;

  /**
   * Raíz del agregado al que pertenece el hecho (p. ej. el perfil del
   * encuestador cuando se audita uno de sus contratos). Permite listar el
   * historial completo de una entidad con una sola consulta.
   */
  @Column({ name: 'scope_id', type: 'uuid', nullable: true })
  scopeId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
