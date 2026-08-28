import type { Inbox, Label, TenantMember } from "./types";

/**
 * Caché en memoria (a nivel de módulo) para los datos semi-estáticos de la vista
 * de chat: inboxes, labels y members. Estos cambian poco durante una sesión, así
 * que evitamos refetchearlos cada vez que el usuario reentra a Comunicaciones.
 *
 * El caché vive mientras la pestaña está abierta y se invalida por tenant. No
 * pretende ser una solución de fetching completa (para eso estaría TanStack
 * Query); es un caché simple y suficiente para este caso.
 */

interface StaticData {
  inboxes: Inbox[];
  labels: Label[];
  members: TenantMember[];
}

const TTL_MS = 5 * 60 * 1000; // 5 minutos

interface CacheEntry {
  data: StaticData;
  storedAt: number;
}

const cache = new Map<string, CacheEntry>();

export function getCachedStaticData(tenantId: string): StaticData | null {
  const entry = cache.get(tenantId);
  if (!entry) return null;
  if (Date.now() - entry.storedAt > TTL_MS) {
    cache.delete(tenantId);
    return null;
  }
  return entry.data;
}

export function setCachedStaticData(tenantId: string, data: StaticData): void {
  cache.set(tenantId, { data, storedAt: Date.now() });
}

/** Invalida el caché de un tenant (o de todos si no se pasa tenantId). */
export function invalidateStaticData(tenantId?: string): void {
  if (tenantId) cache.delete(tenantId);
  else cache.clear();
}
