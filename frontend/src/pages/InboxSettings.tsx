import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Save, Trash2, Wifi, WifiOff, Phone, MessageCircle, Camera, MessageSquare, Mail, Copy, CheckCircle2, XCircle, RefreshCw, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import headerBg from "@/assets/header-background.jpg";
import axios from "axios";

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "/api" });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

interface Inbox {
  id: string;
  tenantId: string;
  name: string;
  channel: string;
  status: string;
  channelName: string | null;
  pageId: string | null;
  phoneNumberId: string | null;
  wabaId: string | null;
  accessToken: string | null;
  metadata: Record<string, any> | null;
  createdAt: string;
  updatedAt: string;
}

const CHANNEL_META: Record<string, { label: string; icon: typeof MessageSquare; color: string; bg: string }> = {
  whatsapp: { label: "WhatsApp", icon: Phone, color: "text-green-600", bg: "bg-green-50" },
  messenger: { label: "Messenger", icon: MessageCircle, color: "text-blue-600", bg: "bg-blue-50" },
  instagram: { label: "Instagram", icon: Camera, color: "text-pink-600", bg: "bg-pink-50" },
  sms: { label: "SMS", icon: MessageSquare, color: "text-sky-600", bg: "bg-sky-50" },
  llamada: { label: "Llamada", icon: Phone, color: "text-purple-600", bg: "bg-purple-50" },
  email: { label: "Email", icon: Mail, color: "text-orange-600", bg: "bg-orange-50" },
};

export function InboxSettings() {
  const { slug, id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const tenantRole = user?.tenantRoles.find((tr) => tr.tenant.slug === slug);

  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Email config state
  const [emailForm, setEmailForm] = useState({ fromEmail: "", fromName: "" });
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailConfig, setEmailConfig] = useState<{ domain: string; domainStatus: string } | null>(null);
  const [dnsRecords, setDnsRecords] = useState<{ type: string; name: string; value: string; purpose: string }[]>([]);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ verified: boolean; results: { record: string; status: string; detail?: string }[] } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // SMS config state
  const [smsSender, setSmsSender] = useState("");
  const [smsSaving, setSmsSaving] = useState(false);
  const [smsSaved, setSmsSaved] = useState(false);

  // Llamada config state
  const [callVoice, setCallVoice] = useState("Mariana");
  const [callSaving, setCallSaving] = useState(false);
  const [callSaved, setCallSaved] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api.get<Inbox>(`/chats/inboxes/${id}`)
      .then(({ data }) => {
        setInbox(data);
        setName(data.name);
        if (data.channel === "email") loadEmailConfig(data.id);
        if (data.channel === "sms") {
          setSmsSender(data.metadata?.sender || "");
        }
        if (data.channel === "llamada") {
          setCallVoice(data.metadata?.voice || "Mariana");
        }
      })
      .catch(() => navigate(`/${slug}/inboxes`))
      .finally(() => setLoading(false));
  }, [id]);

  const loadEmailConfig = async (inboxId: string) => {
    try {
      const { data } = await api.get(`/email-config/inbox/${inboxId}`);
      if (data) {
        setEmailConfig(data);
        setEmailForm({ fromEmail: data.fromEmail, fromName: data.fromName });
        const dnsRes = await api.get(`/email-config/inbox/${inboxId}/dns-records`);
        setDnsRecords(dnsRes.data.records || []);
      }
    } catch {}
  };

  const handleEmailSave = async () => {
    if (!inbox || !emailForm.fromEmail || !emailForm.fromName) return;
    setEmailSaving(true);
    try {
      const { data } = await api.post(`/email-config/inbox/${inbox.id}`, {
        tenantId: inbox.tenantId,
        fromEmail: emailForm.fromEmail,
        fromName: emailForm.fromName,
      });
      setEmailConfig(data);
      setVerifyResult(null);
      const dnsRes = await api.get(`/email-config/inbox/${inbox.id}/dns-records`);
      setDnsRecords(dnsRes.data.records || []);
    } catch {} finally {
      setEmailSaving(false);
    }
  };

  const handleVerifyDomain = async () => {
    if (!inbox) return;
    setVerifying(true);
    try {
      const { data } = await api.post(`/email-config/inbox/${inbox.id}/verify`);
      setVerifyResult(data);
      if (data.verified) {
        setEmailConfig((prev) => prev ? { ...prev, domainStatus: "verified" } : prev);
      } else {
        setEmailConfig((prev) => prev ? { ...prev, domainStatus: "failed" } : prev);
      }
    } catch {} finally {
      setVerifying(false);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleSmsSave = async () => {
    if (!inbox) return;
    setSmsSaving(true);
    try {
      await api.put(`/chats/inboxes/${inbox.id}`, {
        metadata: { ...inbox.metadata, sender: smsSender },
      });
      setSmsSaved(true);
      setTimeout(() => setSmsSaved(false), 2000);
    } catch {} finally {
      setSmsSaving(false);
    }
  };

  const handleCallSave = async () => {
    if (!inbox) return;
    setCallSaving(true);
    try {
      await api.put(`/chats/inboxes/${inbox.id}`, {
        metadata: { ...inbox.metadata, voice: callVoice },
      });
      setCallSaved(true);
      setTimeout(() => setCallSaved(false), 2000);
    } catch {} finally {
      setCallSaving(false);
    }
  };

  const handleSave = async () => {
    if (!inbox || !name.trim()) return;
    setSaving(true);
    try {
      const { data } = await api.put<Inbox>(`/chats/inboxes/${inbox.id}`, { name: name.trim() });
      setInbox(data);
    } catch {} finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    if (!inbox) return;
    try {
      const { data } = await api.put<Inbox>(`/chats/inboxes/${inbox.id}`, {
        status: "disconnected",
        accessToken: null,
        pageId: null,
        phoneNumberId: null,
        wabaId: null,
        channelName: null,
      });
      setInbox(data);
    } catch {}
  };

  const handleDelete = async () => {
    if (!inbox) return;
    try {
      await api.delete(`/chats/inboxes/${inbox.id}`);
      navigate(`/${slug}/inboxes`);
    } catch {}
  };

  const handleConnect = () => {
    if (!inbox) return;
    if (inbox.channel === "whatsapp") {
      navigate(`/${slug}/inboxes/new`);
    } else {
      window.location.href = `/api/chats/oauth/connect?inboxId=${inbox.id}&channel=${inbox.channel}`;
    }
  };

  if (!inbox && !loading) return null;

  const meta = inbox ? (CHANNEL_META[inbox.channel] || { label: inbox.channel, icon: MessageSquare, color: "text-gray-600", bg: "bg-gray-50" }) : { label: "", icon: MessageSquare, color: "text-gray-600", bg: "bg-gray-50" };
  const Icon = meta.icon;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Hero */}
      <div className="px-8 pt-16 pb-4 shrink-0 rounded-b-2xl" style={{ backgroundImage: `url(${headerBg})`, backgroundSize: "cover", backgroundPosition: "center" }}>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/${slug}/comunicaciones`)} className="p-1.5 rounded-lg hover:bg-white/10 text-white transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white">Configuración de bandeja</h1>
            <p className="text-brand-300 mt-0.5 text-sm">{loading ? "" : inbox.name}</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8">
        {loading || !inbox ? (
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
              <div className="h-4 w-40 bg-gray-200 rounded mb-4" />
              <div className="space-y-3">
                <div className="h-10 bg-gray-100 rounded-lg" />
                <div className="h-10 bg-gray-100 rounded-lg" />
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
              <div className="h-4 w-36 bg-gray-200 rounded mb-4" />
              <div className="h-10 bg-gray-100 rounded-lg" />
            </div>
          </div>
        ) : (
        <div className="max-w-2xl mx-auto space-y-6">
          {/* General info */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Información general</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Nombre de la bandeja</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Canal</label>
                <div className="flex items-center gap-3 px-3 py-2.5 border border-gray-200 rounded-lg bg-gray-50">
                  <div className={`h-8 w-8 rounded-md flex items-center justify-center ${meta.bg}`}>
                    <Icon className={`h-4 w-4 ${meta.color}`} />
                  </div>
                  <span className="text-sm text-gray-700 font-medium">{meta.label}</span>
                </div>
              </div>
              <div className="pt-2">
                <button
                  onClick={handleSave}
                  disabled={saving || name.trim() === inbox.name}
                  className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-brand-800 hover:bg-brand-700 text-white font-medium disabled:opacity-50 transition-colors"
                >
                  <Save className="h-4 w-4" />
                  {saving ? "Guardando..." : "Guardar cambios"}
                </button>
              </div>
            </div>
          </div>

          {/* Connection status / Form builder link / Email config */}
          {inbox.channel === "form" ? (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Formulario</h2>
              <p className="text-xs text-gray-500 mb-4">
                Configura los campos y apariencia del formulario público vinculado a esta bandeja.
              </p>
              <button
                onClick={async () => {
                  try {
                    const { data: forms } = await api.get("/forms", { params: { tenantId: inbox.tenantId } });
                    const linked = forms.find((f: any) => f.inboxId === inbox.id);
                    if (linked) navigate(`/${slug}/forms/${linked.id}`);
                  } catch {}
                }}
                className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-brand-800 hover:bg-brand-700 text-white font-medium transition-colors"
              >
                Editar formulario
              </button>
            </div>
          ) : inbox.channel === "email" ? (
          <div className="bg-white rounded-xl border border-orange-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-sm font-semibold text-gray-900">Configuración de dominio</h2>
              {emailConfig?.domainStatus === "verified" && (
                <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 font-medium">
                  <CheckCircle2 className="h-2.5 w-2.5" /> Verificado
                </span>
              )}
              {emailConfig?.domainStatus === "failed" && (
                <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-700 font-medium">
                  <XCircle className="h-2.5 w-2.5" /> Falló
                </span>
              )}
              {emailConfig?.domainStatus === "pending" && (
                <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">
                  Pendiente
                </span>
              )}
            </div>

            {/* Email form */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nombre del remitente</label>
                <input
                  type="text"
                  value={emailForm.fromName}
                  onChange={(e) => setEmailForm({ ...emailForm, fromName: e.target.value })}
                  placeholder="Mi Empresa"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Email del remitente</label>
                <input
                  type="email"
                  value={emailForm.fromEmail}
                  onChange={(e) => setEmailForm({ ...emailForm, fromEmail: e.target.value })}
                  placeholder="comunicaciones@miempresa.com"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>
            </div>
            <button
              onClick={handleEmailSave}
              disabled={emailSaving || !emailForm.fromEmail || !emailForm.fromName}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-xs font-medium transition-colors disabled:opacity-50"
            >
              {emailSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              Guardar
            </button>

            {/* DNS Records */}
            {emailConfig && dnsRecords.length > 0 && (
              <div className="mt-5 pt-5 border-t border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900 mb-1">Registros DNS</h3>
                <p className="text-xs text-gray-500 mb-4">
                  Agrega estos registros en la configuración DNS de <code className="bg-gray-100 px-1 rounded">{emailConfig.domain}</code>
                </p>
                <div className="space-y-3">
                  {dnsRecords.map((record, i) => (
                    <div key={i} className="p-3 rounded-lg border border-gray-200 bg-gray-50/50">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-700 font-mono font-bold">{record.type}</span>
                            <span className="text-xs text-gray-500">{record.purpose}</span>
                          </div>
                          <div className="mt-2 space-y-1">
                            <div>
                              <span className="text-[10px] font-medium text-gray-400 uppercase">Nombre</span>
                              <p className="text-xs font-mono text-gray-700 break-all">{record.name}</p>
                            </div>
                            <div>
                              <span className="text-[10px] font-medium text-gray-400 uppercase">Valor</span>
                              <p className="text-xs font-mono text-gray-700 break-all">{record.value}</p>
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => copyToClipboard(record.value, `${i}`)}
                          className="shrink-0 p-1.5 rounded-md hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          {copied === `${i}` ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4">
                  <button
                    onClick={handleVerifyDomain}
                    disabled={verifying}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-brand-300 text-brand-700 hover:bg-brand-50 text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    {verifying ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    Verificar dominio
                  </button>
                </div>

                {verifyResult && (
                  <div className={`mt-3 p-3 rounded-lg border ${verifyResult.verified ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                    <p className={`text-xs font-medium mb-2 ${verifyResult.verified ? "text-green-800" : "text-red-800"}`}>
                      {verifyResult.verified ? "✓ Dominio verificado correctamente" : "✗ Verificación incompleta"}
                    </p>
                    <div className="space-y-1">
                      {verifyResult.results.map((r, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          {r.status === "ok" ? <CheckCircle2 className="h-3 w-3 text-green-600 shrink-0" /> : <XCircle className="h-3 w-3 text-red-500 shrink-0" />}
                          <span className={r.status === "ok" ? "text-green-700" : "text-red-700"}>
                            {r.record}{r.detail ? ` — ${r.detail}` : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          ) : inbox.channel === "sms" ? (
          <div className="bg-white rounded-xl border border-sky-200 p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Configuración SMS</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Remitente (Sender ID)</label>
                <input
                  type="text"
                  value={smsSender}
                  onChange={(e) => { setSmsSender(e.target.value); setSmsSaved(false); }}
                  placeholder="ej: MiEmpresa (máx. 11 caracteres)"
                  maxLength={11}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Solo caracteres alfanuméricos (a-z, A-Z, 0-9). Máximo 11 caracteres.
                </p>
              </div>

              <button
                onClick={handleSmsSave}
                disabled={smsSaving}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-xs font-medium transition-colors disabled:opacity-50"
              >
                {smsSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : smsSaved ? <CheckCircle2 className="h-3 w-3" /> : <Save className="h-3 w-3" />}
                {smsSaved ? "Guardado" : "Guardar"}
              </button>

              {/* Note */}
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                <p className="text-xs text-amber-800">
                  <strong>Nota:</strong> La funcionalidad de remitente personalizado no está activa de momento. El remitente se mostrará como un número genérico hasta que se complete el registro con el operador.
                </p>
              </div>
            </div>
          </div>
          ) : inbox.channel === "llamada" ? (
          <div className="bg-white rounded-xl border border-purple-200 p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Configuración de Llamadas</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Voz para las llamadas</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {["Mariana", "Penelope", "Conchita", "Mia", "Lucia", "Enrique", "Miguel"].map((voice) => (
                    <button
                      key={voice}
                      type="button"
                      onClick={() => { setCallVoice(voice); setCallSaved(false); }}
                      className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        callVoice === voice
                          ? "border-purple-500 bg-purple-50 text-purple-700"
                          : "border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {voice}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Selecciona la voz que se utilizará para las llamadas automáticas de esta bandeja.
                </p>
              </div>

              <button
                onClick={handleCallSave}
                disabled={callSaving}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-xs font-medium transition-colors disabled:opacity-50"
              >
                {callSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : callSaved ? <CheckCircle2 className="h-3 w-3" /> : <Save className="h-3 w-3" />}
                {callSaved ? "Guardado" : "Guardar"}
              </button>
            </div>
          </div>
          ) : (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Estado de conexión</h2>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {inbox.status === "connected" ? (
                  <div className="flex items-center gap-2 text-green-600">
                    <Wifi className="h-4 w-4" />
                    <span className="text-sm font-medium">Conectada</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-red-500">
                    <WifiOff className="h-4 w-4" />
                    <span className="text-sm font-medium">Desconectada</span>
                  </div>
                )}
                {inbox.channelName && (
                  <span className="text-xs text-gray-400">· {inbox.channelName}</span>
                )}
              </div>
              {inbox.status === "connected" ? (
                <button
                  onClick={handleDisconnect}
                  className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                >
                  Desconectar
                </button>
              ) : (
                <button
                  onClick={handleConnect}
                  className="px-3 py-1.5 text-xs font-medium text-brand-600 border border-brand-200 rounded-lg hover:bg-brand-50 transition-colors"
                >
                  Conectar
                </button>
              )}
            </div>

            {inbox.status === "connected" && (
              <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
                {inbox.phoneNumberId && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Phone Number ID</span>
                    <span className="text-gray-700 font-mono">{inbox.phoneNumberId}</span>
                  </div>
                )}
                {inbox.wabaId && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">WABA ID</span>
                    <span className="text-gray-700 font-mono">{inbox.wabaId}</span>
                  </div>
                )}
                {inbox.pageId && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Page ID</span>
                    <span className="text-gray-700 font-mono">{inbox.pageId}</span>
                  </div>
                )}
              </div>
            )}
          </div>
          )}

          {/* Danger zone */}
          <div className="bg-white rounded-xl border border-red-200 p-6">
            <h2 className="text-sm font-semibold text-red-600 mb-2">Zona de peligro</h2>
            <p className="text-xs text-gray-500 mb-4">
              Eliminar esta bandeja borrará todas las conversaciones y mensajes asociados. Esta acción no se puede deshacer.
            </p>
            {!showDeleteConfirm ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg border border-red-200 text-red-600 hover:bg-red-50 font-medium transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                Eliminar bandeja
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <button
                  onClick={handleDelete}
                  className="px-4 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium transition-colors"
                >
                  Sí, eliminar
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-4 py-2 text-sm rounded-lg text-gray-600 hover:bg-gray-100 font-medium transition-colors"
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
