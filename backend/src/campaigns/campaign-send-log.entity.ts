import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Registro individual de cada mensaje enviado en una campaña.
 * 
 * DISEÑO PARA VOLUMEN:
 * - UUID como PK (compatible con particionamiento)
 * - Sin relaciones ManyToOne cargadas (solo IDs) — evita JOINs costosos
 * - Índices compuestos para queries frecuentes
 * - Columnas mínimas: solo lo necesario para auditoría y reintentos
 * - Preparado para particionamiento por rango de created_at
 * 
 * Volumen esperado: 1M+ filas/mes por cliente.
 * 
 * PARTICIONAMIENTO (aplicar cuando pase de 50M filas):
 * ALTER TABLE campaign_send_logs RENAME TO campaign_send_logs_old;
 * CREATE TABLE campaign_send_logs (...) PARTITION BY RANGE (created_at);
 * CREATE TABLE campaign_send_logs_YYYY_MM PARTITION OF campaign_send_logs
 *   FOR VALUES FROM ('YYYY-MM-01') TO ('YYYY-MM+1-01');
 */
@Entity('campaign_send_logs')
@Index(['sendId', 'status'])
@Index(['campaignId', 'createdAt'])
@Index(['tenantId', 'createdAt'])
@Index(['phone', 'createdAt'])
// Índice para reintentos selectivos: "dame los no entregados de este envío con
// tal código de error" (p. ej. 131026). Mantiene barato el filtrado por código.
@Index(['sendId', 'errorCode'])
export class CampaignSendLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** FK a campaign_sends (ejecución) — NO usar relación lazy */
  @Column({ name: 'send_id', type: 'uuid' })
  sendId: string;

  /** FK a campaigns — desnormalizado para evitar JOINs */
  @Column({ name: 'campaign_id', type: 'uuid' })
  campaignId: string;

  /** FK a tenants — desnormalizado para queries por tenant */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  /** FK al registro del cliente */
  @Column({ name: 'record_id', type: 'uuid' })
  recordId: string;

  /** Teléfono destino (desnormalizado para búsquedas rápidas) */
  @Column({ type: 'varchar', length: 20 })
  phone: string;

  /** Canal usado: sms, whatsapp, llamada, email */
  @Column({ type: 'varchar', length: 20 })
  channel: string;

  /** Estado del envío */
  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: string; // pending, sent, delivered, failed, undelivered, rejected

  /** ID de mensaje del proveedor (para tracking de delivery) */
  @Column({ name: 'provider_message_id', type: 'varchar', length: 100, nullable: true })
  providerMessageId: string | null;

  /**
   * Código de error corto y accionable para reintentos.
   * - WhatsApp: el código numérico de Meta como string (p. ej. "131026").
   * - Email (Mailgun): "bounce", "complained", "failed", etc.
   * - Envío síncrono: el error de rechazo de la API en el momento del envío.
   * Es la clave para reintentos selectivos por tipo de fallo.
   */
  @Column({ name: 'error_code', type: 'varchar', length: 50, nullable: true })
  errorCode: string | null;

  /**
   * Título/categoría del error reportado por el proveedor (p. ej. el `title` de
   * Meta "Message Undeliverable"). Legible y estable para agrupar fallos.
   */
  @Column({ name: 'error_title', type: 'varchar', length: 255, nullable: true })
  errorTitle: string | null;

  /**
   * Detalle completo del error (mensaje + error_data.details de Meta, o la razón
   * de Mailgun). Texto libre para diagnóstico; no se usa para filtrar.
   */
  @Column({ name: 'error_detail', type: 'text', nullable: true })
  errorDetail: string | null;

  /** Timestamp de cuando se envió al proveedor */
  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt: Date | null;

  /** Timestamp de confirmación de entrega */
  @Column({ name: 'delivered_at', type: 'timestamptz', nullable: true })
  deliveredAt: Date | null;

  /** Timestamp del fallo de entrega (p. ej. cuando llega el estado failed/131026) */
  @Column({ name: 'failed_at', type: 'timestamptz', nullable: true })
  failedAt: Date | null;

  /** Timestamp de primera apertura (email) */
  @Column({ name: 'opened_at', type: 'timestamptz', nullable: true })
  openedAt: Date | null;

  /** Timestamp de primer click (email) */
  @Column({ name: 'clicked_at', type: 'timestamptz', nullable: true })
  clickedAt: Date | null;

  /** Timestamp de queja de spam (email) */
  @Column({ name: 'complained_at', type: 'timestamptz', nullable: true })
  complainedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
