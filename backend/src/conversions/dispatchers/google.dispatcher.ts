import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';

export interface GoogleSendParams {
  customerId: string;
  conversionActionId: string;
  developerToken: string;
  eventName: string;
  eventTime: number;
  gclid?: string;
  email?: string;
  phone?: string;
  value?: number;
  currency?: string;
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
   * Send an offline conversion to Google Ads via the Upload Click Conversions endpoint.
   * https://developers.google.com/google-ads/api/docs/conversions/upload-clicks
   *
   * Note: For production, this should use the Google Ads API with OAuth.
   * This implementation uses the simplified REST approach for enhanced conversions.
   */
  async send(params: GoogleSendParams): Promise<GoogleSendResult> {
    const customerId = params.customerId.replace(/-/g, '');
    const url = `https://googleads.googleapis.com/v17/customers/${customerId}:uploadClickConversions`;

    const userIdentifiers: any[] = [];
    if (params.email) {
      userIdentifiers.push({ hashedEmail: this.hash(params.email.toLowerCase().trim()) });
    }
    if (params.phone) {
      userIdentifiers.push({ hashedPhoneNumber: this.hash(this.normalizePhone(params.phone)) });
    }

    const conversion: Record<string, any> = {
      conversionAction: `customers/${customerId}/conversionActions/${params.conversionActionId}`,
      conversionDateTime: this.formatDateTime(params.eventTime),
      userIdentifiers,
    };

    if (params.gclid) {
      conversion.gclid = params.gclid;
    }

    if (params.value !== undefined && params.value !== null) {
      conversion.conversionValue = params.value;
      conversion.currencyCode = params.currency || 'COP';
    }

    const body = {
      conversions: [conversion],
      partialFailure: true,
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'developer-token': params.developerToken,
          'login-customer-id': customerId,
        },
        body: JSON.stringify(body),
      });

      const responseBody = await response.json();

      if (response.ok && !responseBody.partialFailureError) {
        this.logger.log(`[Google Ads] Conversion uploaded for customer ${customerId}`);
        return { success: true, httpStatus: response.status, responseBody };
      } else {
        const errorMsg = responseBody.partialFailureError?.message || responseBody.error?.message || 'Unknown error';
        this.logger.warn(`[Google Ads] Failed: ${errorMsg}`);
        return { success: false, httpStatus: response.status, responseBody, error: errorMsg };
      }
    } catch (error) {
      this.logger.error(`[Google Ads] Network error:`, error);
      return { success: false, httpStatus: 0, responseBody: null, error: String(error) };
    }
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private normalizePhone(phone: string): string {
    const digits = phone.replace(/[^0-9]/g, '');
    return digits.startsWith('+') ? digits : `+${digits}`;
  }

  private formatDateTime(epochSeconds: number): string {
    const d = new Date(epochSeconds * 1000);
    // Format: yyyy-mm-dd hh:mm:ss+00:00
    return d.toISOString().replace('T', ' ').replace('Z', '+00:00').slice(0, 25) + '+00:00';
  }
}
