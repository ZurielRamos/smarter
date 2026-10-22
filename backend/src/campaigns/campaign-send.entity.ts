import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Campaign } from './campaign.entity';

@Entity('campaign_sends')
@Index(['campaignId', 'createdAt'])
@Index(['status'])
export class CampaignSend {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'campaign_id', type: 'uuid' })
  campaignId: string;

  @ManyToOne(() => Campaign)
  @JoinColumn({ name: 'campaign_id' })
  campaign: Campaign;

  @Column({ type: 'varchar', default: 'pending' })
  status: string; // pending, queued, sending, paused, completed, failed

  @Column({ name: 'total_recipients', type: 'integer', default: 0 })
  totalRecipients: number;

  @Column({ name: 'total_sent', type: 'integer', default: 0 })
  totalSent: number;

  /**
   * Entregas confirmadas por el proveedor (webhook de estado). Distinto de
   * `totalSent`, que solo cuenta lo aceptado por la API en el momento del envío.
   */
  @Column({ name: 'total_delivered', type: 'integer', default: 0 })
  totalDelivered: number;

  /** Fallos en el momento del envío (la API del proveedor rechazó el mensaje). */
  @Column({ name: 'total_failed', type: 'integer', default: 0 })
  totalFailed: number;

  /**
   * No entregados de forma asíncrona: la API aceptó el mensaje pero el proveedor
   * luego reportó que no pudo entregarlo (p. ej. WhatsApp 131026). Se actualiza
   * desde el webhook de estado, separado de `totalFailed` para poder reintentar
   * por tipo de fallo.
   */
  @Column({ name: 'total_undelivered', type: 'integer', default: 0 })
  totalUndelivered: number;

  /** Snapshot of recipient record IDs at execution time */
  @Column({ name: 'recipient_ids', type: 'jsonb', nullable: true })
  recipientIds: string[] | null;

  /**
   * Índice del snapshot `recipientIds` desde el cual continuar al reanudar un
   * envío pausado. El worker lo persiste en cada lote y arranca desde aquí, para
   * no reenviar destinatarios ya procesados.
   */
  @Column({ name: 'resume_offset', type: 'integer', default: 0 })
  resumeOffset: number;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
