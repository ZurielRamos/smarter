import { useState, useRef, useEffect } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { User, LogOut, Settings2, Coins, Users, Sun, Moon, Monitor } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useTheme, type ThemePreference } from "@/context/ThemeContext";
import { api } from "@/services/api";
import { PresenceIndicator } from "@/components/ui/PresenceIndicator";
import { usePresence } from "@/hooks/usePresence";

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Oscuro", icon: Moon },
  { value: "system", label: "Sistema", icon: Monitor },
];

export function UserMenu() {
  const [open, setOpen] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const { slug } = useParams();
  const location = useLocation();
  const menuRef = useRef<HTMLDivElement>(null);

  const isOnTenant = !!slug && !location.pathname.startsWith("/admin");
  const isAdmin = user?.isSuperAdmin;
  const isOnAdmin = location.pathname.startsWith("/admin");
  const currentRole = user?.tenantRoles.find((tr) => tr.tenant.slug === slug);
  const tenantId = currentRole?.tenantId;
  const { getStatus } = usePresence();
  const myStatus = user?.id ? getStatus(user.id) : "offline";

  const initials = user?.name
    ?.split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() ?? "U";

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // Fetch credits balance
  useEffect(() => {
    if (!tenantId) return;
    api
      .get(`/tenants/${tenantId}/billing/balance`)
      .then(({ data }) => setCredits(data.available))
      .catch(() => setCredits(null));
  }, [tenantId]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="relative h-9 w-9 rounded-full bg-accent-500 flex items-center justify-center text-xs font-bold text-white hover:ring-2 hover:ring-accent-300 transition-all cursor-pointer overflow-visible"
      >
        <span className="h-full w-full rounded-full overflow-hidden flex items-center justify-center">
          {user?.avatarPath ? (
            <img
              src={user.avatarPath.startsWith("http") ? user.avatarPath : `/${user.avatarPath}`}
              alt={user.name}
              className="h-full w-full object-cover"
            />
          ) : (
            initials
          )}
        </span>
        <PresenceIndicator
          status={myStatus}
          size="md"
          className="absolute -bottom-0.5 -right-0.5"
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute right-0 top-12 w-64 bg-popover text-popover-foreground rounded-xl shadow-lg border border-border py-2 z-50 origin-top-right"
          >
            {/* User info */}
            <div className="px-4 py-3 border-b border-border">
              <p className="text-sm font-medium text-foreground truncate">
                {user?.name}
              </p>
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {user?.email}
              </p>
              {isOnTenant && (() => {
                if (!currentRole) return null;
                return (
                  <span className={`inline-block mt-1.5 text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    currentRole.role === "owner" ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" : currentRole.role === "admin" ? "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300" : "bg-muted text-muted-foreground"
                  }`}>
                    {currentRole.role === "owner" ? "Propietario" : currentRole.role === "admin" ? "Administrador" : "Agente"}
                  </span>
                );
              })()}
            </div>

            {/* Credits */}
            {isOnTenant && credits !== null && (
              <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
                <Coins className="h-4 w-4 text-amber-500" />
                <span className="text-sm font-medium text-foreground">{credits.toLocaleString()}</span>
                <span className="text-xs text-muted-foreground">créditos</span>
              </div>
            )}

            {/* Options */}
            <div className="py-1">
              <button
                onClick={() => {
                  setOpen(false);
                  navigate(`/${slug}/profile`);
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
              >
                <User className="h-4 w-4 text-muted-foreground" />
                Perfil
              </button>
              {isOnTenant && (currentRole?.role === "owner" || currentRole?.role === "admin" || isAdmin) && (
                <button
                  onClick={() => {
                    setOpen(false);
                    navigate(`/${slug}/settings`);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                >
                  <Settings2 className="h-4 w-4 text-muted-foreground" />
                  Configurar cuenta
                </button>
              )}
              {isOnTenant && (currentRole?.role === "owner" || currentRole?.role === "admin" || isAdmin) && (
                <button
                  onClick={() => {
                    setOpen(false);
                    navigate(`/${slug}/team`);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                >
                  <Users className="h-4 w-4 text-muted-foreground" />
                  Administrar equipo
                </button>
              )}
              {isOnAdmin && (
                <button
                  onClick={() => {
                    setOpen(false);
                    navigate("/admin/billing?config=1");
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                >
                  <Coins className="h-4 w-4 text-muted-foreground" />
                  Configurar consumos
                </button>
              )}
              {/* Theme selector */}
              <div className="px-4 py-2.5 border-t border-border">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  Apariencia
                </p>
                <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
                  {THEME_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    const active = theme === opt.value;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setTheme(opt.value)}
                        className={`flex flex-col items-center gap-1 rounded-md py-1.5 text-[11px] font-medium transition-colors ${
                          active
                            ? "bg-card text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                        aria-pressed={active}
                      >
                        <Icon className="h-4 w-4" />
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors border-t border-border"
              >
                <LogOut className="h-4 w-4 text-red-400" />
                Cerrar sesión
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
