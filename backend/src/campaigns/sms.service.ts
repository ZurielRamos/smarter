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

  /** Cabecera de autenticación Basic (username:tokenApi) para la API JSON. */
  private authHeader(): string {
    const credentials = Buffer.from(`${this.username}:${this.token}`).toString('base64');
    return `Basic ${credentials}`;
  }

  /**
   * Send a single SMS via LabsMobile HTTP/POST JSON API.
   * Phone must be in international format (e.g. 573001234567).
   *
   * Endpoint: POST https://api.labsmobile.com/json/send
   * Auth: Basic (username:tokenApi). Respuesta JSON: { code, message, subid }.
   * code === 0 (o "0") indica éxito.
   */
  async sendSms(phone: string, message: string, sender?: string): Promise<SmsSendResult> {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    if (!cleanPhone) return { success: false, error: 'invalid_phone' };

    const body: Record<string, any> = {
      message,
      recipient: [{ msisdn: cleanPhone }],
    };
    // Remitente alfanumérico (opcional). En la API JSON el campo es "tpoa".
    if (sender) body.tpoa = sender;

    try {
      const res = await fetch('https://api.labsmobile.com/json/send', {
        method: 'POST',
        headers: {
          Authorization: this.authHeader(),
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
      });

      const text = await res.text();

      // Log de la respuesta CRUDA de LabsMobile (siempre), para diagnóstico.
      this.logger.log(
        `[SMS] Respuesta LabsMobile para ${cleanPhone} — HTTP ${res.status}: ${text.substring(0, 500)}`,
      );

      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch {
        // Respuesta no-JSON: registrar el cuerpo para diagnóstico.
        this.logger.warn(`[SMS] Respuesta no-JSON de LabsMobile (HTTP ${res.status}): ${text.substring(0, 200)}`);
        return { success: false, error: `respuesta_invalida_http_${res.status}` };
      }

      // Log estructurado de la respuesta parseada.
      this.logger.log(`[SMS] Respuesta LabsMobile parseada para ${cleanPhone}: ${JSON.stringify(data)}`);

      // El code puede venir como número (0) o string ("0").
      const code = data?.code !== undefined ? String(data.code) : null;
      const apiMessage = data?.message || data?.description || '';

      if (code === '0') {
        return { success: true, subId: data?.subid ? String(data.subid) : undefined };
      }

      // Fallo: devolver el mensaje real de LabsMobile (o el code si no hay mensaje).
      const reason = apiMessage || (code ? `code_${code}` : `http_${res.status}`);
      this.logger.warn(`[SMS] Fallo al enviar a ${cleanPhone}: code=${code ?? 'null'} msg="${apiMessage}"`);
      return { success: false, error: reason };
    } catch (err) {
      this.logger.error(`[SMS] Error sending to ${cleanPhone}:`, err);
      return { success: false, error: String(err) };
    }
  }

  /**
   * Check account balance (credits available) via the JSON API.
   * Endpoint: GET https://api.labsmobile.com/json/balance
   */
  async getBalance(): Promise<number | null> {
    try {
      const res = await fetch('https://api.labsmobile.com/json/balance', {
        headers: {
          Authorization: this.authHeader(),
          Accept: 'application/json',
        },
      });
      const data = await res.json();
      // La respuesta trae el saldo en "credits" (o "balance" según versión).
      const raw = data?.credits ?? data?.balance ?? data?.messages;
      const value = typeof raw === 'string' ? parseFloat(raw) : raw;
      return typeof value === 'number' && !Number.isNaN(value) ? value : null;
    } catch {
      return null;
    }
  }
}
