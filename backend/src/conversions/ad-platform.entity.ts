import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Stores ad platform credentials per tenant.
 * Each tenant can connect multiple platforms.
 */
@Entity('ad_platforms')
@Index(['tenantId', 'platform'], { unique: true })
export class AdPlatform {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  /** meta | google | tiktok | linkedin | ga4 */
  @Column({ type: 'varchar', length: 20 })
  platform: string;

  /** Display name: "Meta Pixel Principal", "Google Ads - Cuenta 1" */
  @Column({ type: 'varchar', length: 100, nullable: true })
  name: string | null;

  /** Platform-specific credentials stored as JSON */
  @Column({ type: 'jsonb' })
  credentials: Record<string, any>;
  /*
    Meta:    { pixelId, accessToken, testEventCode? }
    Google:  { customerId, conversionActionId, developerToken, refreshToken }
    TikTok:  { pixelCode, accessToken }
    LinkedIn:{ accountId, accessToken }
    GA4:     { measurementId, apiSecret }
  */

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  /** Last time a conversion was successfully sent */
  @Column({ name: 'last_sent_at', type: 'timestamptz', nullable: true })
  lastSentAt: Date | null;

  /** Total conversions sent successfully */
  @Column({ name: 'total_sent', type: 'integer', default: 0 })
  totalSent: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
