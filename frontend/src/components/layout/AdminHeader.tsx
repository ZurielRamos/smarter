import { LayoutDashboard, Building2, Users, Plug } from "lucide-react";
import { Sidebar, type SidebarItem } from "./Sidebar";

const items: SidebarItem[] = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/admin/accounts", label: "Cuentas", icon: Building2 },
  { to: "/admin/users", label: "Usuarios", icon: Users },
  { to: "/admin/providers", label: "Proveedores", icon: Plug },
];

/** Navegación del panel admin (sidebar izquierdo de iconos). */
export function AdminHeader() {
  return <Sidebar id="admin" items={items} showNotifications={false} />;
}
