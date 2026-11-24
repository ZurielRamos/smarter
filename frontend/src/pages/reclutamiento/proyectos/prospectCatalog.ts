import { useEffect, useState } from "react";
import { reclutamientoApi, type ProspectCatalog, type ProspectRole } from "@/services/reclutamiento";

/** Catálogo de estados de los prospectos. Es fijo: se pide una vez por cuenta y se reutiliza. */
const cache = new Map<string, Promise<ProspectCatalog>>();

export function useProspectCatalog(tenantId: string): ProspectCatalog | null {
  const [catalog, setCatalog] = useState<ProspectCatalog | null>(null);
  useEffect(() => {
    if (!tenantId) return;
    let alive = true;
    if (!cache.has(tenantId)) cache.set(tenantId, reclutamientoApi.prospectCatalog(tenantId).catch((err) => (cache.delete(tenantId), Promise.reject(err))));
    cache
      .get(tenantId)!
      .then((c) => alive && setCatalog(c))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [tenantId]);
  return catalog;
}

export const ROLE_OPTIONS: Array<{ value: ProspectRole; label: string; plural: string }> = [
  { value: "participant", label: "Participante", plural: "Participantes" },
  { value: "surveyor", label: "Encuestador", plural: "Encuestadores" },
  { value: "moderator", label: "Moderador", plural: "Moderadores" },
];
