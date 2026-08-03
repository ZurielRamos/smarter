import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Users, Plus, X, Loader2, CheckCircle2 } from "lucide-react";
import { api } from "@/services/api";

interface Agent {
  id: string;
  userId: string;
  role: string;
  user: { id: string; name: string; email: string };
}

export function Agentes() {
  const { slug } = useParams();
  const { user } = useAuth();
  const tenantRole = user?.tenantRoles.find((tr) => tr.tenant.slug === slug);
  const tenantId = tenantRole?.tenantId || "";
  const [agents, setAgents] = useState<Agent[]>([]);
  const [maxAgents, setMaxAgents] = useState<number>(5);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState({ name: "", email: "", role: "agent" });
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ status: string; message: string } | null>(null);

  const loadAgents = () => {
    if (!tenantId) return;
    api.get("/tenants/" + tenantId + "/members").then(({ data }) => setAgents(data)).catch(() => {});
    api.get("/tenants/" + tenantId).then(({ data }) => setMaxAgents(data.maxAgents || 5)).catch(() => {});
  };

  useEffect(() => { loadAgents(); }, [tenantId]);

  const handleInvite = async () => {
    if (!inviteForm.name || !inviteForm.email || !inviteForm.role) return;
    setInviting(true);
    setInviteResult(null);
    try {
      const { data } = await api.post(`/tenants/${tenantId}/invite`, inviteForm);
      setInviteResult(data);
      loadAgents();
      setTimeout(() => {
        setShowInviteModal(false);
        setInviteForm({ name: "", email: "", role: "agent" });
        setInviteResult(null);
      }, 2000);
    } catch (err: any) {
      setInviteResult({ status: "error", message: err.response?.data?.message || "Error al invitar" });
    } finally {
      setInviting(false);
    }
  };

  const usagePercent = Math.min((agents.length / maxAgents) * 100, 100);
  const isNearLimit = agents.length >= maxAgents - 1;
  const isAtLimit = agents.length >= maxAgents;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Agentes</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">{agents.length} de {maxAgents} agentes</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <Users className="h-3.5 w-3.5" />
              <span className="font-medium">{agents.length}/{maxAgents}</span>
            </div>
            {!isAtLimit && (
              <button
                onClick={() => setShowInviteModal(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-xs font-medium transition-colors"
              >
                <Plus className="h-3 w-3" />
                Agregar
              </button>
            )}
          </div>
        </div>
        {/* Capacity bar */}
        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${isAtLimit ? "bg-red-500" : isNearLimit ? "bg-amber-500" : "bg-brand-500"}`}
            style={{ width: `${usagePercent}%` }}
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {agents.map((agent) => (
          <div key={agent.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors">
            <div className="h-9 w-9 rounded-full bg-brand-100 flex items-center justify-center text-sm font-bold text-brand-700 shrink-0">
              {agent.user.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{agent.user.name}</p>
              <p className="text-[11px] text-gray-400 truncate">{agent.user.email}</p>
            </div>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${agent.role === "admin" ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-600"}`}>
              {agent.role === "admin" ? "Administrador" : "Agente"}
            </span>
          </div>
        ))}
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4"
          onClick={() => { setShowInviteModal(false); setInviteResult(null); }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl shadow-2xl border border-white/30 p-6"
            style={{ background: "rgba(255, 255, 255, 0.95)", backdropFilter: "blur(20px)" }}
          >
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Agregar agente</h3>
                <p className="text-xs text-gray-400 mt-0.5">Se enviará un email con las instrucciones de acceso</p>
              </div>
              <button onClick={() => { setShowInviteModal(false); setInviteResult(null); }} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nombre</label>
                <input
                  type="text"
                  value={inviteForm.name}
                  onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })}
                  placeholder="Nombre del agente"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Correo electrónico</label>
                <input
                  type="email"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                  placeholder="agente@empresa.com"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Rol</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setInviteForm({ ...inviteForm, role: "agent" })}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      inviteForm.role === "agent"
                        ? "border-brand-500 bg-brand-50 text-brand-700"
                        : "border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    Agente
                  </button>
                  <button
                    type="button"
                    onClick={() => setInviteForm({ ...inviteForm, role: "admin" })}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      inviteForm.role === "admin"
                        ? "border-brand-500 bg-brand-50 text-brand-700"
                        : "border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    Administrador
                  </button>
                </div>
              </div>
            </div>

            {inviteResult && (
              <div className={`mt-4 p-3 rounded-lg text-xs font-medium ${
                inviteResult.status === "error"
                  ? "bg-red-50 text-red-700 border border-red-200"
                  : "bg-green-50 text-green-700 border border-green-200"
              }`}>
                <div className="flex items-center gap-2">
                  {inviteResult.status !== "error" && <CheckCircle2 className="h-3.5 w-3.5" />}
                  {inviteResult.message}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
              <button
                onClick={() => { setShowInviteModal(false); setInviteResult(null); }}
                className="px-4 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleInvite}
                disabled={inviting || !inviteForm.name || !inviteForm.email}
                className="relative px-6 py-2.5 rounded-lg text-white font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden bg-brand-800 hover:bg-brand-700 shadow-lg border border-white/10"
              >
                <span className="absolute inset-0 rounded-lg bg-gradient-to-br from-white/20 via-white/5 to-transparent pointer-events-none" />
                <span className="relative flex items-center gap-2">
                  {inviting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {inviting ? "Enviando..." : "Invitar agente"}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
