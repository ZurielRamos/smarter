import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, IsNull, MoreThan } from 'typeorm';
import { AdEvent, ATTRIBUTION_WINDOWS } from './ad-event.entity';
import { ConversionEvent } from './conversion-event.entity';
import { AdPlatform } from './ad-platform.entity';
import { ConversionLog } from './conversion-log.entity';
import { MetaDispatcher } from './dispatchers/meta.dispatcher';

export interface TrackEventParams {
  tenantId: string;
  recordId?: string;
  sessionId?: string;
  platform: string;
  clickId?: string;
  clickIdType?: string;
  fbc?: string;
  fbp?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  referrer?: string;
  landingPage?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class ConversionsService {
  private readonly logger = new Logger(ConversionsService.name);

  constructor(
    @InjectRepository(AdEvent)
    private readonly adEventRepo: Repository<AdEvent>,
    @InjectRepository(ConversionEvent)
    private readonly conversionEventRepo: Repository<ConversionEvent>,
    @InjectRepository(AdPlatform)
    private readonly adPlatformRepo: Repository<AdPlatform>,
    @InjectRepository(ConversionLog)
    private readonly conversionLogRepo: Repository<ConversionLog>,
    private readonly metaDispatcher: MetaDispatcher,
  ) {}

  // ============================
  // AD EVENTS (Touchpoints)
  // ============================

  /**
   * Track an ad event (touchpoint). Called when a user clicks an ad link,
   * submits a form, or arrives via a tracked URL.
   */
  async trackEvent(params: TrackEventParams): Promise<AdEvent> {
    const windowDays = ATTRIBUTION_WINDOWS[params.platform] || 30;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + windowDays);

    const adEvent = this.adEventRepo.create({
      tenantId: params.tenantId,
      recordId: params.recordId || null,
      sessionId: params.sessionId || null,
      platform: params.platform,
      clickId: params.clickId || null,
      clickIdType: params.clickIdType || null,
      fbc: params.fbc || null,
      fbp: params.fbp || null,
      utmSource: params.utmSource || null,
      utmMedium: params.utmMedium || null,
      utmCampaign: params.utmCampaign || null,
      utmContent: params.utmContent || null,
      utmTerm: params.utmTerm || null,
      referrer: params.referrer || null,
      landingPage: params.landingPage || null,
      ipAddress: params.ipAddress || null,
      userAgent: params.userAgent || null,
      metadata: params.metadata || null,
      status: 'active',
      expiresAt,
    });

    return this.adEventRepo.save(adEvent);
  }

  /**
   * Detect platform from URL params and create the appropriate event.
   */
  async trackFromUrlParams(tenantId: string, params: Record<string, string>, context: { ipAddress?: string; userAgent?: string; referrer?: string; landingPage?: string; recordId?: string; sessionId?: string }): Promise<AdEvent | null> {
    let platform = 'direct';
    let clickId: string | null = null;
    let clickIdType: string | null = null;

    if (params.fbclid) {
      platform = 'meta';
      clickId = params.fbclid;
      clickIdType = 'fbclid';
    } else if (params.gclid) {
      platform = 'google';
      clickId = params.gclid;
      clickIdType = 'gclid';
    } else if (params.ttclid) {
      platform = 'tiktok';
      clickId = params.ttclid;
      clickIdType = 'ttclid';
    } else if (params.li_fat_id) {
      platform = 'linkedin';
      clickId = params.li_fat_id;
      clickIdType = 'li_fat_id';
    } else if (params.twclid) {
      platform = 'twitter';
      clickId = params.twclid;
      clickIdType = 'twclid';
    } else if (params.utm_source) {
      platform = 'organic';
    }

    // Don't track direct visits with no attribution data
    if (platform === 'direct' && !params.utm_source) return null;

    return this.trackEvent({
      tenantId,
      recordId: context.recordId,
      sessionId: context.sessionId,
      platform,
      clickId: clickId || undefined,
      clickIdType: clickIdType || undefined,
      fbc: params._fbc || params.fbc || undefined,
      fbp: params._fbp || params.fbp || undefined,
      utmSource: params.utm_source,
      utmMedium: params.utm_medium,
      utmCampaign: params.utm_campaign,
      utmContent: params.utm_content,
      utmTerm: params.utm_term,
      referrer: context.referrer,
      landingPage: context.landingPage,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  }

  /**
   * Link orphan AdEvents to a record (by session or phone/email match).
   */
  async linkEventsToRecord(tenantId: string, recordId: string, sessionId?: string): Promise<number> {
    const qb = this.adEventRepo.createQueryBuilder()
      .update(AdEvent)
      .set({ recordId })
      .where('tenant_id = :tenantId', { tenantId })
      .andWhere('record_id IS NULL');

    if (sessionId) {
      qb.andWhere('session_id = :sessionId', { sessionId });
    }

    const result = await qb.execute();
    return result.affected || 0;
  }

  /**
   * Get all active (non-expired) ad events for a record.
   */
  async getActiveEventsForRecord(recordId: string): Promise<AdEvent[]> {
    return this.adEventRepo.find({
      where: {
        recordId,
        status: 'active',
        expiresAt: MoreThan(new Date()),
      },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get all ad events for a record (including expired, for history).
   */
  async getAllEventsForRecord(recordId: string): Promise<AdEvent[]> {
    return this.adEventRepo.find({
      where: { recordId },
      order: { createdAt: 'DESC' },
    });
  }

  // ============================
  // CONVERSION EVENTS (Config)
  // ============================

  async getConversionEvents(tenantId: string): Promise<ConversionEvent[]> {
    return this.conversionEventRepo.find({ where: { tenantId }, order: { createdAt: 'ASC' } });
  }

  async createConversionEvent(data: Partial<ConversionEvent>): Promise<ConversionEvent> {
    const event = this.conversionEventRepo.create(data);
    return this.conversionEventRepo.save(event);
  }

  async updateConversionEvent(id: string, data: Partial<ConversionEvent>): Promise<ConversionEvent> {
    await this.conversionEventRepo.update(id, data as any);
    return this.conversionEventRepo.findOneByOrFail({ id });
  }

  async deleteConversionEvent(id: string): Promise<void> {
    await this.conversionEventRepo.delete(id);
  }

  // ============================
  // AD PLATFORMS (Credentials)
  // ============================

  async getAdPlatforms(tenantId: string): Promise<AdPlatform[]> {
    return this.adPlatformRepo.find({ where: { tenantId }, order: { createdAt: 'ASC' } });
  }

  async createAdPlatform(data: Partial<AdPlatform>): Promise<AdPlatform> {
    const platform = this.adPlatformRepo.create(data);
    return this.adPlatformRepo.save(platform);
  }

  async updateAdPlatform(id: string, data: Partial<AdPlatform>): Promise<AdPlatform> {
    await this.adPlatformRepo.update(id, data as any);
    return this.adPlatformRepo.findOneByOrFail({ id });
  }

  async deleteAdPlatform(id: string): Promise<void> {
    await this.adPlatformRepo.delete(id);
  }

  // ============================
  // DISPATCH CONVERSIONS
  // ============================

  /**
   * Called when a contact reaches a conversion milestone (e.g., status changed to "venta").
   * Finds matching conversion events, active ad events, and dispatches to platforms.
   */
  async dispatchConversion(params: {
    tenantId: string;
    recordId: string;
    triggerType: string;
    triggerValue: string;
    value?: number;
    email?: string;
    phone?: string;
  }): Promise<ConversionLog[]> {
    const logs: ConversionLog[] = [];

    // 1. Find matching conversion events for this tenant + trigger
    const conversionEvents = await this.conversionEventRepo.find({
      where: {
        tenantId: params.tenantId,
        triggerType: params.triggerType,
        triggerValue: params.triggerValue,
        isActive: true,
      },
    });

    if (conversionEvents.length === 0) return logs;

    // 2. Get active ad events for this record
    const adEvents = await this.getActiveEventsForRecord(params.recordId);
    if (adEvents.length === 0) return logs;

    // 3. Get connected platforms for this tenant
    const platforms = await this.adPlatformRepo.find({
      where: { tenantId: params.tenantId, isActive: true },
    });

    if (platforms.length === 0) return logs;

    // 4. For each conversion event, dispatch to relevant platforms
    for (const convEvent of conversionEvents) {
      for (const platformName of convEvent.platforms) {
        const platformConfig = platforms.find((p) => p.platform === platformName);
        if (!platformConfig) continue;

        // Find the best ad event for this platform (most recent, non-expired)
        const matchingAdEvent = adEvents.find((ae) => ae.platform === platformName);
        if (!matchingAdEvent) continue;

        const convValue = params.value ?? convEvent.defaultValue ?? undefined;

        // Dispatch based on platform
        let log: ConversionLog;
        try {
          if (platformName === 'meta') {
            log = await this.dispatchToMeta(params, convEvent, matchingAdEvent, platformConfig, convValue);
          } else {
            // Other platforms: mark as skipped for now
            log = this.conversionLogRepo.create({
              tenantId: params.tenantId,
              recordId: params.recordId,
              adEventId: matchingAdEvent.id,
              conversionEventId: convEvent.id,
              adPlatformId: platformConfig.id,
              platform: platformName,
              eventName: convEvent.name,
              status: 'skipped',
              errorMessage: `Dispatcher for ${platformName} not implemented yet`,
              value: convValue || null,
              currency: convEvent.currency,
            });
            log = await this.conversionLogRepo.save(log);
          }
        } catch (error) {
          log = this.conversionLogRepo.create({
            tenantId: params.tenantId,
            recordId: params.recordId,
            adEventId: matchingAdEvent.id,
            conversionEventId: convEvent.id,
            adPlatformId: platformConfig.id,
            platform: platformName,
            eventName: convEvent.name,
            status: 'failed',
            errorMessage: String(error).substring(0, 500),
            value: convValue || null,
            currency: convEvent.currency,
          });
          log = await this.conversionLogRepo.save(log);
        }

        logs.push(log);

        // Mark ad event as converted
        await this.adEventRepo.update(matchingAdEvent.id, { status: 'converted', convertedAt: new Date() });
      }
    }

    return logs;
  }

  private async dispatchToMeta(
    params: { tenantId: string; recordId: string; email?: string; phone?: string },
    convEvent: ConversionEvent,
    adEvent: AdEvent,
    platform: AdPlatform,
    value?: number,
  ): Promise<ConversionLog> {
    const result = await this.metaDispatcher.send({
      pixelId: platform.credentials.pixelId,
      accessToken: platform.credentials.accessToken,
      testEventCode: platform.credentials.testEventCode,
      eventName: convEvent.metaEventName || 'Lead',
      eventTime: Math.floor(Date.now() / 1000),
      fbc: adEvent.fbc || undefined,
      fbp: adEvent.fbp || undefined,
      clickId: adEvent.clickId || undefined,
      email: params.email,
      phone: params.phone,
      ipAddress: adEvent.ipAddress || undefined,
      userAgent: adEvent.userAgent || undefined,
      value: value,
      currency: convEvent.currency,
    });

    const log = this.conversionLogRepo.create({
      tenantId: params.tenantId,
      recordId: params.recordId,
      adEventId: adEvent.id,
      conversionEventId: convEvent.id,
      adPlatformId: platform.id,
      platform: 'meta',
      eventName: convEvent.metaEventName || 'Lead',
      status: result.success ? 'success' : 'failed',
      httpStatus: result.httpStatus,
      responseBody: result.responseBody,
      errorMessage: result.error || null,
      value: value || null,
      currency: convEvent.currency,
    });

    if (result.success) {
      await this.adPlatformRepo.update(platform.id, {
        lastSentAt: new Date(),
        totalSent: () => 'total_sent + 1',
      } as any);
    }

    return this.conversionLogRepo.save(log);
  }

  /**
   * Find an AdEvent by its tracking code (stored in metadata or sessionId).
   */
  async findByTrackingCode(tenantId: string, code: string): Promise<AdEvent | null> {
    return this.adEventRepo
      .createQueryBuilder('ae')
      .where('ae.tenant_id = :tenantId', { tenantId })
      .andWhere("ae.session_id = :sessionId", { sessionId: `trk_${code}` })
      .getOne();
  }

  /**
   * Link an existing AdEvent to a record.
   */
  async linkEventToRecord(adEventId: string, recordId: string): Promise<void> {
    await this.adEventRepo.update(adEventId, { recordId });
  }

  // ============================
  // MAINTENANCE
  // ============================

  /**
   * Mark expired ad events. Run via cron daily.
   */
  async expireOldEvents(): Promise<number> {
    const result = await this.adEventRepo.update(
      { status: 'active', expiresAt: LessThan(new Date()) },
      { status: 'expired' },
    );
    return result.affected || 0;
  }

  /**
   * Mark orphan events (no record_id after 30 days).
   */
  async markOrphanEvents(): Promise<number> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const result = await this.adEventRepo
      .createQueryBuilder()
      .update(AdEvent)
      .set({ status: 'orphan' })
      .where('record_id IS NULL')
      .andWhere('status = :status', { status: 'active' })
      .andWhere('created_at < :date', { date: thirtyDaysAgo })
      .execute();
    return result.affected || 0;
  }

  // ============================
  // CONVERSION LOGS
  // ============================

  async getConversionLogs(tenantId: string, limit = 50, offset = 0): Promise<{ data: ConversionLog[]; total: number }> {
    const [data, total] = await this.conversionLogRepo.findAndCount({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
    return { data, total };
  }

  async getConversionLogsByRecord(recordId: string): Promise<ConversionLog[]> {
    return this.conversionLogRepo.find({
      where: { recordId },
      order: { createdAt: 'DESC' },
    });
  }
}
