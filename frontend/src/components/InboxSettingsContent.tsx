import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Save, Trash2, Wifi, WifiOff, CheckCircle2, XCircle, Loader2, AlertTriangle } from "lucide-react";
import { api } from "@/services/api";

interface Inbox {
  id: string;
  tenantId: string;
  name: string;
  channel: string;
  status: string;
  channelName: string | null;
  phoneNumberId: string | null;
  wabaId: string | null;
  pageId: string | null;
  accessToken: string | null;
  metadata: Record<string, any> | null;
  createdAt: string;
}

/**
 * Reusable inbox settings content — renders without its own page header.
 * Can be used inside InboxSettings page or embedded in Canales panel.
 */
export function InboxSettingsContent({ inboxId, onDeleted }: { inboxId: string; onDeleted?: () => void }) {
  const { slug } = useParams();
  const navigate = useNavigate();

  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");

  // WhatsApp connect
  const [connecting, setConnecting] = useState(false);
  const [waConfig, setWaConfig] = useState<{ appId: string; configId: string } | null>(null);

  // Email config
  const [smtpForm, setSmtpForm] = useState({ host: "", port: 465, secure: true, user: "", pass: "", fromName: "", fromEmail: "", defaultSubject: "" });
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpSaved, setSmtpSaved] = useState(false);
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [smtpTestResult, setSmtpTestResult] = useState<{ success: boolean; error?: string } | null>(null);

  // SMS
  const [smsSender, setSmsSender] = useState("");
  const [smsSaving, setSmsSaving] = useState(false);
  const [smsSaved, setSmsSaved] = useState(false);

  // Llamada
  const [callVoice, setCallVoice] = useState("Mariana");
  const [callSaving, setCallSaving] = useState(false);
  const [callSaved, setCallSaved] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get<Inbox>(`/chats/inboxes/${inboxId}`)
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
        if (data.channel === "sms") setSmsSender(data.metadata?.sender || "");
        if (data.channel === "llamada") setCallVoice(data.metadata?.voice || "Mariana");
        if (data.channel === "whatsapp" && data.status !== "connected") preloadWaConfig();
      })
      .finally(() => setLoading(false));
  }, [inboxId]);

  const preloadWaConfig = async () => {
    try {
      const { data } = await api.get("/chats/whatsapp/config");
      setWaConfig(data);
    } catch {}
  };

  const handleWhatsAppConnect = () => {
    if (!inbox || !waConfig) return;
    setConnecting(true);

    const FB = (window as any).FB;
    if (!FB) { alert("Facebook SDK no cargado. Recarga la página."); setConnecting(false); return; }

    FB.init({ appId: waConfig.appId, xfbml: true, version: "v21.0" });

    FB.login(
      (response: any) => {
        if (response.authResponse?.code) {
          api.post("/chats/whatsapp/embedded-signup", {
            code: response.authResponse.code,
            inboxId: inbox.id,
          }).then(({ data }) => {
            setInbox(data);
            setConnecting(false);
          }).catch(() => { setConnecting(false); });
        } else { setConnecting(false); }
      },
      {
        config_id: waConfig.configId,
        response_type: "code",
        override_default_response_type: true,
        extras: {
          setup: {},
          featureType: "whatsapp_business_app_onboarding",
          sessionInfoVersion: "3",
          version: "v4",
        },
      }
    );
  };

  const handleSmtpSave = async () => {
    if (!inbox || !smtpForm.host || !smtpForm.user || !smtpForm.pass) return;
    setSmtpSaving(true);
    setSmtpTestResult(null);
    try {
      await api.put(`/chats/inboxes/${inbox.id}/smtp`, smtpForm);
      setSmtpSaved(true);
      setTimeout(() => setSmtpSaved(false), 2000);
      // Refresh inbox
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
    } catch (err: any) {
      setSmtpTestResult({ success: false, error: "Error de conexión" });
    } finally { setSmtpTesting(false); }
  };

  const handleSave = async () => {
    if (!inbox || !name.trim()) return;
    setSaving(true);
    try {
      const { data } = await api.put<Inbox>(`/chats/inboxes/${inbox.id}`, { name: name.trim() });
      setInbox(data);
    } catch {} finally { setSaving(false); }
  };

  const handleSmsSave = async () => {
    if (!inbox) return;
    setSmsSaving(true);
    try {
      await api.put(`/chats/inboxes/${inbox.id}`, { metadata: { ...inbox.metadata, sender: smsSender } });
      setSmsSaved(true);
      setTimeout(() => setSmsSaved(false), 2000);
    } catch {} finally { setSmsSaving(false); }
  };

  const handleCallSave = async () => {
    if (!inbox) return;
    setCallSaving(true);
    try {
      await api.put(`/chats/inboxes/${inbox.id}`, { metadata: { ...inbox.metadata, voice: callVoice } });
      setCallSaved(true);
      setTimeout(() => setCallSaved(false), 2000);
    } catch {} finally { setCallSaving(false); }
  };

  // Delete modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!inbox || deleteConfirmName !== inbox.name) return;
    setDeleting(true);
    try {
      await api.delete(`/chats/inboxes/${inbox.id}`);
      setShowDeleteModal(false);
      onDeleted?.();
    } catch {} finally {
      setDeleting(false);
    }
  };

  if (loading || !inbox) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>;
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl space-y-6">
        {/* General */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Información general</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nombre</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <button onClick={handleSave} disabled={saving || name.trim() === inbox.name} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-xs font-medium disabled:opacity-50">
              <Save className="h-3 w-3" /> {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>

        {/* Channel-specific config */}
        {inbox.channel === "sms" && (
          <div className="bg-white rounded-xl border border-sky-200 p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Configuración SMS</h2>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Remitente (Sender ID)</label>
              <input type="text" value={smsSender} onChange={(e) => { setSmsSender(e.target.value); setSmsSaved(false); }} placeholder="MiEmpresa" maxLength={11} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              <p className="text-[10px] text-gray-400 mt-1">Máximo 11 caracteres alfanuméricos.</p>
            </div>
            <button onClick={handleSmsSave} disabled={smsSaving} className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-xs font-medium disabled:opacity-50">
              {smsSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : smsSaved ? <CheckCircle2 className="h-3 w-3" /> : <Save className="h-3 w-3" />}
              {smsSaved ? "Guardado" : "Guardar"}
            </button>
            <div className="mt-3 p-2.5 rounded-lg bg-amber-50 border border-amber-200">
              <p className="text-[10px] text-amber-800"><strong>Nota:</strong> Remitente personalizado no activo de momento.</p>
            </div>
          </div>
        )}

        {inbox.channel === "llamada" && (
          <div className="bg-white rounded-xl border border-purple-200 p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Configuración de Llamadas</h2>
            <label className="block text-xs font-medium text-gray-600 mb-2">Voz</label>
            <div className="grid grid-cols-4 gap-2">
              {["Mariana", "Penelope", "Conchita", "Mia", "Lucia", "Enrique", "Miguel"].map((v) => (
                <button key={v} onClick={() => { setCallVoice(v); setCallSaved(false); }} className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors ${callVoice === v ? "border-purple-500 bg-purple-50 text-purple-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>{v}</button>
              ))}
            </div>
            <button onClick={handleCallSave} disabled={callSaving} className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-xs font-medium disabled:opacity-50">
              {callSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : callSaved ? <CheckCircle2 className="h-3 w-3" /> : <Save className="h-3 w-3" />}
              {callSaved ? "Guardado" : "Guardar"}
            </button>
          </div>
        )}

        {inbox.channel === "email" && (
          <div className="bg-white rounded-xl border border-orange-200 p-5">
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
                    <button
                      type="button"
                      onClick={() => setSmtpForm({ ...smtpForm, secure: !smtpForm.secure })}
                      className={`w-full px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${smtpForm.secure ? "border-green-300 bg-green-50 text-green-700" : "border-gray-200 text-gray-500"}`}
                    >
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
        )}

        {/* Connection status (WhatsApp, Messenger, Instagram) */}
        {!["sms", "email", "llamada", "form"].includes(inbox.channel) && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Conexión</h2>
            <div className="flex items-center gap-3">
              {inbox.status === "connected" ? (
                <div className="flex items-center gap-2 text-green-600"><Wifi className="h-4 w-4" /><span className="text-sm font-medium">Conectado</span></div>
              ) : (
                <div className="flex items-center gap-2 text-red-500"><WifiOff className="h-4 w-4" /><span className="text-sm font-medium">Desconectado</span></div>
              )}
              {inbox.channelName && <span className="text-xs text-gray-400">· {inbox.channelName}</span>}
            </div>
            {inbox.status === "connected" ? (
              <>
                <div className="mt-3 pt-3 border-t border-gray-100 space-y-1 text-xs">
                  {inbox.phoneNumberId && <div className="flex justify-between"><span className="text-gray-500">Phone Number ID</span><span className="font-mono text-gray-700">{inbox.phoneNumberId}</span></div>}
                  {inbox.wabaId && <div className="flex justify-between"><span className="text-gray-500">WABA ID</span><span className="font-mono text-gray-700">{inbox.wabaId}</span></div>}
                  {inbox.pageId && <div className="flex justify-between"><span className="text-gray-500">Page ID</span><span className="font-mono text-gray-700">{inbox.pageId}</span></div>}
                </div>
                <button
                  onClick={async () => {
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
                  }}
                  className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-xs font-medium"
                >
                  <WifiOff className="h-3 w-3" /> Desconectar
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  if (inbox.channel === "whatsapp") {
                    handleWhatsAppConnect();
                  } else {
                    window.location.href = `/api/chats/oauth/connect?inboxId=${inbox.id}&channel=${inbox.channel}`;
                  }
                }}
                disabled={connecting || (inbox.channel === "whatsapp" && !waConfig)}
                className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium disabled:opacity-50"
              >
                {connecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wifi className="h-3 w-3" />}
                {connecting ? "Conectando..." : "Conectar"}
              </button>
            )}
          </div>
        )}

        {/* Danger zone */}
        <div className="bg-white rounded-xl border border-red-200 p-5">
          <h2 className="text-sm font-semibold text-red-600 mb-1">Zona de peligro</h2>
          <p className="text-[11px] text-gray-500 mb-3">Eliminar esta bandeja borrará todas las conversaciones asociadas.</p>
          <button onClick={() => setShowDeleteModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-xs font-medium">
            <Trash2 className="h-3 w-3" /> Eliminar bandeja
          </button>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteModal && inbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 mx-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <h3 className="text-base font-semibold text-gray-900">Eliminar bandeja</h3>
            </div>
            <p className="text-sm text-gray-600 mb-1">
              Esta acción no se puede deshacer. Se eliminará la bandeja <strong>{inbox.name}</strong> y todas sus conversaciones asociadas.
            </p>
            <p className="text-sm text-gray-600 mb-4">
              Escribe <strong>{inbox.name}</strong> para confirmar:
            </p>
            <input
              type="text"
              value={deleteConfirmName}
              onChange={(e) => setDeleteConfirmName(e.target.value)}
              placeholder={inbox.name}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowDeleteModal(false); setDeleteConfirmName(""); }}
                className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteConfirmName !== inbox.name || deleting}
                className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
