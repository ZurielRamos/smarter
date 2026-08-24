import { useState, useEffect } from "react";
import { useNavigate, useParams, Outlet } from "react-router-dom";
import { Plus, Bot, Search } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { CreateBotModal } from "@/components/CreateBotModal";
import { toast } from "sonner";
import axios from "axios";

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "/api" });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

interface BotItem {
  id: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: string;
}

const statusColors: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  inactive: "bg-gray-100 text-gray-600",
  draft: "bg-yellow-100 text-yellow-700",
};

const statusLabels: Record<string, string> = {
  active: "activo",
  inactive: "inactivo",
  draft: "borrador",
};

export function Bots() {
  const navigate = useNavigate();
  const { slug, botId } = useParams();
  const { user } = useAuth();
  const currentTenant = user?.tenantRoles.find((tr) => tr.tenant.slug === slug);
  const tenantId = currentTenant?.tenantId;

  const [bots, setBots] = useState<BotItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadBots();
  }, [tenantId]);

  const loadBots = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const { data } = await api.get<BotItem[]>("/bots", { params: { tenantId } });
      setBots(data);
    } catch {
      // handle error silently
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBot = async (data: { name: string; description: string; type: string }) => {
    if (!tenantId) return;
    setCreating(true);
    try {
      const { data: newBot } = await api.post<BotItem>("/bots", {
        tenantId,
        name: data.name,
        description: data.description || null,
        type: data.type,
      });
      setBots((prev) => [newBot, ...prev]);
      setShowCreateModal(false);
      toast.success("Bot creado correctamente");
      navigate(`/${slug}/comunicaciones/bots/${newBot.id}`);
    } catch {
      toast.error("Error al crear el bot");
    } finally {
      setCreating(false);
    }
  };

  const filtered = bots.filter(
    (b) =>
      b.name.toLowerCase().includes(search.toLowerCase()) ||
      (b.description || "").toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <>
      {/* List panel */}
      <div className="w-80 border-r border-gray-100 flex flex-col shrink-0">
        {/* Header */}
        <div className="px-3 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-gray-500 uppercase">Bots</h3>
          <button
            onClick={() => setShowCreateModal(true)}
            className="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            title="Nuevo bot"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="px-3 py-2 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar bot..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-center">
              <Bot className="h-8 w-8 text-gray-300 mx-auto mb-2" />
              <p className="text-xs text-gray-500">No hay bots</p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {filtered.map((bot) => (
                <button
                  key={bot.id}
                  onClick={() => navigate(`/${slug}/comunicaciones/bots/${bot.id}`)}
                  className={cn(
                    "w-full text-left p-3 rounded-lg transition-colors",
                    botId === bot.id
                      ? "bg-brand-50 border border-brand-200"
                      : "hover:bg-gray-50 border border-transparent",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900 truncate">{bot.name}</span>
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", statusColors[bot.status] || "bg-gray-100 text-gray-600")}>
                      {statusLabels[bot.status] || bot.status}
                    </span>
                  </div>
                  {bot.description && (
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{bot.description}</p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail panel */}
      <Outlet />

      {/* Create Bot Modal */}
      <CreateBotModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSave={handleCreateBot}
        saving={creating}
      />
    </>
  );
}
