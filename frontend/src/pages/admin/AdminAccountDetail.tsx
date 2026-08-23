import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import headerBg from "@/assets/header-background.jpg";
import {
  ArrowLeft,
  Users,
  Coins,
  Calendar,
  Activity,
  Loader2,
  MoreVertical,
  Settings2,
  Wrench,
  X,
  Save,
  MessageSquare,
  Phone,
  Mail,
  Bot,
  ArrowUpCircle,
  ArrowDownCircle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/services/api";
import { ModelSelector } from "@/components/ModelSelector";

const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

const ACTIONS = [
  { action: "sms", label: "Envío SMS", icon: MessageSquare, color: "text-blue-600", bg: "bg-blue-50" },
  { action: "whatsapp_utility", label: "WhatsApp - Utilidad", icon: WhatsAppIcon, color: "text-green-600", bg: "bg-green-50" },
  { action: "whatsapp_marketing", label: "WhatsApp - Marketing", icon: WhatsAppIcon, color: "text-green-600", bg: "bg-green-50" },
  { action: "whatsapp_authentication", label: "WhatsApp - Autenticación", icon: WhatsAppIcon, color: "text-green-600", bg: "bg-green-50" },
  { action: "call", label: "Llamada", icon: Phone, color: "text-purple-600", bg: "bg-purple-50" },
  { action: "email", label: "Email", icon: Mail, color: "text-orange-600", bg: "bg-orange-50" },
  { action: "ai_input_tokens", label: "1M Tokens Entrada", icon: Bot, color: "text-emerald-600", bg: "bg-emerald-50" },
  { action: "ai_output_tokens", label: "1M Tokens Salida", icon: Bot, color: "text-emerald-600", bg: "bg-emerald-50" },
];

interface TenantDetail {
  id: string;
  name: string;
  slug: string;
  iconPath: string | null;
  isActive: boolean;
  isDev: boolean;
  maxAgents: number;
  createdAt: string;
  updatedAt: string;
}

interface TenantBalance { available: number; reserved: number; }
interface TenantPlan { type: string; monthlyCredits: number; rollover: boolean; }
interface TenantMember { id: string; userId: string; role: string; user: { id: string; name: string; email: string }; }
interface TenantCostOverride { action: string; cost: number; }

interface CreditTransaction {
  id: string;
  type: "grant" | "purchase" | "consume" | "refund" | "expire" | "adjustment";
  amount: number;
  balanceAfter: number;
  source: string | null;
  description: string | null;
  createdAt: string;
}

const TYPE_LABELS: Record<string, string> = {
  grant: "Renovación",
  purchase: "Recarga",
  consume: "Consumo",
  refund: "Reembolso",
  expire: "Expiración",
  adjustment: "Ajuste",
};

const TYPE_COLORS: Record<string, { text: string; bg: string; icon: any }> = {
  grant: { text: "text-green-700", bg: "bg-green-50", icon: ArrowDownCircle },
  purchase: { text: "text-blue-700", bg: "bg-blue-50", icon: ArrowDownCircle },
  consume: { text: "text-red-700", bg: "bg-red-50", icon: ArrowUpCircle },
  refund: { text: "text-emerald-700", bg: "bg-emerald-50", icon: ArrowDownCircle },
  expire: { text: "text-gray-700", bg: "bg-gray-100", icon: ArrowUpCircle },
  adjustment: { text: "text-purple-700", bg: "bg-purple-50", icon: Activity },
};

export function AdminAccountDetail() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [balance, setBalance] = useState<TenantBalance | null>(null);
  const [plan, setPlan] = useState<TenantPlan | null>(null);
  const [members, setMembers] = useState<TenantMember[]>([]);
  const [loading, setLoading] = useState(true);

  // More dropdown
  const [showMore, setShowMore] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  // Cost config modal
  const [showCostModal, setShowCostModal] = useState(false);
  const [costs, setCosts] = useState<Record<string, number | "">>({});
  const [globalCosts, setGlobalCosts] = useState<Record<string, number>>({});
  const [savingCosts, setSavingCosts] = useState(false);
  const [tenantModel, setTenantModel] = useState("");

  // Config modal
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [configForm, setConfigForm] = useState({ name: "", maxAgents: 5, isDev: false, monthlyCredits: 0, rollover: false });
  const [configLoading, setConfigLoading] = useState(false);

  // Transactions (infinite scroll)
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [txLoading, setTxLoading] = useState(false);
  const [txOffset, setTxOffset] = useState(0);
  const txContainerRef = useRef<HTMLDivElement>(null);
  const TX_LIMIT = 20;

  // Audit logs
  const [auditLogs, setAuditLogs] = useState<{ id: string; action: string; adminEmail: string; metadata: any; createdAt: string }[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditLoading, setAuditLoading] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    Promise.all([
      api.get<TenantDetail>(`/tenants/${tenantId}`),
      api.get(`/tenants/${tenantId}/billing`).catch(() => ({ data: { balance: null, plan: null } })),
      api.get<TenantMember[]>(`/tenants/${tenantId}/members`).catch(() => ({ data: [] })),
    ])
      .then(([tenantRes, billingRes, membersRes]) => {
        setTenant(tenantRes.data);
        setBalance(billingRes.data.balance ?? null);
        setPlan(billingRes.data.plan ?? null);
        setMembers(membersRes.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    // Load initial transactions
    fetchTransactions(0, true);
    // Load audit logs
    setAuditLoading(true);
    api.get<{ data: typeof auditLogs; total: number }>(`/audit/target/${tenantId}?limit=20`)
      .then(({ data }) => { setAuditLogs(data.data); setAuditTotal(data.total); })
      .catch(() => {})
      .finally(() => setAuditLoading(false));
  }, [tenantId]);

  const fetchTransactions = useCallback(async (offset: number, reset = false) => {
    if (!tenantId) return;
    setTxLoading(true);
    try {
      const { data } = await api.get<{ data: CreditTransaction[]; total: number }>(
        `/tenants/${tenantId}/billing/transactions?limit=${TX_LIMIT}&offset=${offset}`
      );
      setTransactions((prev) => reset ? data.data : [...prev, ...data.data]);
      setTxTotal(data.total);
      setTxOffset(offset + data.data.length);
    } catch {} finally {
      setTxLoading(false);
    }
  }, [tenantId]);

  const handleTxScroll = useCallback(() => {
    const el = txContainerRef.current;
    if (!el || txLoading) return;
    if (transactions.length >= txTotal) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight - scrollTop - clientHeight < 100) {
      fetchTransactions(txOffset);
    }
  }, [txLoading, transactions.length, txTotal, txOffset, fetchTransactions]);

  // Close more dropdown on click outside
  useEffect(() => {
    if (!showMore) return;
    function handleClick(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setShowMore(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showMore]);

  const openConfigModal = () => {
    setShowMore(false);
    if (tenant) {
      setConfigForm({
        name: tenant.name,
        maxAgents: tenant.maxAgents,
        isDev: tenant.isDev,
        monthlyCredits: plan?.monthlyCredits ?? 0,
        rollover: plan?.rollover ?? false,
      });
    }
    setShowConfigModal(true);
  };

  const handleSaveConfig = async () => {
    if (!tenantId) return;
    setConfigLoading(true);
    try {
      const { data } = await api.patch<TenantDetail>(`/tenants/${tenantId}`, {
        name: configForm.name,
        maxAgents: configForm.maxAgents,
        isDev: configForm.isDev,
      });
      setTenant(data);
      // Update billing plan
      await api.patch(`/tenants/${tenantId}/billing/plan`, {
        type: "monthly",
        monthlyCredits: configForm.monthlyCredits,
        rollover: configForm.rollover,
      });
      setPlan({ type: "monthly", monthlyCredits: configForm.monthlyCredits, rollover: configForm.rollover });
      setShowConfigModal(false);
    } catch {}
    setConfigLoading(false);
  };

  const openCostModal = async () => {
    setShowMore(false);
    try {
      const [globalRes, tenantRes, modelRes] = await Promise.all([
        api.get<{ action: string; cost: number }[]>("/billing/config/costs"),
        api.get<TenantCostOverride[]>(`/billing/config/tenant-costs/${tenantId}`),
        api.get<{ model: string }>(`/billing/config/tenant-costs/${tenantId}/default-model`),
      ]);
      const gMap: Record<string, number> = {};
      globalRes.data.forEach((c) => { gMap[c.action] = c.cost; });
      setGlobalCosts(gMap);

      const tMap: Record<string, number | ""> = {};
      tenantRes.data.forEach((c) => {
        if (c.action !== "__config_default_model") {
          tMap[c.action] = c.cost;
        }
      });
      setCosts(tMap);
      setTenantModel(modelRes.data.model || "");
    } catch {}
    setShowCostModal(true);
  };

  const handleSaveCosts = async () => {
    setSavingCosts(true);
    try {
      for (const a of ACTIONS) {
        const val = costs[a.action];
        const cost = (val === "" || val === undefined) ? null : val;
        await api.post(`/billing/config/tenant-costs/${tenantId}`, { action: a.action, cost });
      }
      await api.post(`/billing/config/tenant-costs/${tenantId}/default-model`, { model: tenantModel || "" });
      setShowCostModal(false);
    } catch {} finally {
      setSavingCosts(false);
    }
  };

  const getFileUrl = (path: string | null) => {
    if (!path) return null;
    if (path.startsWith("http")) return path;
    return `/${path}`;
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });

  const formatRelativeDate = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Ahora";
    if (mins < 60) return `hace ${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `hace ${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `hace ${days}d`;
    return new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
  };

  const AUDIT_ACTION_LABELS: Record<string, string> = {
    'tenant.create': 'creó la cuenta',
    'tenant.update': 'actualizó la configuración',
    'tenant.delete': 'eliminó la cuenta',
    'billing.plan.create': 'creó el plan de créditos',
    'billing.plan.update': 'actualizó el plan de créditos',
    'billing.recharge': 'recargó créditos',
    'billing.costs.update': 'actualizó costos por consumo',
    'billing.model.update': 'cambió el modelo por defecto',
    'billing.global_costs.update': 'actualizó costos globales',
  };

  const formatAuditAction = (action: string) => AUDIT_ACTION_LABELS[action] || action;

  const formatAuditMetadata = (action: string, metadata: any): string => {
    if (!metadata) return '';
    if (action === 'tenant.create') {
      return `Slug: ${metadata.slug}${metadata.ownerEmail ? ` · Owner: ${metadata.ownerEmail}` : ''}`;
    }
    if (action === 'tenant.update' && metadata.changes) {
      return Object.entries(metadata.changes).map(([k, v]) => `${k}: ${v}`).join(', ');
    }
    if (action === 'billing.plan.update' && metadata.changes) {
      return Object.entries(metadata.changes).map(([k, v]) => `${k}: ${v}`).join(', ');
    }
    if (action === 'billing.recharge') {
      return `+${Number(metadata.amount).toLocaleString()} créditos`;
    }
    if (action === 'billing.costs.update') {
      return `${metadata.costAction}: ${metadata.cost ?? 'eliminado'}`;
    }
    if (action === 'billing.model.update') {
      return `Modelo: ${metadata.model}`;
    }
    return '';
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-gray-500">Cuenta no encontrada</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div
        className="px-8 pt-16 pb-6 shrink-0 rounded-b-2xl"
        style={{ backgroundImage: `url(${headerBg})`, backgroundSize: "cover", backgroundPosition: "center" }}
      >
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/admin/accounts")}
            className="h-9 w-9 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <ArrowLeft className="h-4 w-4 text-white" />
          </button>
          {tenant.iconPath ? (
            <div className="h-14 w-14 rounded-xl bg-white/10 flex items-center justify-center p-1">
              <img src={getFileUrl(tenant.iconPath)!} alt="" className="h-full w-full rounded-lg object-cover" />
            </div>
          ) : (
            <div className="h-14 w-14 rounded-xl bg-white/10 flex items-center justify-center text-white text-xl font-bold">
              {tenant.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-white">{tenant.name}</h1>
            <p className="text-brand-300 text-sm">/{tenant.slug}</p>
          </div>
          <span
            className={`text-xs px-2.5 py-1 rounded-full font-medium ${
              tenant.isActive ? "bg-green-500/20 text-green-300" : "bg-red-500/20 text-red-300"
            }`}
          >
            {tenant.isActive ? "Activa" : "Inactiva"}
          </span>
          {tenant.isDev && (
            <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-yellow-500/20 text-yellow-300">
              Desarrollo
            </span>
          )}

          {/* More button */}
          <div className="relative" ref={moreRef}>
            <button
              onClick={() => setShowMore(!showMore)}
              className="h-9 w-9 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            >
              <MoreVertical className="h-4 w-4 text-white" />
            </button>
            {showMore && (
              <div className="absolute right-0 top-11 w-52 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                <button
                  onClick={openConfigModal}
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Wrench className="h-4 w-4 text-gray-400" />
                  Configurar cuenta
                </button>
                <button
                  onClick={openCostModal}
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Settings2 className="h-4 w-4 text-gray-400" />
                  Configurar consumos
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1, ease: "easeOut" }}
        className="py-6 px-8 flex-1 min-h-0 overflow-auto"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-9 w-9 rounded-lg bg-amber-50 flex items-center justify-center">
                <Coins className="h-4 w-4 text-amber-600" />
              </div>
              <p className="text-sm font-medium text-gray-500">Créditos disponibles</p>
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {balance ? balance.available.toLocaleString("es-CO", { maximumFractionDigits: 2 }) : "—"}
            </p>
            {balance && balance.reserved > 0 && (
              <p className="text-xs text-gray-400 mt-1">{balance.reserved.toLocaleString()} reservados</p>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center">
                <Users className="h-4 w-4 text-blue-600" />
              </div>
              <p className="text-sm font-medium text-gray-500">Miembros</p>
            </div>
            <p className="text-2xl font-bold text-gray-900">{members.length}</p>
            <p className="text-xs text-gray-400 mt-1">Máx. {tenant.maxAgents} agentes</p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-9 w-9 rounded-lg bg-purple-50 flex items-center justify-center">
                <Activity className="h-4 w-4 text-purple-600" />
              </div>
              <p className="text-sm font-medium text-gray-500">Plan</p>
            </div>
            <p className="text-2xl font-bold text-gray-900 capitalize">{plan ? plan.type : "Sin plan"}</p>
            {plan && plan.type === "monthly" && (
              <p className="text-xs text-gray-400 mt-1">{plan.monthlyCredits.toLocaleString()} créditos/mes</p>
            )}
          </div>
        </div>

        {/* Members */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Users className="h-4 w-4 text-gray-400" />
            Miembros de la cuenta
          </h3>
          {members.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Sin miembros asignados</p>
          ) : (
            <div className="space-y-2">
              {members.map((m) => (
                <div key={m.id} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50/50 border border-gray-100">
                  <div className="h-8 w-8 rounded-full bg-brand-100 flex items-center justify-center text-xs font-bold text-brand-700">
                    {m.user.name?.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "U"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{m.user.name}</p>
                    <p className="text-xs text-gray-400 truncate">{m.user.email}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    m.role === "owner" ? "bg-amber-100 text-amber-700" : m.role === "admin" ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-600"
                  }`}>
                    {m.role === "owner" ? "Propietario" : m.role === "admin" ? "Administrador" : "Agente"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Transactions */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6 w-1/2">
          <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Coins className="h-4 w-4 text-gray-400" />
            Historial de consumos
            {txTotal > 0 && <span className="text-xs text-gray-400 font-normal ml-1">({txTotal})</span>}
          </h3>
          <div
            ref={txContainerRef}
            onScroll={handleTxScroll}
            className="max-h-64 overflow-y-auto space-y-1"
          >
            {transactions.length === 0 && !txLoading ? (
              <p className="text-sm text-gray-400 text-center py-4">Sin movimientos registrados</p>
            ) : (
              transactions.map((tx) => {
                const typeInfo = TYPE_COLORS[tx.type] || TYPE_COLORS.adjustment;
                const TypeIcon = typeInfo.icon;
                return (
                  <div key={tx.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50/50 transition-colors">
                    <div className={`h-7 w-7 rounded-lg ${typeInfo.bg} flex items-center justify-center shrink-0`}>
                      <TypeIcon className={`h-3.5 w-3.5 ${typeInfo.text}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-800 truncate">
                        {tx.description || tx.source || TYPE_LABELS[tx.type]}
                      </p>
                      <p className="text-[10px] text-gray-400">
                        {new Date(tx.createdAt).toLocaleDateString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-xs font-bold ${tx.amount >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {tx.amount >= 0 ? "+" : ""}{tx.amount.toLocaleString("es-CO", { maximumFractionDigits: 2 })}
                      </p>
                      <p className="text-[10px] text-gray-400">{tx.balanceAfter.toLocaleString("es-CO", { maximumFractionDigits: 2 })}</p>
                    </div>
                  </div>
                );
              })
            )}
            {txLoading && (
              <div className="flex items-center justify-center py-3">
                <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
              </div>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Calendar className="h-4 w-4 text-gray-400" />
            Información
          </h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-400 text-xs">ID</p>
              <p className="text-gray-700 font-mono text-xs mt-0.5">{tenant.id}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs">Slug</p>
              <p className="text-gray-700 mt-0.5">/{tenant.slug}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs">Creada</p>
              <p className="text-gray-700 mt-0.5">{formatDate(tenant.createdAt)}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs">Última actualización</p>
              <p className="text-gray-700 mt-0.5">{formatDate(tenant.updatedAt)}</p>
            </div>
          </div>
        </div>

        {/* Audit Log */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Activity className="h-4 w-4 text-gray-400" />
            Registro de actividad
            {auditTotal > 0 && (
              <span className="text-xs text-gray-400 font-normal">({auditTotal})</span>
            )}
          </h3>
          {auditLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-gray-300" />
            </div>
          ) : auditLogs.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Sin actividad registrada</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {auditLogs.map((log) => (
                <div key={log.id} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                  <div className="h-7 w-7 rounded-full bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
                    <Activity className="h-3.5 w-3.5 text-gray-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">{log.adminEmail}</span>
                      {' '}
                      <span className="text-gray-500">{formatAuditAction(log.action)}</span>
                    </p>
                    {log.metadata && (
                      <p className="text-xs text-gray-400 mt-0.5 truncate">
                        {formatAuditMetadata(log.action, log.metadata)}
                      </p>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 shrink-0 mt-0.5">{formatRelativeDate(log.createdAt)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>

      {/* Config Modal */}
      <AnimatePresence>
        {showConfigModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4"
            onClick={() => setShowConfigModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className="rounded-2xl w-full max-w-md border border-white/15 shadow-[0_0_15px_rgba(255,255,255,0.05)]"
              style={{
                background: 'linear-gradient(135deg, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.6) 100%)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-6 border-b border-gray-100">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Configurar cuenta</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Editar configuración de la cuenta</p>
                </div>
                <button onClick={() => setShowConfigModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Nombre de la cuenta</label>
                  <input
                    type="text"
                    value={configForm.name}
                    onChange={(e) => setConfigForm({ ...configForm, name: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  />
                </div>

                {/* Max agents */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Máximo de agentes</label>
                  <input
                    type="number"
                    min={1}
                    value={configForm.maxAgents}
                    onChange={(e) => setConfigForm({ ...configForm, maxAgents: parseInt(e.target.value) || 1 })}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-400 mt-1">Número máximo de usuarios permitidos</p>
                </div>

                {/* isDev toggle */}
                <div className="flex items-center justify-between p-3 rounded-lg border border-gray-200 bg-gray-50/50">
                  <div>
                    <p className="text-sm font-medium text-gray-700">Cuenta de desarrollo</p>
                    <p className="text-xs text-gray-400 mt-0.5">Webhooks al entorno de desarrollo</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setConfigForm({ ...configForm, isDev: !configForm.isDev })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      configForm.isDev ? 'bg-brand-600' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
                        configForm.isDev ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {/* Plan de créditos */}
                <div className="pt-4 border-t border-gray-200">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Plan de créditos</p>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Créditos mensuales</label>
                      <input
                        type="number"
                        min={0}
                        value={configForm.monthlyCredits}
                        onChange={(e) => setConfigForm({ ...configForm, monthlyCredits: parseInt(e.target.value) || 0 })}
                        className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                      />
                      <p className="text-xs text-gray-400 mt-1">Créditos otorgados al inicio de cada mes</p>
                    </div>

                    {/* Rollover toggle */}
                    <div className="flex items-center justify-between p-3 rounded-lg border border-gray-200 bg-gray-50/50">
                      <div>
                        <p className="text-sm font-medium text-gray-700">Acumular créditos</p>
                        <p className="text-xs text-gray-400 mt-0.5">Los créditos no usados se acumulan al renovar</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setConfigForm({ ...configForm, rollover: !configForm.rollover })}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          configForm.rollover ? 'bg-brand-600' : 'bg-gray-300'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
                            configForm.rollover ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                  <button
                    onClick={() => setShowConfigModal(false)}
                    className="px-4 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSaveConfig}
                    disabled={configLoading || !configForm.name.trim()}
                    className="relative px-6 py-2.5 rounded-lg text-white font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden bg-brand-800 hover:bg-brand-700 shadow-lg border border-white/10"
                  >
                    <span className="absolute inset-0 rounded-lg bg-gradient-to-br from-white/20 via-white/5 to-transparent pointer-events-none" />
                    <span className="relative">{configLoading ? "Guardando..." : "Guardar"}</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cost Config Modal */}
      <AnimatePresence>
        {showCostModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4"
            onClick={() => setShowCostModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg rounded-2xl shadow-2xl border border-white/30 p-6 max-h-[90vh] overflow-y-auto"
              style={{ background: "rgba(255, 255, 255, 0.92)", backdropFilter: "blur(20px)" }}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Configurar consumos</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Override por cuenta · Vacío = usa valor global
                  </p>
                </div>
                <button onClick={() => setShowCostModal(false)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Actions grid */}
              <div className="space-y-3">
                {ACTIONS.map(({ action, label, icon: Icon, color, bg }) => (
                  <div key={action} className="flex items-center gap-4 p-3 rounded-lg border border-gray-200 bg-gray-50/50">
                    <div className={`h-9 w-9 rounded-lg ${bg} flex items-center justify-center shrink-0`}>
                      <Icon className={`h-4 w-4 ${color}`} />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800">{label}</p>
                      <p className="text-[10px] text-gray-400">
                        Global: {globalCosts[action] !== undefined ? globalCosts[action] : "—"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={costs[action] ?? ""}
                        placeholder={globalCosts[action]?.toString() ?? "0"}
                        onChange={(e) =>
                          setCosts((prev) => ({
                            ...prev,
                            [action]: e.target.value === "" ? "" : parseFloat(e.target.value) || 0,
                          }))
                        }
                        className="w-20 px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                      />
                      <span className="text-xs text-gray-500">créditos</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Model selector */}
              <div className="mt-4 pt-4 border-t border-gray-100">
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  Modelo IA (override por cuenta · vacío = global)
                </label>
                <ModelSelector value={tenantModel} onChange={setTenantModel} />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowCostModal(false)}
                  className="px-4 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveCosts}
                  disabled={savingCosts}
                  className="relative px-6 py-2.5 rounded-lg text-white font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden bg-brand-800 hover:bg-brand-700 shadow-lg border border-white/10"
                >
                  <span className="absolute inset-0 rounded-lg bg-gradient-to-br from-white/20 via-white/5 to-transparent pointer-events-none" />
                  <span className="relative flex items-center gap-2">
                    {savingCosts ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Guardar
                  </span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
