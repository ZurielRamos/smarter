import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Settings2, Users, Clock, UserPlus, X, Loader2, Save, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { InboxSettingsContent } from "@/components/InboxSettingsContent";
import { api } from "@/services/api";

interface DaySchedule {
  enabled: boolean;
  start: string;
  end: string;
}

interface Schedule {
  [key: string]: DaySchedule;
}

const DAYS = [
  { key: "lunes", label: "Lunes" },
  { key: "martes", label: "Martes" },
  { key: "miercoles", label: "Miércoles" },
  { key: "jueves", label: "Jueves" },
  { key: "viernes", label: "Viernes" },
  { key: "sabado", label: "Sábado" },
  { key: "domingo", label: "Domingo" },
  { key: "festivos", label: "Festivos" },
];

const DEFAULT_SCHEDULE: Schedule = {
  lunes: { enabled: true, start: "08:00", end: "18:00" },
  martes: { enabled: true, start: "08:00", end: "18:00" },
  miercoles: { enabled: true, start: "08:00", end: "18:00" },
  jueves: { enabled: true, start: "08:00", end: "18:00" },
  viernes: { enabled: true, start: "08:00", end: "18:00" },
  sabado: { enabled: false, start: "09:00", end: "13:00" },
  domingo: { enabled: false, start: "09:00", end: "13:00" },
  festivos: { enabled: false, start: "09:00", end: "13:00" },
};

function ScheduleTab({ inboxId }: { inboxId: string }) {
  const [schedule, setSchedule] = useState<Schedule>(DEFAULT_SCHEDULE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get(`/chats/inboxes/${inboxId}`)
      .then(({ data }) => {
        if (data.metadata?.schedule) {
          setSchedule({ ...DEFAULT_SCHEDULE, ...data.metadata.schedule });
        }
      })
      .finally(() => setLoading(false));
  }, [inboxId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: inbox } = await api.get(`/chats/inboxes/${inboxId}`);
      await api.put(`/chats/inboxes/${inboxId}`, {
        metadata: { ...inbox.metadata, schedule },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {} finally { setSaving(false); }
  };

  const toggleDay = (day: string) => {
    setSchedule((prev) => ({ ...prev, [day]: { ...prev[day], enabled: !prev[day].enabled } }));
    setSaved(false);
  };

  const updateTime = (day: string, field: "start" | "end", value: string) => {
    setSchedule((prev) => ({ ...prev, [day]: { ...prev[day], [field]: value } }));
    setSaved(false);
  };

  if (loading) return <div className="flex-1 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>;

  return (
    <div className="flex-1 overflow-y-auto p-5">
      <div className="max-w-2xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Horarios de atención</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">Define cuándo el canal está disponible para recibir y responder mensajes</p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-xs font-medium disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : saved ? <CheckCircle2 className="h-3 w-3" /> : <Save className="h-3 w-3" />}
            {saved ? "Guardado" : "Guardar"}
          </button>
        </div>

        <div className="space-y-2">
          {DAYS.map(({ key, label }) => {
            const day = schedule[key];
            const isFestivo = key === "festivos";
            return (
              <div
                key={key}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors ${
                  day.enabled ? "border-gray-200 bg-white" : "border-gray-100 bg-gray-50/50"
                } ${isFestivo ? "mt-4 border-amber-200" : ""}`}
              >
                {/* Toggle */}
                <button
                  onClick={() => toggleDay(key)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${
                    day.enabled ? "bg-brand-600" : "bg-gray-300"
                  }`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow-sm ${
                    day.enabled ? "translate-x-[18px]" : "translate-x-1"
                  }`} />
                </button>

                {/* Day label */}
                <span className={`text-sm font-medium w-24 shrink-0 ${day.enabled ? "text-gray-900" : "text-gray-400"} ${isFestivo ? "text-amber-700" : ""}`}>
                  {label}
                </span>

                {/* Time inputs */}
                {day.enabled ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="time"
                      value={day.start}
                      onChange={(e) => updateTime(key, "start", e.target.value)}
                      className="px-2 py-1 rounded-md border border-gray-200 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                    <span className="text-xs text-gray-400">a</span>
                    <input
                      type="time"
                      value={day.end}
                      onChange={(e) => updateTime(key, "end", e.target.value)}
                      className="px-2 py-1 rounded-md border border-gray-200 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                ) : (
                  <span className="text-xs text-gray-400 italic">Cerrado</span>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-4 p-3 rounded-lg bg-blue-50 border border-blue-100">
          <p className="text-[11px] text-blue-800">
            <strong>Nota:</strong> Fuera de horario, los mensajes entrantes se almacenarán pero no se notificará a los agentes hasta el inicio del siguiente horario.
          </p>
        </div>
      </div>
    </div>
  );
}

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
        <ScheduleTab inboxId={inboxId} />
      )}
    </div>
  );
}
