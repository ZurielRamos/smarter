/**
 * Configuración del "Modo Puente" de SendPulse, almacenada en
 * `Inbox.metadata.sendpulseBridge`.
 *
 * Mientras `active` es true, la bandeja opera en modo puente:
 *  - los mensajes entrantes llegan vía webhook de SendPulse (tiempo real),
 *  - los mensajes salientes se envían a través de la API de SendPulse.
 * Al desactivarlo, la bandeja vuelve a su comportamiento normal (Meta/Evolution).
 *
 * La API key se guarda en `Inbox.accessToken` (texto plano, consistente con el
 * resto de tokens de canal), NO aquí, para no duplicarla.
 */
export interface SendPulseBridgeConfig {
  /** Si el modo puente está activo. */
  active: boolean;
  /** ID del bot de SendPulse asociado a esta bandeja. */
  botId: string;
  /** Estado de la sincronización inicial del histórico. */
  syncStatus?: 'idle' | 'queued' | 'running' | 'completed' | 'failed';
  /** ID del job de BullMQ de la sync inicial en curso. */
  syncJobId?: string;
  /** Progreso 0-100 de la sync inicial. */
  syncProgress?: number;
  /** Contadores de la última sincronización. */
  syncStats?: {
    contacts?: number;
    messages?: number;
    conversations?: number;
  };
  /** Mensaje de error de la última sync fallida. */
  syncError?: string;
  /** Fecha (ISO) en que terminó la última sync. */
  lastSyncAt?: string;
  /** Fecha (ISO) en que se activó el puente. */
  activatedAt?: string;
}

export const SENDPULSE_BRIDGE_KEY = 'sendpulseBridge';

/** Lee la config del puente desde el metadata de un inbox. */
export function getBridgeConfig(
  metadata: Record<string, any> | null | undefined,
): SendPulseBridgeConfig | null {
  const cfg = metadata?.[SENDPULSE_BRIDGE_KEY];
  return cfg && typeof cfg === 'object' ? (cfg as SendPulseBridgeConfig) : null;
}

/** true si el inbox tiene el modo puente activo. */
export function isBridgeActive(metadata: Record<string, any> | null | undefined): boolean {
  return getBridgeConfig(metadata)?.active === true;
}
