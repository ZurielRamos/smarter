import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface EvolutionInstanceInfo {
  instanceName: string;
  status: 'open' | 'close' | 'connecting' | 'created';
  ownerJid?: string;
  profilePictureUrl?: string;
}

export interface EvolutionQrCode {
  pairingCode?: string;
  code?: string;
  base64?: string;
  count?: number;
}

export interface EvolutionSendResult {
  key: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
  };
  message: Record<string, any>;
  messageTimestamp: number;
  status: string;
}

@Injectable()
export class EvolutionService {
  private readonly logger = new Logger(EvolutionService.name);

  constructor(private readonly configService: ConfigService) {}

  // === HELPERS ===

  private getBaseUrl(): string {
    return this.configService.get<string>('EVOLUTION_API_URL', 'http://localhost:8080');
  }

  private getGlobalApiKey(): string {
    return this.configService.get<string>('EVOLUTION_API_KEY', '');
  }

  private async request<T = any>(
    method: string,
    path: string,
    body?: Record<string, any>,
    instanceToken?: string,
  ): Promise<T> {
    const url = `${this.getBaseUrl()}${path}`;
    const apiKey = instanceToken || this.getGlobalApiKey();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      apikey: apiKey,
    };

    const options: RequestInit = { method, headers };
    if (body && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(body);
    }

    this.logger.debug(`[Evolution] ${method} ${path}`);

    const res = await fetch(url, options);
    const data = await res.json();

    if (!res.ok) {
      this.logger.error(`[Evolution] Error ${res.status}: ${JSON.stringify(data)}`);
      throw new Error(data?.message || data?.error || `Evolution API error: ${res.status}`);
    }

    return data as T;
  }

  // === INSTANCE MANAGEMENT ===

  /**
   * Crea una nueva instancia en Evolution API.
   * @param instanceName Nombre único de la instancia
   * @param webhookUrl URL donde Evolution enviará los webhooks
   */
  async createInstance(
    instanceName: string,
    webhookUrl: string,
  ): Promise<{ instance: EvolutionInstanceInfo; hash: string }> {
    const data = await this.request<any>('POST', '/instance/create', {
      instanceName,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: true,
      webhook: {
        url: webhookUrl,
        byEvents: false,
        base64: true,
        events: [
          'MESSAGES_UPSERT',
          'MESSAGES_UPDATE',
          'CONNECTION_UPDATE',
          'QRCODE_UPDATED',
        ],
      },
    });

    return {
      instance: {
        instanceName: data.instance?.instanceName || instanceName,
        status: data.instance?.status || 'created',
      },
      hash: data.hash || data.instance?.token || '',
    };
  }

  /**
   * Obtiene el QR code para conectar el WhatsApp.
   */
  async getQrCode(instanceName: string): Promise<EvolutionQrCode> {
    const data = await this.request<any>('GET', `/instance/connect/${instanceName}`);
    return {
      pairingCode: data.pairingCode,
      code: data.code,
      base64: data.base64,
      count: data.count,
    };
  }

  /**
   * Obtiene el estado actual de conexión de la instancia.
   */
  async getInstanceStatus(instanceName: string): Promise<EvolutionInstanceInfo> {
    const data = await this.request<any>('GET', `/instance/connectionState/${instanceName}`);
    return {
      instanceName,
      status: data.instance?.state || data.state || 'close',
      ownerJid: data.instance?.ownerJid,
    };
  }

  /**
   * Obtiene información detallada de la instancia.
   */
  async fetchInstance(instanceName: string): Promise<any> {
    const data = await this.request<any>('GET', `/instance/fetchInstances?instanceName=${instanceName}`);
    return data;
  }

  /**
   * Desconecta la instancia (logout).
   */
  async logout(instanceName: string): Promise<void> {
    await this.request('DELETE', `/instance/logout/${instanceName}`);
    this.logger.log(`[Evolution] Instance ${instanceName} logged out`);
  }

  /**
   * Elimina la instancia completamente.
   */
  async deleteInstance(instanceName: string): Promise<void> {
    await this.request('DELETE', `/instance/delete/${instanceName}`);
    this.logger.log(`[Evolution] Instance ${instanceName} deleted`);
  }

  /**
   * Reinicia la instancia (reconexión).
   */
  async restartInstance(instanceName: string): Promise<void> {
    await this.request('PUT', `/instance/restart/${instanceName}`);
    this.logger.log(`[Evolution] Instance ${instanceName} restarted`);
  }

  // === MESSAGING ===

  /**
   * Envía un mensaje de texto.
   * @param instanceName Nombre de la instancia
   * @param to Número con código de país (ej: 573001234567)
   * @param text Contenido del mensaje
   * @param instanceToken Token específico de la instancia (opcional, usa global si no se provee)
   */
  async sendText(
    instanceName: string,
    to: string,
    text: string,
    instanceToken?: string,
  ): Promise<EvolutionSendResult> {
    const number = this.formatNumber(to);
    const data = await this.request<any>(
      'POST',
      `/message/sendText/${instanceName}`,
      { number, text },
      instanceToken,
    );
    return data;
  }

  /**
   * Envía un archivo multimedia (imagen, video, audio, documento).
   * @param instanceName Nombre de la instancia
   * @param to Número destino
   * @param mediaUrl URL pública del archivo
   * @param mediaType Tipo: image | video | audio | document
   * @param caption Texto opcional
   * @param fileName Nombre del archivo (para documentos)
   * @param instanceToken Token de la instancia
   */
  async sendMedia(
    instanceName: string,
    to: string,
    mediaUrl: string,
    mediaType: 'image' | 'video' | 'audio' | 'document',
    caption?: string,
    fileName?: string,
    instanceToken?: string,
  ): Promise<EvolutionSendResult> {
    const number = this.formatNumber(to);
    const body: Record<string, any> = {
      number,
      mediatype: mediaType,
      media: mediaUrl,
    };

    if (caption) body.caption = caption;
    if (fileName) body.fileName = fileName;

    // Audio se envía como PTT (push-to-talk) para que aparezca como nota de voz
    if (mediaType === 'audio') {
      body.mediatype = 'audio';
      // Evolution espera audio como media con mimetype
    }

    const data = await this.request<any>(
      'POST',
      `/message/sendMedia/${instanceName}`,
      body,
      instanceToken,
    );
    return data;
  }

  /**
   * Envía un documento con nombre de archivo.
   */
  async sendDocument(
    instanceName: string,
    to: string,
    mediaUrl: string,
    fileName: string,
    caption?: string,
    instanceToken?: string,
  ): Promise<EvolutionSendResult> {
    return this.sendMedia(instanceName, to, mediaUrl, 'document', caption, fileName, instanceToken);
  }

  // === WEBHOOK CONFIGURATION ===

  /**
   * Configura o actualiza el webhook de la instancia.
   */
  async setWebhook(instanceName: string, webhookUrl: string): Promise<void> {
    await this.request('POST', `/webhook/set/${instanceName}`, {
      url: webhookUrl,
      webhook_by_events: false,
      webhook_base64: true,
      events: [
        'MESSAGES_UPSERT',
        'MESSAGES_UPDATE',
        'CONNECTION_UPDATE',
        'QRCODE_UPDATED',
      ],
    });
    this.logger.log(`[Evolution] Webhook set for ${instanceName}: ${webhookUrl}`);
  }

  // === PROFILE ===

  /**
   * Obtiene la foto de perfil de un contacto.
   */
  async getProfilePicture(instanceName: string, number: string): Promise<string | null> {
    try {
      const data = await this.request<any>('POST', `/chat/fetchProfilePictureUrl/${instanceName}`, {
        number: this.formatNumber(number),
      });
      return data?.profilePictureUrl || null;
    } catch {
      return null;
    }
  }

  // === UTILITIES ===

  /**
   * Formatea el número al formato que espera Evolution API (solo dígitos).
   * Acepta: +573001234567, 573001234567, 3001234567
   * Retorna: 573001234567
   */
  private formatNumber(phone: string): string {
    // Remove everything except digits
    let cleaned = phone.replace(/\D/g, '');

    // Si empieza con un 0 local, removerlo (poco común en este contexto)
    if (cleaned.startsWith('0')) {
      cleaned = cleaned.substring(1);
    }

    return cleaned;
  }

  /**
   * Extrae el número de teléfono de un remoteJid de WhatsApp.
   * Ej: "573001234567@s.whatsapp.net" → "573001234567"
   */
  parseRemoteJid(jid: string): string {
    return jid?.split('@')[0] || '';
  }

  /**
   * Verifica si la API de Evolution está accesible.
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.request('GET', '/instance/fetchInstances');
      return true;
    } catch {
      return false;
    }
  }
}
