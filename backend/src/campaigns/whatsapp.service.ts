import { Injectable } from '@nestjs/common';

export interface WhatsAppTemplate {
  name: string;
  language: string;
  status: string;
  category: string;
  components: any[];
}

@Injectable()
export class WhatsAppService {
  /**
   * Send a WhatsApp message via Onurix
   * Endpoint: POST https://www.onurix.com/api/v1/whatsappsend
   * 
   * URL params: client, key, phone-sender-id, template-id
   * Body: { phone, header, body, button }
   *   - header: [{ type: "text", value: "string" }]
   *   - body: [{ type: "text", value: "string" }]
   *   - button: [{ type: "text", value: "string" }]
   */
  async sendTemplate(
    phone: string,
    templateId: string,
    _languageCode: string,
    variables: Record<string, string>,
    credentials?: Record<string, string>,
    _provider?: string,
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const client = credentials?.client;
    const key = credentials?.key;
    const phoneSenderId = credentials?.phoneSenderId;

    if (!client || !key || !phoneSenderId) {
      return { success: false, error: 'Credenciales de Onurix WhatsApp no configuradas' };
    }

    // Build body parameters from variables
    const bodyParams = Object.entries(variables)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([, value]) => ({ type: 'text', value }));

    const requestBody: any = {
      phone: phone.startsWith('+') ? phone.slice(1) : phone,
    };

    // Add body params if any
    if (bodyParams.length > 0) {
      requestBody.body = bodyParams;
    }

    try {
      const url = `https://www.onurix.com/api/v1/whatsapp/send?key=${key}&client=${client}&template-id=${templateId}&phone-sender-id=${phoneSenderId}`;

      console.log('[WhatsApp/Onurix] URL:', url);
      console.log('[WhatsApp/Onurix] Body:', JSON.stringify(requestBody));

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const text = await response.text();
      let result: any;
      try {
        result = JSON.parse(text);
      } catch {
        console.error('[WhatsApp/Onurix] Non-JSON response:', text.substring(0, 200));
        return { success: false, error: `Onurix respondió con HTML (status ${response.status}). Verifica las credenciales y el endpoint.` };
      }

      if (response.ok && result.id) {
        return { success: true, messageId: result.id };
      } else {
        console.error('[WhatsApp/Onurix] Send error:', result);
        return { success: false, error: result.msg || result.message || 'Error desconocido' };
      }
    } catch (error) {
      console.error('[WhatsApp/Onurix] Send exception:', error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * List templates from Meta WhatsApp Business API
   * Uses metaToken and metaBusinessId from the channel config credentials
   */
  async getTemplates(credentials?: Record<string, string>): Promise<WhatsAppTemplate[]> {
    const token = credentials?.metaToken;
    const businessId = credentials?.metaBusinessId;

    if (!token || !businessId) {
      return [];
    }

    try {
      const url = `https://graph.facebook.com/v21.0/${businessId}/message_templates?fields=name,language,status,category,components&limit=100`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        console.error('[WhatsApp/Meta] Error fetching templates:', response.status);
        return [];
      }

      const data = await response.json();
      return (data.data || [])
        .filter((t: any) => t.status === 'APPROVED')
        .map((t: any) => ({
          name: t.name,
          language: t.language,
          status: t.status,
          category: t.category,
          components: t.components || [],
        }));
    } catch (error) {
      console.error('[WhatsApp/Meta] Error fetching templates:', error);
      return [];
    }
  }
}
