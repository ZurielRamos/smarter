import { useEffect, useState } from "react";
import headerBg from "@/assets/header-background.jpg";
import {
  MessageSquare,
  Phone,
  Mail,
  Coins,
  Save,
  Loader2,
  Settings2,
  X,
  ArrowUpCircle,
  ArrowDownCircle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { api } from "@/services/api";

interface CreditCost {
  id: string;
  action: string;
  label: string;
  cost: number;
  isActive: boolean;
}

interface CreditTransaction {
  id: string;
  tenantId: string;
  type: "grant" | "purchase" | "consume" | "refund" | "expire" | "adjustment";
  amount: number;
  balanceAfter: number;
  source: string | null;
  referenceId: string | null;
  description: string | null;
  createdAt: string;
  tenant?: { id: string; name: string; slug: string };
}

const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

const ACTIONS = [
  {
    action: "sms",
    label: "Envío SMS",
    icon: MessageSquare,
    color: "text-blue-600",
    bg: "bg-blue-50",
  },
  {
    action: "whatsapp_utility",
    label: "WhatsApp - Utilidad",
    icon: WhatsAppIcon,
    color: "text-green-600",
    bg: "bg-green-50",
  },
  {
    action: "whatsapp_marketing",
    label: "WhatsApp - Marketing",
    icon: WhatsAppIcon,
    color: "text-green-600",
    bg: "bg-green-50",
  },
  {
    action: "whatsapp_authentication",
    label: "WhatsApp - Autenticación",
    icon: WhatsAppIcon,
    color: "text-green-600",
    bg: "bg-green-50",
  },
  {
    action: "call",
    label: "Llamada",
    icon: Phone,
    color: "text-purple-600",
    bg: "bg-purple-50",
  },
  {
    action: "email",
    label: "Email",
    icon: Mail,
    color: "text-orange-600",
    bg: "bg-orange-50",
  },
];

const TYPE_LABELS: Record<string, string> = {
  grant: "Renovación",
  purchase: "Recarga",
  consume: "Consumo",
  refund: "Reembolso",
  expire: "Expiración",
  adjustment: "Ajuste",
};

export function AdminBilling() {
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [costs, setCosts] = useState<Record<string, number>>({});
  const [savedCosts, setSavedCosts] = useState<Record<string, number>>({});
  const [savingCosts, setSavingCosts] = useState(false);

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{ data: CreditTransaction[]; total: number }>(
        "/billing/config/transactions?limit=50"
      );
      setTransactions(data.data);
      setTotal(data.total);
    } catch {
      // handle error
    } finally {
      setLoading(false);
    }
  };

  const fetchCosts = async () => {
    try {
      const { data } = await api.get<CreditCost[]>("/billing/config/costs");
      const map: Record<string, number> = {};
      data.forEach((c) => {
        map[c.action] = c.cost;
      });
      setCosts(map);
      setSavedCosts(map);
    } catch {}
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  const handleOpenConfig = () => {
    fetchCosts();
    setShowConfigModal(true);
  };

  const handleSaveCosts = async () => {
    setSavingCosts(true);
    try {
      for (const a of ACTIONS) {
        const cost = costs[a.action];
        if (cost !== undefined && cost >= 1) {
          await api.post("/billing/config/costs", {
            action: a.action,
            label: a.label,
            cost,
          });
        }
      }
      setSavedCosts({ ...costs });
      setShowConfigModal(false);
    } catch {} finally {
      setSavingCosts(false);
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("es-CO", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Dark header section */}
      <div
        className="px-8 pt-16 pb-6 shrink-0 rounded-b-2xl"
        style={{
          backgroundImage: `url(${headerBg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Créditos</h1>
            <p className="text-brand-300 text-sm mt-1">
              Historial de recargas y consumos del sistema
            </p>
          </div>
          <Button
            onClick={handleOpenConfig}
            className="bg-brand-700 hover:bg-brand-600 text-white gap-2"
          >
            <Settings2 className="h-4 w-4" />
            Configurar consumos
          </Button>
        </div>
      </div>

      {/* Transactions list */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1, ease: "easeOut" }}
        className="py-6 flex-1 min-h-0 overflow-auto"
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12">
            <div className="flex flex-col items-center justify-center text-center">
              <div className="h-16 w-16 rounded-full bg-brand-50 flex items-center justify-center mb-4">
                <Coins className="h-7 w-7 text-brand-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                Sin movimientos
              </h3>
              <p className="text-gray-500 text-sm max-w-sm">
                Aún no hay recargas ni consumos registrados en el sistema.
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fecha
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cuenta
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tipo
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Descripción
                  </th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Créditos
                  </th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Balance
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {transactions.map((tx) => {
                  const isPositive = tx.amount > 0;
                  return (
                    <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-3 text-sm text-gray-600 whitespace-nowrap">
                        {formatDate(tx.createdAt)}
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-900 font-medium">
                        {tx.tenant?.name ?? "—"}
                      </td>
                      <td className="px-6 py-3">
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                            isPositive
                              ? "bg-green-50 text-green-700"
                              : "bg-red-50 text-red-700"
                          }`}
                        >
                          {isPositive ? (
                            <ArrowUpCircle className="h-3 w-3" />
                          ) : (
                            <ArrowDownCircle className="h-3 w-3" />
                          )}
                          {TYPE_LABELS[tx.type] ?? tx.type}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-600">
                        {tx.description ?? tx.source ?? "—"}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <span
                          className={`text-sm font-semibold ${
                            isPositive ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {isPositive ? "+" : ""}
                          {tx.amount.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right text-sm text-gray-500">
                        {tx.balanceAfter.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {total > transactions.length && (
              <div className="px-6 py-3 border-t border-gray-100 text-center">
                <p className="text-xs text-gray-400">
                  Mostrando {transactions.length} de {total} movimientos
                </p>
              </div>
            )}
          </div>
        )}
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
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg rounded-2xl shadow-2xl border border-white/30 p-6"
              style={{
                background: "rgba(255, 255, 255, 0.92)",
                backdropFilter: "blur(20px)",
              }}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    Configurar consumos
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Define cuántos créditos consume cada acción
                  </p>
                </div>
                <button
                  onClick={() => setShowConfigModal(false)}
                  className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Actions grid */}
              <div className="space-y-3">
                {ACTIONS.map(({ action, label, icon: Icon, color, bg }) => (
                  <div
                    key={action}
                    className="flex items-center gap-4 p-3 rounded-lg border border-gray-200 bg-gray-50/50"
                  >
                    <div
                      className={`h-9 w-9 rounded-lg ${bg} flex items-center justify-center shrink-0`}
                    >
                      <Icon className={`h-4 w-4 ${color}`} />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800">{label}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        value={costs[action] ?? ""}
                        placeholder="0"
                        onChange={(e) =>
                          setCosts((prev) => ({
                            ...prev,
                            [action]: parseInt(e.target.value) || 0,
                          }))
                        }
                        className="w-20 px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                      />
                      <span className="text-xs text-gray-500">créditos</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowConfigModal(false)}
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
                    {savingCosts ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
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
