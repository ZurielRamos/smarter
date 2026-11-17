import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * Configuración del portal del encuestador de una cuenta: canales de invitación
 * y de verificación, plantillas, campos y documentos que se piden. Una fila por
 * cuenta; si no existe se usan los valores por defecto del servicio.
 */
@Entity('recruit_portal_configs')
@Index(['tenantId'], { unique: true })
export class PortalConfigRow {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  config: Record<string, any>;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
