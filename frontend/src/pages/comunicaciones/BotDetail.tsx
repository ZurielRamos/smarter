import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Bot, Settings2, Play, Pause, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ConfirmModal";
import { BotToolLogsPanel } from "@/components/BotToolLogsPanel";
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
  inactive: { bg: "bg-muted", text: "text-muted-foreground" },
  draft: { bg: "bg-yellow-100", text: "text-yellow-700" },
};

export function BotDetail() {
  const { botId, slug } = useParams();
  const navigate = useNavigate();
  const [bot, setBot] = useState<BotData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [metrics, setMetrics] = useState<any>(null);

  useEffect(() => {
    if (!botId) return;
    loadBot();
  }, [botId]);

  const loadBot = async () => {
    setLoading(true);
    try {
      const { data } = await api.get<BotData>(`/bots/${botId}`);
      setBot(data);
      // Load metrics
      api.get(`/bots/${botId}/metrics`).then(({ data: m }) => setMetrics(m)).catch(() => {});
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
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  if (!bot) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <p className="text-muted-foreground text-sm">Bot no encontrado</p>
      </div>
    );
  }

  const colors = statusColors[bot.status] || statusColors.draft;

  return (
    <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden bg-background">
      {/* Header */}
      <div className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-brand-50 flex items-center justify-center">
              <Bot className="h-5 w-5 text-brand-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">{bot.name}</h2>
              {bot.description && (
                <p className="text-sm text-muted-foreground">{bot.description}</p>
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
        <div className="bg-card rounded-xl border border-border p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">Información del Bot</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Nombre</p>
              <p className="text-sm font-medium text-foreground">{bot.name}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Estado</p>
              <p className="text-sm font-medium text-foreground capitalize">{bot.status}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Creado</p>
              <p className="text-sm font-medium text-foreground">
                {new Date(bot.createdAt).toLocaleDateString("es-CO")}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Última actualización</p>
              <p className="text-sm font-medium text-foreground">
                {new Date(bot.updatedAt).toLocaleDateString("es-CO")}
              </p>
            </div>
          </div>
        </div>

        {/* Token Usage */}
        <div className="mt-4 bg-card rounded-xl border border-border p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">Consumo de tokens</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-blue-50 dark:bg-blue-500/10 rounded-lg p-3 text-center">
              <p className="text-[10px] text-blue-600 dark:text-blue-400 font-medium uppercase">Entrada</p>
              <p className="text-lg font-bold text-blue-700 dark:text-blue-300 mt-0.5">
                {(bot.totalPromptTokens || 0).toLocaleString()}
              </p>
              <p className="text-[10px] text-blue-500">tokens</p>
            </div>
            <div className="bg-purple-50 dark:bg-purple-500/10 rounded-lg p-3 text-center">
              <p className="text-[10px] text-purple-600 dark:text-purple-400 font-medium uppercase">Salida</p>
              <p className="text-lg font-bold text-purple-700 dark:text-purple-300 mt-0.5">
                {(bot.totalCompletionTokens || 0).toLocaleString()}
              </p>
              <p className="text-[10px] text-purple-500">tokens</p>
            </div>
            <div className="bg-muted rounded-lg p-3 text-center">
              <p className="text-[10px] text-muted-foreground font-medium uppercase">Total</p>
              <p className="text-lg font-bold text-foreground mt-0.5">
                {((bot.totalPromptTokens || 0) + (bot.totalCompletionTokens || 0)).toLocaleString()}
              </p>
              <p className="text-[10px] text-muted-foreground">{(bot.totalRequests || 0)} requests</p>
            </div>
          </div>
        </div>

        {/* Metrics */}
        <div className="mt-4 bg-card rounded-xl border border-border p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">Métricas</h3>
          {metrics ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-lg font-bold text-foreground">{metrics.totalConversations}</p>
                <p className="text-[10px] text-muted-foreground">Conversaciones</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-green-600 dark:text-green-400">{metrics.resolutionRate}%</p>
                <p className="text-[10px] text-muted-foreground">Tasa de resolución</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-foreground">{metrics.messages24h}</p>
                <p className="text-[10px] text-muted-foreground">Mensajes (24h)</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-brand-600 dark:text-brand-300">{metrics.totalCredits}</p>
                <p className="text-[10px] text-muted-foreground">Créditos consumidos</p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center">Cargando métricas...</p>
          )}
        </div>

        {/* Tool Logs */}
        <BotToolLogsPanel botId={botId!} />

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
