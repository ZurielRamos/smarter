import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Bot, Settings2, Play, Pause, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ConfirmModal";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import axios from "axios";

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "/api" });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

interface BotData {
  id: string;
  name: string;
  description: string | null;
  status: string;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalRequests: number;
  createdAt: string;
  updatedAt: string;
}

const statusColors: Record<string, { bg: string; text: string }> = {
  active: { bg: "bg-green-100", text: "text-green-700" },
  inactive: { bg: "bg-gray-100", text: "text-gray-600" },
  draft: { bg: "bg-yellow-100", text: "text-yellow-700" },
};

export function BotDetail() {
  const { botId, slug } = useParams();
  const navigate = useNavigate();
  const [bot, setBot] = useState<BotData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (!botId) return;
    loadBot();
  }, [botId]);

  const loadBot = async () => {
    setLoading(true);
    try {
      const { data } = await api.get<BotData>(`/bots/${botId}`);
      setBot(data);
    } catch {
      // handle error
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!bot || !botId) return;
    const newStatus = bot.status === "active" ? "inactive" : "active";
    try {
      const { data } = await api.put<BotData>(`/bots/${botId}`, { status: newStatus });
      setBot(data);
      toast.success(newStatus === "active" ? "Bot activado" : "Bot pausado");
    } catch {
      toast.error("Error al cambiar estado");
    }
  };

  const handleDelete = async () => {
    if (!botId) return;
    try {
      await api.delete(`/bots/${botId}`);
      toast.success("Bot eliminado");
      navigate(`/${slug}/comunicaciones/bots`);
    } catch {
      toast.error("Error al eliminar el bot");
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  if (!bot) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <p className="text-gray-500 text-sm">Bot no encontrado</p>
      </div>
    );
  }

  const colors = statusColors[bot.status] || statusColors.draft;

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-brand-50 flex items-center justify-center">
              <Bot className="h-5 w-5 text-brand-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{bot.name}</h2>
              {bot.description && (
                <p className="text-sm text-gray-500">{bot.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn("text-xs px-2 py-1 rounded-full font-medium", colors.bg, colors.text)}>
              {bot.status}
            </span>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate(`/${slug}/comunicaciones/bots/${botId}/config`)}>
              <Settings2 className="h-3.5 w-3.5" />
              Configurar
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Información del Bot</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500">Nombre</p>
              <p className="text-sm font-medium text-gray-900">{bot.name}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Estado</p>
              <p className="text-sm font-medium text-gray-900 capitalize">{bot.status}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Creado</p>
              <p className="text-sm font-medium text-gray-900">
                {new Date(bot.createdAt).toLocaleDateString("es-CO")}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Última actualización</p>
              <p className="text-sm font-medium text-gray-900">
                {new Date(bot.updatedAt).toLocaleDateString("es-CO")}
              </p>
            </div>
          </div>
        </div>

        {/* Token Usage */}
        <div className="mt-4 bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Consumo de tokens</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-blue-50 rounded-lg p-3 text-center">
              <p className="text-[10px] text-blue-600 font-medium uppercase">Entrada</p>
              <p className="text-lg font-bold text-blue-700 mt-0.5">
                {(bot.totalPromptTokens || 0).toLocaleString()}
              </p>
              <p className="text-[10px] text-blue-500">tokens</p>
            </div>
            <div className="bg-purple-50 rounded-lg p-3 text-center">
              <p className="text-[10px] text-purple-600 font-medium uppercase">Salida</p>
              <p className="text-lg font-bold text-purple-700 mt-0.5">
                {(bot.totalCompletionTokens || 0).toLocaleString()}
              </p>
              <p className="text-[10px] text-purple-500">tokens</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-[10px] text-gray-600 font-medium uppercase">Total</p>
              <p className="text-lg font-bold text-gray-700 mt-0.5">
                {((bot.totalPromptTokens || 0) + (bot.totalCompletionTokens || 0)).toLocaleString()}
              </p>
              <p className="text-[10px] text-gray-500">{(bot.totalRequests || 0)} requests</p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-4 flex gap-2">
          {bot.status === "active" ? (
            <Button variant="outline" size="sm" className="gap-1.5 text-orange-600 hover:text-orange-700" onClick={handleToggleStatus}>
              <Pause className="h-3.5 w-3.5" />
              Pausar
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="gap-1.5 text-green-600 hover:text-green-700" onClick={handleToggleStatus}>
              <Play className="h-3.5 w-3.5" />
              Activar
            </Button>
          )}
          <Button variant="outline" size="sm" className="gap-1.5 text-red-600 hover:text-red-700" onClick={() => setShowDeleteConfirm(true)}>
            <Trash2 className="h-3.5 w-3.5" />
            Eliminar
          </Button>
        </div>
      </div>

      <ConfirmModal
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="Eliminar bot"
        description="Se eliminará el bot y toda su configuración permanentemente. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        variant="danger"
      />
    </div>
  );
}
