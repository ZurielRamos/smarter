import { useParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

/** Id del tenant de la cuenta actual (a partir del slug de la URL). */
export function useTenantId(): string {
  const { slug } = useParams();
  const { user } = useAuth();
  return user?.tenantRoles.find((tr) => tr.tenant.slug === slug)?.tenantId ?? "";
}
