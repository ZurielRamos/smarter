import { useEffect, useState } from "react";
import { useParams, useNavigate, Outlet } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Plus, Loader2, Workflow, X, Upload, Download, AlertTriangle, ShieldCheck, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/services/api";
import { getInboxes, type InboxSummary } from "@/services/api";
import { DropdownSelect } from "@/components/ui/dropdown-select";

// Hook que carga los canales de WhatsApp del tenant con estado de error visible
// (sin tragarse fallos silenciosamente, para poder diagnosticar).
function useWhatsAppInboxes(tenantId: string) {
  const [inboxes, setInboxes] = useState<InboxSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    getInboxes(tenantId)
      .then((list) => {
        setInboxes(list.filter((i) => i.channel === "whatsapp"));
      })
      .catch((err) => {
        setError(err?.response?.data?.message || err?.message || "No se pudieron cargar los canales");
      })
      .finally(() => setLoading(false));
  }, [tenantId]);

  return { inboxes, loading, error };
}

// Selector de canal de WhatsApp con dropdown propio (no nativo) y mensajes de
// estado claros (cargando / sin canales / error).
function WhatsAppInboxPicker({
  inboxId,
  onChange,
  inboxes,
  loading,
  error,
}: {
  inboxId: string;
  onChange: (id: string) => void;
  inboxes: InboxSummary[];
  loading: boolean;
  error: string | null;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-foreground mb-1.5">Canal (WhatsApp)</label>
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground px-3 py-2 border border-border rounded-lg">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando canales…
        </div>
      ) : error ? (
        <div className="flex items-center gap-1.5 text-[11px] text-red-600 px-3 py-2 border border-red-200 rounded-lg">
          <AlertTriangle className="h-3.5 w-3.5" /> {error}
        </div>
      ) : inboxes.length === 0 ? (
        <div className="text-[11px] text-amber-600 px-3 py-2 border border-amber-200 rounded-lg">
          No hay canales de WhatsApp conectados en este espacio.
        </div>
      ) : (
        <DropdownSelect
          value={inboxId}
          onChange={onChange}
          options={inboxes.map((i) => ({ value: i.id, label: i.name }))}
        />
      )}
      {inboxId && <EncryptionStatusPanel inboxId={inboxId} />}
    </div>
  );
}

// Estado de la clave de cifrado del canal + botón para configurarla.
// La clave es por número; sin ella, los Flows con endpoint no funcionan.
function EncryptionStatusPanel({ inboxId }: { inboxId: string }) {
  const [status, setStatus] = useState<{ hasKey: boolean; status: string; metaStatus?: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [setting, setSetting] = useState(false);

  const load = () => {
    setLoading(true);
    api
      .get(`/whatsapp-flows/encryption/${inboxId}/status`)
      .then(({ data }) => setStatus(data))
      .catch(() => setStatus(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inboxId]);

  const setup = async () => {
    setSetting(true);
    try {
      await api.post(`/whatsapp-flows/encryption/${inboxId}/setup`, {});
      toast.success("Cifrado configurado y registrado en Meta");
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "No se pudo configurar el cifrado");
    } finally {
      setSetting(false);
    }
  };

  if (loading) {
    return <p className="text-[10px] text-muted-foreground mt-1.5">Verificando cifrado…</p>;
  }

  const ok = status?.hasKey && (status.metaStatus === "VALID" || status.status === "registered");

  return (
    <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px]">
      {ok ? (
        <span className="flex items-center gap-1 text-green-600">
          <ShieldCheck className="h-3 w-3" /> Cifrado activo{status?.metaStatus ? ` (${status.metaStatus})` : ""}
        </span>
      ) : (
        <span className="flex items-center gap-1 text-amber-600">
          <ShieldAlert className="h-3 w-3" /> Sin clave de cifrado para este número
        </span>
      )}
      {!ok && (
        <button
          onClick={setup}
          disabled={setting}
          className="flex items-center gap-1 px-2 py-1 rounded-md bg-brand-700 hover:bg-brand-600 text-white text-[10px] font-medium transition-colors disabled:opacity-50"
        >
          {setting ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
          Configurar cifrado
        </button>
      )}
    </div>
  );
}

export interface WhatsAppFlowItem {
  id: string;
  tenantId: string;
  inboxId: string | null;
  metaFlowId: string | null;
  name: string;
  status: string; // draft | published | deprecated | ...
  categories: string[] | null;
  dataApiVersion: string | null;
  entryScreen: string | null;
  flowJson: Record<string, any> | null;
  metadata: Record<string, any> | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_STYLES: Record<string, string> = {
  published: "bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300",
  draft: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  deprecated: "bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-300",
};

function statusLabel(status: string) {
  const map: Record<string, string> = {
    published: "Publicado",
    draft: "Borrador",
    deprecated: "Obsoleto",
  };
  return map[status] || status;
}

export function Flows() {
  const { slug, flowId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const tenantRole = user?.tenantRoles.find((tr: any) => tr.tenant.slug === slug);
  const tenantId = tenantRole?.tenantId || "";

  const [flows, setFlows] = useState<WhatsAppFlowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [autoImporting, setAutoImporting] = useState(false);

  const fetchFlows = (): Promise<WhatsAppFlowItem[]> => {
    if (!tenantId) return Promise.resolve([]);
    setLoading(true);
    return api
      .get<WhatsAppFlowItem[]>("/whatsapp-flows", { params: { tenantId } })
      .then(({ data }) => {
        setFlows(data);
        return data;
      })
      .catch(() => [] as WhatsAppFlowItem[])
      .finally(() => setLoading(false));
  };

  // Carga inicial: lista los Flows y, si no hay ninguno, intenta importar
  // automáticamente los que ya existen en las WABAs de los canales de WhatsApp.
  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    (async () => {
      const existing = await fetchFlows();
      if (cancelled || existing.length > 0) return;
      // Auto-import en segundo plano desde los canales de WhatsApp del tenant.
      try {
        const inboxes = await getInboxes(tenantId);
        const wa = inboxes.filter((i) => i.channel === "whatsapp");
        if (wa.length === 0) return;
        setAutoImporting(true);
        for (const inbox of wa) {
          await api
            .post("/whatsapp-flows/import", { tenantId, inboxId: inbox.id })
            .catch(() => {});
        }
        if (!cancelled) await fetchFlows();
      } catch {
        /* silencioso: el usuario puede importar manualmente */
      } finally {
        if (!cancelled) setAutoImporting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Sidebar — Flows list */}
      <div className="w-80 border-r border-border flex flex-col shrink-0">
        <div className="px-3 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase">Flows</h3>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowImport(true)}
              className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Importar Flows de Meta"
            >
              <Download className="h-4 w-4" />
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Nuevo Flow"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading || autoImporting ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              {autoImporting && (
                <p className="text-[10px] text-muted-foreground">Importando Flows de Meta…</p>
              )}
            </div>
          ) : flows.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <Workflow className="h-6 w-6 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">Sin Flows</p>
              <p className="text-[10px] text-muted-foreground mt-1 mb-3">
                Importa los que ya tienes en Meta o crea uno nuevo
              </p>
              <button
                onClick={() => setShowImport(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-[11px] font-medium transition-colors"
              >
                <Download className="h-3 w-3" />
                Importar de Meta
              </button>
            </div>
          ) : (
            flows.map((flow) => (
              <button
                key={flow.id}
                onClick={() => navigate(`/${slug}/comunicaciones/flows/${flow.id}`)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors ${
                  flowId === flow.id
                    ? "bg-brand-50 text-brand-700 dark:bg-brand-700 dark:text-brand-100"
                    : "text-foreground hover:bg-muted"
                }`}
              >
                <div className="h-7 w-7 rounded-lg bg-green-50 dark:bg-green-500/15 flex items-center justify-center shrink-0">
                  <Workflow className="h-3.5 w-3.5 text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{flow.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span
                      className={`text-[9px] px-1.5 py-0 rounded font-medium ${
                        STATUS_STYLES[flow.status] || STATUS_STYLES.draft
                      }`}
                    >
                      {statusLabel(flow.status)}
                    </span>
                    {flow.categories?.[0] && (
                      <span className="text-[9px] text-muted-foreground">
                        {flow.categories[0]}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Detail panel */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <Outlet context={{ refreshFlows: fetchFlows }} />
      </div>

      {showCreate && (
        <CreateFlowModal
          tenantId={tenantId}
          onClose={() => setShowCreate(false)}
          onCreated={(createdId) => {
            setShowCreate(false);
            fetchFlows();
            if (createdId) navigate(`/${slug}/comunicaciones/flows/${createdId}`);
          }}
        />
      )}

      {showImport && (
        <ImportFlowsModal
          tenantId={tenantId}
          onClose={() => setShowImport(false)}
          onImported={() => {
            setShowImport(false);
            fetchFlows();
          }}
        />
      )}
    </div>
  );
}

// === Import Flows from Meta Modal ===

function ImportFlowsModal({
  tenantId,
  onClose,
  onImported,
}: {
  tenantId: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const [inboxId, setInboxId] = useState("");
  const { inboxes, loading: loadingInboxes, error: inboxesError } = useWhatsAppInboxes(tenantId);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (inboxes.length === 1) setInboxId(inboxes[0].id);
  }, [inboxes]);

  const handleImport = async () => {
    if (!inboxId) {
      toast.error("Selecciona un canal de WhatsApp");
      return;
    }
    setImporting(true);
    try {
      const { data } = await api.post("/whatsapp-flows/import", { tenantId, inboxId });
      if (data?.error) {
        toast.error(data.error);
      } else {
        toast.success(`${data.imported} de ${data.total} Flows importados`);
        onImported();
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Error al importar Flows");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-card text-card-foreground rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Importar Flows de Meta</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <p className="text-[11px] text-muted-foreground">
            Trae los Flows que ya existen en la cuenta de WhatsApp (WABA) del canal seleccionado,
            incluidos los creados en el panel de Meta.
          </p>
          <WhatsAppInboxPicker
            inboxId={inboxId}
            onChange={setInboxId}
            inboxes={inboxes}
            loading={loadingInboxes}
            error={inboxesError}
          />
        </div>
        <div className="px-5 py-4 border-t border-border flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleImport}
            disabled={!inboxId || importing}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-xs font-medium transition-colors disabled:opacity-50"
          >
            {importing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
            Importar
          </button>
        </div>
      </div>
    </div>
  );
}

// === Create Flow Modal ===

const CATEGORIES = [
  "SURVEY",
  "LEAD_GENERATION",
  "CONTACT_US",
  "CUSTOMER_SUPPORT",
  "APPOINTMENT_BOOKING",
  "OTHER",
] as const;

function CreateFlowModal({
  tenantId,
  onClose,
  onCreated,
}: {
  tenantId: string;
  onClose: () => void;
  onCreated: (flowId: string | null) => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("SURVEY");
  const [inboxId, setInboxId] = useState("");
  const { inboxes, loading: loadingInboxes, error: inboxesError } = useWhatsAppInboxes(tenantId);
  const [flowJsonText, setFlowJsonText] = useState("");
  const [publish, setPublish] = useState(false);
  const [saving, setSaving] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    if (inboxes.length === 1) setInboxId(inboxes[0].id);
  }, [inboxes]);

  const validateJson = (text: string): Record<string, any> | null => {
    try {
      const parsed = JSON.parse(text);
      setJsonError(null);
      return parsed;
    } catch (e: any) {
      setJsonError("JSON inválido: " + e.message);
      return null;
    }
  };

  const handleFile = async (file: File) => {
    const text = await file.text();
    setFlowJsonText(text);
    validateJson(text);
    // Autocompletar nombre desde el nombre del archivo si está vacío.
    if (!name.trim()) {
      setName(file.name.replace(/\.json$/i, ""));
    }
  };

  const handleCreate = async () => {
    if (!name.trim() || !inboxId || !tenantId) {
      toast.error("Completa nombre, bandeja y JSON");
      return;
    }
    const flowJson = validateJson(flowJsonText);
    if (!flowJson) {
      toast.error("El flow.json no es válido");
      return;
    }

    setSaving(true);
    try {
      const { data } = await api.post("/whatsapp-flows/provision", {
        tenantId,
        inboxId,
        name: name.trim(),
        categories: [category],
        flowJson,
        publish,
      });
      if (data?.success) {
        toast.success(publish ? "Flow creado y publicado" : "Flow creado (borrador)");
        onCreated(data.flowId || null);
      } else {
        // Hubo errores de validación de Meta pero el registro pudo quedar en DRAFT.
        const detail = data?.error || "No se pudo crear el Flow";
        toast.error(detail);
        if (data?.validationErrors?.length) {
          console.error("Flow validation errors:", data.validationErrors);
        }
        onCreated(data?.flowId || null);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Error al crear el Flow");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative bg-card text-card-foreground rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h3 className="text-sm font-semibold text-foreground">Nuevo WhatsApp Flow</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Nombre</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: encuesta_satisfaccion"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">Categoría</label>
              <DropdownSelect
                value={category}
                onChange={setCategory}
                options={CATEGORIES.map((c) => ({ value: c, label: c }))}
              />
            </div>
            <WhatsAppInboxPicker
              inboxId={inboxId}
              onChange={setInboxId}
              inboxes={inboxes}
              loading={loadingInboxes}
              error={inboxesError}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium text-foreground">flow.json</label>
              <label className="flex items-center gap-1 text-[11px] text-brand-700 dark:text-brand-300 cursor-pointer hover:underline">
                <Upload className="h-3 w-3" />
                Subir archivo
                <input
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                />
              </label>
            </div>
            <textarea
              value={flowJsonText}
              onChange={(e) => {
                setFlowJsonText(e.target.value);
                if (e.target.value.trim()) validateJson(e.target.value);
                else setJsonError(null);
              }}
              placeholder='{ "version": "7.3", "data_api_version": "3.0", "routing_model": { ... }, "screens": [ ... ] }'
              rows={10}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground text-[11px] font-mono focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200 resize-y"
            />
            {jsonError && <p className="text-[11px] text-red-600 mt-1">{jsonError}</p>}
            <p className="text-[10px] text-muted-foreground mt-1">
              El endpoint se configura automáticamente si el Flow usa data_exchange.
            </p>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={publish}
              onChange={(e) => setPublish(e.target.checked)}
              className="rounded border-border"
            />
            <span className="text-xs text-foreground">Publicar inmediatamente</span>
          </label>
        </div>

        <div className="px-5 py-4 border-t border-border flex items-center justify-end gap-2 shrink-0">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || !inboxId || !flowJsonText.trim() || !!jsonError || saving}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            {publish ? "Crear y publicar" : "Crear borrador"}
          </button>
        </div>
      </div>
    </div>
  );
}
