import { Injectable } from '@nestjs/common';

export interface CallSendOptions {
  phone: string;
  message: string;
  credentials: Record<string, string>;
  voice?: string;
  retries?: string;
  leaveVoicemail?: boolean;
  audioCode?: string;
  groups?: string;
}

export interface CallSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

@Injectable()
export class CallService {
  /**
   * Send a voice call via Onurix
   * Endpoint: POST https://www.onurix.com/api/v1/call/send
   * Content-Type: application/x-www-form-urlencoded
   *
   * Required params: client, key, phone, message (or audio-code)
   * Optional params: voice, retries, leave-voicemail, audio-code, groups
   */
  async sendCall(options: CallSendOptions): Promise<CallSendResult> {
    const { phone, message, credentials, voice, retries, leaveVoicemail, audioCode, groups } = options;

    const client = credentials?.client;
    const key = credentials?.key;

    if (!client || !key) {
      return { success: false, error: 'Credenciales de Onurix (client/key) no configuradas' };
    }

    const params: Record<string, string> = {
      client,
      key,
      phone: phone.startsWith('+') ? phone.slice(1) : phone,
    };

    // audio-code and message/voice are mutually exclusive
    if (audioCode) {
      params['audio-code'] = audioCode;
    } else {
      params.message = message;
      if (voice) {
        params.voice = voice;
      }
    }

    if (retries) {
      params.retries = retries;
    }

    if (leaveVoicemail !== undefined) {
      params['leave-voicemail'] = String(leaveVoicemail);
    }

    if (groups) {
      params.groups = groups;
    }

    try {
      const response = await fetch('https://www.onurix.com/api/v1/call/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params),
      });

      const result = await response.json();

      if (response.ok && result.status === 'string') {
        // API returns array of results per phone
        return { success: true, messageId: result.id || JSON.stringify(result) };
      }

      if (response.ok) {
        return { success: true, messageId: JSON.stringify(result) };
      }

      console.error('[Call/Onurix] Send error:', result);
      return { success: false, error: result.msg || result.message || 'Error desconocido' };
    } catch (error) {
      console.error('[Call/Onurix] Send exception:', error);
      return { success: false, error: String(error) };
    }
  }
}
