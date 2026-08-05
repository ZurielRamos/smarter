import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Radio, Plus, Trash2, ShoppingCart, CalendarCheck, Star, UserPlus, ArrowRightLeft, Check } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/services/api";

interface AdPlatform {
  id: string;
  platform: string;
  name: string | null;
  credentials: Record<string, any>;
  isActive: boolean;
  lastSentAt: string | null;
  totalSent: number;
}

const PLATFORMS = [
  { value: "meta", label: "Meta (Facebook/Instagram)", desc: "Conversions API (CAPI)", fields: [
    { key: "pixelId", label: "Pixel ID", placeholder: "123456789012345", help: "Se encuentra en Meta Events Manager → Data Sources → tu Pixel" },
    { key: "accessToken", label: "Access Token", placeholder: "EAAx...", type: "password", help: "System User Token con permisos ads_management" },
    { key: "testEventCode", label: "Test Event Code (opcional)", placeholder: "TEST12345", help: "Para verificar eventos en modo test antes de ir a producción" },
  ]},
  { value: "google", label: "Google (GA4)", desc: "Measurement Protocol", fields: [
    { key: "measurementId", label: "Measurement ID", placeholder: "G-XXXXXXXXXX", help: "GA4 → Admin → Data Streams → tu stream → Measurement ID" },
    { key: "apiSecret", label: "API Secret", placeholder: "xxxxxxxxxxxxxxx", type: "password", help: "GA4 → Admin → Data Streams → Measurement Protocol API Secrets" },
  ]},
  { value: "tiktok", label: "TikTok Ads", desc: "Events API", fields: [
    { key: "pixelCode", label: "Pixel Code", placeholder: "CXXXXXXXXXXXXXX", help: "TikTok Ads Manager → Assets → Events → Web Events → tu pixel" },
    { key: "accessToken", label: "Access Token", placeholder: "xxxxxxxx", type: "password", help: "TikTok for Business → Marketing API → generar token con scope 'Event' " },
  ]},
];

const CONVERSION_MAP = [
  { type: "purchase", label: "Compra", icon: ShoppingCart, meta: "Purchase", google: "purchase", tiktok: "CompletePayment", value: true },
  { type: "appointment", label: "Cita agendada", icon: CalendarCheck, meta: "Schedule", google: "generate_lead", tiktok: "Contact", value: false },
  { type: "qualified", label: "Lead calificado", icon: Star, meta: "Lead", google: "qualify_lead", tiktok: "SubmitForm", value: false },
  { type: "registration", label: "Registro", icon: UserPlus, meta: "CompleteRegistration", google: "sign_up", tiktok: "CompleteRegistration", value: false },
  { type: "subscription", label: "Suscripción", icon: ArrowRightLeft, meta: "Subscribe", google: "purchase", tiktok: "Subscribe", value: true },
];

export function AdPlatformsCard() {
  const { slug } = useParams();
  const { user } = useAuth();
  const tenantId = user?.tenantRoles.find((tr) => tr.tenant.slug === slug)?.tenantId || "";

  const [platforms, setPlatforms] = useState<AdPlatform[]>([]);
  const [showAddPlatform, setShowAddPlatform] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState("meta");
  const [credentials, setCredentials] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!tenantId) return;
    api.get("/conversions/platforms", { params: { tenantId } }).then(({ data }) => setPlatforms(data)).catch(() => {});
  }, [tenantId]);

  const handleAddPlatform = async () => {
    try {
      const { data } = await api.post("/conversions/platforms", { tenantId, platform: selectedPlatform, credentials, isActive: true });
      setPlatforms((prev) => [...prev, data]);
      setShowAddPlatform(false);
      setCredentials({});
      toast.success("Plataforma conectada. Las conversiones se reportarán automáticamente.");
    } catch { toast.error("Error al conectar"); }
  };

  const handleDeletePlatform = async (id: string) => {
    await api.delete(`/conversions/platforms/${id}`);
    setPlatforms((prev) => prev.filter((p) => p.id !== id));
    toast.success("Plataforma desconectada");
  };

  const connectedPlatformNames = platforms.map((p) => p.platform);
  const currentConfig = PLATFORMS.find((p) => p.value === selectedPlatform);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
        <Radio className="h-4 w-4 text-gray-400" />
        <h2 className="text-sm font-semibold text-gray-900">Plataformas de Ads</h2>
      </div>

      <div className="p-5 space-y-6">
        {/* Info */}
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
          <p className="text-xs text-blue-700">
            Conecta tus plataformas de ads para reportar conversiones automáticamente. Cuando un contacto que llegó por un anuncio complete un evento (compra, cita, etc.), se notificará a la plataforma correspondiente.
          </p>
        </div>

        {/* Connected platforms */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-gray-700">Plataformas conectadas</p>
            <button onClick={() => setShowAddPlatform(true)} className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium">
              <Plus className="h-3 w-3" /> Conectar
            </button>
          </div>

          {platforms.length === 0 && !showAddPlatform && (
            <p className="text-xs text-gray-400 py-3 text-center">No hay plataformas conectadas</p>
          )}

          <div className="space-y-2">
            {platforms.map((p) => {
              const config = PLATFORMS.find((pl) => pl.value === p.platform);
              return (
                <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 bg-gray-50/50">
                  <div className="h-8 w-8 rounded-lg bg-gray-100 flex items-center justify-center">
                    {p.platform === "meta" && <svg className="h-4 w-4" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>}
                    {p.platform === "google" && <svg className="h-4 w-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>}
                    {p.platform === "tiktok" && <svg className="h-4 w-4" viewBox="0 0 24 24" fill="#000"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.88 2.89 2.89 0 01-2.88-2.88 2.89 2.89 0 012.88-2.88c.28 0 .56.04.82.11v-3.5a6.37 6.37 0 00-.82-.05A6.34 6.34 0 003.15 15.7a6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V9.4a8.16 8.16 0 004.76 1.52v-3.4a4.85 4.85 0 01-1-.83z"/></svg>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{config?.label || p.platform}</p>
                    <p className="text-[11px] text-gray-400">{p.totalSent} conversiones enviadas{p.lastSentAt ? ` — Última: ${new Date(p.lastSentAt).toLocaleDateString()}` : ""}</p>
                  </div>
                  <button onClick={() => handleDeletePlatform(p.id)} className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Add platform form */}
          {showAddPlatform && (
            <div className="mt-3 p-4 rounded-xl border border-gray-200 bg-gray-50/50 space-y-4">
              {/* Platform selector (buttons instead of native select) */}
              <div>
                <p className="text-[11px] font-medium text-gray-600 mb-2">Selecciona la plataforma</p>
                <div className="grid grid-cols-3 gap-2">
                  {PLATFORMS.map((p) => {
                    const isSelected = selectedPlatform === p.value;
                    return (
                      <button
                        key={p.value}
                        onClick={() => { setSelectedPlatform(p.value); setCredentials({}); }}
                        className={`p-2.5 rounded-lg border text-center transition-all ${isSelected ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500/20" : "border-gray-200 hover:border-gray-300 hover:bg-white"}`}
                      >
                        <div className="flex justify-center mb-1.5">
                          {p.value === "meta" && <svg className="h-5 w-5" viewBox="0 0 24 24" fill={isSelected ? "#1877F2" : "#9CA3AF"}><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>}
                          {p.value === "google" && <svg className="h-5 w-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill={isSelected ? "#4285F4" : "#9CA3AF"}/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill={isSelected ? "#34A853" : "#D1D5DB"}/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill={isSelected ? "#FBBC05" : "#E5E7EB"}/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill={isSelected ? "#EA4335" : "#9CA3AF"}/></svg>}
                          {p.value === "tiktok" && <svg className="h-5 w-5" viewBox="0 0 24 24" fill={isSelected ? "#000" : "#9CA3AF"}><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.88 2.89 2.89 0 01-2.88-2.88 2.89 2.89 0 012.88-2.88c.28 0 .56.04.82.11v-3.5a6.37 6.37 0 00-.82-.05A6.34 6.34 0 003.15 15.7a6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V9.4a8.16 8.16 0 004.76 1.52v-3.4a4.85 4.85 0 01-1-.83z"/></svg>}
                        </div>
                        <p className={`text-[11px] font-medium ${isSelected ? "text-gray-900" : "text-gray-500"}`}>{p.label.split(" ")[0]}</p>
                        <p className="text-[9px] text-gray-400">{p.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Credential fields */}
              <div className="space-y-2.5">
                {currentConfig?.fields.map((field) => (
                  <div key={field.key}>
                    <label className="block text-[11px] font-medium text-gray-600 mb-1">{field.label}</label>
                    <input
                      type={field.type || "text"}
                      placeholder={field.placeholder}
                      value={credentials[field.key] || ""}
                      onChange={(e) => setCredentials({ ...credentials, [field.key]: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
                    />
                    {field.help && <p className="text-[10px] text-gray-400 mt-0.5">{field.help}</p>}
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => { setShowAddPlatform(false); setCredentials({}); }} className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
                <button onClick={handleAddPlatform} className="px-4 py-1.5 text-xs font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg">Conectar</button>
              </div>
            </div>
          )}
        </div>

        {/* Fixed conversion mapping (read-only reference) */}
        {connectedPlatformNames.length > 0 && (
          <div className="border-t border-gray-100 pt-5">
            <p className="text-xs font-medium text-gray-700 mb-1">Eventos que se reportan automáticamente</p>
            <p className="text-[11px] text-gray-400 mb-3">Cada evento se envía a las plataformas conectadas con el nombre correcto</p>
            <div className="space-y-1.5">
              {CONVERSION_MAP.map((evt) => {
                const Icon = evt.icon;
                const activeNames = connectedPlatformNames
                  .map((p) => {
                    if (p === "meta") return `Meta: ${evt.meta}`;
                    if (p === "google") return `GA4: ${evt.google}`;
                    if (p === "tiktok") return `TikTok: ${evt.tiktok}`;
                    return null;
                  })
                  .filter(Boolean);
                return (
                  <div key={evt.type} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-gray-50">
                    <Icon className="h-3.5 w-3.5 text-gray-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-800">{evt.label}{evt.value ? " (con valor)" : ""}</p>
                      <p className="text-[10px] text-gray-400 truncate">{activeNames.join(" · ")}</p>
                    </div>
                    <Check className="h-3 w-3 text-green-500 shrink-0" />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
