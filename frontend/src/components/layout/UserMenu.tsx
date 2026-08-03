import { useState, useRef, useEffect } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { User, LogOut, Settings2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export function UserMenu() {
  const [open, setOpen] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { slug } = useParams();
  const location = useLocation();
  const menuRef = useRef<HTMLDivElement>(null);

  const isOnTenant = !!slug && !location.pathname.startsWith("/admin");
  const isAdmin = user?.isSuperAdmin;

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

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="h-9 w-9 rounded-full bg-accent-500 flex items-center justify-center text-xs font-bold text-white hover:ring-2 hover:ring-accent-300 transition-all cursor-pointer"
      >
        {initials}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute right-0 top-12 w-64 bg-white rounded-xl shadow-lg border border-gray-200 py-2 z-50 origin-top-right"
          >
            {/* User info */}
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-sm font-medium text-gray-900 truncate">
                {user?.name}
              </p>
              <p className="text-xs text-gray-500 truncate mt-0.5">
                {user?.email}
              </p>
              {isOnTenant && (() => {
                const currentRole = user?.tenantRoles.find((tr) => tr.tenant.slug === slug);
                if (!currentRole) return null;
                return (
                  <span className={`inline-block mt-1.5 text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    currentRole.role === "admin" ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-600"
                  }`}>
                    {currentRole.role === "admin" ? "Administrador" : "Agente"}
                  </span>
                );
              })()}
            </div>

            {/* Options */}
            <div className="py-1">
              <button
                onClick={() => {
                  setOpen(false);
                  // TODO: navigate to profile page
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <User className="h-4 w-4 text-gray-400" />
                Perfil
              </button>
              {isOnTenant && isAdmin && (
                <button
                  onClick={() => {
                    setOpen(false);
                    navigate(`/${slug}/settings`);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Settings2 className="h-4 w-4 text-gray-400" />
                  Configurar cuenta
                </button>
              )}
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
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
