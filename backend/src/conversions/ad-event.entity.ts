import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ClientRecord } from '../records/record.entity';

/**
 * Attribution windows per platform (in days).
 * Used to calculate expires_at when creating an AdEvent.
 */
export const ATTRIBUTION_WINDOWS: Record<string, number> = {
  meta: 28,
  google: 90,
  tiktok: 28,
  linkedin: 90,
  twitter: 30,
  organic: 30,
  direct: 7,
};

@Entity('ad_events')
@Index(['tenantId', 'recordId'])
@Index(['tenantId', 'sessionId'])
@Index(['recordId', 'status', 'expiresAt'])
@Index(['tenantId', 'status', 'createdAt'])
export class AdEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'record_id', type: 'uuid', nullable: true })
  recordId: string | null;

  @ManyToOne(() => ClientRecord, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'record_id' })
  record: ClientRecord | null;

  /** Session identifier to group events from the same visit */
  @Column({ name: 'session_id', type: 'varchar', nullable: true })
  sessionId: string | null;

  /** Ad platform: meta | google | tiktok | linkedin | twitter | organic | direct */
  @Column({ type: 'varchar', length: 20 })
  platform: string;

  /** The actual click ID value */
  @Column({ name: 'click_id', type: 'varchar', nullable: true })
  clickId: string | null;

  /** Type of click ID: fbclid | gclid | ttclid | li_fat_id | twclid */
  @Column({ name: 'click_id_type', type: 'varchar', length: 20, nullable: true })
  clickIdType: string | null;

  /** Meta _fbc cookie */
  @Column({ type: 'varchar', nullable: true })
  fbc: string | null;

  /** Meta _fbp cookie */
  @Column({ type: 'varchar', nullable: true })
  fbp: string | null;

  // === UTM params ===
  @Column({ name: 'utm_source', type: 'varchar', nullable: true })
  utmSource: string | null;

  @Column({ name: 'utm_medium', type: 'varchar', nullable: true })
  utmMedium: string | null;

  @Column({ name: 'utm_campaign', type: 'varchar', nullable: true })
  utmCampaign: string | null;

  @Column({ name: 'utm_content', type: 'varchar', nullable: true })
  utmContent: string | null;

  @Column({ name: 'utm_term', type: 'varchar', nullable: true })
  utmTerm: string | null;

  // === Context ===
  @Column({ type: 'varchar', nullable: true })
  referrer: string | null;

  @Column({ name: 'landing_page', type: 'varchar', length: 1000, nullable: true })
  landingPage: string | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent: string | null;

  /** Extra platform-specific data (ad_id, adset_id, campaign_id, etc.) */
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null;

  // === Lifecycle ===

  /** active | expired | converted | orphan */
  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: string;

  /** When this event was used to report a conversion */
  @Column({ name: 'converted_at', type: 'timestamptz', nullable: true })
  convertedAt: Date | null;

  /** When this event expires (based on platform attribution window) */
  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
