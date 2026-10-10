import { useEffect, useState } from "react";
import { Loader2, AlertTriangle, ShieldCheck, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/services/api";
import { getInboxes, type InboxSummary } from "@/services/api";
import { DropdownSelect } from "@/components/ui/dropdown-select";

/**
 * Carga los canales de WhatsApp del tenant con estado de error visible.
 * Compartido por la sección de Flows y la de Encuestas (ambas crean/envían
 * WhatsApp Flows y necesitan elegir el canal + verificar su cifrado).
 */
export function useWhatsAppInboxes(tenantId: string) {
  const [inboxes, setInboxes] = useState<InboxSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    getInboxes(tenantId)
      .then((list) => setInboxes(list.filter((i) => i.channel === "whatsapp")))
      .catch((err) => {
        setError(
          err?.response?.data?.message || err?.message || "No se pudieron cargar los canales",
        );
      })
      .finally(() => setLoading(false));
  }, [tenantId]);

  return { inboxes, loading, error };
}

/**
 * Estado de la clave de cifrado del canal + botón para configurarla. La clave
 * es por número; sin ella, los Flows/Encuestas con endpoint no funcionan.
 */
export function EncryptionStatusPanel({ inboxId }: { inboxId: string }) {
  const [status, setStatus] = useState<{
    hasKey: boolean;
    status: string;
    metaStatus?: string | null;
  } | null>(null);
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
          <ShieldCheck className="h-3 w-3" /> Cifrado activo
          {status?.metaStatus ? ` (${status.metaStatus})` : ""}
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

/**
 * Selector de canal de WhatsApp con estados claros (cargando / sin canales /
 * error) y panel de estado de cifrado del canal elegido.
 */
export function WhatsAppInboxPicker({
  inboxId,
  onChange,
  inboxes,
  loading,
  error,
  label = "Canal (WhatsApp)",
}: {
  inboxId: string;
  onChange: (id: string) => void;
  inboxes: InboxSummary[];
  loading: boolean;
  error: string | null;
  label?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-foreground mb-1.5">{label}</label>
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
