import { useEffect, useState } from "react";
import { Users, Megaphone, Upload, Send, TrendingUp } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { motion } from "framer-motion";
import headerBg from "@/assets/header-background.jpg";
import axios from "axios";

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "/api" });

// Add auth token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

interface Stats {
  totalClients: number;
  totalMessagesSent: number;
  totalCampaigns: number;
  lastImportDate: string | null;
  recentSends: Array<{
    id: string;
    campaignName: string;
    status: string;
    totalSent: number;
    totalFailed: number;
    createdAt: string;
  }>;
}

export function Dashboard() {
  const navigate = useNavigate();
  const { slug } = useParams();
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats>({
    totalClients: 0,
    totalMessagesSent: 0,
    totalCampaigns: 0,
    lastImportDate: null,
    recentSends: [],
  });

  // Resolve tenantId from slug using auth context
  const currentTenant = user?.tenantRoles.find((tr) => tr.tenant.slug === slug);
  const tenantId = currentTenant?.tenantId;

  useEffect(() => {
    if (!tenantId) return;
    api
      .get<Stats>("/records/stats", { params: { tenantId } })
      .then(({ data }) => setStats(data))
      .catch(() => {});
  }, [tenantId]);

  const statCards = [
    {
      label: "Total Clientes",
      value: stats.totalClients.toLocaleString(),
      icon: Users,
      color: "text-brand-300",
      bg: "bg-brand-700",
    },
    {
      label: "Mensajes Enviados",
      value: stats.totalMessagesSent.toLocaleString(),
      icon: Send,
      color: "text-accent-300",
      bg: "bg-accent-500/20",
    },
    {
      label: "Campañas",
      value: stats.totalCampaigns.toLocaleString(),
      icon: Megaphone,
      color: "text-amber-400",
      bg: "bg-amber-500/10",
    },
    {
      label: "Última Importación",
      value: stats.lastImportDate
        ? new Date(stats.lastImportDate).toLocaleDateString()
        : "Sin datos",
      icon: Upload,
      color: "text-brand-400",
      bg: "bg-brand-600/20",
    },
  ];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Dark section - title + stats */}
      <div
        className="px-8 pt-16 pb-6 shrink-0 rounded-b-2xl"
        style={{
          backgroundImage: `url(${headerBg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <h1 className="text-2xl font-bold text-white mb-6">Dashboard</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((stat) => (
            <div
              key={stat.label}
              className="relative rounded-xl p-5 flex items-center justify-between overflow-hidden border border-white/15 shadow-[0_0_15px_rgba(255,255,255,0.05)]"
              style={{
                background: 'linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.04) 100%)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
              }}
            >
              {/* Top shine */}
              <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
              <div>
                <p className="text-sm text-brand-300">{stat.label}</p>
                <p className="text-3xl font-bold text-white mt-1">
                  {stat.value}
                </p>
              </div>
              <div
                className={`${stat.bg} h-10 w-10 rounded-lg flex items-center justify-center`}
              >
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Light section - content */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1, ease: 'easeOut' }} className="px-8 py-6 flex-1 min-h-0 overflow-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Quick Actions */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Acciones Rápidas
            </h2>
            <div className="space-y-3">
              <Button
                onClick={() => navigate(`/${slug}/import`)}
                className="w-full justify-start gap-3 h-12"
                variant="outline"
              >
                <Upload className="h-5 w-5 text-brand-600" />
                <div className="text-left">
                  <p className="font-medium">Importar Datos</p>
                  <p className="text-xs text-gray-500">
                    Subir CSV o Excel con clientes
                  </p>
                </div>
              </Button>
              <Button
                onClick={() => navigate(`/${slug}/campaigns`)}
                className="w-full justify-start gap-3 h-12"
                variant="outline"
              >
                <Megaphone className="h-5 w-5 text-amber-500" />
                <div className="text-left">
                  <p className="font-medium">Crear Campaña</p>
                  <p className="text-xs text-gray-500">
                    Segmentar y enviar comunicaciones
                  </p>
                </div>
              </Button>
              <Button
                onClick={() => navigate(`/${slug}/clients`)}
                className="w-full justify-start gap-3 h-12"
                variant="outline"
              >
                <Users className="h-5 w-5 text-accent-500" />
                <div className="text-left">
                  <p className="font-medium">Ver Clientes</p>
                  <p className="text-xs text-gray-500">
                    Explorar base de datos importada
                  </p>
                </div>
              </Button>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Actividad Reciente
            </h2>
            {stats.recentSends.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="h-16 w-16 rounded-full bg-brand-50 flex items-center justify-center mb-3">
                  <TrendingUp className="h-7 w-7 text-brand-400" />
                </div>
                <p className="text-gray-500 text-sm">
                  No hay envíos recientes
                </p>
                <Button
                  onClick={() => navigate(`/${slug}/campaigns`)}
                  size="sm"
                  className="mt-4 bg-accent-500 hover:bg-accent-600 text-white"
                >
                  Crear campaña
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {stats.recentSends.map((send) => (
                  <div key={send.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-100">
                    <div className="flex items-center gap-3">
                      <div className={`h-2 w-2 rounded-full shrink-0 ${
                        send.status === "completed" ? "bg-green-500" :
                        send.status === "sending" ? "bg-amber-500 animate-pulse" :
                        send.status === "failed" ? "bg-red-500" : "bg-gray-400"
                      }`} />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{send.campaignName}</p>
                        <p className="text-xs text-gray-400">
                          {new Date(send.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-green-600 font-medium">{send.totalSent} ✓</span>
                      {send.totalFailed > 0 && (
                        <span className="text-red-500 font-medium">{send.totalFailed} ✗</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
