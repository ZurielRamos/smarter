import { useEffect, useState } from "react";
import { NavLink, useLocation, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { UserMenu } from "./UserMenu";
import { TenantSelector } from "./TenantSelector";
import { NotificationBell } from "./NotificationBell";
import { useAuth } from "@/context/AuthContext";

export function Header() {
  const location = useLocation();
  const { slug } = useParams();
  const { user } = useAuth();

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
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  );
}
