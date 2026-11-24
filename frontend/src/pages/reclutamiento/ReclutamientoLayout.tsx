import { Navigate, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { FileText, FolderKanban, Globe, Wallet, LayoutTemplate, Users } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import headerBg from "@/assets/header-background.jpg";

const navItems = [
  { key: "encuestadores", path: "", icon: <Users className="h-4.5 w-4.5" />, label: "Encuestadores" },
  { key: "proyectos", path: "proyectos", icon: <FolderKanban className="h-4.5 w-4.5" />, label: "Proyectos" },
  { key: "pagos", path: "pagos", icon: <Wallet className="h-4.5 w-4.5" />, label: "Pagos" },
  { key: "plantillas", path: "plantillas", icon: <FileText className="h-4.5 w-4.5" />, label: "Plantillas de contrato" },
  { key: "portal", path: "portal", icon: <Globe className="h-4.5 w-4.5" />, label: "Portal de registro" },
  { key: "landing", path: "landing", icon: <LayoutTemplate className="h-4.5 w-4.5" />, label: "Landing" },
];

export function ReclutamientoLayout() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const tenantRole = user?.tenantRoles.find((tr) => tr.tenant.slug === slug);
  const enabled = !!tenantRole?.tenant.features?.reclutamiento;
  const isAdmin = tenantRole?.role === "owner" || tenantRole?.role === "admin";

  // Acceso directo por URL con el módulo apagado o sin rol de administrador
  // (el backend también lo exige): se redirige al dashboard.
  if (user && !user.isSuperAdmin && (!enabled || !isAdmin)) {
    return <Navigate to={`/${slug}`} replace />;
  }

  const activeView = location.pathname.includes("/proyectos")
    ? "proyectos"
    : location.pathname.endsWith("/pagos")
    ? "pagos"
    : location.pathname.includes("/plantillas")
    ? "plantillas"
    : location.pathname.endsWith("/portal")
      ? "portal"
      : location.pathname.endsWith("/landing")
        ? "landing"
        : "encuestadores";

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div
        className="px-5 pt-3 pb-3 shrink-0 rounded-b-2xl"
        style={{ backgroundImage: `url(${headerBg})`, backgroundSize: "cover", backgroundPosition: "center" }}
      >
        <h1 className="text-xl font-bold text-white">Reclutamiento</h1>
        <p className="text-brand-300 mt-0.5 text-sm">
          Gestiona encuestadores, sus contratos y sus datos de pago, y los proyectos con su landing y registro de prospectos
        </p>
      </div>

      <div className="flex-1 flex overflow-hidden mt-4 rounded-t-xl border border-border bg-card min-w-0">
        <nav aria-label="Secciones de reclutamiento" className="w-12 border-r border-border flex flex-col items-center py-3 gap-1 shrink-0 bg-muted/50">
          {navItems.map((item) => (
            <div key={item.key} className="relative group/tip">
              <button
                type="button"
                aria-label={item.label}
                aria-current={activeView === item.key ? "page" : undefined}
                onClick={() => navigate(`/${slug}/reclutamiento${item.path ? `/${item.path}` : ""}`)}
                className={`p-2.5 rounded-lg transition-colors ${
                  activeView === item.key
                    ? "bg-brand-100 text-brand-700 dark:bg-brand-700 dark:text-brand-100"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {item.icon}
              </button>
              <span className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 rounded-md bg-gray-900 dark:bg-gray-700 text-white text-[10px] whitespace-nowrap opacity-0 group-hover/tip:opacity-100 pointer-events-none transition-opacity duration-150 z-50">
                {item.label}
              </span>
            </div>
          ))}
        </nav>
        <Outlet />
      </div>
    </div>
  );
}
