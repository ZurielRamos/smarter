import { Outlet, useParams, useNavigate, useLocation } from "react-router-dom";
import { MessageSquare, Settings2, Inbox, UserCircle, Megaphone } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import headerBg from "@/assets/header-background.jpg";

export function ComunicacionesLayout() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  const activeView = (() => {
    const path = location.pathname;
    if (path.includes("/agentes")) return "agentes";
    if (path.includes("/equipos")) return "equipos";
    if (path.includes("/etiquetas")) return "etiquetas";
    if (path.includes("/campanas")) return "campanas";
    return "conversaciones";
  })();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const navItems = [
    { key: "conversaciones", path: "conversaciones", icon: <MessageSquare className="h-4.5 w-4.5" />, label: "Conversaciones" },
    { key: "agentes", path: "agentes", icon: <UserCircle className="h-4.5 w-4.5" />, label: "Agentes" },
    {
      key: "equipos",
      path: "equipos",
      icon: (
        <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
      label: "Equipos",
    },
    {
      key: "etiquetas",
      path: "etiquetas",
      icon: (
        <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" />
        </svg>
      ),
      label: "Etiquetas",
    },
    { key: "campanas", path: "campanas", icon: <Megaphone className="h-4.5 w-4.5" />, label: "Campañas" },
  ];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Hero */}
      <div className="px-8 pt-16 pb-3 shrink-0 rounded-b-2xl" style={{ backgroundImage: `url(${headerBg})`, backgroundSize: "cover", backgroundPosition: "center" }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Comunicaciones</h1>
            <p className="text-brand-300 mt-0.5 text-sm">Gestiona las conversaciones de tus canales</p>
          </div>
          <div className="relative" ref={settingsRef}>
            <button
              onClick={() => setSettingsOpen((v) => !v)}
              className="flex items-center justify-center h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              <Settings2 className="h-4 w-4" />
            </button>
            {settingsOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                <button
                  onClick={() => { setSettingsOpen(false); navigate(`/${slug}/inboxes`); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Inbox className="h-4 w-4 text-gray-400" />
                  Bandejas
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main layout */}
      <div className="flex-1 flex overflow-hidden mt-4 rounded-t-xl border border-gray-200 bg-white">
        {/* Icon sidebar */}
        <div className="w-12 border-r border-gray-100 flex flex-col items-center py-3 gap-1 shrink-0 bg-gray-50/50">
          {navItems.map((item) => (
            <div key={item.key} className="relative group/tip">
              <button
                onClick={() => navigate(`/${slug}/comunicaciones/${item.path}`)}
                className={`p-2.5 rounded-lg transition-colors ${activeView === item.key ? "bg-brand-100 text-brand-700" : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"}`}
              >
                {item.icon}
              </button>
              <span className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 rounded-md bg-gray-900 text-white text-[10px] whitespace-nowrap opacity-0 group-hover/tip:opacity-100 pointer-events-none transition-opacity duration-150 z-50">
                {item.label}
              </span>
            </div>
          ))}
        </div>

        {/* Content area — child routes render here */}
        <Outlet />
      </div>
    </div>
  );
}
