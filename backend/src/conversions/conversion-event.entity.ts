import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Defines what events a tenant wants to track as conversions.
 * Maps internal CRM events to ad platform conversion events.
 */
@Entity('conversion_events')
@Index(['tenantId'])
export class ConversionEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  /** Internal event trigger: status_changed, tag_added, form_submitted, manual */
  @Column({ name: 'trigger_type', type: 'varchar', length: 50 })
  triggerType: string;

  /** Condition value: e.g. status name "venta", tag name, etc. */
  @Column({ name: 'trigger_value', type: 'varchar', nullable: true })
  triggerValue: string | null;

  /** Display name for this conversion: "Venta", "Lead Calificado", "Cita Agendada" */
  @Column({ type: 'varchar', length: 100 })
  name: string;

  /** Platforms to notify when this conversion fires */
  @Column({ type: 'jsonb', default: [] })
  platforms: string[]; // ['meta', 'google', 'tiktok']

  /** Meta CAPI event name: Purchase, Lead, CompleteRegistration, etc. */
  @Column({ name: 'meta_event_name', type: 'varchar', nullable: true })
  metaEventName: string | null;

  /** Google Ads conversion action ID */
  @Column({ name: 'google_conversion_action', type: 'varchar', nullable: true })
  googleConversionAction: string | null;

  /** TikTok event name: CompletePayment, SubmitForm, Contact, etc. */
  @Column({ name: 'tiktok_event_name', type: 'varchar', nullable: true })
  tiktokEventName: string | null;

  /** LinkedIn conversion ID */
  @Column({ name: 'linkedin_conversion_id', type: 'varchar', nullable: true })
  linkedinConversionId: string | null;

  /** Whether to include a monetary value with the conversion */
  @Column({ name: 'include_value', type: 'boolean', default: false })
  includeValue: boolean;

  /** Default value (if includeValue is true and no value is provided) */
  @Column({ name: 'default_value', type: 'decimal', precision: 12, scale: 2, nullable: true })
  defaultValue: number | null;

  /** Currency code for value */
  @Column({ type: 'varchar', length: 3, default: 'COP' })
  currency: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
