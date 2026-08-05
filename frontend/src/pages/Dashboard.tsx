import { useEffect, useState } from "react";
import { Users, Megaphone, Upload, Send, TrendingUp, MessageSquare, Phone } from "lucide-react";
import { UsersThree, PaperPlaneTilt, ChartLineUp, ChatCircleDots, Funnel, Megaphone as PhMegaphone, Lightning } from "@phosphor-icons/react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { motion } from "framer-motion";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import headerBg from "@/assets/header-background.jpg";
import axios from "axios";

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "/api" });
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

interface DashboardMetrics {
  contactsByDay: Array<{ date: string; count: number }>;
  messagesByDay: Array<{ date: string; sent: number; failed: number }>;
  channelDistribution: Array<{ channel: string; count: number }>;
  statusDistribution: Array<{ status: string; count: number }>;
  conversationStats: Array<{ status: string; count: number }>;
  topCampaigns: Array<{ name: string; channel: string; totalSent: number; totalFailed: number; totalDelivered: number }>;
}

const CHANNEL_COLORS: Record<string, string> = {
  import: "#10b981",
  whatsapp: "#25D366",
  manual: "#6366f1",
  web: "#f59e0b",
  sms: "#0ea5e9",
  "sin canal": "#9ca3af",
};

const STATUS_COLORS: Record<string, string> = {
  lead: "#3b82f6",
  contactado: "#0ea5e9",
  interesado: "#6366f1",
  oportunidad: "#f59e0b",
  cliente: "#10b981",
  premium: "#8b5cf6",
  fidelizado: "#059669",
  inactivo: "#9ca3af",
  perdido: "#ef4444",
  active: "#10b981",
  inactive: "#9ca3af",
  blocked: "#ef4444",
  unknown: "#d1d5db",
};

const CONVERSATION_COLORS: Record<string, string> = {
  open: "#10b981",
  closed: "#6b7280",
  archived: "#d1d5db",
};

const channelLabels: Record<string, string> = {
  import: "Importación",
  whatsapp: "WhatsApp",
  manual: "Manual",
  web: "Web",
  sms: "SMS",
  "sin canal": "Sin canal",
};

const statusLabels: Record<string, string> = {
  lead: "Lead",
  contactado: "Contactado",
  interesado: "Interesado",
  oportunidad: "Oportunidad",
  cliente: "Cliente",
  premium: "Premium",
  fidelizado: "Fidelizado",
  inactivo: "Inactivo",
  perdido: "Perdido",
  active: "Activo",
  inactive: "Inactivo",
  blocked: "Bloqueado",
  open: "Abiertas",
  closed: "Cerradas",
  archived: "Archivadas",
};

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
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);

  const currentTenant = user?.tenantRoles.find((tr) => tr.tenant.slug === slug);
  const tenantId = currentTenant?.tenantId;

  useEffect(() => {
    if (!tenantId) return;
    api.get<Stats>("/records/stats", { params: { tenantId } }).then(({ data }) => setStats(data)).catch(() => {});
    api.get<DashboardMetrics>("/records/dashboard-metrics", { params: { tenantId } }).then(({ data }) => setMetrics(data)).catch(() => {});
  }, [tenantId]);

  const statCards = [
    { label: "Total Clientes", value: stats.totalClients.toLocaleString(), icon: Users, color: "text-brand-300", bg: "bg-brand-700" },
    { label: "Mensajes Enviados", value: stats.totalMessagesSent.toLocaleString(), icon: Send, color: "text-accent-300", bg: "bg-accent-500/20" },
    { label: "Campañas", value: stats.totalCampaigns.toLocaleString(), icon: Megaphone, color: "text-amber-400", bg: "bg-amber-500/10" },
    { label: "Última Importación", value: stats.lastImportDate ? new Date(stats.lastImportDate).toLocaleDateString() : "Sin datos", icon: Upload, color: "text-brand-400", bg: "bg-brand-600/20" },
  ];

  // Format date for chart axis
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getDate()}/${d.getMonth() + 1}`;
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Dark section - title + stats */}
      <div
        className="px-8 pt-16 pb-6 shrink-0 rounded-b-2xl"
        style={{ backgroundImage: `url(${headerBg})`, backgroundSize: "cover", backgroundPosition: "center" }}
      >
        <h1 className="text-2xl font-bold text-white mb-6">Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((stat) => (
            <div
              key={stat.label}
              className="relative rounded-xl p-5 flex items-center justify-between overflow-hidden border border-white/15 shadow-[0_0_15px_rgba(255,255,255,0.05)]"
              style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.04) 100%)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}
            >
              <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
              <div>
                <p className="text-sm text-brand-300">{stat.label}</p>
                <p className="text-3xl font-bold text-white mt-1">{stat.value}</p>
              </div>
              <div className={`${stat.bg} h-10 w-10 rounded-lg flex items-center justify-center`}>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Charts section */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }} className="py-6 flex-1 min-h-0 overflow-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Contactos nuevos por día */}
          <ChartCard title="Contactos nuevos" subtitle="Últimos 30 días" icon={UsersThree}>
            {metrics?.contactsByDay && metrics.contactsByDay.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={metrics.contactsByDay} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorContacts" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="count" stroke="#10b981" strokeWidth={2} fill="url(#colorContacts)" name="Contactos" animationDuration={1200} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart />
            )}
          </ChartCard>

          {/* Mensajes enviados por día */}
          <ChartCard title="Mensajes de campañas" subtitle="Últimos 14 días" icon={PaperPlaneTilt}>
            {metrics?.messagesByDay && metrics.messagesByDay.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={metrics.messagesByDay} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="sent" fill="#10b981" radius={[4, 4, 0, 0]} name="Enviados" animationDuration={1000} />
                  <Bar dataKey="failed" fill="#ef4444" radius={[4, 4, 0, 0]} name="Fallidos" animationDuration={1000} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart />
            )}
          </ChartCard>

          {/* Distribución por canal */}
          <ChartCard title="Contactos por canal" subtitle="Distribución total" icon={Funnel}>
            {metrics?.channelDistribution && metrics.channelDistribution.length > 0 ? (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="50%" height={200}>
                  <PieChart>
                    <Pie
                      data={metrics.channelDistribution}
                      dataKey="count"
                      nameKey="channel"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      innerRadius={45}
                      animationDuration={1000}
                      animationBegin={200}
                    >
                      {metrics.channelDistribution.map((entry) => (
                        <Cell key={entry.channel} fill={CHANNEL_COLORS[entry.channel] || "#9ca3af"} />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {metrics.channelDistribution.map((item) => (
                    <div key={item.channel} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: CHANNEL_COLORS[item.channel] || "#9ca3af" }} />
                        <span className="text-gray-600">{channelLabels[item.channel] || item.channel}</span>
                      </div>
                      <span className="font-medium text-gray-900">{item.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyChart />
            )}
          </ChartCard>

          {/* Conversaciones */}
          <ChartCard title="Conversaciones" subtitle="Estado actual" icon={ChatCircleDots}>
            {metrics?.conversationStats && metrics.conversationStats.length > 0 ? (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="50%" height={200}>
                  <PieChart>
                    <Pie
                      data={metrics.conversationStats}
                      dataKey="count"
                      nameKey="status"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      innerRadius={45}
                      animationDuration={1000}
                      animationBegin={400}
                    >
                      {metrics.conversationStats.map((entry) => (
                        <Cell key={entry.status} fill={CONVERSATION_COLORS[entry.status] || "#9ca3af"} />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {metrics.conversationStats.map((item) => (
                    <div key={item.status} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: CONVERSATION_COLORS[item.status] || "#9ca3af" }} />
                        <span className="text-gray-600">{statusLabels[item.status] || item.status}</span>
                      </div>
                      <span className="font-medium text-gray-900">{item.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyChart />
            )}
          </ChartCard>

          {/* Top Campañas */}
          <ChartCard title="Top campañas" subtitle="Por mensajes enviados" icon={PhMegaphone}>
            {metrics?.topCampaigns && metrics.topCampaigns.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={metrics.topCampaigns} layout="vertical" margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: "#64748b" }} width={100} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="totalSent" fill="#10b981" radius={[0, 4, 4, 0]} name="Enviados" animationDuration={1000} />
                  <Bar dataKey="totalFailed" fill="#ef4444" radius={[0, 4, 4, 0]} name="Fallidos" animationDuration={1000} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart />
            )}
          </ChartCard>

          {/* Actividad reciente */}
          <ChartCard title="Actividad reciente" subtitle="Últimos envíos" icon={Lightning}>
            {stats.recentSends.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="h-14 w-14 rounded-full bg-brand-50 flex items-center justify-center mb-3">
                  <TrendingUp className="h-6 w-6 text-brand-400" />
                </div>
                <p className="text-gray-500 text-sm">No hay envíos recientes</p>
                <Button onClick={() => navigate(`/${slug}/campaigns`)} size="sm" className="mt-3 bg-accent-500 hover:bg-accent-600 text-white">
                  Crear campaña
                </Button>
              </div>
            ) : (
              <div className="space-y-2 max-h-[220px] overflow-y-auto">
                {stats.recentSends.map((send) => (
                  <div key={send.id} className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50 border border-gray-100">
                    <div className="flex items-center gap-3">
                      <div className={`h-2 w-2 rounded-full shrink-0 ${send.status === "completed" ? "bg-green-500" : send.status === "sending" ? "bg-amber-500 animate-pulse" : send.status === "failed" ? "bg-red-500" : "bg-gray-400"}`} />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{send.campaignName}</p>
                        <p className="text-xs text-gray-400">{new Date(send.createdAt).toLocaleString("es-CO")}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-green-600 font-medium">{send.totalSent} ✓</span>
                      {send.totalFailed > 0 && <span className="text-red-500 font-medium">{send.totalFailed} ✗</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ChartCard>
        </div>
      </motion.div>
    </div>
  );
}

function ChartCard({ title, subtitle, icon: Icon, children }: { title: string; subtitle: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="relative rounded-xl p-5 overflow-hidden border border-gray-200/60 shadow-[0_4px_24px_rgba(0,0,0,0.04),_0_0_0_1px_rgba(255,255,255,0.8)_inset]"
      style={{
        background: "linear-gradient(145deg, rgba(255,255,255,0.55) 0%, rgba(245,250,255,0.4) 100%)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
      }}
    >
      {/* Top shine line */}
      <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-200/60 to-transparent" />
      {/* Left glow */}
      <span className="absolute inset-y-0 left-0 w-px bg-gradient-to-b from-emerald-200/40 via-transparent to-transparent" />
      <div className="relative z-10 flex items-center gap-2.5 mb-4">
        <Icon className="h-5 w-5 text-emerald-600" weight="duotone" />
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <p className="text-[11px] text-gray-400">{subtitle}</p>
        </div>
      </div>
      <div className="relative z-10">{children}</div>
    </motion.div>
  );
}

function EmptyChart() {
  return (
    <div className="flex items-center justify-center h-[200px] text-gray-400 text-sm">
      Sin datos disponibles
    </div>
  );
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="text-gray-500 mb-1">{label}</p>
      {payload.map((entry: any) => (
        <p key={entry.name} className="font-medium" style={{ color: entry.color }}>
          {entry.name}: {entry.value?.toLocaleString()}
        </p>
      ))}
    </div>
  );
}

function PieTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const data = payload[0];
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-medium text-gray-900">
        {channelLabels[data.name] || statusLabels[data.name] || data.name}: {data.value?.toLocaleString()}
      </p>
    </div>
  );
}
