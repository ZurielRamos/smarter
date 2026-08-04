import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Webhook, Trash2, Edit3, X, Loader2, Save, ToggleLeft, ToggleRight } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/services/api";
import headerBg from "@/assets/header-background.jpg";

interface WebhookItem {
  id: string;
  name: string;
  url: string;
  events: string[];
  enabled: boolean;
  secret: string | null;
  createdAt: string;
}

const AVAILABLE_EVENTS = [
  { key: "message_created", label: "Mensaje creado", payload: `{
  "message": {
    "id", "direction", "content",
    "messageType", "status", "createdAt"
  },
  "conversation": {
    "id", "contactId", "contactName",
    "status", "inboxId"
  },
  "contact": {
    "id", "firstName", "lastName",
    "phone", "email", "tags", ...
  },
  "inbox": { "id", "name", "channel" }
}` },
  { key: "contact_created", label: "Contacto creado", payload: `{
  "id", "firstName", "lastName",
  "phone", "email", "documentType",
  "documentNumber", "gender", "city",
  "region", "status", "channelSource",
  "score", "tags", "customData",
  "createdAt"
}` },
  { key: "contact_updated", label: "Contacto actualizado", payload: `{
  "id", "firstName", "lastName",
  "phone", "email", "documentType",
  "documentNumber", "gender", "city",
  "region", "status", "channelSource",
  "score", "tags", "customData",
  "updatedAt"
}` },
  { key: "campaign_started", label: "Campaña iniciada", payload: `{
  "campaignId": "uuid",
  "campaignName": "string",
  "channel": "sms|whatsapp|llamada",
  "sendId": "uuid",
  "totalRecipients": 150
}` },
  { key: "campaign_completed", label: "Campaña completada", payload: `{
  "campaignId": "uuid",
  "campaignName": "string",
  "channel": "sms|whatsapp|llamada",
  "sendId": "uuid",
  "totalRecipients": 150,
  "totalSent": 145,
  "totalFailed": 5
}` },
];

export function Webhooks() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const tenantRole = user?.tenantRoles.find((tr) => tr.tenant.slug === slug);
  const tenantId = tenantRole?.tenantId || "";

  const [webhooks, setWebhooks] = useState<WebhookItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<WebhookItem | null>(null);

  const fetchWebhooks = () => {
    setLoading(true);
    api.get<WebhookItem[]>("/user-webhooks", { params: { tenantId } })
      .then(({ data }) => setWebhooks(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { if (tenantId) fetchWebhooks(); }, [tenantId]);

  const handleToggle = async (wh: WebhookItem) => {
    await api.put(`/user-webhooks/${wh.id}`, { enabled: !wh.enabled });
    fetchWebhooks();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este webhook?")) return;
    await api.delete(`/user-webhooks/${id}`);
    fetchWebhooks();
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-8 pt-16 pb-6 shrink-0 rounded-b-2xl" style={{ backgroundImage: `url(${headerBg})`, backgroundSize: "cover", backgroundPosition: "center" }}>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/${slug}/integraciones`)} className="p-1.5 rounded-lg hover:bg-white/10 text-white transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-white flex items-center gap-2"><Webhook className="h-5 w-5" /> Webhooks</h1>
            <p className="text-brand-300 mt-0.5 text-sm">Recibe notificaciones HTTP cuando ocurren eventos en tu cuenta</p>
          </div>
          <button onClick={() => { setEditing(null); setShowModal(true); }} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-medium backdrop-blur-sm border border-white/20">
            <Plus className="h-4 w-4" /> Añadir webhook
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
          ) : webhooks.length === 0 ? (
            <div className="text-center py-16">
              <Webhook className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">No hay webhooks configurados</p>
              <p className="text-xs text-gray-400 mt-1">Crea uno para recibir notificaciones en tiempo real</p>
            </div>
          ) : (
            <div className="space-y-3">
              {webhooks.map((wh) => (
                <div key={wh.id} className={`bg-white rounded-xl border p-4 transition-colors ${wh.enabled ? "border-gray-200" : "border-gray-100 opacity-60"}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-900">{wh.name}</p>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${wh.enabled ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                          {wh.enabled ? "Activo" : "Inactivo"}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 font-mono mt-1 truncate">{wh.url}</p>
                      <div className="flex gap-1 mt-2 flex-wrap">
                        {wh.events.map((ev) => (
                          <span key={ev} className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 font-medium">{AVAILABLE_EVENTS.find(e => e.key === ev)?.label || ev}</span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-3">
                      <button onClick={() => handleToggle(wh)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400" title={wh.enabled ? "Desactivar" : "Activar"}>
                        {wh.enabled ? <ToggleRight className="h-4 w-4 text-green-500" /> : <ToggleLeft className="h-4 w-4" />}
                      </button>
                      <button onClick={() => { setEditing(wh); setShowModal(true); }} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><Edit3 className="h-4 w-4" /></button>
                      <button onClick={() => handleDelete(wh.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showModal && <WebhookModal tenantId={tenantId} webhook={editing} onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); fetchWebhooks(); }} />}
    </div>
  );
}

function WebhookModal({ tenantId, webhook, onClose, onSaved }: { tenantId: string; webhook: WebhookItem | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(webhook?.name || "");
  const [url, setUrl] = useState(webhook?.url || "");
  const [secret, setSecret] = useState(webhook?.secret || "");
  const [events, setEvents] = useState<Set<string>>(new Set(webhook?.events || []));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const toggleEvent = (key: string) => {
    setEvents((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  };

  const handleSave = async () => {
    if (!url.trim() || !name.trim() || events.size === 0) { setError("Completa todos los campos y selecciona al menos un evento"); return; }
    setSaving(true); setError("");
    try {
      if (webhook) {
        await api.put(`/user-webhooks/${webhook.id}`, { name, url, events: Array.from(events), secret: secret || null });
      } else {
        await api.post("/user-webhooks", { tenantId, name, url, events: Array.from(events), secret: secret || null });
      }
      onSaved();
    } catch (err: any) { setError(err.response?.data?.message || "Error al guardar"); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col mx-4">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h3 className="text-base font-semibold text-gray-900">{webhook ? "Editar webhook" : "Añadir nuevo webhook"}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100"><X className="h-4 w-4 text-gray-500" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <p className="text-xs text-gray-500">Los webhooks envían notificaciones HTTP POST a tu URL cuando ocurren eventos en tu cuenta.</p>
          <div>
            <label className="text-[11px] text-gray-500 font-medium mb-1 block">Nombre del webhook</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Mi webhook" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="text-[11px] text-gray-500 font-medium mb-1 block">URL del webhook</label>
            <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/api/webhook" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="text-[11px] text-gray-500 font-medium mb-1 block">Secret (opcional)</label>
            <input type="text" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="Token secreto para verificar firma HMAC" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500" />
            <p className="text-[10px] text-gray-400 mt-1">Se enviará una firma HMAC-SHA256 en el header X-Webhook-Signature</p>
          </div>
          <div>
            <label className="text-[11px] text-gray-500 font-medium mb-2 block">Eventos suscritos</label>
            <div className="space-y-1.5">
              {AVAILABLE_EVENTS.map((ev) => (
                <label key={ev.key} className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors group relative">
                  <input type="checkbox" checked={events.has(ev.key)} onChange={() => toggleEvent(ev.key)} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                  <span className="text-sm text-gray-700 flex-1">{ev.label}</span>
                  <span className="text-[10px] text-gray-400 font-mono">{ev.key}</span>
                  <div className="absolute z-30 bottom-full left-0 mb-1 w-80 px-3 py-2.5 rounded-lg bg-gray-900 text-white text-[10px] shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150">
                    <p className="font-semibold mb-1 text-gray-300">Payload:</p>
                    <pre className="font-mono whitespace-pre text-[9px] text-green-300 leading-relaxed">{ev.payload}</pre>
                  </div>
                </label>
              ))}
            </div>
          </div>
          {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2 shrink-0">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-600 disabled:opacity-50">
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            {webhook ? "Guardar cambios" : "Crear webhook"}
          </button>
        </div>
      </div>
    </div>
  );
}
