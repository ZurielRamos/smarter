import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';

export interface GoogleSendParams {
  measurementId: string;
  apiSecret: string;
  eventName: string;
  eventTime: number;
  gclid?: string;
  email?: string;
  phone?: string;
  value?: number;
  currency?: string;
  clientId?: string;
}

export interface GoogleSendResult {
  success: boolean;
  httpStatus: number;
  responseBody: Record<string, any> | null;
  error?: string;
}

@Injectable()
export class GoogleDispatcher {
  private readonly logger = new Logger(GoogleDispatcher.name);

  /**
   * Send a conversion event to Google Analytics 4 via Measurement Protocol.
   * https://developers.google.com/analytics/devguides/collection/protocol/ga4
   *
   * Events sent here appear in GA4 and can be imported into Google Ads
   * as conversion actions for campaign optimization.
   */
  async send(params: GoogleSendParams): Promise<GoogleSendResult> {
    const url = `https://www.google-analytics.com/mp/collect?measurement_id=${params.measurementId}&api_secret=${params.apiSecret}`;

    // Generate a client_id (required) - use hashed email/phone as stable identifier
    const clientId = params.clientId || this.generateClientId(params.email, params.phone);

    const eventParams: Record<string, any> = {};
    if (params.value !== undefined && params.value !== null) {
      eventParams.value = params.value;
      eventParams.currency = params.currency || 'COP';
    }
    if (params.gclid) {
      eventParams.gclid = params.gclid;
    }

    const body = {
      client_id: clientId,
      timestamp_micros: String(params.eventTime * 1000000),
      events: [{
        name: params.eventName,
        params: {
          ...eventParams,
          engagement_time_msec: '1',
        },
      }],
      user_properties: {
        ...(params.email ? { email: { value: params.email } } : {}),
        ...(params.phone ? { phone: { value: params.phone } } : {}),
      },
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      // GA4 Measurement Protocol returns 204 on success with no body
      if (response.status === 204 || response.ok) {
        this.logger.log(`[GA4] Event '${params.eventName}' sent to ${params.measurementId}`);
        return { success: true, httpStatus: response.status, responseBody: null };
      } else {
        const responseBody = await response.json().catch(() => null);
        const errorMsg = responseBody?.validationMessages?.[0]?.description || `HTTP ${response.status}`;
        this.logger.warn(`[GA4] Failed: ${errorMsg}`);
        return { success: false, httpStatus: response.status, responseBody, error: errorMsg };
      }
    } catch (error) {
      this.logger.error(`[GA4] Network error:`, error);
      return { success: false, httpStatus: 0, responseBody: null, error: String(error) };
    }
  }

  /**
   * Generate a stable client_id from user data.
   * GA4 uses client_id to identify users across events.
   */
  private generateClientId(email?: string, phone?: string): string {
    const seed = email || phone || `anon_${Date.now()}`;
    const hash = createHash('sha256').update(seed).digest('hex');
    return `${hash.slice(0, 8)}.${Math.floor(Date.now() / 1000)}`;
  }
}
