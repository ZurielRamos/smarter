import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SmsSendResult {
  success: boolean;
  subId?: string;
  error?: string;
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly username: string;
  private readonly token: string;

  constructor(private readonly configService: ConfigService) {
    this.username = this.configService.get<string>('LABSMOBILE_USERNAME', '');
    this.token = this.configService.get<string>('LABSMOBILE_TOKEN', '');
  }

  /**
   * Send a single SMS via LabsMobile API.
   * Phone must be in international format (e.g. 573001234567).
   */
  async sendSms(phone: string, message: string, sender?: string): Promise<SmsSendResult> {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    if (!cleanPhone) return { success: false, error: 'invalid_phone' };

    const params = new URLSearchParams({
      username: this.username,
      password: this.token,
      msisdn: cleanPhone,
      message,
    });
    if (sender) params.append('sender', sender);

    try {
      const res = await fetch(
        `https://api.labsmobile.com/get/send.php?${params.toString()}`,
      );

      const text = await res.text();

      if (!res.ok) {
        this.logger.warn(`[SMS] HTTP ${res.status} for ${cleanPhone}`);
        return { success: false, error: `http_${res.status}` };
      }

      // Parse XML response: <response><code>0</code><message>...</message><subid>...</subid></response>
      const codeMatch = text.match(/<code>(\d+)<\/code>/);
      const subIdMatch = text.match(/<subid>([^<]+)<\/subid>/);
      const msgMatch = text.match(/<message>([^<]+)<\/message>/);

      const code = codeMatch ? parseInt(codeMatch[1]) : -1;

      if (code === 0) {
        return { success: true, subId: subIdMatch?.[1] || undefined };
      }

      return { success: false, error: msgMatch?.[1] || `code_${code}` };
    } catch (err) {
      this.logger.error(`[SMS] Error sending to ${cleanPhone}:`, err);
      return { success: false, error: String(err) };
    }
  }

  /**
   * Check account balance (credits available).
   */
  async getBalance(): Promise<number | null> {
    try {
      const params = new URLSearchParams({
        username: this.username,
        password: this.token,
      });
      const res = await fetch(`https://api.labsmobile.com/get/balance.php?${params.toString()}`);
      const text = await res.text();
      const match = text.match(/<messages>([\d.]+)<\/messages>/);
      return match ? parseFloat(match[1]) : null;
    } catch {
      return null;
    }
  }
}
