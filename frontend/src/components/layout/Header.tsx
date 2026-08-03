import { useEffect, useState } from "react";
import { NavLink, useLocation, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Coins } from "lucide-react";
import { cn } from "@/lib/utils";
import { UserMenu } from "./UserMenu";
import { TenantSelector } from "./TenantSelector";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/services/api";

export function Header() {
  const location = useLocation();
  const { slug } = useParams();
  const { user } = useAuth();
  const [credits, setCredits] = useState<number | null>(null);

  const currentTenant = user?.tenantRoles?.find((tr) => tr.tenant.slug === slug);

  useEffect(() => {
    if (!currentTenant) return;
    api
      .get(`/tenants/${currentTenant.tenantId}/billing/balance`)
      .then(({ data }) => setCredits(data.available))
      .catch(() => setCredits(null));
  }, [currentTenant?.tenantId]);

  const navItems = [
    { to: `/${slug}`, label: "Dashboard" },
    { to: `/${slug}/comunicaciones`, label: "Comunicaciones" },
    { to: `/${slug}/clients`, label: "Contactos" },
  ];

  return (
    <header className="px-8 py-4 flex items-center justify-between">
      {/* Logo / Tenant selector */}
      <TenantSelector />

      {/* Nav - centered */}
      <nav className="flex items-center gap-1">
        {navItems.map((item) => {
          const isActive =
            item.to === `/${slug}`
              ? location.pathname === `/${slug}`
              : location.pathname.startsWith(item.to);

          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === `/${slug}`}
              className={cn(
                "relative px-4 py-1.5 rounded-full text-sm font-medium transition-colors",
                isActive ? "text-white" : "text-brand-300 hover:text-white"
              )}
            >
              {isActive && (
                <motion.span
                  layoutId="nav-indicator"
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
      <div className="flex items-center gap-2">
        {credits !== null && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand-700/50 border border-brand-500/30">
            <Coins className="h-3.5 w-3.5 text-brand-300" />
            <span className="text-xs font-semibold text-white">{credits.toLocaleString()}</span>
          </div>
        )}
        <UserMenu />
      </div>
    </header>
  );
}
