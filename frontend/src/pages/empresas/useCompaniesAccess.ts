import { useParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

/** Cuenta actual y permisos del usuario en ella. */
export function useCompaniesAccess() {
  const { slug } = useParams();
  const { user } = useAuth();
  const membership = user?.tenantRoles.find((tr) => tr.tenant.slug === slug);
  const role = user?.isSuperAdmin ? "owner" : membership?.role;
  return {
    slug: slug ?? "",
    tenantId: membership?.tenantId ?? "",
    /** Crear y editar: todos menos viewer. */
    canWrite: !!role && role !== "viewer",
    /** Eliminar empresas: owner o admin. */
    canDelete: role === "owner" || role === "admin",
  };
}

/** Ubicación en una línea: dirección, ciudad y región. */
export function formatPlace(o: { address: string | null; city: string | null; region?: string | null }) {
  return [o.address, o.city, o.region].filter(Boolean).join(", ") || "—";
}
