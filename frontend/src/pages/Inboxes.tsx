import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Plus, Settings2, Trash2, MessageCircle, Phone, Camera, MessageSquare, Mail, Wifi, WifiOff, ArrowLeft, Smartphone } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import headerBg from "@/assets/header-background.jpg";
import axios from "axios";

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "/api" });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

interface Inbox {
  id: string;
  name: string;
  channel: string;
  status: string;
  channelName: string | null;
  pageId: string | null;
  phoneNumberId: string | null;
  createdAt: string;
}

const CHANNEL_META: Record<string, { label: string; icon: typeof MessageSquare; color: string; bg: string }> = {
  whatsapp: { label: "WhatsApp", icon: Phone, color: "text-green-600", bg: "bg-green-50" },
  messenger: { label: "Messenger", icon: MessageCircle, color: "text-blue-600", bg: "bg-blue-50" },
  instagram: { label: "Instagram", icon: Camera, color: "text-pink-600", bg: "bg-pink-50" },
  sms: { label: "SMS", icon: MessageSquare, color: "text-sky-600", bg: "bg-sky-50" },
  llamada: { label: "Llamada", icon: Phone, color: "text-purple-600", bg: "bg-purple-50" },
  email: { label: "Email", icon: Mail, color: "text-orange-600", bg: "bg-orange-50" },
  chat: { label: "Chat", icon: MessageCircle, color: "text-teal-600", bg: "bg-teal-50" },
  evolution: { label: "Chat Genérico", icon: Smartphone, color: "text-emerald-600", bg: "bg-emerald-50" },
};

export function Inboxes() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const tenantRole = user?.tenantRoles.find((tr) => tr.tenant.slug === slug);
  const tenantId = tenantRole?.tenantId || "";

  const [inboxes, setInboxes] = useState<Inbox[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    loadInboxes();
  }, [tenantId]);

  const loadInboxes = () => {
    setLoading(true);
    api.get<Inbox[]>("/chats/inboxes", { params: { tenantId } })
      .then(({ data }) => setInboxes(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/chats/inboxes/${id}`);
      setInboxes((prev) => prev.filter((i) => i.id !== id));
    } catch {}
  };

  const handleConnect = (inbox: Inbox) => {
    window.location.href = `/api/chats/oauth/connect?inboxId=${inbox.id}&channel=${inbox.channel}`;
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Hero */}
      <div className="px-8 pt-16 pb-4 shrink-0 rounded-b-2xl" style={{ backgroundImage: `url(${headerBg})`, backgroundSize: "cover", backgroundPosition: "center" }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(`/${slug}/comunicaciones`)} className="p-1.5 rounded-lg hover:bg-white/10 text-white transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-white">Bandejas de entrada</h1>
              <p className="text-brand-300 mt-0.5 text-sm">
                Gestiona los canales de comunicación conectados
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate(`/${slug}/inboxes/new`)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-sm font-medium transition-colors"
          >
            <Plus className="h-4 w-4" />
            Añadir bandeja
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-3xl mx-auto">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <p className="text-sm text-gray-500 mb-6">
              Una bandeja de entrada es donde administras las conversaciones de un canal específico.
              Puede incluir comunicaciones de WhatsApp, Messenger o Instagram.
            </p>

            {loading ? (
              <div className="py-8 text-center text-sm text-gray-400">Cargando...</div>
            ) : inboxes.length === 0 ? (
              <div className="py-12 text-center">
                <MessageSquare className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-600 font-medium">Sin bandejas creadas</p>
                <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
                  Crea tu primera bandeja de entrada para empezar a recibir y gestionar conversaciones de tus clientes.
                </p>
                <button
                  onClick={() => navigate(`/${slug}/inboxes/new`)}
                  className="mt-4 px-4 py-2 text-sm rounded-lg bg-brand-800 hover:bg-brand-700 text-white font-medium"
                >
                  Crear primera bandeja
                </button>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {inboxes.map((inbox) => {
                  const meta = CHANNEL_META[inbox.channel] || { label: inbox.channel, icon: MessageSquare, color: "text-gray-600", bg: "bg-gray-50" };
                  const Icon = meta.icon;

                  return (
                    <div key={inbox.id} className="flex items-center justify-between py-4">
                      <div className="flex items-center gap-4">
                        <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${meta.bg}`}>
                          <Icon className={`h-5 w-5 ${meta.color}`} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-gray-900">{inbox.name}</p>
                            {inbox.status === "connected" ? (
                              <span className="flex items-center gap-1 text-[10px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full font-medium">
                                <Wifi className="h-2.5 w-2.5" /> Conectada
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-[10px] text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full font-medium">
                                <WifiOff className="h-2.5 w-2.5" /> Desconectada
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">
                            Canal {meta.label}{inbox.channelName ? ` · ${inbox.channelName}` : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {inbox.status === "disconnected" && (
                          <button
                            onClick={() => handleConnect(inbox)}
                            className="px-3 py-1.5 text-xs font-medium text-brand-600 border border-brand-200 rounded-lg hover:bg-brand-50 transition-colors"
                          >
                            Conectar
                          </button>
                        )}
                        <button
                          onClick={() => navigate(`/${slug}/inboxes/${inbox.id}/settings`)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                        >
                          <Settings2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(inbox.id)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
