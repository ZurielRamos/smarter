import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
  Index,
} from 'typeorm';
import { Tenant } from './tenant.entity';

@Entity('channel_configs')
@Unique(['tenantId', 'channel'])
@Index(['tenantId'])
export class ChannelConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  // sms | whatsapp | email | llamada
  @Column({ type: 'varchar', length: 20 })
  channel: string;

  // Proveedor: onurix, meta, twilio, sendgrid, mailgun, etc.
  @Column({ type: 'varchar', length: 50 })
  provider: string;

  // Credenciales encriptadas en JSON
  @Column({ type: 'jsonb', default: {} })
  credentials: Record<string, string>;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
