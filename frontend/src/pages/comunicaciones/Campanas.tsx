import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams, Outlet } from "react-router-dom";
import { Plus, Megaphone, MessageSquare, Phone, Send, Mail, X, Trash2 } from "lucide-react";
import { WhatsAppIcon } from "@/components/ChannelIcons";
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

interface InboxOption {
  id: string;
  name: string;
  channel: string;
  status: string;
  channelName: string | null;
}

const CAMPAIGN_CHANNELS = ["sms", "whatsapp", "llamada", "email"];

const channelMeta: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string; activeColor: string }> = {
  sms: { label: "SMS", icon: MessageSquare, color: "border-blue-200 bg-blue-50 text-blue-700", activeColor: "border-blue-500 bg-blue-50 ring-2 ring-blue-200" },
  whatsapp: { label: "WhatsApp", icon: WhatsAppIcon, color: "border-green-200 bg-green-50 text-green-700", activeColor: "border-green-500 bg-green-50 ring-2 ring-green-200" },
  email: { label: "Email", icon: Mail, color: "border-purple-200 bg-purple-50 text-purple-700", activeColor: "border-purple-500 bg-purple-50 ring-2 ring-purple-200" },
  llamada: { label: "Llamada", icon: Phone, color: "border-orange-200 bg-orange-50 text-orange-700", activeColor: "border-orange-500 bg-orange-50 ring-2 ring-orange-200" },
};

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  active: "bg-green-100 text-green-700",
  paused: "bg-yellow-100 text-yellow-700",
  completed: "bg-blue-100 text-blue-700",
};

const statusLabels: Record<string, string> = {
  draft: "borrador",
  active: "activa",
  paused: "pausada",
  completed: "enviada",
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
  const [selectedInboxId, setSelectedInboxId] = useState<string | null>(null);
  const [inboxes, setInboxes] = useState<InboxOption[]>([]);
  const [loadingInboxes, setLoadingInboxes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; campaign: Campaign } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

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

  const loadInboxes = async () => {
    if (!tenantId) return;
    setLoadingInboxes(true);
    try {
      const { data } = await api.get<InboxOption[]>("/chats/inboxes", { params: { tenantId } });
      setInboxes(data);
    } catch {} finally { setLoadingInboxes(false); }
  };

  useEffect(() => {
    if (showModal) loadInboxes();
  }, [showModal]);

  useEffect(() => {
    if (!contextMenu) return;
    function handleClick(e: MouseEvent) {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) setContextMenu(null);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [contextMenu]);

  const handleDeleteCampaign = async (campaign: Campaign) => {
    setContextMenu(null);
    try {
      await api.delete(`/campaigns/${campaign.id}`);
      setCampaigns((prev) => prev.filter((c) => c.id !== campaign.id));
      if (campaignId === campaign.id) navigate(`/${slug}/comunicaciones/campanas`, { replace: true });
    } catch {}
  };

  const handleCreate = async () => {
    if (!name.trim() || !selectedInboxId) return;
    const selectedInbox = inboxes.find((i) => i.id === selectedInboxId);
    if (!selectedInbox) return;
    setSaving(true);
    try {
      const { data } = await api.post<Campaign>("/campaigns", {
        name,
        description,
        channel: selectedInbox.channel,
        inboxId: selectedInboxId,
        segments: [],
        tenantId,
      });
      setShowModal(false);
      resetForm();
      loadCampaigns();
      navigate(`/${slug}/comunicaciones/campanas/${data.id}`);
    } catch {} finally { setSaving(false); }
  };

  const resetForm = () => { setName(""); setDescription(""); setSelectedInboxId(null); };

  const channelIcon = (ch: string | null) => {
    switch (ch) {
      case "sms": return <MessageSquare className="h-4 w-4 text-blue-500" />;
      case "whatsapp": return <WhatsAppIcon className="h-4 w-4 text-green-500" />;
      case "email": return <Mail className="h-4 w-4 text-purple-500" />;
      case "llamada": return <Phone className="h-4 w-4 text-orange-500" />;
      default: return <Megaphone className="h-4 w-4 text-gray-400" />;
    }
  };

  return (
    <>
      {/* Campaign list sidebar */}
      <div className="w-80 border-r border-gray-200 flex flex-col shrink-0">
        <div className="px-3 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-gray-500 uppercase">Campañas</h3>
          <button
            onClick={() => setShowModal(true)}
            className="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
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
                onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, campaign: c }); }}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-gray-50 transition-colors ${campaignId === c.id ? "bg-brand-50" : "hover:bg-gray-50"}`}
              >
                <div className="h-9 w-9 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                  {channelIcon(c.channel)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                    <span className={`ml-2 px-1.5 py-0.5 rounded text-[9px] font-medium shrink-0 ${statusColors[c.status] || statusColors.draft}`}>
                      {statusLabels[c.status] || c.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5 truncate">
                    {c.channel || "sin canal"}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Campaign detail panel */}
      <Outlet />

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-[60] w-44 bg-white rounded-lg shadow-lg border border-gray-200 py-1 animate-in fade-in zoom-in-95 duration-100"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button
            onClick={() => handleDeleteCampaign(contextMenu.campaign)}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
          >
            <Trash2 className="h-4 w-4 text-red-400" />
            Eliminar campaña
          </button>
        </div>
      )}

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
                    <label className="block text-sm font-medium text-gray-700 mb-2">Bandeja</label>
                    {loadingInboxes ? (
                      <div className="flex items-center justify-center py-6">
                        <div className="h-5 w-5 border-2 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
                      </div>
                    ) : inboxes.filter((i) => CAMPAIGN_CHANNELS.includes(i.channel) && i.status === "connected").length === 0 ? (
                      <div className="text-center py-4 text-sm text-gray-500 border border-dashed border-gray-300 rounded-lg">
                        No hay bandejas conectadas para campañas
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto">
                        {inboxes.filter((i) => CAMPAIGN_CHANNELS.includes(i.channel) && i.status === "connected").map((inbox) => {
                          const meta = channelMeta[inbox.channel];
                          if (!meta) return null;
                          const Icon = meta.icon;
                          const isActive = selectedInboxId === inbox.id;
                          return (
                            <button
                              key={inbox.id}
                              type="button"
                              onClick={() => setSelectedInboxId(inbox.id)}
                              className={cn(
                                "flex items-center gap-3 p-3 rounded-xl border-2 transition-all cursor-pointer text-left",
                                isActive ? meta.activeColor : "border-gray-200 hover:border-gray-300 bg-white"
                              )}
                            >
                              <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", isActive ? "" : "bg-gray-100")}>
                                <Icon className={cn("h-4 w-4", isActive ? "" : "text-gray-400")} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={cn("text-sm font-medium truncate", isActive ? "" : "text-gray-700")}>{inbox.name}</p>
                                <p className="text-[11px] text-gray-400 truncate">{meta.label}{inbox.channelName ? ` · ${inbox.channelName}` : ""}</p>
                              </div>
                              <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-medium bg-green-100 text-green-700")}>
                                Conectada
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Nombre</label>
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Promoción fin de semana" className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Descripción <span className="text-gray-400 font-normal">(opcional)</span></label>
                    <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripción de la campaña" rows={3} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all resize-none" />
                  </div>
                </div>
                <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-3">
                  <Button onClick={() => { setShowModal(false); resetForm(); }} variant="outline" size="sm">Cancelar</Button>
                  <Button onClick={handleCreate} disabled={saving || !name.trim() || !selectedInboxId} size="sm" className="bg-brand-800 hover:bg-brand-700 text-white">
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
