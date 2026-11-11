import { NavLink, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { UserMenu } from "./UserMenu";
import { TenantSelector } from "./TenantSelector";
import { NotificationBell } from "./NotificationBell";

export interface SidebarItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Coincidencia exacta (p. ej. dashboard raíz). */
  end?: boolean;
}

interface SidebarProps {
  items: SidebarItem[];
  showNotifications?: boolean;
  /** Prefijo único para el layoutId del indicador animado. */
  id: string;
}

/** Sidebar izquierdo delgado, solo iconos. Arriba cuenta, centro módulos, abajo notificaciones y usuario. */
export function Sidebar({ items, showNotifications = true, id }: SidebarProps) {
  const location = useLocation();

  return (
    <aside className="w-14 shrink-0 flex flex-col items-center py-3 gap-2 z-20">
      {/* Top: account selector */}
      <TenantSelector compact />

      {/* Center: modules */}
      <nav className="flex-1 flex flex-col items-center justify-center gap-1.5">
        {items.map((item) => {
          const isActive = item.end
            ? location.pathname === item.to
            : location.pathname.startsWith(item.to);
          const Icon = item.icon;

          return (
            <div key={item.to} className="relative group/tip">
              <NavLink
                to={item.to}
                end={item.end}
                aria-label={item.label}
                className={cn(
                  "relative flex h-9 w-9 items-center justify-center rounded-xl transition-colors",
                  isActive ? "text-white" : "text-brand-300 hover:text-white hover:bg-white/10",
                )}
              >
                {isActive && (
                  <motion.span
                    layoutId={`${id}-nav-indicator`}
                    className="absolute inset-0 rounded-xl bg-brand-700"
                    transition={{ type: "spring", stiffness: 500, damping: 35, mass: 0.5 }}
                  />
                )}
                <Icon className="relative z-10 h-[18px] w-[18px]" />
              </NavLink>
              <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 origin-left scale-90 -translate-x-2 whitespace-nowrap rounded-lg border border-white/10 bg-gray-900 px-3 py-1.5 text-sm font-medium text-white opacity-0 shadow-xl transition-all duration-200 ease-out group-hover/tip:translate-x-0 group-hover/tip:scale-100 group-hover/tip:opacity-100">
                {item.label}
                <span className="absolute right-full top-1/2 -mr-1 h-2 w-2 -translate-y-1/2 rotate-45 border-b border-l border-white/10 bg-gray-900" />
              </span>
            </div>
          );
        })}
      </nav>

      {/* Bottom: notifications + user */}
      <div className="flex flex-col items-center gap-2">
        {showNotifications && <NotificationBell />}
        <UserMenu />
      </div>
    </aside>
  );
}
