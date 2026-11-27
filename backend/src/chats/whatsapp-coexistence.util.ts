/**
 * Utilidades puras para la coexistencia de WhatsApp (número usado a la vez en la
 * app WhatsApp Business y en la Cloud API).
 *
 * Referencia: Meta, "Onboard WhatsApp Business app users" (webhooks `history`,
 * `smb_app_state_sync` y `smb_message_echoes`).
 */

/** Campos de webhook que la coexistencia necesita además de `messages`. */
export const COEXISTENCE_WEBHOOK_FIELDS = [
  'history',
  'smb_app_state_sync',
  'smb_message_echoes',
] as const;

/** Campos que se piden al suscribir una WABA en coexistencia. */
export const COEXISTENCE_SUBSCRIBED_FIELDS = [
  'messages',
  ...COEXISTENCE_WEBHOOK_FIELDS,
];

/** Código de error del webhook `history` cuando el negocio no comparte su historial. */
export const HISTORY_SHARING_DECLINED_CODE = 2593109;

/** Ventana (ms) que da Meta para iniciar la sincronización tras el onboarding. */
export const COEXISTENCE_SYNC_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Estado de coexistencia que se guarda en `inbox.metadata.coexistence`. */
export interface CoexistenceMetadata {
  enabled: boolean;
  onboardedAt: string;
  /** Resultado de cada paso de sincronización (contacts = smb_app_state_sync). */
  contactsSync?: CoexistenceSyncStep;
  historySync?: CoexistenceSyncStep;
  /** Estado del historial: pending | shared | declined | failed */
  historyStatus?: 'pending' | 'shared' | 'declined' | 'failed';
  /** Progreso 0-100 reportado por los webhooks `history`. */
  historyProgress?: number;
  historyMessagesImported?: number;
  contactsImported?: number;
  disconnectedAt?: string;
  /** `disconnection_info` de Meta (reason, initiated_by) en PARTNER_REMOVED. */
  disconnection?: { reason?: string; initiated_by?: string } | null;
}

export interface CoexistenceSyncStep {
  status: 'ok' | 'failed';
  at: string;
  requestId?: string | null;
  error?: string;
}

export interface NormalizedWhatsAppMessage {
  messageType: string;
  content: string | null;
  mediaId: string | null;
  mediaMimeType: string | null;
  filename: string | null;
}

/** Solo dígitos de un número (sin "+", espacios ni guiones). */
export function digitsOnly(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

/** Compara dos teléfonos ignorando formato. Falso si alguno está vacío. */
export function samePhone(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const da = digitsOnly(a);
  const db = digitsOnly(b);
  return !!da && !!db && da === db;
}

/**
 * Normaliza el cuerpo de un mensaje de la Cloud API (eco, historial) a los
 * campos que guarda la tabla `messages`. Para tipos sin soporte guarda un
 * marcador `[tipo]`, igual que el flujo de mensajes entrantes.
 */
export function normalizeWhatsAppMessage(msg: any): NormalizedWhatsAppMessage {
  const type: string = msg?.type || 'text';
  const empty = {
    mediaId: null,
    mediaMimeType: null,
    filename: null,
  };
  switch (type) {
    case 'text':
      return { ...empty, messageType: 'text', content: msg.text?.body ?? '' };
    case 'button':
      return {
        ...empty,
        messageType: 'text',
        content: msg.button?.text || msg.button?.payload || '[button]',
      };
    case 'interactive': {
      const i = msg.interactive;
      return {
        ...empty,
        messageType: 'text',
        content:
          i?.button_reply?.title ||
          i?.list_reply?.title ||
          i?.body?.text ||
          '[interactive]',
      };
    }
    case 'image':
    case 'video':
    case 'audio':
    case 'document':
    case 'sticker':
      return {
        messageType: type,
        content: msg[type]?.caption || null,
        mediaId: msg[type]?.id || null,
        mediaMimeType: msg[type]?.mime_type || null,
        filename: msg[type]?.filename || null,
      };
    case 'location':
      return {
        ...empty,
        messageType: 'location',
        content: `📍 ${msg.location?.latitude}, ${msg.location?.longitude}`,
      };
    case 'media_placeholder':
      // El historial no trae el archivo: llega después en otro webhook `history`.
      return {
        ...empty,
        messageType: 'text',
        content: '[Archivo multimedia no disponible]',
      };
    default:
      return { ...empty, messageType: 'text', content: `[${type}]` };
  }
}

/** Convierte el `history_context.status` de Meta al estado interno del mensaje. */
export function mapHistoryStatus(status: string | null | undefined): string {
  switch (status) {
    case 'read':
    case 'played':
      return 'read';
    case 'delivered':
      return 'delivered';
    case 'error':
      return 'failed';
    default:
      return 'sent';
  }
}

/** Convierte un timestamp Unix (segundos, string o número) a Date. */
export function unixToDate(ts: string | number | null | undefined): Date {
  const n = Number(ts);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000) : new Date();
}

/**
 * Identidad del contacto de un eco (`smb_message_echoes`): el destinatario es
 * `to` / `to_user_id`, con `contacts[0]` como respaldo.
 */
export function resolveEchoContact(
  echo: any,
  contacts: any[] | undefined,
): { waId: string | null; userId: string | null; name: string | null } {
  const c = contacts?.[0];
  return {
    waId: echo?.to || c?.wa_id || null,
    userId: echo?.to_user_id || c?.user_id || null,
    name: c?.profile?.name || c?.profile?.username || null,
  };
}

/** Identidad del contacto de un hilo del historial. */
export function resolveThreadContact(thread: any): {
  waId: string | null;
  userId: string | null;
  name: string | null;
} {
  const ctx = thread?.context;
  return {
    waId: ctx?.wa_id || thread?.id || null,
    userId: ctx?.user_id || null,
    name: ctx?.username || null,
  };
}

/**
 * Indica si un mensaje del historial lo envió el negocio. Es saliente si `from`
 * es el número del negocio o si trae `to` (eco). Un mensaje del usuario trae
 * `from_user_id` o un `from` distinto del número del negocio.
 */
export function isBusinessHistoryMessage(
  msg: any,
  businessPhone: string | null | undefined,
): boolean {
  if (msg?.from_user_id) return false;
  if (msg?.to || msg?.to_user_id) return true;
  return samePhone(msg?.from, businessPhone);
}

/**
 * Convierte un contacto de `smb_app_state_sync` en nombre + teléfono. `full_name`
 * tiene prioridad sobre `first_name`.
 */
export function parseStateSyncContact(item: any): {
  action: 'add' | 'remove' | null;
  phone: string | null;
  userId: string | null;
  fullName: string | null;
} | null {
  if (!item || item.type !== 'contact' || !item.contact) return null;
  const c = item.contact;
  const phone = digitsOnly(c.phone_number) || null;
  const action =
    item.action === 'add' || item.action === 'remove' ? item.action : null;
  return {
    action,
    phone,
    userId: c.user_id || null,
    fullName: (c.full_name || c.first_name || '').trim() || null,
  };
}
