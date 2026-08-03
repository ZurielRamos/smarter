import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Settings2, Users, Clock, UserPlus, X, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { InboxSettingsContent } from "@/components/InboxSettingsContent";
import { api } from "@/services/api";

interface Collaborator {
  id: string;
  inboxId: string;
  type: string;
  referenceId: string;
}

interface Agent {
  id: string;
  userId: string;
  role: string;
  user: { id: string; name: string; email: string };
}

interface Team {
  id: string;
  name: string;
  description: string | null;
}

function CollaboratorsTab({ inboxId }: { inboxId: string }) {
  const { slug } = useParams();
  const { user } = useAuth();
  const tenantRole = user?.tenantRoles.find((tr) => tr.tenant.slug === slug);
  const tenantId = tenantRole?.tenantId || "";

  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get<Collaborator[]>(`/chats/inboxes/${inboxId}/collaborators`),
      api.get(`/tenants/${tenantId}/members`),
      api.get<Team[]>("/teams", { params: { tenantId } }),
    ]).then(([collabRes, agentsRes, teamsRes]) => {
      setCollaborators(collabRes.data);
      setAgents(agentsRes.data);
      setTeams(teamsRes.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [inboxId, tenantId]);

  const assignedUserIds = collaborators.filter((c) => c.type === "user").map((c) => c.referenceId);
  const assignedTeamIds = collaborators.filter((c) => c.type === "team").map((c) => c.referenceId);
  const availableAgents = agents.filter((a) => !assignedUserIds.includes(a.userId));
  const availableTeams = teams.filter((t) => !assignedTeamIds.includes(t.id));

  const handleAdd = async (type: string, referenceId: string) => {
    const { data } = await api.post<Collaborator>(`/chats/inboxes/${inboxId}/collaborators`, { type, referenceId });
    setCollaborators((prev) => [...prev, data]);
  };

  const handleRemove = async (collaboratorId: string) => {
    await api.delete(`/chats/inboxes/${inboxId}/collaborators/${collaboratorId}`);
    setCollaborators((prev) => prev.filter((c) => c.id !== collaboratorId));
  };

  if (loading) return <div className="flex-1 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>;

  return (
    <div className="flex-1 overflow-y-auto p-5">
      <div className="max-w-2xl space-y-6">
        {/* Assigned agents */}
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Agentes asignados</h3>
          {assignedUserIds.length === 0 ? (
            <p className="text-xs text-gray-400 py-2">Sin agentes asignados</p>
          ) : (
            <div className="space-y-1">
              {collaborators.filter((c) => c.type === "user").map((c) => {
                const agent = agents.find((a) => a.userId === c.referenceId);
                return (
                  <div key={c.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-50 border border-gray-100">
                    <div className="h-7 w-7 rounded-full bg-brand-100 flex items-center justify-center text-xs font-bold text-brand-700">
                      {agent?.user.name.charAt(0).toUpperCase() || "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{agent?.user.name || "Usuario"}</p>
                      <p className="text-[10px] text-gray-400 truncate">{agent?.user.email}</p>
                    </div>
                    <button onClick={() => handleRemove(c.id)} className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {availableAgents.length > 0 && (
            <div className="mt-2 space-y-1">
              {availableAgents.map((a) => (
                <button key={a.userId} onClick={() => handleAdd("user", a.userId)} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border border-dashed border-gray-200 hover:border-brand-300 hover:bg-brand-50/30 transition-colors">
                  <UserPlus className="h-3.5 w-3.5 text-gray-400" />
                  <span className="text-sm text-gray-600">{a.user.name}</span>
                  <span className="text-[10px] text-gray-400 ml-auto">{a.user.email}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Assigned teams */}
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Equipos asignados</h3>
          {assignedTeamIds.length === 0 ? (
            <p className="text-xs text-gray-400 py-2">Sin equipos asignados</p>
          ) : (
            <div className="space-y-1">
              {collaborators.filter((c) => c.type === "team").map((c) => {
                const team = teams.find((t) => t.id === c.referenceId);
                return (
                  <div key={c.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-50 border border-gray-100">
                    <div className="h-7 w-7 rounded-full bg-purple-100 flex items-center justify-center">
                      <Users className="h-3.5 w-3.5 text-purple-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{team?.name || "Equipo"}</p>
                      {team?.description && <p className="text-[10px] text-gray-400 truncate">{team.description}</p>}
                    </div>
                    <button onClick={() => handleRemove(c.id)} className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {availableTeams.length > 0 && (
            <div className="mt-2 space-y-1">
              {availableTeams.map((t) => (
                <button key={t.id} onClick={() => handleAdd("team", t.id)} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border border-dashed border-gray-200 hover:border-purple-300 hover:bg-purple-50/30 transition-colors">
                  <Users className="h-3.5 w-3.5 text-gray-400" />
                  <span className="text-sm text-gray-600">{t.name}</span>
                  {t.description && <span className="text-[10px] text-gray-400 ml-auto">{t.description}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type Tab = "ajustes" | "colaboradores" | "horarios";

export function CanalDetail() {
  const { slug, inboxId } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>("ajustes");

  if (!inboxId) return null;

  const tabs = [
    { key: "ajustes" as Tab, label: "Ajustes", icon: Settings2 },
    { key: "colaboradores" as Tab, label: "Colaboradores", icon: Users },
    { key: "horarios" as Tab, label: "Horarios", icon: Clock },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Tabs */}
      <div className="px-5 border-b border-gray-100 flex items-center gap-1 shrink-0">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === key
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "ajustes" && (
        <InboxSettingsContent
          inboxId={inboxId}
          onDeleted={() => navigate(`/${slug}/comunicaciones/canales`, { replace: true })}
        />
      )}

      {activeTab === "colaboradores" && (
        <CollaboratorsTab inboxId={inboxId} />
      )}

      {activeTab === "horarios" && (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
          <Clock className="h-8 w-8 text-gray-300 mb-2" />
          <p className="text-sm text-gray-500 font-medium">Horarios de atención</p>
          <p className="text-[11px] text-gray-400 mt-1">Configura los horarios en los que este canal está disponible</p>
        </div>
      )}
    </div>
  );
}
