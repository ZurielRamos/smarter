import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Save, Trash2, Wifi, WifiOff, Phone, MessageCircle, Camera, MessageSquare, Mail, Copy, CheckCircle2, XCircle, RefreshCw, Loader2 } from "lucide-react";
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

  // Email config
  const [emailForm, setEmailForm] = useState({ fromEmail: "", fromName: "" });
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailConfig, setEmailConfig] = useState<{ domain: string; domainStatus: string } | null>(null);
  const [dnsRecords, setDnsRecords] = useState<{ type: string; name: string; value: string; purpose: string }[]>([]);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<any>(null);
  const [copied, setCopied] = useState<string | null>(null);

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
        if (data.channel === "email") loadEmailConfig(data.id);
        if (data.channel === "sms") setSmsSender(data.metadata?.sender || "");
        if (data.channel === "llamada") setCallVoice(data.metadata?.voice || "Mariana");
      })
      .finally(() => setLoading(false));
  }, [inboxId]);

  const loadEmailConfig = async (id: string) => {
    try {
      const { data } = await api.get(`/email-config/inbox/${id}`);
      if (data) {
        setEmailConfig(data);
        setEmailForm({ fromEmail: data.fromEmail, fromName: data.fromName });
        const dnsRes = await api.get(`/email-config/inbox/${id}/dns-records`);
        setDnsRecords(dnsRes.data.records || []);
      }
    } catch {}
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

  const handleEmailSave = async () => {
    if (!inbox || !emailForm.fromEmail || !emailForm.fromName) return;
    setEmailSaving(true);
    try {
      const { data } = await api.post(`/email-config/inbox/${inbox.id}`, { tenantId: inbox.tenantId, ...emailForm });
      setEmailConfig(data);
      const dnsRes = await api.get(`/email-config/inbox/${inbox.id}/dns-records`);
      setDnsRecords(dnsRes.data.records || []);
    } catch {} finally { setEmailSaving(false); }
  };

  const handleVerifyDomain = async () => {
    if (!inbox) return;
    setVerifying(true);
    try {
      const { data } = await api.post(`/email-config/inbox/${inbox.id}/verify`);
      setVerifyResult(data);
      if (data.verified) setEmailConfig((p) => p ? { ...p, domainStatus: "verified" } : p);
      else setEmailConfig((p) => p ? { ...p, domainStatus: "failed" } : p);
    } catch {} finally { setVerifying(false); }
  };

  const handleDelete = async () => {
    if (!inbox) return;
    await api.delete(`/chats/inboxes/${inbox.id}`);
    onDeleted?.();
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
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
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Configuración de Email</h2>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nombre remitente</label>
                <input type="text" value={emailForm.fromName} onChange={(e) => setEmailForm({ ...emailForm, fromName: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Email remitente</label>
                <input type="email" value={emailForm.fromEmail} onChange={(e) => setEmailForm({ ...emailForm, fromEmail: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
            </div>
            <button onClick={handleEmailSave} disabled={emailSaving} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-xs font-medium disabled:opacity-50">
              {emailSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Guardar
            </button>
            {emailConfig && dnsRecords.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <h3 className="text-xs font-semibold text-gray-900 mb-2">Registros DNS — <code className="bg-gray-100 px-1 rounded">{emailConfig.domain}</code></h3>
                <div className="space-y-2">
                  {dnsRecords.map((r, i) => (
                    <div key={i} className="p-2.5 rounded-lg border border-gray-200 bg-gray-50/50 text-xs">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-1 py-0.5 rounded bg-gray-200 font-mono font-bold text-[10px]">{r.type}</span>
                        <span className="text-gray-500">{r.purpose}</span>
                        <button onClick={() => copyToClipboard(r.value, `${i}`)} className="ml-auto p-1 rounded hover:bg-gray-200 text-gray-400">
                          {copied === `${i}` ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                        </button>
                      </div>
                      <p className="font-mono text-gray-600 break-all">{r.name}</p>
                      <p className="font-mono text-gray-700 break-all mt-0.5">{r.value}</p>
                    </div>
                  ))}
                </div>
                <button onClick={handleVerifyDomain} disabled={verifying} className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-300 text-brand-700 hover:bg-brand-50 text-xs font-medium disabled:opacity-50">
                  {verifying ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Verificar dominio
                </button>
                {verifyResult && (
                  <div className={`mt-2 p-2.5 rounded-lg border text-xs ${verifyResult.verified ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>
                    {verifyResult.results?.map((r: any, i: number) => (
                      <div key={i} className="flex items-center gap-1.5">
                        {r.status === "ok" ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                        {r.record}{r.detail ? ` — ${r.detail}` : ""}
                      </div>
                    ))}
                  </div>
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
            {inbox.status === "connected" && (
              <div className="mt-3 pt-3 border-t border-gray-100 space-y-1 text-xs">
                {inbox.phoneNumberId && <div className="flex justify-between"><span className="text-gray-500">Phone Number ID</span><span className="font-mono text-gray-700">{inbox.phoneNumberId}</span></div>}
                {inbox.wabaId && <div className="flex justify-between"><span className="text-gray-500">WABA ID</span><span className="font-mono text-gray-700">{inbox.wabaId}</span></div>}
                {inbox.pageId && <div className="flex justify-between"><span className="text-gray-500">Page ID</span><span className="font-mono text-gray-700">{inbox.pageId}</span></div>}
              </div>
            )}
          </div>
        )}

        {/* Danger zone */}
        <div className="bg-white rounded-xl border border-red-200 p-5">
          <h2 className="text-sm font-semibold text-red-600 mb-1">Zona de peligro</h2>
          <p className="text-[11px] text-gray-500 mb-3">Eliminar esta bandeja borrará todas las conversaciones asociadas.</p>
          <button onClick={handleDelete} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-xs font-medium">
            <Trash2 className="h-3 w-3" /> Eliminar bandeja
          </button>
        </div>
      </div>
    </div>
  );
}
