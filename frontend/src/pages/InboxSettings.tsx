import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Save, Trash2, Wifi, WifiOff, Phone, MessageCircle, Camera, MessageSquare, Mail, CheckCircle2, XCircle, Loader2 } from "lucide-react";
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
  chat: { label: "Chat", icon: MessageCircle, color: "text-teal-600", bg: "bg-teal-50" },
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

  // SMTP config state
  const [smtpForm, setSmtpForm] = useState({ host: "", port: 465, secure: true, user: "", pass: "", fromName: "", fromEmail: "", defaultSubject: "" });
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpSaved, setSmtpSaved] = useState(false);
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [smtpTestResult, setSmtpTestResult] = useState<{ success: boolean; error?: string } | null>(null);

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
        if (data.channel === "email") {
          const smtp = data.metadata?.smtp || {};
          setSmtpForm({
            host: smtp.host || "",
            port: smtp.port || 465,
            secure: smtp.secure ?? true,
            user: smtp.user || "",
            pass: smtp.pass || "",
            fromName: smtp.fromName || "",
            fromEmail: smtp.fromEmail || "",
            defaultSubject: smtp.defaultSubject || "",
          });
        }
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

  const handleSmtpSave = async () => {
    if (!inbox || !smtpForm.host || !smtpForm.user || !smtpForm.pass) return;
    setSmtpSaving(true);
    setSmtpTestResult(null);
    try {
      await api.put(`/chats/inboxes/${inbox.id}/smtp`, smtpForm);
      setSmtpSaved(true);
      setTimeout(() => setSmtpSaved(false), 2000);
      const { data } = await api.get<Inbox>(`/chats/inboxes/${inbox.id}`);
      setInbox(data);
    } catch {} finally { setSmtpSaving(false); }
  };

  const handleSmtpTest = async () => {
    if (!inbox || !smtpForm.host || !smtpForm.user || !smtpForm.pass) return;
    setSmtpTesting(true);
    setSmtpTestResult(null);
    try {
      const { data } = await api.post(`/chats/inboxes/${inbox.id}/smtp/test`, smtpForm);
      setSmtpTestResult(data);
    } catch {
      setSmtpTestResult({ success: false, error: "Error de conexión" });
    } finally { setSmtpTesting(false); }
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
          ) : inbox.channel === "chat" ? (
            <div className="bg-white rounded-xl border border-teal-200 p-6">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Chat Widget</h2>
              <p className="text-xs text-gray-500 mb-4">
                Configura la apariencia del widget de chat y obtén el código para instalarlo en tu sitio web.
              </p>
              <button
                onClick={() => navigate(`/${slug}/chat-widget/${inbox.id}`)}
                className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-brand-800 hover:bg-brand-700 text-white font-medium transition-colors"
              >
                Configurar widget
              </button>
            </div>
          ) : inbox.channel === "email" ? (
          <div className="bg-white rounded-xl border border-orange-200 p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Configuración SMTP</h2>
            <p className="text-[11px] text-gray-500 mb-4">Configura las credenciales SMTP para enviar correos desde esta bandeja.</p>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Servidor SMTP</label>
                  <input type="text" value={smtpForm.host} onChange={(e) => setSmtpForm({ ...smtpForm, host: e.target.value })} placeholder="smtp.gmail.com" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Puerto</label>
                    <input type="number" value={smtpForm.port} onChange={(e) => setSmtpForm({ ...smtpForm, port: parseInt(e.target.value) || 465 })} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">SSL/TLS</label>
                    <button type="button" onClick={() => setSmtpForm({ ...smtpForm, secure: !smtpForm.secure })} className={`w-full px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${smtpForm.secure ? "border-green-300 bg-green-50 text-green-700" : "border-gray-200 text-gray-500"}`}>
                      {smtpForm.secure ? "Sí" : "No"}
                    </button>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Usuario</label>
                  <input type="text" value={smtpForm.user} onChange={(e) => setSmtpForm({ ...smtpForm, user: e.target.value })} placeholder="usuario@dominio.com" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Contraseña</label>
                  <input type="password" value={smtpForm.pass} onChange={(e) => setSmtpForm({ ...smtpForm, pass: e.target.value })} placeholder="••••••••" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nombre remitente</label>
                  <input type="text" value={smtpForm.fromName} onChange={(e) => setSmtpForm({ ...smtpForm, fromName: e.target.value })} placeholder="Mi Empresa" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Email remitente</label>
                  <input type="email" value={smtpForm.fromEmail} onChange={(e) => setSmtpForm({ ...smtpForm, fromEmail: e.target.value })} placeholder="correo@dominio.com" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Asunto por defecto (conversaciones)</label>
                <input type="text" value={smtpForm.defaultSubject} onChange={(e) => setSmtpForm({ ...smtpForm, defaultSubject: e.target.value })} placeholder="Nuevo mensaje" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                <p className="text-[10px] text-gray-400 mt-1">Se usa cuando se envía un mensaje desde la conversación</p>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-4">
              <button onClick={handleSmtpTest} disabled={smtpTesting || !smtpForm.host || !smtpForm.user || !smtpForm.pass} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-orange-300 text-orange-700 hover:bg-orange-50 text-xs font-medium disabled:opacity-50">
                {smtpTesting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wifi className="h-3 w-3" />}
                Probar conexión
              </button>
              <button onClick={handleSmtpSave} disabled={smtpSaving || !smtpForm.host || !smtpForm.user || !smtpForm.pass} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-xs font-medium disabled:opacity-50">
                {smtpSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : smtpSaved ? <CheckCircle2 className="h-3 w-3" /> : <Save className="h-3 w-3" />}
                {smtpSaved ? "Guardado" : "Guardar SMTP"}
              </button>
            </div>

            {smtpTestResult && (
              <div className={`mt-3 p-2.5 rounded-lg border text-xs ${smtpTestResult.success ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>
                {smtpTestResult.success ? (
                  <div className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3" /> Conexión SMTP exitosa</div>
                ) : (
                  <div className="flex items-center gap-1.5"><XCircle className="h-3 w-3" /> {smtpTestResult.error || "Error de conexión"}</div>
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
