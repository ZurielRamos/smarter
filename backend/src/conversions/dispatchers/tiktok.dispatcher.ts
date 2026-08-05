import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';

export interface TikTokSendParams {
  pixelCode: string;
  accessToken: string;
  eventName: string;
  eventTime: number;
  ttclid?: string;
  email?: string;
  phone?: string;
  ipAddress?: string;
  userAgent?: string;
  value?: number;
  currency?: string;
}

export interface TikTokSendResult {
  success: boolean;
  httpStatus: number;
  responseBody: Record<string, any> | null;
  error?: string;
}

@Injectable()
export class TikTokDispatcher {
  private readonly logger = new Logger(TikTokDispatcher.name);

  /**
   * Send a conversion event to TikTok Events API.
   * https://business-api.tiktok.com/portal/docs?id=1741601162187777
   */
  async send(params: TikTokSendParams): Promise<TikTokSendResult> {
    const url = 'https://business-api.tiktok.com/open_api/v1.3/event/track/';

    const user: Record<string, any> = {};
    if (params.email) user.email = this.hash(params.email.toLowerCase().trim());
    if (params.phone) user.phone = this.hash(this.normalizePhone(params.phone));
    if (params.ipAddress) user.ip = params.ipAddress;
    if (params.userAgent) user.user_agent = params.userAgent;
    if (params.ttclid) user.ttclid = params.ttclid;

    const properties: Record<string, any> = {};
    if (params.value !== undefined && params.value !== null) {
      properties.value = params.value;
      properties.currency = params.currency || 'COP';
    }

    const eventData: Record<string, any> = {
      event: params.eventName,
      event_time: params.eventTime,
      event_id: `${params.eventName}_${params.eventTime}_${Math.random().toString(36).slice(2, 10)}`,
      user,
    };

    if (Object.keys(properties).length > 0) {
      eventData.properties = properties;
    }

    const body = {
      pixel_code: params.pixelCode,
      event: 'track',
      timestamp: new Date(params.eventTime * 1000).toISOString(),
      context: {
        user,
      },
      data: [eventData],
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Access-Token': params.accessToken,
        },
        body: JSON.stringify(body),
      });

      const responseBody = await response.json();

      if (response.ok && responseBody.code === 0) {
        this.logger.log(`[TikTok] Event ${params.eventName} sent to pixel ${params.pixelCode}`);
        return { success: true, httpStatus: response.status, responseBody };
      } else {
        const errorMsg = responseBody.message || 'Unknown error';
        this.logger.warn(`[TikTok] Failed: ${errorMsg}`);
        return { success: false, httpStatus: response.status, responseBody, error: errorMsg };
      }
    } catch (error) {
      this.logger.error(`[TikTok] Network error:`, error);
      return { success: false, httpStatus: 0, responseBody: null, error: String(error) };
    }
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private normalizePhone(phone: string): string {
    return phone.replace(/[^0-9+]/g, '');
  }
}
