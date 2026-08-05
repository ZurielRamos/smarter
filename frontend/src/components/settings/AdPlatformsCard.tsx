import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Radio, Plus, Trash2, Check, ChevronDown, ShoppingCart, CalendarCheck, Presentation, Star, FileText, UserPlus, ArrowRightLeft, Zap } from "lucide-react";
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

interface ConversionEventConfig {
  id: string;
  triggerType: string;
  triggerValue: string | null;
  name: string;
  platforms: string[];
  metaEventName: string | null;
  googleConversionAction: string | null;
  tiktokEventName: string | null;
  includeValue: boolean;
  defaultValue: number | null;
  currency: string;
  isActive: boolean;
}

const PLATFORMS = [
  { value: "meta", label: "Meta (Facebook/Instagram)", color: "text-blue-600", bg: "bg-blue-50", fields: [
    { key: "pixelId", label: "Pixel ID", placeholder: "123456789012345" },
    { key: "accessToken", label: "Access Token", placeholder: "EAAx...", type: "password" },
    { key: "testEventCode", label: "Test Event Code (opcional)", placeholder: "TEST12345" },
  ]},
  { value: "google", label: "Google Ads", color: "text-red-500", bg: "bg-red-50", fields: [
    { key: "customerId", label: "Customer ID", placeholder: "123-456-7890" },
    { key: "conversionActionId", label: "Conversion Action ID", placeholder: "123456789" },
    { key: "developerToken", label: "Developer Token", placeholder: "aBcDeFg..." },
  ]},
  { value: "tiktok", label: "TikTok Ads", color: "text-black", bg: "bg-gray-100", fields: [
    { key: "pixelCode", label: "Pixel Code", placeholder: "CXXXXXX" },
    { key: "accessToken", label: "Access Token", placeholder: "xxxxxxxx", type: "password" },
  ]},
];

const EVENT_TYPES = [
  { value: "purchase", label: "Compra", icon: ShoppingCart },
  { value: "appointment", label: "Cita", icon: CalendarCheck },
  { value: "demo", label: "Demo", icon: Presentation },
  { value: "qualified", label: "Calificado", icon: Star },
  { value: "proposal", label: "Propuesta", icon: FileText },
  { value: "registration", label: "Registro", icon: UserPlus },
  { value: "subscription", label: "Suscripción", icon: ArrowRightLeft },
  { value: "custom", label: "Personalizado", icon: Zap },
];

const META_EVENTS = ["Purchase", "Lead", "CompleteRegistration", "Schedule", "Contact", "SubmitApplication", "Subscribe", "ViewContent"];
const TIKTOK_EVENTS = ["CompletePayment", "SubmitForm", "Contact", "Subscribe", "PlaceAnOrder", "CompleteRegistration"];

export function AdPlatformsCard() {
  const { slug } = useParams();
  const { user } = useAuth();
  const tenantId = user?.tenantRoles.find((tr) => tr.tenant.slug === slug)?.tenantId || "";

  const [platforms, setPlatforms] = useState<AdPlatform[]>([]);
  const [conversionEvents, setConversionEvents] = useState<ConversionEventConfig[]>([]);
  const [showAddPlatform, setShowAddPlatform] = useState(false);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [newPlatform, setNewPlatform] = useState({ platform: "meta", name: "", credentials: {} as Record<string, string> });
  const [newEvent, setNewEvent] = useState({ triggerType: "purchase", name: "", platforms: [] as string[], metaEventName: "Purchase", tiktokEventName: "CompletePayment", includeValue: true, currency: "COP" });

  useEffect(() => {
    if (!tenantId) return;
    api.get("/conversions/platforms", { params: { tenantId } }).then(({ data }) => setPlatforms(data)).catch(() => {});
    api.get("/conversions/events", { params: { tenantId } }).then(({ data }) => setConversionEvents(data)).catch(() => {});
  }, [tenantId]);

  const handleAddPlatform = async () => {
    try {
      const { data } = await api.post("/conversions/platforms", { tenantId, platform: newPlatform.platform, name: newPlatform.name || null, credentials: newPlatform.credentials, isActive: true });
      setPlatforms((prev) => [...prev, data]);
      setShowAddPlatform(false);
      setNewPlatform({ platform: "meta", name: "", credentials: {} });
      toast.success("Plataforma conectada");
    } catch { toast.error("Error al guardar"); }
  };

  const handleDeletePlatform = async (id: string) => {
    await api.delete(`/conversions/platforms/${id}`);
    setPlatforms((prev) => prev.filter((p) => p.id !== id));
    toast.success("Plataforma eliminada");
  };

  const handleAddEvent = async () => {
    try {
      const { data } = await api.post("/conversions/events", {
        tenantId,
        triggerType: newEvent.triggerType,
        triggerValue: newEvent.triggerType,
        name: newEvent.name || EVENT_TYPES.find((e) => e.value === newEvent.triggerType)?.label || "",
        platforms: newEvent.platforms,
        metaEventName: newEvent.metaEventName,
        tiktokEventName: newEvent.tiktokEventName,
        includeValue: newEvent.includeValue,
        currency: newEvent.currency,
        isActive: true,
      });
      setConversionEvents((prev) => [...prev, data]);
      setShowAddEvent(false);
      setNewEvent({ triggerType: "purchase", name: "", platforms: [], metaEventName: "Purchase", tiktokEventName: "CompletePayment", includeValue: true, currency: "COP" });
      toast.success("Evento de conversión configurado");
    } catch { toast.error("Error al guardar"); }
  };

  const handleDeleteEvent = async (id: string) => {
    await api.delete(`/conversions/events/${id}`);
    setConversionEvents((prev) => prev.filter((e) => e.id !== id));
    toast.success("Configuración eliminada");
  };

  const currentPlatformConfig = PLATFORMS.find((p) => p.value === newPlatform.platform);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
        <Radio className="h-4 w-4 text-gray-400" />
        <h2 className="text-sm font-semibold text-gray-900">Plataformas de Ads y Conversiones</h2>
      </div>

      <div className="p-5 space-y-6">
        {/* Connected platforms */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-gray-700">Plataformas conectadas</p>
            <button onClick={() => setShowAddPlatform(true)} className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium">
              <Plus className="h-3 w-3" /> Agregar
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
                  <div className={`h-8 w-8 rounded-lg ${config?.bg || "bg-gray-100"} flex items-center justify-center`}>
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
            <div className="mt-3 p-4 rounded-xl border border-gray-200 bg-gray-50/50 space-y-3">
              <select value={newPlatform.platform} onChange={(e) => setNewPlatform({ ...newPlatform, platform: e.target.value, credentials: {} })} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30">
                {PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
              {currentPlatformConfig?.fields.map((field) => (
                <input
                  key={field.key}
                  type={field.type || "text"}
                  placeholder={field.label}
                  value={newPlatform.credentials[field.key] || ""}
                  onChange={(e) => setNewPlatform({ ...newPlatform, credentials: { ...newPlatform.credentials, [field.key]: e.target.value } })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                />
              ))}
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowAddPlatform(false)} className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
                <button onClick={handleAddPlatform} className="px-3 py-1.5 text-xs font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg">Conectar</button>
              </div>
            </div>
          )}
        </div>

        {/* Conversion event mapping */}
        <div className="border-t border-gray-100 pt-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs font-medium text-gray-700">Mapeo de conversiones</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Define qué eventos se reportan a cada plataforma</p>
            </div>
            <button onClick={() => setShowAddEvent(true)} className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium">
              <Plus className="h-3 w-3" /> Agregar
            </button>
          </div>

          {conversionEvents.length === 0 && !showAddEvent && (
            <p className="text-xs text-gray-400 py-3 text-center">No hay conversiones configuradas</p>
          )}

          <div className="space-y-2">
            {conversionEvents.map((evt) => {
              const typeConfig = EVENT_TYPES.find((t) => t.value === evt.triggerType);
              const Icon = typeConfig?.icon || Zap;
              return (
                <div key={evt.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 bg-gray-50/50">
                  <Icon className="h-4 w-4 text-gray-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{evt.name}</p>
                    <p className="text-[11px] text-gray-400">
                      Reporta a: {evt.platforms.join(", ") || "ninguna"} — {evt.includeValue ? "Con valor" : "Sin valor"}
                    </p>
                  </div>
                  <button onClick={() => handleDeleteEvent(evt.id)} className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Add event mapping form */}
          {showAddEvent && (
            <div className="mt-3 p-4 rounded-xl border border-gray-200 bg-gray-50/50 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Cuando ocurra</label>
                  <select value={newEvent.triggerType} onChange={(e) => setNewEvent({ ...newEvent, triggerType: e.target.value, name: EVENT_TYPES.find((t) => t.value === e.target.value)?.label || "" })} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30">
                    {EVENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Nombre</label>
                  <input type="text" value={newEvent.name} onChange={(e) => setNewEvent({ ...newEvent, name: e.target.value })} placeholder="Ej: Venta cerrada" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-gray-500 mb-1.5">Reportar a</label>
                <div className="flex gap-2">
                  {PLATFORMS.map((p) => {
                    const isSelected = newEvent.platforms.includes(p.value);
                    return (
                      <button
                        key={p.value}
                        onClick={() => setNewEvent({ ...newEvent, platforms: isSelected ? newEvent.platforms.filter((x) => x !== p.value) : [...newEvent.platforms, p.value] })}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-all ${isSelected ? "border-brand-500 bg-brand-50 text-brand-700 font-medium" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                      >
                        {isSelected && <Check className="h-3 w-3" />}
                        {p.label.split(" ")[0]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {newEvent.platforms.includes("meta") && (
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Evento en Meta CAPI</label>
                  <select value={newEvent.metaEventName} onChange={(e) => setNewEvent({ ...newEvent, metaEventName: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30">
                    {META_EVENTS.map((e) => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>
              )}

              {newEvent.platforms.includes("tiktok") && (
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Evento en TikTok</label>
                  <select value={newEvent.tiktokEventName} onChange={(e) => setNewEvent({ ...newEvent, tiktokEventName: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30">
                    {TIKTOK_EVENTS.map((e) => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>
              )}

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={newEvent.includeValue} onChange={(e) => setNewEvent({ ...newEvent, includeValue: e.target.checked })} className="h-3.5 w-3.5 rounded border-gray-300 text-brand-600" />
                <span className="text-xs text-gray-700">Incluir valor monetario en la conversión</span>
              </label>

              <div className="flex justify-end gap-2">
                <button onClick={() => setShowAddEvent(false)} className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
                <button onClick={handleAddEvent} disabled={newEvent.platforms.length === 0} className="px-3 py-1.5 text-xs font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg disabled:opacity-50">Guardar</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
