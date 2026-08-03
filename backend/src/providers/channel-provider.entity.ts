import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Configuración global de proveedores de canales.
 * Administrado a nivel de plataforma (SuperAdmin).
 * Las cuentas (tenants) usan estos proveedores para enviar mensajes.
 */
@Entity('channel_providers')
export class ChannelProvider {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Canal: sms | whatsapp | email | llamada */
  @Column({ type: 'varchar', length: 20 })
  channel: string;

  /** Proveedor: onurix, twilio, brevo, sendgrid, mailgun, meta, etc. */
  @Column({ type: 'varchar', length: 50 })
  provider: string;

  /** Nombre legible para identificar esta configuración */
  @Column({ type: 'varchar', length: 100 })
  name: string;

  /** Credenciales del proveedor */
  @Column({ type: 'jsonb', default: {} })
  credentials: Record<string, string>;

  /** Si este proveedor es el predeterminado para su canal */
  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
