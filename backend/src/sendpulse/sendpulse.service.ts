import { Injectable, Logger } from '@nestjs/common';

/**
 * Cliente de la API de SendPulse (chatbots / WhatsApp).
 *
 * Autenticación: API key estática (formato `sp_apikey_...`) enviada como
 * `Authorization: Bearer {apiKey}`. La key NO vive en el .env: se guarda por
 * bandeja (Inbox.accessToken) y se pasa explícitamente en cada llamada, de modo
 * que cada tenant/bandeja usa su propia cuenta de SendPulse.
 *
 * Sigue el mismo patrón que EvolutionService: un único `request<T>` sobre
 * `fetch` nativo, con logging y manejo de errores homogéneo.
 */

const SENDPULSE_BASE_URL = 'https://api.sendpulse.com';

// SendPulse codifica la dirección del mensaje como número.
// 1 = entrante (del contacto hacia el negocio), 2 = saliente.
export const SP_DIRECTION_INBOUND = 1;

export interface SendPulseBot {
  id: string;
  name: string;
  channel: string; // "WHATSAPP" | "INSTAGRAM" | ...
  channel_data?: {
    phone?: number | string;
    name?: string;
  };
  inbox?: { total?: number; unread?: number };
}

export interface SendPulseContact {
  id: string;
  bot_id: string;
  channel_data?: {
    // Modelo de identidad de WhatsApp: BSUID "CO.xxx" cuando el usuario usa
    // username y NO expone teléfono. Puede venir vacío si hay teléfono real.
    user_id?: string;
    name?: string;
    username?: string;
    // Teléfono real (p. ej. 573017931148) cuando el contacto lo expone.
    // Presente en los contactos "clásicos"; ausente en los de identidad.
    phone?: string | number;
    photo?: string | null;
  };
  last_activity_at?: string | null;
  created_at?: string;
}

export interface SendPulseMessageData {
  text?: { body?: string };
  message_id?: string; // wamid
  id?: string;
  from_user_id?: string | null;
  timestamp?: number;
  type?: string;
  // Mensaje citado (respuesta): { message_id: wamid }
  context?: { message_id?: string; id?: string } | null;
}

export interface SendPulseMessage {
  id: string;
  contact_id: string;
  bot_id: string;
  direction: number; // 1 inbound, 2 outbound
  type: string; // "text" | "image" | ...
  status?: number;
  sent_by?: string | null;
  attachments?: any;
  created_at: string;
  data?: SendPulseMessageData;
}

export interface SendPulsePaginated<T> {
  data: T[];
  meta?: { total?: number; limit?: number };
  links?: { next?: string | null };
}

export type SendPulseOutgoingType = 'text' | 'image' | 'document' | 'audio';

@Injectable()
export class SendPulseService {
  private readonly logger = new Logger(SendPulseService.name);

  private async request<T = any>(
    apiKey: string,
    method: string,
    path: string,
    body?: Record<string, any>,
    query?: Record<string, string | number | undefined>,
  ): Promise<T> {
    if (!apiKey) {
      throw new Error('SendPulse API key no configurada para esta bandeja');
    }

    let url = `${SENDPULSE_BASE_URL}${path}`;
    if (query) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) params.append(key, String(value));
      }
      const qs = params.toString();
      if (qs) url += `?${qs}`;
    }

    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
    };
    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      options.body = JSON.stringify(body);
    }

    this.logger.debug(`[SendPulse] ${method} ${path}`);

    const res = await fetch(url, options);
    const raw = await res.text();
    let data: any = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = raw;
    }

    if (!res.ok || (data && data.success === false)) {
      const errMsg =
        data?.errors
          ? JSON.stringify(data.errors)
          : data?.message || `SendPulse API error: ${res.status}`;
      this.logger.error(`[SendPulse] Error ${res.status} en ${path}: ${errMsg}`);
      throw new Error(errMsg);
    }

    // SendPulse envuelve la respuesta en { success, data, ... }
    return data as T;
  }

  /**
   * Valida una API key devolviendo la info de la cuenta. Útil al activar el
   * modo puente para confirmar credenciales antes de guardarlas.
   */
  async getAccount(apiKey: string): Promise<any> {
    const res = await this.request<{ data: any }>(apiKey, 'GET', '/chatbots/account');
    return res.data;
  }

  /** Lista los bots de la cuenta. */
  async getBots(apiKey: string): Promise<SendPulseBot[]> {
    const res = await this.request<{ data: SendPulseBot[] }>(apiKey, 'GET', '/chatbots/bots');
    return res.data || [];
  }

  /** Obtiene una página de contactos de un bot de WhatsApp. */
  async getContacts(
    apiKey: string,
    botId: string,
    size = 100,
    skip = 0,
  ): Promise<SendPulsePaginated<SendPulseContact>> {
    return this.request<SendPulsePaginated<SendPulseContact>>(
      apiKey,
      'GET',
      '/whatsapp/contacts',
      undefined,
      { bot_id: botId, size, skip },
    );
  }

  /** Obtiene los mensajes de un contacto (una conversación). */
  async getMessages(
    apiKey: string,
    botId: string,
    contactId: string,
    size = 200,
  ): Promise<SendPulseMessage[]> {
    const res = await this.request<{ data: SendPulseMessage[] }>(
      apiKey,
      'GET',
      '/whatsapp/chats/messages',
      undefined,
      { bot_id: botId, contact_id: contactId, size },
    );
    return res.data || [];
  }

  /**
   * Envía un mensaje de texto a un contacto vía SendPulse.
   * Devuelve el wamid/message_id resultante si SendPulse lo expone.
   */
  async sendText(apiKey: string, contactId: string, body: string): Promise<{ messageId: string | null; raw: any }> {
    const res = await this.request<{ data: any }>(apiKey, 'POST', '/whatsapp/contacts/send', {
      contact_id: contactId,
      message: {
        type: 'text',
        text: { body },
      },
    });
    const messageId =
      res?.data?.data?.message_id ||
      res?.data?.message_id ||
      res?.data?.id ||
      null;
    return { messageId, raw: res?.data ?? res };
  }

  /**
   * Envía un mensaje con media (imagen / documento / audio) por enlace público.
   */
  async sendMedia(
    apiKey: string,
    contactId: string,
    type: 'image' | 'document' | 'audio',
    link: string,
    caption?: string,
  ): Promise<{ messageId: string | null; raw: any }> {
    const messagePayload: Record<string, any> = { type };
    if (type === 'image') {
      messagePayload.image = { link, caption: caption ?? null };
    } else if (type === 'document') {
      messagePayload.file = { link, caption: caption ?? null };
    } else if (type === 'audio') {
      messagePayload.audio = { link };
    }

    const res = await this.request<{ data: any }>(apiKey, 'POST', '/whatsapp/contacts/send', {
      contact_id: contactId,
      message: messagePayload,
    });
    const messageId = res?.data?.data?.message_id || res?.data?.message_id || res?.data?.id || null;
    return { messageId, raw: res?.data ?? res };
  }
}
