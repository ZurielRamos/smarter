import { useState, useEffect } from "react";
import { useNavigate, useParams, Outlet } from "react-router-dom";
import { Plus, Megaphone, MessageSquare, Phone, Send, Mail, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import axios from "axios";

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "/api" });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  status: string;
  channel: string | null;
  matchedCount: number;
  createdAt: string;
}

const channels = [
  { value: "sms", label: "SMS", description: "Mensajes de texto cortos", icon: MessageSquare, color: "border-blue-200 bg-blue-50 text-blue-700", activeColor: "border-blue-500 bg-blue-50 ring-2 ring-blue-200" },
  { value: "whatsapp", label: "WhatsApp", description: "Mensajes con plantillas", icon: Send, color: "border-green-200 bg-green-50 text-green-700", activeColor: "border-green-500 bg-green-50 ring-2 ring-green-200" },
  { value: "email", label: "Email", description: "Correos personalizados", icon: Mail, color: "border-purple-200 bg-purple-50 text-purple-700", activeColor: "border-purple-500 bg-purple-50 ring-2 ring-purple-200" },
  { value: "llamada", label: "Llamada", description: "Llamadas de voz", icon: Phone, color: "border-orange-200 bg-orange-50 text-orange-700", activeColor: "border-orange-500 bg-orange-50 ring-2 ring-orange-200" },
];

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  active: "bg-green-100 text-green-700",
  paused: "bg-yellow-100 text-yellow-700",
  completed: "bg-blue-100 text-blue-700",
};

export function Campanas() {
  const navigate = useNavigate();
  const { slug, campaignId } = useParams();
  const { user } = useAuth();
  const currentTenant = user?.tenantRoles.find((tr) => tr.tenant.slug === slug);
  const tenantId = currentTenant?.tenantId;

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [channel, setChannel] = useState("sms");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadCampaigns();
  }, [tenantId]);

  const loadCampaigns = async () => {
    setLoading(true);
    try {
      const { data } = await api.get<Campaign[]>("/campaigns", { params: tenantId ? { tenantId } : {} });
      setCampaigns(data);
    } catch {} finally { setLoading(false); }
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const { data } = await api.post<Campaign>("/campaigns", { name, description, channel, segments: [], tenantId });
      setShowModal(false);
      resetForm();
      loadCampaigns();
      navigate(`/${slug}/comunicaciones/campanas/${data.id}`);
    } catch {} finally { setSaving(false); }
  };

  const resetForm = () => { setName(""); setDescription(""); setChannel("sms"); };

  const channelIcon = (ch: string | null) => {
    switch (ch) {
      case "sms": return <MessageSquare className="h-4 w-4 text-blue-500" />;
      case "whatsapp": return <Send className="h-4 w-4 text-green-500" />;
      case "email": return <Mail className="h-4 w-4 text-purple-500" />;
      case "llamada": return <Phone className="h-4 w-4 text-orange-500" />;
      default: return <Megaphone className="h-4 w-4 text-gray-400" />;
    }
  };

  return (
    <>
      {/* Campaign list sidebar */}
      <div className="w-80 border-r border-gray-200 flex flex-col shrink-0">
        <div className="px-3 py-2.5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Campañas</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">{campaigns.length} campañas</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="p-1.5 rounded-lg text-brand-600 hover:bg-brand-50 transition-colors"
            title="Nueva campaña"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-5 w-5 border-2 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
            </div>
          ) : campaigns.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <Megaphone className="h-8 w-8 text-gray-300 mb-2" />
              <p className="text-sm text-gray-500">Sin campañas</p>
              <p className="text-[11px] text-gray-400 mt-1">Crea tu primera campaña para empezar</p>
            </div>
          ) : (
            campaigns.map((c) => (
              <button
                key={c.id}
                onClick={() => navigate(`/${slug}/comunicaciones/campanas/${c.id}`)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-gray-50 transition-colors ${campaignId === c.id ? "bg-brand-50" : "hover:bg-gray-50"}`}
              >
                <div className="h-9 w-9 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                  {channelIcon(c.channel)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                    <span className={`ml-2 px-1.5 py-0.5 rounded text-[9px] font-medium shrink-0 ${statusColors[c.status] || statusColors.draft}`}>
                      {c.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5 truncate">
                    {c.matchedCount.toLocaleString()} clientes · {c.channel || "sin canal"}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Campaign detail panel */}
      <Outlet />

      {/* Create Campaign Modal */}
      <AnimatePresence>
        {showModal && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/40 z-50" onClick={() => { setShowModal(false); resetForm(); }} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="px-6 pt-6 pb-4 border-b border-gray-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">Nueva Campaña</h2>
                      <p className="text-sm text-gray-500 mt-0.5">Define los datos básicos de tu campaña.</p>
                    </div>
                    <button onClick={() => { setShowModal(false); resetForm(); }} className="text-gray-400 hover:text-gray-600 transition-colors">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>
                <div className="px-6 py-5 space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Nombre</label>
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Promoción fin de semana" className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Descripción <span className="text-gray-400 font-normal">(opcional)</span></label>
                    <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripción de la campaña" rows={3} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all resize-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Canal</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {channels.map((ch) => {
                        const Icon = ch.icon;
                        const isActive = channel === ch.value;
                        return (
                          <button key={ch.value} type="button" onClick={() => setChannel(ch.value)} className={cn("flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all cursor-pointer", isActive ? ch.activeColor : "border-gray-200 hover:border-gray-300 bg-white")}>
                            <Icon className={cn("h-5 w-5", isActive ? "" : "text-gray-400")} />
                            <span className={cn("text-xs font-medium", isActive ? "" : "text-gray-600")}>{ch.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-3">
                  <Button onClick={() => { setShowModal(false); resetForm(); }} variant="outline" size="sm">Cancelar</Button>
                  <Button onClick={handleCreate} disabled={saving || !name.trim()} size="sm" className="bg-brand-800 hover:bg-brand-700 text-white">
                    {saving ? "Creando..." : "Crear Campaña"}
                  </Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
