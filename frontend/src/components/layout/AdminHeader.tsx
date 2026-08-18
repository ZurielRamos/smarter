import { NavLink, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { UserMenu } from "./UserMenu";
import { TenantSelector } from "./TenantSelector";

const navItems = [
  { to: "/admin", label: "Dashboard" },
  { to: "/admin/accounts", label: "Cuentas" },
  { to: "/admin/users", label: "Usuarios" },
  { to: "/admin/providers", label: "Proveedores" },
];

export function AdminHeader() {
  const location = useLocation();

  return (
    <header className="px-8 py-4 flex items-center justify-between">
      {/* Logo / Tenant selector */}
      <TenantSelector />

      {/* Nav - centered */}
      <nav className="flex items-center gap-1">
        {navItems.map((item) => {
          const isActive =
            item.to === "/admin"
              ? location.pathname === "/admin"
              : location.pathname.startsWith(item.to);

          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/admin"}
              className={cn(
                "relative px-4 py-1.5 rounded-full text-sm font-medium transition-colors",
                isActive ? "text-white" : "text-brand-300 hover:text-white"
              )}
            >
              {isActive && (
                <motion.span
                  layoutId="admin-nav-indicator"
                  className="absolute inset-0 rounded-full bg-brand-700"
                  transition={{ type: "spring", stiffness: 500, damping: 35, mass: 0.5 }}
                />
              )}
              <span className="relative z-10">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Right side */}
      <div className="flex items-center">
        <UserMenu />
      </div>
    </header>
  );
}
