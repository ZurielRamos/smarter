import { SendPulseMessage, SP_DIRECTION_INBOUND } from './sendpulse.service';

/**
 * Traduce el `type` de un mensaje de SendPulse al `messageType` de nuestra
 * entidad Message.
 */
export function mapMessageType(spType: string | undefined): string {
  switch ((spType || '').toLowerCase()) {
    case 'text':
      return 'text';
    case 'image':
      return 'image';
    case 'video':
      return 'video';
    case 'audio':
    case 'voice':
      return 'audio';
    case 'document':
    case 'file':
      return 'document';
    case 'sticker':
      return 'sticker';
    case 'location':
      return 'location';
    default:
      return 'text';
  }
}

/**
 * Extrae el contenido textual legible de un mensaje de SendPulse.
 * Para tipos no-texto devuelve un placeholder consistente con el resto del CRM.
 */
export function extractContent(msg: SendPulseMessage): string | null {
  const body = msg.data?.text?.body;
  if (body) return body;
  const type = mapMessageType(msg.type);
  if (type === 'text') return null;
  return `[${type}]`;
}

/**
 * Identificador externo estable del mensaje (wamid) usado para idempotencia.
 * Cae al id interno de SendPulse si no hay wamid.
 */
export function resolveExternalId(msg: SendPulseMessage): string {
  return msg.data?.message_id || msg.data?.id || msg.id;
}

/** true si el mensaje es entrante (del contacto). */
export function isInbound(msg: SendPulseMessage): boolean {
  return msg.direction === SP_DIRECTION_INBOUND;
}

/** Fecha de creación como Date. */
export function resolveCreatedAt(msg: SendPulseMessage): Date {
  if (msg.data?.timestamp) return new Date(msg.data.timestamp * 1000);
  if (msg.created_at) return new Date(msg.created_at);
  return new Date();
}

/**
 * Normaliza la representación de un mensaje de SendPulse a los campos que
 * necesita nuestra entidad Message. Compartido por el worker de sync inicial y
 * por el webhook en tiempo real.
 */
export interface NormalizedMessage {
  externalId: string;
  direction: 'inbound' | 'outbound';
  messageType: string;
  content: string | null;
  createdAt: Date;
  /** wamid del mensaje citado (si es una respuesta), para el hilo. */
  replyToExternalId: string | null;
}

/** Extrae el wamid del mensaje citado (respuesta), si existe. */
export function resolveReplyTo(msg: SendPulseMessage): string | null {
  const ctx = msg.data?.context;
  if (!ctx) return null;
  return ctx.message_id || ctx.id || null;
}

export function normalizeMessage(msg: SendPulseMessage): NormalizedMessage {
  return {
    externalId: resolveExternalId(msg),
    direction: isInbound(msg) ? 'inbound' : 'outbound',
    messageType: mapMessageType(msg.type),
    content: extractContent(msg),
    createdAt: resolveCreatedAt(msg),
    replyToExternalId: resolveReplyTo(msg),
  };
}

/**
 * Normaliza un teléfono a solo dígitos (quita +, espacios, guiones, paréntesis).
 * Devuelve null si no queda ningún dígito.
 */
export function normalizePhoneDigits(phone: string | number | null | undefined): string | null {
  if (phone === null || phone === undefined) return null;
  const digits = String(phone).replace(/\D/g, '');
  return digits.length > 0 ? digits : null;
}

/**
 * Obtiene los últimos N dígitos de un teléfono para hacer un match flexible
 * tolerante al prefijo de país (p. ej. Colombia "57"). Por defecto 10, que es
 * la longitud del número nacional colombiano.
 *
 * Ejemplos (N=10):
 *   "573011298963" -> "3011298963"
 *   "3011298963"   -> "3011298963"
 *   "+57 301 129 8963" -> "3011298963"
 */
export function phoneMatchKey(phone: string | number | null | undefined, lastN = 10): string | null {
  const digits = normalizePhoneDigits(phone);
  if (!digits) return null;
  return digits.length <= lastN ? digits : digits.slice(-lastN);
}

/**
 * true si el identificador es una identidad de WhatsApp (BSUID), no un teléfono.
 */
export function isWhatsAppIdentity(value: string | null | undefined): boolean {
  if (!value) return false;
  return value.startsWith('CO.') || /^\d{16,}$/.test(value);
}
