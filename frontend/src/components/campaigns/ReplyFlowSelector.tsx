import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Loader2, Workflow } from "lucide-react";
import { api } from "@/services/api";

interface FlowOption {
  id: string;
  name: string;
  status: "draft" | "active" | "inactive";
}

interface Props {
  campaignId: string;
  tenantId: string;
  value: string | null;
  onSaved: (replyFlowId: string | null) => void;
}

/**
 * «Flujo al responder» de una campaña de WhatsApp: el flujo conversacional que
 * se inicia cuando el contacto responde a la plantilla (botón o texto) en las
 * 72 h siguientes al envío. Se guarda al elegir.
 */
export function ReplyFlowSelector({ campaignId, tenantId, value, onSaved }: Props) {
  const { slug } = useParams();
  const [flows, setFlows] = useState<FlowOption[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<FlowOption[]>("/conversation-flows", { params: { tenantId } })
      .then(({ data }) => setFlows(data))
      .catch(() => setFlows([]));
  }, [tenantId]);

  const change = async (next: string) => {
    const replyFlowId = next || null;
    setSaving(true);
    setError(null);
    try {
      await api.put(`/campaigns/${campaignId}`, { replyFlowId });
      onSaved(replyFlowId);
    } catch {
      setError("No se pudo guardar el flujo. Intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  const selected = flows?.find((f) => f.id === value);

  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <h2 className="text-base font-semibold text-foreground mb-1 flex items-center gap-2">
        <Workflow className="h-4 w-4 text-brand-600 dark:text-brand-200" />
        Flujo al responder
      </h2>
      <p className="text-xs text-muted-foreground mb-4">
        Cuando el contacto responda a la plantilla de esta campaña (con un botón o con texto, en las 72 horas siguientes
        al envío), se inicia este flujo. Tiene prioridad sobre los disparadores de los flujos.
      </p>
      <div className="flex items-center gap-2">
        <select
          aria-label="Flujo al responder"
          value={value ?? ""}
          disabled={flows === null || saving}
          onChange={(e) => change(e.target.value)}
          className="w-full max-w-md px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200"
        >
          <option value="">{flows === null ? "Cargando flujos…" : "Ninguno (el bot o los disparadores atienden la respuesta)"}</option>
          {(flows ?? []).map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
              {f.status !== "active" ? " (inactivo)" : ""}
            </option>
          ))}
        </select>
        {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Guardando" />}
      </div>
      {selected && selected.status !== "active" && (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
          Este flujo no está activo: no se iniciará hasta que lo actives.
        </p>
      )}
      {selected && slug && (
        <Link
          to={`/${slug}/comunicaciones/flujos/${selected.id}`}
          className="mt-2 inline-block text-xs font-medium text-brand-700 hover:underline dark:text-brand-300"
        >
          Abrir el flujo
        </Link>
      )}
      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
      <p className="mt-3 text-[11px] text-muted-foreground">
        En el flujo puedes usar <code className="font-mono">{"{{campaign_name}}"}</code>,{" "}
        <code className="font-mono">{"{{template_button}}"}</code> y <code className="font-mono">{"{{template_name}}"}</code>.
        Aplica a los envíos hechos desde ahora.
      </p>
    </div>
  );
}
