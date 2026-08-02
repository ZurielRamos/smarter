import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Plus, Megaphone, MessageSquare, Phone, X, Send, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import axios from "axios";
import headerBg from "@/assets/header-background.jpg";

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
  {
    value: "sms",
    label: "SMS",
    description: "Mensajes de texto cortos y directos",
    icon: MessageSquare,
    color: "border-blue-200 bg-blue-50 text-blue-700",
    activeColor: "border-blue-500 bg-blue-50 ring-2 ring-blue-200",
  },
  {
    value: "whatsapp",
    label: "WhatsApp",
    description: "Mensajes enriquecidos con plantillas",
    icon: Send,
    color: "border-green-200 bg-green-50 text-green-700",
    activeColor: "border-green-500 bg-green-50 ring-2 ring-green-200",
  },
  {
    value: "email",
    label: "Email",
    description: "Correos electrónicos personalizados",
    icon: Mail,
    color: "border-purple-200 bg-purple-50 text-purple-700",
    activeColor: "border-purple-500 bg-purple-50 ring-2 ring-purple-200",
  },
  {
    value: "llamada",
    label: "Llamada",
    description: "Llamadas automatizadas de voz",
    icon: Phone,
    color: "border-orange-200 bg-orange-50 text-orange-700",
    activeColor: "border-orange-500 bg-orange-50 ring-2 ring-orange-200",
  },
];

export function Campaigns() {
  const navigate = useNavigate();
  const { slug } = useParams();
  const { user } = useAuth();
  const currentTenant = user?.tenantRoles.find((tr) => tr.tenant.slug === slug);
  const tenantId = currentTenant?.tenantId;

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // Create form state
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
      const { data } = await api.get<Campaign[]>("/campaigns", {
        params: tenantId ? { tenantId } : {},
      });
      setCampaigns(data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const { data } = await api.post<Campaign>("/campaigns", {
        name,
        description,
        channel,
        segments: [],
        tenantId,
      });
      setShowModal(false);
      resetForm();
      navigate(`/${slug}/campaigns/${data.id}`);
    } catch {
      // error
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setName("");
    setDescription("");
    setChannel("sms");
  };

  const statusColors: Record<string, string> = {
    draft: "bg-gray-100 text-gray-600",
    active: "bg-green-100 text-green-700",
    completed: "bg-blue-100 text-blue-700",
    paused: "bg-orange-100 text-orange-700",
  };

  const channelIcon = (ch: string | null) => {
    switch (ch?.toLowerCase()) {
      case "sms":
        return <MessageSquare className="h-5 w-5 text-blue-500" />;
      case "whatsapp":
        return (
          <svg className="h-5 w-5 text-green-500" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
        );
      case "email":
        return <Mail className="h-5 w-5 text-purple-500" />;
      case "llamada":
        return <Phone className="h-5 w-5 text-orange-500" />;
      default:
        return <Megaphone className="h-5 w-5 text-gray-400" />;
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Dark section - title */}
      <div
        className="px-8 pt-16 pb-4 shrink-0 rounded-b-2xl"
        style={{
          backgroundImage: `url(${headerBg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Campañas</h1>
            <p className="text-brand-300 mt-0.5 text-sm">
              Crea y gestiona campañas publicitarias
            </p>
          </div>
          <Button
            onClick={() => setShowModal(true)}
            size="sm"
            className="gap-1.5 bg-accent-500 hover:bg-accent-600 text-white"
          >
            <Plus className="h-4 w-4" />
            Nueva Campaña
          </Button>
        </div>
      </div>

      {/* Content */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1, ease: 'easeOut' }} className="flex-1 min-h-0 overflow-auto py-4">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-700" />
          </div>
        ) : campaigns.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                <Megaphone className="h-8 w-8 text-gray-400" />
              </div>
              <h2 className="text-xl font-semibold text-gray-700">
                Sin campañas creadas
              </h2>
              <p className="text-gray-500 mt-2 text-sm max-w-md">
                Las campañas te permiten segmentar tu base de clientes y enviar comunicaciones
                personalizadas por SMS, WhatsApp o llamada.
              </p>
              <Button
                onClick={() => setShowModal(true)}
                size="sm"
                className="mt-4 bg-accent-500 hover:bg-accent-600 text-white gap-1.5"
              >
                <Plus className="h-4 w-4" />
                Crear primera campaña
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {campaigns.map((c) => (
              <div
                key={c.id}
                onClick={() => navigate(`/${slug}/campaigns/${c.id}`)}
                className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow cursor-pointer"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {channelIcon(c.channel)}
                    <h3 className="font-semibold text-gray-900">{c.name}</h3>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[c.status] || statusColors.draft}`}
                  >
                    {c.status}
                  </span>
                </div>
                {c.description && (
                  <p className="text-sm text-gray-500 mb-3">{c.description}</p>
                )}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">
                    {c.matchedCount.toLocaleString()} clientes
                  </span>
                  <span className="text-xs text-gray-400 uppercase">
                    {c.channel || "—"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Create Campaign Modal */}
      <AnimatePresence>
        {showModal && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-50"
              onClick={() => { setShowModal(false); resetForm(); }}
            />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="px-6 pt-6 pb-4 border-b border-gray-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">
                        Nueva Campaña
                      </h2>
                      <p className="text-sm text-gray-500 mt-0.5">
                        Define los datos básicos de tu campaña. Podrás configurar la segmentación
                        y el mensaje después.
                      </p>
                    </div>
                    <button
                      onClick={() => { setShowModal(false); resetForm(); }}
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                {/* Body */}
                <div className="px-6 py-5 space-y-5">
                  {/* Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Nombre de la campaña
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ej: Promoción fin de semana"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Un nombre descriptivo te ayudará a identificarla rápidamente.
                    </p>
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Descripción
                      <span className="text-gray-400 font-normal ml-1">(opcional)</span>
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Ej: Campaña dirigida a clientes premium con bonos activos"
                      rows={3}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all resize-none"
                    />
                  </div>

                  {/* Channel */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Canal de comunicación
                    </label>
                    <p className="text-xs text-gray-400 mb-3">
                      Selecciona cómo llegarás a tus clientes.
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {channels.map((ch) => {
                        const Icon = ch.icon;
                        const isActive = channel === ch.value;
                        return (
                          <button
                            key={ch.value}
                            type="button"
                            onClick={() => setChannel(ch.value)}
                            className={cn(
                              "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all cursor-pointer",
                              isActive ? ch.activeColor : "border-gray-200 hover:border-gray-300 bg-white"
                            )}
                          >
                            <Icon className={cn("h-6 w-6", isActive ? "" : "text-gray-400")} />
                            <span className={cn("text-sm font-medium", isActive ? "" : "text-gray-600")}>
                              {ch.label}
                            </span>
                            <span className="text-[10px] text-gray-400 text-center leading-tight">
                              {ch.description}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-3">
                  <Button
                    onClick={() => { setShowModal(false); resetForm(); }}
                    variant="outline"
                    size="sm"
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleCreate}
                    disabled={saving || !name.trim()}
                    size="sm"
                    className="bg-brand-800 hover:bg-brand-700 text-white gap-1.5"
                  >
                    {saving ? "Creando..." : "Crear Campaña"}
                  </Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
