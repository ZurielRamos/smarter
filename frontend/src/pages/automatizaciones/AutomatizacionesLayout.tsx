import { Navigate, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { KeyRound, ListChecks, Workflow } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import headerBg from "@/assets/header-background.jpg";

const navItems = [
  { key: "flujos", path: "", icon: <Workflow className="h-4.5 w-4.5" />, label: "Automatizaciones" },
  { key: "ejecuciones", path: "ejecuciones", icon: <ListChecks className="h-4.5 w-4.5" />, label: "Ejecuciones" },
  { key: "conexiones", path: "conexiones", icon: <KeyRound className="h-4.5 w-4.5" />, label: "Conexiones" },
];

export function AutomatizacionesLayout() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const tenantRole = user?.tenantRoles.find((tr) => tr.tenant.slug === slug);
  const features = tenantRole?.tenant.features as { automatizaciones?: boolean } | null | undefined;

  // Acceso directo por URL con el módulo apagado: se redirige al dashboard.
  if (user && !user.isSuperAdmin && !features?.automatizaciones) {
    return <Navigate to={`/${slug}`} replace />;
  }

  const activeView = location.pathname.includes("/ejecuciones")
    ? "ejecuciones"
    : location.pathname.includes("/conexiones")
      ? "conexiones"
      : "flujos";

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div
        className="px-5 pt-3 pb-3 shrink-0 rounded-b-2xl"
        style={{ backgroundImage: `url(${headerBg})`, backgroundSize: "cover", backgroundPosition: "center" }}
      >
        <h1 className="text-xl font-bold text-white">Automatizaciones</h1>
        <p className="text-brand-300 mt-0.5 text-sm">Diseña flujos que conectan tus herramientas y trabajan por ti</p>
      </div>

      <div className="flex-1 flex overflow-hidden mt-4 rounded-t-xl border border-border bg-card min-w-0">
        <nav aria-label="Secciones de automatizaciones" className="w-12 border-r border-border flex flex-col items-center py-3 gap-1 shrink-0 bg-muted/50">
          {navItems.map((item) => (
            <div key={item.key} className="relative group/tip">
              <button
                type="button"
                aria-label={item.label}
                aria-current={activeView === item.key ? "page" : undefined}
                onClick={() => navigate(`/${slug}/automatizaciones${item.path ? `/${item.path}` : ""}`)}
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
