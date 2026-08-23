import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Users, Plus, X, Loader2, CheckCircle2, Pencil, Mail, Trash2, UserMinus, UserPlus } from "lucide-react";
import { motion } from "framer-motion";
import { api } from "@/services/api";
import { ConfirmModal } from "@/components/ConfirmModal";
import headerBg from "@/assets/header-background.jpg";

interface Agent {
  id: string;
  userId: string;
  role: string;
  status: string;
  user: { id: string; name: string; email: string };
}

interface TeamData {
  id: string;
  name: string;
  description: string | null;
}

interface TeamMember {
  id: string;
  userId: string;
  user: { id: string; name: string; email: string };
}

export function Team() {
  const { slug } = useParams();
  const { user } = useAuth();
  const currentTenant = user?.tenantRoles.find((tr) => tr.tenant.slug === slug);

  const [agents, setAgents] = useState<Agent[]>([]);
  const [maxAgents, setMaxAgents] = useState<number>(5);
  const [loading, setLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState({ name: "", email: "", role: "agent" });
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ status: string; message: string } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; agent: Agent } | null>(null);
  const [roleChangeAgent, setRoleChangeAgent] = useState<Agent | null>(null);
  const [changingRole, setChangingRole] = useState<string | null>(null);
  const [removeAgent, setRemoveAgent] = useState<Agent | null>(null);
  const [removeLoading, setRemoveLoading] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Teams state
  const [teams, setTeams] = useState<TeamData[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<TeamData | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamDesc, setNewTeamDesc] = useState("");
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [deleteTeam, setDeleteTeam] = useState<TeamData | null>(null);
  const [deleteTeamLoading, setDeleteTeamLoading] = useState(false);
  const [editingTeam, setEditingTeam] = useState<TeamData | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const teamContextRef = useRef<HTMLDivElement>(null);
  const [teamContextMenu, setTeamContextMenu] = useState<{ x: number; y: number; team: TeamData } | null>(null);

  const loadAgents = async () => {
    if (!slug) return;
    setLoading(true);
    try {
      const [membersRes, tenantRes] = await Promise.all([
        api.get<Agent[]>(`/account/${slug}/members`),
        api.get(`/account/${slug}`),
      ]);
      setAgents(membersRes.data);
      setMaxAgents(tenantRes.data.maxAgents || 5);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadAgents(); loadTeams(); }, [slug]);

  // Teams logic
  const loadTeams = async () => {
    if (!currentTenant?.tenantId) return;
    try {
      const { data } = await api.get<TeamData[]>("/teams", { params: { tenantId: currentTenant.tenantId } });
      setTeams(data);
    } catch {}
  };

  const loadTeamMembers = async (teamId: string) => {
    try {
      const { data } = await api.get<TeamMember[]>(`/teams/${teamId}/members`);
      setTeamMembers(data);
    } catch {}
  };

  useEffect(() => {
    if (selectedTeam) loadTeamMembers(selectedTeam.id);
    else setTeamMembers([]);
  }, [selectedTeam?.id]);

  const handleCreateTeam = async () => {
    if (!newTeamName.trim() || !currentTenant?.tenantId) return;
    setCreatingTeam(true);
    try {
      const { data } = await api.post<TeamData>("/teams", {
        tenantId: currentTenant.tenantId,
        name: newTeamName.trim(),
        description: newTeamDesc.trim() || undefined,
      });
      setTeams((prev) => [...prev, data]);
      setSelectedTeam(data);
      setNewTeamName("");
      setNewTeamDesc("");
      setShowCreateTeam(false);
    } catch {} finally {
      setCreatingTeam(false);
    }
  };

  const confirmDeleteTeam = async () => {
    if (!deleteTeam) return;
    setDeleteTeamLoading(true);
    try {
      await api.delete(`/teams/${deleteTeam.id}`);
      setTeams((prev) => prev.filter((t) => t.id !== deleteTeam.id));
      if (selectedTeam?.id === deleteTeam.id) { setSelectedTeam(null); setTeamMembers([]); }
      setDeleteTeam(null);
    } catch {}
    setDeleteTeamLoading(false);
  };

  const handleEditTeam = async () => {
    if (!editingTeam || !editName.trim()) return;
    try {
      const { data } = await api.put<TeamData>(`/teams/${editingTeam.id}`, { name: editName.trim(), description: editDesc.trim() || null });
      setTeams((prev) => prev.map((t) => t.id === data.id ? data : t));
      if (selectedTeam?.id === data.id) setSelectedTeam(data);
      setEditingTeam(null);
    } catch {}
  };

  const handleAddTeamMember = async (userId: string) => {
    if (!selectedTeam) return;
    await api.post(`/teams/${selectedTeam.id}/members`, { userId });
    loadTeamMembers(selectedTeam.id);
  };

  const handleRemoveTeamMember = async (userId: string) => {
    if (!selectedTeam) return;
    await api.delete(`/teams/${selectedTeam.id}/members/${userId}`);
    setTeamMembers((prev) => prev.filter((m) => m.userId !== userId));
  };

  // Close team context menu
  useEffect(() => {
    if (!teamContextMenu) return;
    function handleClick(e: MouseEvent) {
      if (teamContextRef.current && !teamContextRef.current.contains(e.target as Node)) setTeamContextMenu(null);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [teamContextMenu]);

  const availableForTeam = agents.filter(
    (a) => a.status === "active" && !teamMembers.some((m) => m.userId === a.userId)
  );

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return;
    function handleClick(e: MouseEvent) {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) setContextMenu(null);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [contextMenu]);

  const handleContextMenu = (e: React.MouseEvent, agent: Agent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, agent });
  };

  const handleResendInvite = async (agent: Agent) => {
    setContextMenu(null);
    try {
      await api.post(`/tenants/${currentTenant?.tenantId}/resend-invite`, { userId: agent.userId });
    } catch {}
  };

  const confirmRemoveAgent = async () => {
    if (!removeAgent) return;
    setRemoveLoading(true);
    try {
      await api.delete(`/account/${slug}/members/${removeAgent.userId}`);
      loadAgents();
      setRemoveAgent(null);
    } catch {}
    setRemoveLoading(false);
  };

  const handleChangeRole = async (agent: Agent, newRole: string) => {
    setChangingRole(newRole);
    try {
      await api.post(`/account/${slug}/members`, { userId: agent.userId, role: newRole });
      setRoleChangeAgent(null);
      loadAgents();
    } catch {} finally {
      setChangingRole(null);
    }
  };

  const handleInvite = async () => {
    if (!inviteForm.name || !inviteForm.email || !inviteForm.role || !currentTenant) return;
    setInviting(true);
    setInviteResult(null);
    try {
      const { data } = await api.post(`/tenants/${currentTenant.tenantId}/invite`, inviteForm);
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
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div
        className="px-8 pt-16 pb-4 shrink-0 rounded-b-2xl"
        style={{
          backgroundImage: `url(${headerBg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-brand-300" />
            <div>
              <h1 className="text-xl font-bold text-white">Equipo</h1>
              <p className="text-brand-300 mt-0.5 text-sm">
                Gestiona los miembros y permisos de {currentTenant?.tenant.name ?? "la cuenta"}
              </p>
            </div>
          </div>
          {!isAtLimit && (
            <button
              onClick={() => setShowInviteModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors border border-white/10"
            >
              <Plus className="h-4 w-4" />
              Agregar miembro
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1, ease: "easeOut" }}
        className="flex-1 min-h-0 overflow-auto py-6"
      >
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 max-w-6xl">
          {/* Left: Members */}
          <div>
            {/* Usage bar */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center gap-1.5 text-sm text-gray-500">
                <Users className="h-4 w-4" />
                <span className="font-medium">{agents.length}</span>
                <span className="text-gray-400">/ {maxAgents} miembros</span>
              </div>
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${isAtLimit ? "bg-red-500" : isNearLimit ? "bg-amber-500" : "bg-brand-500"}`}
                  style={{ width: `${usagePercent}%` }}
                />
              </div>
              {isAtLimit && (
                <span className="text-xs text-red-600 font-medium">Limite alcanzado</span>
              )}
            </div>

            {/* Members list */}
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-gray-300" />
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {agents.map((agent, i) => (
                  <div
                    key={agent.id}
                    onContextMenu={(e) => handleContextMenu(e, agent)}
                    className={`flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors cursor-default ${
                      i > 0 ? "border-t border-gray-100" : ""
                    }`}
                  >
                    <div className="h-10 w-10 rounded-full bg-brand-100 flex items-center justify-center text-sm font-bold text-brand-700 shrink-0">
                      {agent.user.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900 truncate">{agent.user.name}</p>
                        {agent.status === "pending" && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium border border-amber-200">
                            Pendiente
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 truncate">{agent.user.email}</p>
                    </div>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                      agent.role === "owner" ? "bg-amber-100 text-amber-700" :
                      agent.role === "admin" ? "bg-purple-100 text-purple-700" :
                      "bg-gray-100 text-gray-600"
                    }`}>
                      {agent.role === "owner" ? "Propietario" : agent.role === "admin" ? "Administrador" : "Agente"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: Teams */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col max-h-[calc(100vh-220px)]">
            {/* Teams header */}
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
              <h3 className="text-sm font-semibold text-gray-900">Equipos</h3>
              <button
                onClick={() => setShowCreateTeam(true)}
                className="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                title="Crear equipo"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            {/* Teams list */}
            <div className="flex-1 overflow-y-auto">
              {teams.length === 0 ? (
                <div className="py-8 text-center">
                  <Users className="h-6 w-6 text-gray-300 mx-auto mb-2" />
                  <p className="text-xs text-gray-400">Sin equipos creados</p>
                  <button
                    onClick={() => setShowCreateTeam(true)}
                    className="mt-2 text-xs text-brand-600 hover:text-brand-800 font-medium"
                  >
                    Crear primer equipo
                  </button>
                </div>
              ) : (
                <>
                  {teams.map((team) => (
                    <button
                      key={team.id}
                      onClick={() => setSelectedTeam(selectedTeam?.id === team.id ? null : team)}
                      onContextMenu={(e) => { e.preventDefault(); setTeamContextMenu({ x: e.clientX, y: e.clientY, team }); }}
                      className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                        selectedTeam?.id === team.id ? "bg-brand-50" : ""
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-lg bg-brand-100 flex items-center justify-center shrink-0">
                          <Users className="h-4 w-4 text-brand-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{team.name}</p>
                          {team.description && (
                            <p className="text-[10px] text-gray-400 truncate">{team.description}</p>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}

                  {/* Selected team members */}
                  {selectedTeam && (
                    <div className="border-t border-gray-200">
                      <div className="px-4 py-2.5 bg-gray-50 flex items-center justify-between">
                        <p className="text-xs font-medium text-gray-600">{selectedTeam.name} · {teamMembers.length} miembros</p>
                      </div>
                      {teamMembers.map((m) => (
                        <div key={m.id} className="flex items-center gap-2.5 px-4 py-2 border-b border-gray-50 hover:bg-gray-50">
                          <div className="h-7 w-7 rounded-full bg-brand-100 flex items-center justify-center text-[10px] font-bold text-brand-700 shrink-0">
                            {m.user.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-gray-900 truncate">{m.user.name}</p>
                          </div>
                          <button
                            onClick={() => handleRemoveTeamMember(m.userId)}
                            className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                      {/* Add to team */}
                      {availableForTeam.length > 0 && (
                        <div className="px-4 py-2 border-t border-gray-100">
                          <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1.5">Agregar</p>
                          {availableForTeam.slice(0, 5).map((a) => (
                            <button
                              key={a.userId}
                              onClick={() => handleAddTeamMember(a.userId)}
                              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-gray-600 hover:bg-brand-50 hover:text-brand-700 transition-colors"
                            >
                              <UserPlus className="h-3 w-3" />
                              {a.user.name}
                            </button>
                          ))}
                          {availableForTeam.length > 5 && (
                            <p className="text-[10px] text-gray-400 mt-1 px-2">+{availableForTeam.length - 5} más</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 animate-in fade-in zoom-in-95 duration-100"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          {contextMenu.agent.status === "pending" && (
            <button
              onClick={() => handleResendInvite(contextMenu.agent)}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Mail className="h-4 w-4 text-gray-400" />
              Reenviar invitación
            </button>
          )}
          {contextMenu.agent.role !== "owner" && (
            <>
              <button
                onClick={() => { setRoleChangeAgent(contextMenu.agent); setContextMenu(null); }}
                className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Pencil className="h-4 w-4 text-gray-400" />
                Cambiar rol
              </button>
              <div className="border-t border-gray-100 my-1" />
              <button
                onClick={() => { setRemoveAgent(contextMenu.agent); setContextMenu(null); }}
                className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <UserMinus className="h-4 w-4 text-red-400" />
                Eliminar del equipo
              </button>
            </>
          )}
        </div>
      )}

      {/* Role Change Modal */}
      {roleChangeAgent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4"
          onClick={() => setRoleChangeAgent(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl shadow-2xl border border-white/30 p-6"
            style={{ background: "rgba(255, 255, 255, 0.95)", backdropFilter: "blur(20px)" }}
          >
            <div className="mb-4">
              <h3 className="text-base font-semibold text-gray-900">Cambiar rol</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                {roleChangeAgent.user.name} · {roleChangeAgent.user.email}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleChangeRole(roleChangeAgent, "agent")}
                disabled={!!changingRole}
                className={`p-3 rounded-xl border-2 text-left transition-all disabled:opacity-70 ${
                  roleChangeAgent.role === "agent"
                    ? "border-brand-500 bg-brand-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  {changingRole === "agent" ? (
                    <Loader2 className="h-4 w-4 text-brand-600 animate-spin" />
                  ) : (
                    <Users className={`h-4 w-4 ${roleChangeAgent.role === "agent" ? "text-brand-600" : "text-gray-500"}`} />
                  )}
                  <span className={`text-sm font-semibold ${roleChangeAgent.role === "agent" ? "text-brand-700" : "text-gray-700"}`}>Agente</span>
                </div>
                <p className="text-[10px] text-gray-500">Responde conversaciones</p>
              </button>
              <button
                onClick={() => handleChangeRole(roleChangeAgent, "admin")}
                disabled={!!changingRole}
                className={`p-3 rounded-xl border-2 text-left transition-all disabled:opacity-70 ${
                  roleChangeAgent.role === "admin"
                    ? "border-purple-500 bg-purple-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  {changingRole === "admin" ? (
                    <Loader2 className="h-4 w-4 text-purple-600 animate-spin" />
                  ) : (
                    <Users className={`h-4 w-4 ${roleChangeAgent.role === "admin" ? "text-purple-600" : "text-gray-500"}`} />
                  )}
                  <span className={`text-sm font-semibold ${roleChangeAgent.role === "admin" ? "text-purple-700" : "text-gray-700"}`}>Administrador</span>
                </div>
                <p className="text-[10px] text-gray-500">Acceso total</p>
              </button>
            </div>

            <div className="mt-4 text-right">
              <button onClick={() => setRoleChangeAgent(null)} className="text-xs text-gray-500 hover:text-gray-700">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

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
                <h3 className="text-lg font-semibold text-gray-900">Agregar miembro al equipo</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Invita a un nuevo miembro. Recibirá un correo con las instrucciones.
                </p>
              </div>
              <button onClick={() => { setShowInviteModal(false); setInviteResult(null); }} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nombre completo</label>
                <input
                  type="text"
                  value={inviteForm.name}
                  onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })}
                  placeholder="Ej: María García"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Correo electrónico</label>
                <input
                  type="email"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                  placeholder="maria@empresa.com"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  Si ya tiene cuenta, se le dará acceso. Si no, se le creará una cuenta nueva.
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Rol en la cuenta</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setInviteForm({ ...inviteForm, role: "agent" })}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${
                      inviteForm.role === "agent"
                        ? "border-brand-500 bg-brand-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className={`h-7 w-7 rounded-lg flex items-center justify-center ${inviteForm.role === "agent" ? "bg-brand-100" : "bg-gray-100"}`}>
                        <Users className={`h-4 w-4 ${inviteForm.role === "agent" ? "text-brand-600" : "text-gray-500"}`} />
                      </div>
                      <span className={`text-sm font-semibold ${inviteForm.role === "agent" ? "text-brand-700" : "text-gray-700"}`}>Agente</span>
                    </div>
                    <p className="text-[10px] text-gray-500 leading-tight">
                      Puede ver y responder conversaciones asignadas.
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setInviteForm({ ...inviteForm, role: "admin" })}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${
                      inviteForm.role === "admin"
                        ? "border-purple-500 bg-purple-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className={`h-7 w-7 rounded-lg flex items-center justify-center ${inviteForm.role === "admin" ? "bg-purple-100" : "bg-gray-100"}`}>
                        <Users className={`h-4 w-4 ${inviteForm.role === "admin" ? "text-purple-600" : "text-gray-500"}`} />
                      </div>
                      <span className={`text-sm font-semibold ${inviteForm.role === "admin" ? "text-purple-700" : "text-gray-700"}`}>Administrador</span>
                    </div>
                    <p className="text-[10px] text-gray-500 leading-tight">
                      Acceso total: canales, campañas, contactos y configuraciones.
                    </p>
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
                  {inviting ? "Enviando..." : "Invitar"}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Member Confirmation */}
      <ConfirmModal
        open={!!removeAgent}
        onClose={() => setRemoveAgent(null)}
        onConfirm={confirmRemoveAgent}
        title="Eliminar del equipo"
        description={`¿Eliminar a ${removeAgent?.user.name} (${removeAgent?.user.email}) del equipo? Perderá acceso a esta cuenta.`}
        confirmLabel="Eliminar"
        variant="danger"
        loading={removeLoading}
      />

      {/* Delete Team Confirmation */}
      <ConfirmModal
        open={!!deleteTeam}
        onClose={() => setDeleteTeam(null)}
        onConfirm={confirmDeleteTeam}
        title="Eliminar equipo"
        description={`¿Eliminar el equipo "${deleteTeam?.name}"? Los miembros no serán eliminados de la cuenta.`}
        confirmLabel="Eliminar"
        variant="danger"
        loading={deleteTeamLoading}
      />

      {/* Team Context Menu */}
      {teamContextMenu && (
        <div
          ref={teamContextRef}
          className="fixed z-50 w-44 bg-white rounded-lg shadow-lg border border-gray-200 py-1 animate-in fade-in zoom-in-95 duration-100"
          style={{ top: teamContextMenu.y, left: teamContextMenu.x }}
        >
          <button
            onClick={() => {
              setEditingTeam(teamContextMenu.team);
              setEditName(teamContextMenu.team.name);
              setEditDesc(teamContextMenu.team.description || "");
              setTeamContextMenu(null);
            }}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Pencil className="h-4 w-4 text-gray-400" />
            Editar
          </button>
          <div className="border-t border-gray-100 my-1" />
          <button
            onClick={() => { setDeleteTeam(teamContextMenu.team); setTeamContextMenu(null); }}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
          >
            <Trash2 className="h-4 w-4 text-red-400" />
            Eliminar
          </button>
        </div>
      )}

      {/* Create Team Modal */}
      {showCreateTeam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4" onClick={() => setShowCreateTeam(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl shadow-2xl border border-white/30 p-6" style={{ background: "rgba(255, 255, 255, 0.95)", backdropFilter: "blur(20px)" }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-900">Nuevo equipo</h3>
              <button onClick={() => setShowCreateTeam(false)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nombre</label>
                <input
                  type="text"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleCreateTeam(); }}
                  placeholder="Ej: Soporte, Ventas, Marketing"
                  autoFocus
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Descripción <span className="text-gray-400">(opcional)</span></label>
                <input
                  type="text"
                  value={newTeamDesc}
                  onChange={(e) => setNewTeamDesc(e.target.value)}
                  placeholder="Descripción del equipo"
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-gray-100">
              <button onClick={() => setShowCreateTeam(false)} className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Cancelar
              </button>
              <button
                onClick={handleCreateTeam}
                disabled={!newTeamName.trim() || creatingTeam}
                className="px-4 py-2 rounded-lg bg-brand-800 hover:bg-brand-700 text-white text-sm font-medium disabled:opacity-50 flex items-center gap-1.5"
              >
                {creatingTeam && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {creatingTeam ? "Creando..." : "Crear equipo"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Team Modal */}
      {editingTeam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4" onClick={() => setEditingTeam(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl shadow-2xl border border-white/30 p-6" style={{ background: "rgba(255, 255, 255, 0.95)", backdropFilter: "blur(20px)" }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-900">Editar equipo</h3>
              <button onClick={() => setEditingTeam(null)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nombre</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleEditTeam(); }}
                  autoFocus
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Descripción</label>
                <input
                  type="text"
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  placeholder="Descripción del equipo"
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-gray-100">
              <button onClick={() => setEditingTeam(null)} className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Cancelar
              </button>
              <button
                onClick={handleEditTeam}
                disabled={!editName.trim()}
                className="px-4 py-2 rounded-lg bg-brand-800 hover:bg-brand-700 text-white text-sm font-medium disabled:opacity-50"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
