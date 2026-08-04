import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Settings2, Users, Clock, UserPlus, X, Loader2, Save, CheckCircle2, MessageSquare, Activity, Shield, TrendingUp, Globe, Mail as MailIcon, MapPin, Building2, ExternalLink, Edit3, Upload, Camera, RefreshCw } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { InboxSettingsContent } from "@/components/InboxSettingsContent";
import { WhatsAppTemplatesManager } from "@/components/WhatsAppTemplatesManager";
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

function WhatsAppStatusTab({ inboxId }: { inboxId: string }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ about: "", description: "", address: "", email: "", websites: "", vertical: "" });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [uploadingPicture, setUploadingPicture] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState("");
  const [showRegister, setShowRegister] = useState(false);
  const [registerPin, setRegisterPin] = useState("");
  const [registering, setRegistering] = useState(false);

  const fetchData = () => {
    setLoading(true);
    api.get("/chats/whatsapp/status", { params: { inboxId } })
      .then(({ data }) => setData(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, [inboxId]);

  const handleSaveProfile = async () => {
    setProfileSaving(true); setProfileError("");
    try {
      const payload: any = { inboxId };
      if (profileForm.about) payload.about = profileForm.about;
      if (profileForm.description) payload.description = profileForm.description;
      if (profileForm.address) payload.address = profileForm.address;
      if (profileForm.email) payload.email = profileForm.email;
      if (profileForm.websites) payload.websites = profileForm.websites.split(",").map((s: string) => s.trim()).filter(Boolean);
      await api.put("/chats/whatsapp/profile", payload);
      setEditingProfile(false);
      fetchData();
    } catch (err: any) {
      setProfileError(err.response?.data?.message || "Error al actualizar perfil");
    } finally { setProfileSaving(false); }
  };

  const handleUploadProfilePicture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPicture(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("inboxId", inboxId);
      const { data: uploadResult } = await api.post("/chats/whatsapp/profile/upload-picture", formData);
      await api.put("/chats/whatsapp/profile", { inboxId, profile_picture_handle: uploadResult.handle });
      fetchData();
    } catch (err: any) {
      setProfileError(err.response?.data?.message || "Error al subir imagen");
    } finally { setUploadingPicture(false); }
  };

  const handleSyncPhone = async () => {
    setSyncing(true); setSyncResult("");
    try {
      const { data: result } = await api.post("/chats/whatsapp/sync-phone", { inboxId });
      setSyncResult(`Sincronizado: ${result.displayPhoneNumber || result.phoneNumberId} — ${result.verifiedName || "OK"}`);
      fetchData();
    } catch (err: any) {
      setSyncResult(err.response?.data?.message || "Error al sincronizar");
    } finally { setSyncing(false); }
  };

  const handleRegisterPhone = async () => {
    if (!registerPin || registerPin.length !== 6) return;
    setRegistering(true);
    try {
      await api.post("/chats/whatsapp/register-phone", { inboxId, pin: registerPin });
      setShowRegister(false);
      setRegisterPin("");
      fetchData();
    } catch (err: any) {
      setSyncResult(err.response?.data?.message || "Error al registrar");
    } finally { setRegistering(false); }
  };

  if (loading) return <div className="flex-1 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>;
  if (!data) return <div className="flex-1 flex items-center justify-center text-sm text-gray-400">No se pudo obtener el estado</div>;

  const phone = data.phoneNumber || {};
  const profile = data.businessProfile || {};
  const waba = data.waba || {};

  const qualityColor = phone.quality_rating === "GREEN" ? "text-green-600 bg-green-50 border-green-200" : phone.quality_rating === "YELLOW" ? "text-yellow-600 bg-yellow-50 border-yellow-200" : phone.quality_rating === "RED" ? "text-red-600 bg-red-50 border-red-200" : "text-gray-500 bg-gray-50 border-gray-200";
  const qualityLabel = phone.quality_rating === "GREEN" ? "Alta" : phone.quality_rating === "YELLOW" ? "Media" : phone.quality_rating === "RED" ? "Baja" : phone.quality_rating || "No disponible";

  const tierLabels: Record<string, string> = {
    TIER_50: "50 conversaciones/día",
    TIER_250: "250 conversaciones/día",
    TIER_1K: "1,000 conversaciones/día",
    TIER_10K: "10,000 conversaciones/día",
    TIER_100K: "100,000 conversaciones/día",
    TIER_UNLIMITED: "Sin límite",
  };

  const nameStatusLabels: Record<string, { label: string; color: string }> = {
    APPROVED: { label: "Aprobado", color: "text-green-700 bg-green-50" },
    AVAILABLE_WITHOUT_REVIEW: { label: "Disponible", color: "text-blue-700 bg-blue-50" },
    DECLINED: { label: "Rechazado", color: "text-red-700 bg-red-50" },
    EXPIRED: { label: "Expirado", color: "text-orange-700 bg-orange-50" },
    PENDING_REVIEW: { label: "En revisión", color: "text-yellow-700 bg-yellow-50" },
    NONE: { label: "Sin nombre", color: "text-gray-700 bg-gray-50" },
  };

  const verificationLabels: Record<string, { label: string; color: string }> = {
    verified: { label: "Verificado", color: "text-green-700 bg-green-50" },
    not_verified: { label: "No verificado", color: "text-orange-700 bg-orange-50" },
  };

  return (
    <div className="flex-1 overflow-y-auto p-5">
      <div className="max-w-2xl space-y-5">
        {/* Profile card — unified with editing */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-semibold text-gray-900">Perfil de negocio</h4>
            {!editingProfile ? (
              <button onClick={() => { setEditingProfile(true); setProfileForm({ about: profile?.about || "", description: profile?.description || "", address: profile?.address || "", email: profile?.email || "", websites: profile?.websites?.join(", ") || "", vertical: profile?.vertical || "" }); }} className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium">
                <Edit3 className="h-3 w-3" /> Editar perfil
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button onClick={() => setEditingProfile(false)} className="text-xs text-gray-500 hover:text-gray-700">Cancelar</button>
                <button onClick={handleSaveProfile} disabled={profileSaving} className="flex items-center gap-1 text-xs bg-brand-700 text-white px-2.5 py-1 rounded-lg hover:bg-brand-600 disabled:opacity-50 font-medium">
                  {profileSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Guardar
                </button>
              </div>
            )}
          </div>

          {/* Avatar + Name + Number */}
          <div className="flex items-start gap-4 mb-4 pb-4 border-b border-gray-100">
            <div className="relative group">
              {profile?.profile_picture_url ? (
                <img src={profile.profile_picture_url} alt="Perfil" className="h-16 w-16 rounded-full object-cover border-2 border-gray-100" />
              ) : (
                <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center border-2 border-green-200">
                  <Building2 className="h-7 w-7 text-green-600" />
                </div>
              )}
              <label className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity">
                {uploadingPicture ? <Loader2 className="h-4 w-4 animate-spin text-white" /> : <Camera className="h-4 w-4 text-white" />}
                <input type="file" className="hidden" accept="image/jpeg,image/png" onChange={handleUploadProfilePicture} />
              </label>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-gray-900">{phone.verified_name || "Sin nombre verificado"}</h3>
              <p className="text-sm text-gray-500 mt-0.5">{phone.display_phone_number || "—"}</p>
              <div className="flex items-center gap-2 mt-2">
                {phone.is_official_business_account && (
                  <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">
                    <CheckCircle2 className="h-3 w-3" /> Cuenta oficial
                  </span>
                )}
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${phone.status === "CONNECTED" ? "bg-green-50 text-green-700" : phone.status === "PENDING" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>
                  {phone.status || "Desconocido"}
                </span>
              </div>
              {phone.status === "PENDING" && (
                <div className="mt-2">
                  {!showRegister ? (
                    <button onClick={() => setShowRegister(true)} className="text-xs text-brand-600 hover:text-brand-700 font-medium">
                      Registrar número para Cloud API
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 mt-1">
                      <input type="text" value={registerPin} onChange={(e) => setRegisterPin(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="PIN de 6 dígitos" maxLength={6} className="w-32 px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                      <button onClick={handleRegisterPhone} disabled={registering || registerPin.length !== 6} className="px-3 py-1.5 rounded-lg bg-brand-700 text-white text-xs font-medium hover:bg-brand-600 disabled:opacity-50">
                        {registering ? "Registrando..." : "Registrar"}
                      </button>
                      <button onClick={() => setShowRegister(false)} className="text-xs text-gray-500 hover:text-gray-700">Cancelar</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Editable profile fields */}
          {editingProfile ? (
            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-gray-500 uppercase font-medium mb-0.5 block">Acerca de</label>
                <input type="text" value={profileForm.about} onChange={(e) => setProfileForm({ ...profileForm, about: e.target.value })} placeholder="Breve descripción de tu negocio" maxLength={139} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 uppercase font-medium mb-0.5 block">Descripción</label>
                <textarea value={profileForm.description} onChange={(e) => setProfileForm({ ...profileForm, description: e.target.value })} placeholder="Descripción detallada del negocio" maxLength={512} rows={3} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-gray-500 uppercase font-medium mb-0.5 block">Dirección</label>
                  <input type="text" value={profileForm.address} onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })} placeholder="Dirección del negocio" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 uppercase font-medium mb-0.5 block">Email</label>
                  <input type="email" value={profileForm.email} onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })} placeholder="contacto@empresa.com" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-gray-500 uppercase font-medium mb-0.5 block">Sitios web (separados por coma)</label>
                <input type="text" value={profileForm.websites} onChange={(e) => setProfileForm({ ...profileForm, websites: e.target.value })} placeholder="https://tusitio.com, https://otro.com" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              {profileError && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{profileError}</p>}
            </div>
          ) : (
            <div className="space-y-2.5">
              {profile?.about && <div><p className="text-[10px] text-gray-500 uppercase font-medium mb-0.5">Acerca de</p><p className="text-sm text-gray-700">{profile.about}</p></div>}
              {profile?.description && <div><p className="text-[10px] text-gray-500 uppercase font-medium mb-0.5">Descripción</p><p className="text-sm text-gray-700">{profile.description}</p></div>}
              {profile?.address && <div className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-gray-400" /><span className="text-sm text-gray-700">{profile.address}</span></div>}
              {profile?.email && <div className="flex items-center gap-2"><MailIcon className="h-3.5 w-3.5 text-gray-400" /><span className="text-sm text-gray-700">{profile.email}</span></div>}
              {profile?.websites?.length > 0 && <div className="flex items-start gap-2"><Globe className="h-3.5 w-3.5 text-gray-400 mt-0.5" /><div className="space-y-0.5">{profile.websites.map((url: string, i: number) => <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm text-brand-600 hover:underline">{url} <ExternalLink className="h-3 w-3" /></a>)}</div></div>}
              {!profile?.about && !profile?.description && !profile?.address && !profile?.email && !profile?.websites?.length && <p className="text-xs text-gray-400 italic">Sin información de perfil. Haz clic en "Editar perfil" para configurar.</p>}
            </div>
          )}
        </div>

        {/* Quality & Limits */}
        <div className="grid grid-cols-2 gap-4">
          <div className={`rounded-xl border p-4 ${qualityColor}`}>
            <div className="flex items-center gap-2 mb-1">
              <Activity className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase">Calidad</span>
            </div>
            <p className="text-lg font-bold">{qualityLabel}</p>
            <p className="text-[10px] opacity-70 mt-0.5">Calificación del número</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-gray-600" />
              <span className="text-xs font-semibold text-gray-600 uppercase">Tier de mensajes</span>
            </div>
            <p className="text-lg font-bold text-gray-900">{tierLabels[phone.messaging_limit_tier] || phone.messaging_limit_tier || "No disponible"}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">Límite de conversaciones iniciadas por negocio</p>
          </div>
        </div>

        {/* Verification & Name status */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Shield className="h-4 w-4 text-gray-500" /> Verificación
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] text-gray-500 uppercase font-medium mb-1">Estado del nombre</p>
              {phone.name_status ? (
                <span className={`text-xs px-2 py-1 rounded font-medium ${nameStatusLabels[phone.name_status]?.color || "bg-gray-50 text-gray-700"}`}>
                  {nameStatusLabels[phone.name_status]?.label || phone.name_status}
                </span>
              ) : (
                <span className="text-xs text-gray-400">No disponible</span>
              )}
            </div>
            <div>
              <p className="text-[10px] text-gray-500 uppercase font-medium mb-1">Verificación de código</p>
              <span className={`text-xs px-2 py-1 rounded font-medium ${phone.code_verification_status === "VERIFIED" ? "bg-green-50 text-green-700" : "bg-gray-50 text-gray-700"}`}>
                {phone.code_verification_status === "VERIFIED" ? "Verificado" : phone.code_verification_status || "No disponible"}
              </span>
            </div>
            <div>
              <p className="text-[10px] text-gray-500 uppercase font-medium mb-1">Verificación de negocio</p>
              {waba.business_verification_status ? (
                <span className={`text-xs px-2 py-1 rounded font-medium ${verificationLabels[waba.business_verification_status]?.color || "bg-gray-50 text-gray-700"}`}>
                  {verificationLabels[waba.business_verification_status]?.label || waba.business_verification_status}
                </span>
              ) : (
                <span className="text-xs text-gray-400">No disponible</span>
              )}
            </div>
            <div>
              <p className="text-[10px] text-gray-500 uppercase font-medium mb-1">Revisión de cuenta</p>
              <span className={`text-xs px-2 py-1 rounded font-medium ${waba.account_review_status === "APPROVED" ? "bg-green-50 text-green-700" : "bg-gray-50 text-gray-700"}`}>
                {waba.account_review_status || "No disponible"}
              </span>
            </div>
          </div>
        </div>

        {/* WABA details */}
        {waba.name && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h4 className="text-sm font-semibold text-gray-900 mb-3">Cuenta de WhatsApp Business (WABA)</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Nombre</span>
                <span className="text-gray-900 font-medium">{waba.name}</span>
              </div>
              {waba.currency && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Moneda</span>
                  <span className="text-gray-900">{waba.currency}</span>
                </div>
              )}
              {waba.ownership_type && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Tipo de propiedad</span>
                  <span className="text-gray-900">{waba.ownership_type}</span>
                </div>
              )}
              {waba.message_template_namespace && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Namespace de plantillas</span>
                  <span className="text-gray-900 font-mono text-xs">{waba.message_template_namespace}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* IDs técnicos */}
        <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-[10px] text-gray-500 uppercase font-semibold">IDs técnicos</h4>
            <button onClick={handleSyncPhone} disabled={syncing} className="flex items-center gap-1 text-[11px] text-brand-600 hover:text-brand-700 font-medium disabled:opacity-50">
              {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Sincronizar
            </button>
          </div>
          {syncResult && <p className="text-[10px] text-green-600 mb-2">{syncResult}</p>}
          <div className="space-y-1 text-xs font-mono">
            {data.phoneNumberId && <div className="flex justify-between"><span className="text-gray-500">Phone Number ID</span><span className="text-gray-700">{data.phoneNumberId}</span></div>}
            {data.wabaId && <div className="flex justify-between"><span className="text-gray-500">WABA ID</span><span className="text-gray-700">{data.wabaId}</span></div>}
            {phone.platform_type && <div className="flex justify-between"><span className="text-gray-500">Plataforma</span><span className="text-gray-700">{phone.platform_type}</span></div>}
            {phone.account_mode && <div className="flex justify-between"><span className="text-gray-500">Modo de cuenta</span><span className="text-gray-700">{phone.account_mode}</span></div>}
          </div>
        </div>
      </div>
    </div>
  );
}

type Tab = "estado" | "ajustes" | "colaboradores" | "horarios" | "plantillas";

export function CanalDetail() {
  const { slug, inboxId } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>("ajustes");
  const [inboxChannel, setInboxChannel] = useState<string | null>(null);

  useEffect(() => {
    if (!inboxId) return;
    api.get(`/chats/inboxes/${inboxId}`).then(({ data }) => {
      setInboxChannel(data.channel);
      if (data.channel === "whatsapp") setActiveTab("estado");
    }).catch(() => {});
  }, [inboxId]);

  if (!inboxId) return null;

  const tabs: Array<{ key: Tab; label: string; icon: typeof Settings2 }> = [
    ...(inboxChannel === "whatsapp" ? [{ key: "estado" as Tab, label: "Estado", icon: Activity }] : []),
    { key: "ajustes", label: "Ajustes", icon: Settings2 },
    { key: "colaboradores", label: "Colaboradores", icon: Users },
    { key: "horarios", label: "Horarios", icon: Clock },
    ...(inboxChannel === "whatsapp" ? [{ key: "plantillas" as Tab, label: "Plantillas", icon: MessageSquare }] : []),
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
      {activeTab === "estado" && (
        <WhatsAppStatusTab inboxId={inboxId} />
      )}

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

      {activeTab === "plantillas" && (
        <WhatsAppTemplatesManager inboxId={inboxId} />
      )}
    </div>
  );
}
