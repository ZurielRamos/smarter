import { Navigate, Outlet, useParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

/**
 * Marco del módulo Empresas. Cada página dibuja su propia banda de título,
 * igual que Contactos. El acceso por URL con el módulo apagado se redirige al
 * dashboard (el backend también lo exige).
 */
export function EmpresasLayout() {
  const { slug } = useParams();
  const { user } = useAuth();
  const tenantRole = user?.tenantRoles.find((tr) => tr.tenant.slug === slug);
  const enabled = !!tenantRole?.tenant.features?.companies;

  if (user && !user.isSuperAdmin && !enabled) {
    return <Navigate to={`/${slug}`} replace />;
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <Outlet />
    </div>
  );
}
