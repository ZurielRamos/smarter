import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';

export interface MetaSendParams {
  pixelId: string;
  accessToken: string;
  testEventCode?: string;
  eventName: string;
  eventTime: number;
  fbc?: string;
  fbp?: string;
  clickId?: string;
  email?: string;
  phone?: string;
  ipAddress?: string;
  userAgent?: string;
  value?: number;
  currency?: string;
}

export interface MetaSendResult {
  success: boolean;
  httpStatus: number;
  responseBody: Record<string, any> | null;
  error?: string;
}

@Injectable()
export class MetaDispatcher {
  private readonly logger = new Logger(MetaDispatcher.name);

  /**
   * Send a conversion event to Meta Conversions API (CAPI).
   * https://developers.facebook.com/docs/marketing-api/conversions-api
   */
  async send(params: MetaSendParams): Promise<MetaSendResult> {
    const url = `https://graph.facebook.com/v21.0/${params.pixelId}/events`;

    const userData: Record<string, any> = {};

    // Hashed PII (Meta requires SHA-256 lowercase)
    if (params.email) userData.em = [this.hash(params.email.toLowerCase().trim())];
    if (params.phone) userData.ph = [this.hash(this.normalizePhone(params.phone))];
    if (params.ipAddress) userData.client_ip_address = params.ipAddress;
    if (params.userAgent) userData.client_user_agent = params.userAgent;
    if (params.fbc) userData.fbc = params.fbc;
    if (params.fbp) userData.fbp = params.fbp;

    // Build _fbc from click_id if not present
    if (!userData.fbc && params.clickId) {
      userData.fbc = `fb.1.${params.eventTime * 1000}.${params.clickId}`;
    }

    const eventData: Record<string, any> = {
      event_name: params.eventName,
      event_time: params.eventTime,
      action_source: 'website',
      event_id: `${params.eventName}_${params.eventTime}_${Math.random().toString(36).slice(2, 10)}`,
      user_data: userData,
    };

    if (params.value !== undefined && params.value !== null) {
      eventData.custom_data = {
        value: params.value,
        currency: params.currency || 'COP',
      };
    }

    const body: Record<string, any> = {
      data: [eventData],
    };

    if (params.testEventCode) {
      body.test_event_code = params.testEventCode;
    }

    try {
      const response = await fetch(`${url}?access_token=${params.accessToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const responseBody = await response.json();

      if (response.ok) {
        this.logger.log(`[Meta CAPI] Event ${params.eventName} sent successfully to pixel ${params.pixelId}`);
        return {
          success: true,
          httpStatus: response.status,
          responseBody,
        };
      } else {
        const errorMsg = responseBody?.error?.message || 'Unknown error';
        this.logger.warn(`[Meta CAPI] Failed to send event: ${errorMsg}`);
        return {
          success: false,
          httpStatus: response.status,
          responseBody,
          error: errorMsg,
        };
      }
    } catch (error) {
      this.logger.error(`[Meta CAPI] Network error:`, error);
      return {
        success: false,
        httpStatus: 0,
        responseBody: null,
        error: String(error),
      };
    }
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private normalizePhone(phone: string): string {
    // Remove all non-numeric, keep country code
    return phone.replace(/[^0-9]/g, '');
  }
}
