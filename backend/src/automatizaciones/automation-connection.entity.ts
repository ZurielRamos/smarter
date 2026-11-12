import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';

/** Tipos de conexión soportados y los campos secretos/visibles de cada uno. */
export type ConnectionType =
  | 'http_bearer'
  | 'http_basic'
  | 'http_api_key'
  | 'slack_webhook'
  | 'discord_webhook'
  | 'telegram_bot'
  | 'openrouter';

export const CONNECTION_FIELDS: Record<
  ConnectionType,
  { label: string; fields: { key: string; label: string; secret: boolean }[] }
> = {
  http_bearer: {
    label: 'HTTP · Bearer token',
    fields: [{ key: 'token', label: 'Token', secret: true }],
  },
  http_basic: {
    label: 'HTTP · Basic auth',
    fields: [
      { key: 'username', label: 'Usuario', secret: false },
      { key: 'password', label: 'Contraseña', secret: true },
    ],
  },
  http_api_key: {
    label: 'HTTP · API key',
    fields: [
      { key: 'headerName', label: 'Nombre del header', secret: false },
      { key: 'apiKey', label: 'API key', secret: true },
    ],
  },
  slack_webhook: {
    label: 'Slack · Incoming Webhook',
    fields: [{ key: 'webhookUrl', label: 'Webhook URL', secret: true }],
  },
  discord_webhook: {
    label: 'Discord · Webhook',
    fields: [{ key: 'webhookUrl', label: 'Webhook URL', secret: true }],
  },
  telegram_bot: {
    label: 'Telegram · Bot',
    fields: [{ key: 'botToken', label: 'Bot token', secret: true }],
  },
  openrouter: {
    label: 'IA · OpenRouter',
    fields: [{ key: 'apiKey', label: 'API key', secret: true }],
  },
};

/**
 * Credenciales reutilizables entre automatizaciones. `data` guarda el JSON de
 * campos cifrado con AES-256-GCM (ver automation-crypto.util.ts); nunca se
 * devuelve al cliente.
 */
@Entity('automation_connections')
@Index(['tenantId'])
export class AutomationConnection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 40 })
  type: ConnectionType;

  @Column({ type: 'text' })
  data: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
