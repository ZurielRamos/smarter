import { useState, useRef, useEffect } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Check } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import iconSvg from "@/assets/icon.svg";

export function TenantSelector() {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const { slug } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const menuRef = useRef<HTMLDivElement>(null);

  const tenants = user?.tenantRoles ?? [];
  const isOnAdmin = location.pathname.startsWith("/admin");
  const currentTenant = tenants.find((tr) => tr.tenant.slug === slug);

  // Count total options (tenants + super admin if applicable)
  const totalOptions = tenants.length + (user?.isSuperAdmin ? 1 : 0);
  const hasMultipleOptions = totalOptions > 1;

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

  function handleSelect(tenantSlug: string) {
    setOpen(false);
    navigate(`/${tenantSlug}`, { replace: true });
  }

  function handleSelectAdmin() {
    setOpen(false);
    navigate("/admin", { replace: true });
  }

  // Determine what to show as the current selection
  const currentLabel = isOnAdmin ? "Smarter Admin" : currentTenant?.tenant.name ?? "Smarter";
  const currentIcon = isOnAdmin
    ? null
    : currentTenant?.tenant.iconPath
      ? `/${currentTenant.tenant.iconPath}`
      : null;

  // If only one option and not super admin, just show static
  if (!hasMultipleOptions) {
    return (
      <div className="shrink-0 flex items-center gap-3">
        {currentIcon ? (
          <img src={currentIcon} alt={currentLabel} className="h-8 w-8 rounded-lg object-cover" />
        ) : (
          <img src={iconSvg} alt="Smarter" className="h-8 w-8 object-contain invert brightness-0" style={{ filter: 'invert(1)' }} />
        )}
        <span className="text-sm font-medium text-white">{currentLabel}</span>
      </div>
    );
  }

  return (
    <div className="relative shrink-0" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2.5 hover:opacity-80 transition-opacity cursor-pointer"
      >
        {isOnAdmin ? (
          <img src={iconSvg} alt="Smarter" className="h-8 w-8 object-contain" style={{ filter: 'invert(1)' }} />
        ) : currentIcon ? (
          <img src={currentIcon} alt={currentLabel} className="h-8 w-8 rounded-lg object-cover" />
        ) : (
          <img src={iconSvg} alt="Smarter" className="h-8 w-8 object-contain" style={{ filter: 'invert(1)' }} />
        )}
        <span className="text-sm font-medium text-white">{currentLabel}</span>
        <ChevronDown
          className={`h-4 w-4 text-brand-300 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute left-0 top-12 w-72 bg-white rounded-xl shadow-lg border border-gray-200 py-2 z-50 origin-top-left"
          >
            <div className="px-4 py-2 border-b border-gray-100">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                Cuentas
              </p>
            </div>
            <div className="py-1 max-h-64 overflow-y-auto">
              {/* Super Admin option */}
              {user?.isSuperAdmin && (
                <button
                  onClick={handleSelectAdmin}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors"
                >
                  <img src={iconSvg} alt="Smarter Admin" className="h-8 w-8 object-contain" />
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium text-gray-900">Smarter Admin</p>
                    <p className="text-xs text-gray-400">Panel de administración</p>
                  </div>
                  {isOnAdmin && <Check className="h-4 w-4 text-accent-500" />}
                </button>
              )}

              {/* Tenant options */}
              {tenants.map((tr) => (
                <button
                  key={tr.tenantId}
                  onClick={() => handleSelect(tr.tenant.slug)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors"
                >
                  {tr.tenant.iconPath ? (
                    <img
                      src={`/${tr.tenant.iconPath}`}
                      alt={tr.tenant.name}
                      className="h-8 w-8 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="h-8 w-8 rounded-lg bg-brand-100 flex items-center justify-center text-xs font-bold text-brand-700">
                      {tr.tenant.name.charAt(0)}
                    </div>
                  )}
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium text-gray-900">{tr.tenant.name}</p>
                    <p className="text-xs text-gray-400">{tr.role === "admin" ? "Administrador" : "Agente"}</p>
                  </div>
                  {tr.tenant.slug === slug && !isOnAdmin && (
                    <Check className="h-4 w-4 text-accent-500" />
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
