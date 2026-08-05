import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Audit log: every conversion dispatch attempt.
 */
@Entity('conversion_logs')
@Index(['tenantId', 'createdAt'])
@Index(['recordId'])
@Index(['adEventId'])
export class ConversionLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'record_id', type: 'uuid' })
  recordId: string;

  @Column({ name: 'ad_event_id', type: 'uuid' })
  adEventId: string;

  @Column({ name: 'conversion_event_id', type: 'uuid' })
  conversionEventId: string;

  @Column({ name: 'ad_platform_id', type: 'uuid' })
  adPlatformId: string;

  /** meta | google | tiktok | linkedin | ga4 */
  @Column({ type: 'varchar', length: 20 })
  platform: string;

  /** Event name sent (Purchase, Lead, etc.) */
  @Column({ name: 'event_name', type: 'varchar', length: 100 })
  eventName: string;

  /** success | failed | expired | skipped */
  @Column({ type: 'varchar', length: 20 })
  status: string;

  /** HTTP status code from the platform */
  @Column({ name: 'http_status', type: 'integer', nullable: true })
  httpStatus: number | null;

  /** Response body (for debugging) */
  @Column({ name: 'response_body', type: 'jsonb', nullable: true })
  responseBody: Record<string, any> | null;

  /** Error message if failed */
  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  /** Value sent with the conversion */
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  value: number | null;

  @Column({ type: 'varchar', length: 3, nullable: true })
  currency: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
