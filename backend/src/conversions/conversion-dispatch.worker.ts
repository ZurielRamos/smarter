import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdEvent } from './ad-event.entity';
import { ConversionEvent } from './conversion-event.entity';
import { AdPlatform } from './ad-platform.entity';
import { ConversionLog } from './conversion-log.entity';
import { MetaDispatcher } from './dispatchers/meta.dispatcher';
import { GoogleDispatcher } from './dispatchers/google.dispatcher';
import { TikTokDispatcher } from './dispatchers/tiktok.dispatcher';

export interface ConversionDispatchJobData {
  tenantId: string;
  recordId: string;
  conversionEventId: string;
  adEventId: string;
  adPlatformId: string;
  platform: string;
  email?: string;
  phone?: string;
  value?: number;
}

@Processor('conversion-dispatch', {
  concurrency: 5,
  limiter: { max: 10, duration: 1000 },
})
export class ConversionDispatchWorker extends WorkerHost {
  private readonly logger = new Logger(ConversionDispatchWorker.name);

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
    private readonly googleDispatcher: GoogleDispatcher,
    private readonly tiktokDispatcher: TikTokDispatcher,
  ) {
    super();
  }

  async process(job: Job<ConversionDispatchJobData>): Promise<void> {
    const { tenantId, recordId, conversionEventId, adEventId, adPlatformId, platform, email, phone, value } = job.data;
    this.logger.log(`[Worker] Dispatching conversion to ${platform} (attempt ${job.attemptsMade + 1})`);

    const [convEvent, adEvent, platformConfig] = await Promise.all([
      this.conversionEventRepo.findOneBy({ id: conversionEventId }),
      this.adEventRepo.findOneBy({ id: adEventId }),
      this.adPlatformRepo.findOneBy({ id: adPlatformId }),
    ]);

    if (!convEvent || !adEvent || !platformConfig) {
      this.logger.warn(`[Worker] Missing data for job ${job.id}, skipping`);
      return;
    }

    const convValue = value ?? (convEvent.defaultValue ? Number(convEvent.defaultValue) : undefined);
    let result: { success: boolean; httpStatus: number; responseBody: any; error?: string };

    if (platform === 'meta') {
      result = await this.metaDispatcher.send({
        pixelId: platformConfig.credentials.pixelId,
        accessToken: platformConfig.credentials.accessToken,
        testEventCode: platformConfig.credentials.testEventCode,
        eventName: convEvent.metaEventName || 'Lead',
        eventTime: Math.floor(Date.now() / 1000),
        fbc: adEvent.fbc || undefined,
        fbp: adEvent.fbp || undefined,
        clickId: adEvent.clickId || undefined,
        email,
        phone,
        ipAddress: adEvent.ipAddress || undefined,
        userAgent: adEvent.userAgent || undefined,
        value: convValue,
        currency: convEvent.currency,
      });
    } else if (platform === 'google') {
      // Refresh token if needed
      let accessToken = platformConfig.credentials.accessToken;
      if (platformConfig.credentials.expiresAt && new Date(platformConfig.credentials.expiresAt) < new Date()) {
        accessToken = await this.refreshGoogleToken(platformConfig) || accessToken;
      }
      result = await this.googleDispatcher.send({
        accessToken,
        developerToken: platformConfig.credentials.developerToken,
        customerId: platformConfig.credentials.customerId,
        eventName: convEvent.googleConversionAction || 'purchase',
        eventTime: Math.floor(Date.now() / 1000),
        gclid: adEvent.clickId || undefined,
        email,
        phone,
        value: convValue,
        currency: convEvent.currency,
      });
    } else if (platform === 'tiktok') {
      result = await this.tiktokDispatcher.send({
        pixelCode: platformConfig.credentials.pixelCode,
        accessToken: platformConfig.credentials.accessToken,
        eventName: convEvent.tiktokEventName || 'CompletePayment',
        eventTime: Math.floor(Date.now() / 1000),
        ttclid: adEvent.clickId || undefined,
        email,
        phone,
        ipAddress: adEvent.ipAddress || undefined,
        userAgent: adEvent.userAgent || undefined,
        value: convValue,
        currency: convEvent.currency,
      });
    } else {
      this.logger.warn(`[Worker] Unknown platform ${platform}`);
      return;
    }

    // Save log
    const log = this.conversionLogRepo.create({
      tenantId,
      recordId,
      adEventId,
      conversionEventId,
      adPlatformId,
      platform,
      eventName: platform === 'meta' ? (convEvent.metaEventName || 'Lead') : platform === 'tiktok' ? (convEvent.tiktokEventName || 'CompletePayment') : convEvent.name,
      status: result.success ? 'success' : 'failed',
      httpStatus: result.httpStatus,
      responseBody: result.responseBody,
      errorMessage: result.error || null,
      value: convValue || null,
      currency: convEvent.currency,
    });
    await this.conversionLogRepo.save(log);

    if (result.success) {
      // Update platform stats
      await this.adPlatformRepo.update(adPlatformId, {
        lastSentAt: new Date(),
        totalSent: () => 'total_sent + 1',
      } as any);
      // Mark ad event as converted
      await this.adEventRepo.update(adEventId, { status: 'converted', convertedAt: new Date() });
      this.logger.log(`[Worker] Successfully dispatched to ${platform}`);
    } else {
      // If it's a retryable error (5xx or network), throw to trigger retry
      if (result.httpStatus >= 500 || result.httpStatus === 0) {
        throw new Error(`${platform} returned ${result.httpStatus}: ${result.error}`);
      }
      // 4xx errors are not retryable (bad credentials, invalid data)
      this.logger.warn(`[Worker] Non-retryable error from ${platform}: ${result.error}`);
    }
  }

  private async refreshGoogleToken(platform: AdPlatform): Promise<string | null> {
    if (!platform.credentials?.refreshToken) return null;
    const clientId = process.env.GOOGLE_ADS_CLIENT_ID || '';
    const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET || '';
    if (!clientId || !clientSecret) return null;

    try {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          refresh_token: platform.credentials.refreshToken,
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'refresh_token',
        }),
      });
      const tokens = await response.json();
      if (!tokens.access_token) return null;

      await this.adPlatformRepo.update(platform.id, {
        credentials: {
          ...platform.credentials,
          accessToken: tokens.access_token,
          expiresAt: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
        },
      } as any);

      return tokens.access_token;
    } catch {
      return null;
    }
  }
}
