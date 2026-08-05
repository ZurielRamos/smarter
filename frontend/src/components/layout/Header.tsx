import { useEffect, useState } from "react";
import { NavLink, useLocation, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Coins, MessageCircle } from "lucide-react";
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
  const [unreadCount, setUnreadCount] = useState(0);

  const currentTenant = user?.tenantRoles?.find((tr) => tr.tenant.slug === slug);
  const tenantId = currentTenant?.tenantId;
  const userRole = currentTenant?.role;

  useEffect(() => {
    if (!tenantId) return;
    api
      .get(`/tenants/${tenantId}/billing/balance`)
      .then(({ data }) => setCredits(data.available))
      .catch(() => setCredits(null));
  }, [tenantId]);

  // Poll unread count every 30s
  useEffect(() => {
    if (!tenantId || !user) return;
    const fetchUnread = () => {
      api.get('/chats/unread-count', { params: { tenantId, userId: user.id, role: userRole } })
        .then(({ data }) => setUnreadCount(data.count))
        .catch(() => {});
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, [tenantId, user?.id, userRole]);

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
        <NavLink
          to={`/${slug}/comunicaciones/conversaciones`}
          className="relative h-8 w-8 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
        >
          <MessageCircle className="h-4 w-4 text-brand-300" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-brand-900">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </NavLink>
        <UserMenu />
      </div>
    </header>
  );
}
