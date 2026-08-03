import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Plus, Users, X, Trash2, UserPlus, Loader2, Pencil } from "lucide-react";
import { api } from "@/services/api";

interface Team {
  id: string;
  name: string;
  description: string | null;
}

interface TeamMember {
  id: string;
  userId: string;
  user: { id: string; name: string; email: string };
}

interface Agent {
  id: string;
  userId: string;
  role: string;
  user: { id: string; name: string; email: string };
}

export function Equipos() {
  const { slug } = useParams();
  const { user } = useAuth();
  const tenantRole = user?.tenantRoles.find((tr) => tr.tenant.slug === slug);
  const tenantId = tenantRole?.tenantId || "";

  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [showCreateInput, setShowCreateInput] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamDesc, setNewTeamDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [teamContextMenu, setTeamContextMenu] = useState<{ x: number; y: number; team: Team } | null>(null);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const teamContextRef = useRef<HTMLDivElement>(null);

  const loadTeams = () => {
    if (!tenantId) return;
    api.get<Team[]>("/teams", { params: { tenantId } }).then(({ data }) => setTeams(data)).catch(() => {});
  };

  const loadMembers = (teamId: string) => {
    api.get<TeamMember[]>(`/teams/${teamId}/members`).then(({ data }) => setMembers(data)).catch(() => {});
  };

  const loadAgents = () => {
    api.get(`/tenants/${tenantId}/members`).then(({ data }) => setAgents(data)).catch(() => {});
  };

  useEffect(() => { loadTeams(); loadAgents(); }, [tenantId]);

  useEffect(() => {
    if (selectedTeam) loadMembers(selectedTeam.id);
  }, [selectedTeam?.id]);

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) return;
    setCreating(true);
    try {
      const { data } = await api.post<Team>("/teams", { tenantId, name: newTeamName.trim(), description: newTeamDesc.trim() || undefined });
      setTeams((prev) => [...prev, data]);
      setNewTeamName("");
      setNewTeamDesc("");
      setShowCreateInput(false);
      setSelectedTeam(data);
    } catch {} finally {
      setCreating(false);
    }
  };

  const handleDeleteTeam = async (team: Team) => {
    await api.delete(`/teams/${team.id}`);
    setTeams((prev) => prev.filter((t) => t.id !== team.id));
    if (selectedTeam?.id === team.id) { setSelectedTeam(null); setMembers([]); }
  };

  // Context menu close
  useEffect(() => {
    if (!teamContextMenu) return;
    function handleClick(e: MouseEvent) {
      if (teamContextRef.current && !teamContextRef.current.contains(e.target as Node)) setTeamContextMenu(null);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [teamContextMenu]);

  const handleEditTeam = async () => {
    if (!editingTeam || !editName.trim()) return;
    const { data } = await api.put<Team>(`/teams/${editingTeam.id}`, { name: editName.trim(), description: editDesc.trim() || null });
    setTeams((prev) => prev.map((t) => t.id === data.id ? data : t));
    if (selectedTeam?.id === data.id) setSelectedTeam(data);
    setEditingTeam(null);
  };

  const handleAddMember = async (userId: string) => {
    if (!selectedTeam) return;
    await api.post(`/teams/${selectedTeam.id}/members`, { userId });
    loadMembers(selectedTeam.id);
  };

  const handleRemoveMember = async (userId: string) => {
    if (!selectedTeam) return;
    await api.delete(`/teams/${selectedTeam.id}/members/${userId}`);
    setMembers((prev) => prev.filter((m) => m.userId !== userId));
  };

  const availableAgents = agents.filter(
    (a) => !members.some((m) => m.userId === a.userId)
  );

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Sidebar — Teams list */}
      <div className="w-64 border-r border-gray-100 flex flex-col">
        <div className="px-3 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-gray-500 uppercase">Equipos</h3>
          <button
            onClick={() => setShowCreateInput(true)}
            className="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {showCreateInput && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4" onClick={() => setShowCreateInput(false)}>
            <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl shadow-2xl border border-white/30 p-6" style={{ background: "rgba(255, 255, 255, 0.95)", backdropFilter: "blur(20px)" }}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold text-gray-900">Nuevo equipo</h3>
                <button onClick={() => setShowCreateInput(false)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
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
                    placeholder="¿Qué hace este equipo?"
                    className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-gray-100">
                <button onClick={() => setShowCreateInput(false)} className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  Cancelar
                </button>
                <button
                  onClick={handleCreateTeam}
                  disabled={!newTeamName.trim() || creating}
                  className="px-4 py-2 rounded-lg bg-brand-800 hover:bg-brand-700 text-white text-sm font-medium disabled:opacity-50 flex items-center gap-1.5"
                >
                  {creating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {creating ? "Creando..." : "Crear equipo"}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {teams.length === 0 && !showCreateInput ? (
            <div className="px-3 py-8 text-center">
              <Users className="h-6 w-6 text-gray-300 mx-auto mb-2" />
              <p className="text-xs text-gray-400">Sin equipos</p>
            </div>
          ) : (
            teams.map((team) => (
              <button
                key={team.id}
                onClick={() => setSelectedTeam(team)}
                onContextMenu={(e) => { e.preventDefault(); setTeamContextMenu({ x: e.clientX, y: e.clientY, team }); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-colors ${
                  selectedTeam?.id === team.id ? "bg-brand-50 text-brand-700 font-medium" : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                <Users className="h-4 w-4 text-gray-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="truncate">{team.name}</p>
                  {team.description && (
                    <p className="text-[10px] text-gray-400 truncate">{team.description}</p>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Detail panel */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedTeam ? (
          <>
            {/* Team header */}
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">{selectedTeam.name}</h3>
                <p className="text-[11px] text-gray-400">{members.length} miembros</p>
              </div>
              <button
                onClick={() => handleDeleteTeam(selectedTeam)}
                className="p-1.5 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                title="Eliminar equipo"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            {/* Members list */}
            <div className="flex-1 overflow-y-auto">
              {members.map((m) => (
                <div key={m.id} className="flex items-center gap-3 px-5 py-2.5 border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <div className="h-8 w-8 rounded-full bg-brand-100 flex items-center justify-center text-xs font-bold text-brand-700 shrink-0">
                    {m.user.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{m.user.name}</p>
                    <p className="text-[10px] text-gray-400 truncate">{m.user.email}</p>
                  </div>
                  <button
                    onClick={() => handleRemoveMember(m.userId)}
                    className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}

              {/* Add member section */}
              {availableAgents.length > 0 && (
                <div className="px-5 py-3 border-t border-gray-100">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase mb-2">Agregar miembro</p>
                  <div className="space-y-1">
                    {availableAgents.map((a) => (
                      <button
                        key={a.userId}
                        onClick={() => handleAddMember(a.userId)}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border border-dashed border-gray-200 hover:border-brand-300 hover:bg-brand-50/30 transition-colors"
                      >
                        <UserPlus className="h-3.5 w-3.5 text-gray-400" />
                        <span className="text-sm text-gray-600">{a.user.name}</span>
                        <span className="text-[10px] text-gray-400 ml-auto">{a.user.email}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
            <Users className="h-8 w-8 text-gray-300 mb-2" />
            <p className="text-sm text-gray-500 font-medium">Selecciona un equipo</p>
            <p className="text-[11px] text-gray-400 mt-1">O crea uno nuevo desde el panel izquierdo</p>
          </div>
        )}
      </div>

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
            onClick={() => { handleDeleteTeam(teamContextMenu.team); setTeamContextMenu(null); }}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
          >
            <Trash2 className="h-4 w-4 text-red-400" />
            Eliminar
          </button>
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
