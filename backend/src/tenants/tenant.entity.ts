import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // === IDENTIDAD ===
  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  slug: string;

  @Column({ name: 'icon_path', type: 'varchar', nullable: true })
  iconPath: string;

  // === ESTADO ===
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'is_dev', type: 'boolean', default: false })
  isDev: boolean;

  @Column({ name: 'max_agents', type: 'int', default: 5 })
  maxAgents: number;

  // === CONFIGURACIÓN ===
  @Column({ name: 'table_config', type: 'jsonb', nullable: true })
  tableConfig: Record<string, any> | null;

  /** Tracking configuration for ad attribution */
  @Column({ name: 'tracking_config', type: 'jsonb', nullable: true })
  trackingConfig: {
    /** WhatsApp number to redirect to (with country code) */
    whatsappPhone?: string;
    /** Message template with {{code}} placeholder. E.g. "Hola, me interesa información. Ref: {{code}}" */
    messageTemplate?: string;
    /** Next sequential code number */
    nextCode?: number;
  } | null;

  // === AUDITORÍA ===
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
