import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Save, Trash2, Wifi, WifiOff, Phone, MessageCircle, Camera, MessageSquare } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import headerBg from "@/assets/header-background.jpg";
import axios from "axios";

const api = axios.create({ baseURL: "http://localhost:3001/api" });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

interface Inbox {
  id: string;
  tenantId: string;
  name: string;
  channel: string;
  status: string;
  channelName: string | null;
  pageId: string | null;
  phoneNumberId: string | null;
  wabaId: string | null;
  accessToken: string | null;
  metadata: Record<string, any> | null;
  createdAt: string;
  updatedAt: string;
}

const CHANNEL_META: Record<string, { label: string; icon: typeof MessageSquare; color: string; bg: string }> = {
  whatsapp: { label: "WhatsApp", icon: Phone, color: "text-green-600", bg: "bg-green-50" },
  messenger: { label: "Messenger", icon: MessageCircle, color: "text-blue-600", bg: "bg-blue-50" },
  instagram: { label: "Instagram", icon: Camera, color: "text-pink-600", bg: "bg-pink-50" },
};

export function InboxSettings() {
  const { slug, id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const tenantRole = user?.tenantRoles.find((tr) => tr.tenant.slug === slug);

  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api.get<Inbox>(`/chats/inboxes/${id}`)
      .then(({ data }) => {
        setInbox(data);
        setName(data.name);
      })
      .catch(() => navigate(`/${slug}/inboxes`))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSave = async () => {
    if (!inbox || !name.trim()) return;
    setSaving(true);
    try {
      const { data } = await api.put<Inbox>(`/chats/inboxes/${inbox.id}`, { name: name.trim() });
      setInbox(data);
    } catch {} finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    if (!inbox) return;
    try {
      const { data } = await api.put<Inbox>(`/chats/inboxes/${inbox.id}`, {
        status: "disconnected",
        accessToken: null,
        pageId: null,
        phoneNumberId: null,
        wabaId: null,
        channelName: null,
      });
      setInbox(data);
    } catch {}
  };

  const handleDelete = async () => {
    if (!inbox) return;
    try {
      await api.delete(`/chats/inboxes/${inbox.id}`);
      navigate(`/${slug}/inboxes`);
    } catch {}
  };

  const handleConnect = () => {
    if (!inbox) return;
    if (inbox.channel === "whatsapp") {
      navigate(`/${slug}/inboxes/new`);
    } else {
      window.location.href = `http://localhost:3001/api/chats/oauth/connect?inboxId=${inbox.id}&channel=${inbox.channel}`;
    }
  };

  if (!inbox && !loading) return null;

  const meta = inbox ? (CHANNEL_META[inbox.channel] || { label: inbox.channel, icon: MessageSquare, color: "text-gray-600", bg: "bg-gray-50" }) : { label: "", icon: MessageSquare, color: "text-gray-600", bg: "bg-gray-50" };
  const Icon = meta.icon;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Hero */}
      <div className="px-8 pt-16 pb-4 shrink-0 rounded-b-2xl" style={{ backgroundImage: `url(${headerBg})`, backgroundSize: "cover", backgroundPosition: "center" }}>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/${slug}/comunicaciones`)} className="p-1.5 rounded-lg hover:bg-white/10 text-white transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white">Configuración de bandeja</h1>
            <p className="text-brand-300 mt-0.5 text-sm">{loading ? "" : inbox.name}</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8">
        {loading || !inbox ? (
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
              <div className="h-4 w-40 bg-gray-200 rounded mb-4" />
              <div className="space-y-3">
                <div className="h-10 bg-gray-100 rounded-lg" />
                <div className="h-10 bg-gray-100 rounded-lg" />
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
              <div className="h-4 w-36 bg-gray-200 rounded mb-4" />
              <div className="h-10 bg-gray-100 rounded-lg" />
            </div>
          </div>
        ) : (
        <div className="max-w-2xl mx-auto space-y-6">
          {/* General info */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Información general</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Nombre de la bandeja</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Canal</label>
                <div className="flex items-center gap-3 px-3 py-2.5 border border-gray-200 rounded-lg bg-gray-50">
                  <div className={`h-8 w-8 rounded-md flex items-center justify-center ${meta.bg}`}>
                    <Icon className={`h-4 w-4 ${meta.color}`} />
                  </div>
                  <span className="text-sm text-gray-700 font-medium">{meta.label}</span>
                </div>
              </div>
              <div className="pt-2">
                <button
                  onClick={handleSave}
                  disabled={saving || name.trim() === inbox.name}
                  className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-brand-800 hover:bg-brand-700 text-white font-medium disabled:opacity-50 transition-colors"
                >
                  <Save className="h-4 w-4" />
                  {saving ? "Guardando..." : "Guardar cambios"}
                </button>
              </div>
            </div>
          </div>

          {/* Connection status / Form builder link */}
          {inbox.channel === "form" ? (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Formulario</h2>
              <p className="text-xs text-gray-500 mb-4">
                Configura los campos y apariencia del formulario público vinculado a esta bandeja.
              </p>
              <button
                onClick={async () => {
                  try {
                    const { data: forms } = await api.get("/forms", { params: { tenantId: inbox.tenantId } });
                    const linked = forms.find((f: any) => f.inboxId === inbox.id);
                    if (linked) navigate(`/${slug}/forms/${linked.id}`);
                  } catch {}
                }}
                className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-brand-800 hover:bg-brand-700 text-white font-medium transition-colors"
              >
                Editar formulario
              </button>
            </div>
          ) : (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Estado de conexión</h2>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {inbox.status === "connected" ? (
                  <div className="flex items-center gap-2 text-green-600">
                    <Wifi className="h-4 w-4" />
                    <span className="text-sm font-medium">Conectada</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-red-500">
                    <WifiOff className="h-4 w-4" />
                    <span className="text-sm font-medium">Desconectada</span>
                  </div>
                )}
                {inbox.channelName && (
                  <span className="text-xs text-gray-400">· {inbox.channelName}</span>
                )}
              </div>
              {inbox.status === "connected" ? (
                <button
                  onClick={handleDisconnect}
                  className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                >
                  Desconectar
                </button>
              ) : (
                <button
                  onClick={handleConnect}
                  className="px-3 py-1.5 text-xs font-medium text-brand-600 border border-brand-200 rounded-lg hover:bg-brand-50 transition-colors"
                >
                  Conectar
                </button>
              )}
            </div>

            {inbox.status === "connected" && (
              <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
                {inbox.phoneNumberId && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Phone Number ID</span>
                    <span className="text-gray-700 font-mono">{inbox.phoneNumberId}</span>
                  </div>
                )}
                {inbox.wabaId && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">WABA ID</span>
                    <span className="text-gray-700 font-mono">{inbox.wabaId}</span>
                  </div>
                )}
                {inbox.pageId && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Page ID</span>
                    <span className="text-gray-700 font-mono">{inbox.pageId}</span>
                  </div>
                )}
              </div>
            )}
          </div>
          )}

          {/* Danger zone */}
          <div className="bg-white rounded-xl border border-red-200 p-6">
            <h2 className="text-sm font-semibold text-red-600 mb-2">Zona de peligro</h2>
            <p className="text-xs text-gray-500 mb-4">
              Eliminar esta bandeja borrará todas las conversaciones y mensajes asociados. Esta acción no se puede deshacer.
            </p>
            {!showDeleteConfirm ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg border border-red-200 text-red-600 hover:bg-red-50 font-medium transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                Eliminar bandeja
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <button
                  onClick={handleDelete}
                  className="px-4 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium transition-colors"
                >
                  Sí, eliminar
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-4 py-2 text-sm rounded-lg text-gray-600 hover:bg-gray-100 font-medium transition-colors"
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
