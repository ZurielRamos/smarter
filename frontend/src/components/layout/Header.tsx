import { useParams } from "react-router-dom";
import { LayoutDashboard, MessagesSquare, Users, ClipboardList, GraduationCap, type LucideIcon } from "lucide-react";
import { Sidebar, type SidebarItem } from "./Sidebar";
import { useAuth } from "@/context/AuthContext";
import { TENANT_MODULES, isModuleEnabled } from "@/config/modules";

const MODULE_ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  comunicaciones: MessagesSquare,
  contactos: Users,
  encuestas: ClipboardList,
  cursos: GraduationCap,
};

/** Navegación principal del tenant (sidebar izquierdo de iconos). */
export function Header() {
  const { slug } = useParams();
  const { user } = useAuth();

  // Features del tenant actual gobiernan qué módulos se muestran en la nav.
  const currentTenant = user?.tenantRoles.find((tr) => tr.tenant.slug === slug)?.tenant;
  const features = currentTenant?.features ?? null;

  const items: SidebarItem[] = TENANT_MODULES.filter((m) => isModuleEnabled(m, features)).map((m) => ({
    to: m.path ? `/${slug}/${m.path}` : `/${slug}`,
    label: m.label,
    icon: MODULE_ICONS[m.key] ?? LayoutDashboard,
    end: !m.path,
  }));

  return <Sidebar id="tenant" items={items} />;
}
