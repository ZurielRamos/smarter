import { useEffect, useState } from "react";
import { useParams, useOutletContext } from "react-router-dom";
import { Loader2, Workflow, FileJson, Inbox, Rocket } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/services/api";
import type { WhatsAppFlowItem } from "./Flows";
import { FlowBuilder } from "@/components/flow-builder/FlowBuilder";

interface FlowSubmission {
  id: string;
  flowToken: string | null;
  status: string;
  currentScreen: string | null;
  responseData: Record<string, any>;
  contactIdentifier: string | null;
  completedAt: string | null;
  createdAt: string;
}

type Tab = "definicion" | "respuestas";

const STATUS_STYLES: Record<string, string> = {
  published: "bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300",
  draft: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
};

export function FlowDetail() {
  const { flowId } = useParams();
  const ctx = useOutletContext<{ refreshFlows: () => void }>();
  const [flow, setFlow] = useState<WhatsAppFlowItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("definicion");
  const [publishing, setPublishing] = useState(false);

  const fetchFlow = () => {
    if (!flowId) return;
    setLoading(true);
    api
      .get<WhatsAppFlowItem>(`/whatsapp-flows/${flowId}`)
      .then(({ data }) => setFlow(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchFlow();
    setTab("definicion");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowId]);

  const handlePublish = async () => {
    if (!flow) return;
    setPublishing(true);
    try {
      const { data } = await api.post(`/whatsapp-flows/${flow.id}/publish`);
      if (data?.success) {
        toast.success("Flow publicado");
        fetchFlow();
        ctx?.refreshFlows?.();
      } else {
        toast.error(data?.error || "No se pudo publicar");
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Error al publicar");
    } finally {
      setPublishing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!flow) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        Flow no encontrado
      </div>
    );
  }

  const tabs: { key: Tab; label: string; icon: any }[] = [
    { key: "definicion", label: "Definición", icon: FileJson },
    { key: "respuestas", label: "Respuestas", icon: Inbox },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-8 w-8 rounded-lg bg-green-50 dark:bg-green-500/15 flex items-center justify-center shrink-0">
            <Workflow className="h-4 w-4 text-green-600" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground truncate">{flow.name}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`text-[9px] px-1.5 py-0 rounded font-medium ${STATUS_STYLES[flow.status] || STATUS_STYLES.draft}`}>
                {flow.status}
              </span>
              {flow.metaFlowId && (
                <span className="text-[9px] text-muted-foreground">ID: {flow.metaFlowId}</span>
              )}
            </div>
          </div>
        </div>
        {flow.status !== "published" && flow.metaFlowId && (
          <button
            onClick={handlePublish}
            disabled={publishing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-xs font-medium transition-colors disabled:opacity-50"
          >
            {publishing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Rocket className="h-3 w-3" />}
            Publicar
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="px-5 border-b border-border flex items-center gap-1 shrink-0">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? "border-brand-600 text-brand-700 dark:text-brand-300"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {tab === "definicion" && <DefinitionTab flow={flow} onSaved={() => { fetchFlow(); ctx?.refreshFlows?.(); }} />}
        {tab === "respuestas" && <SubmissionsTab flowId={flow.id} />}
      </div>
    </div>
  );
}

// === Definición / Editor visual ===

function DefinitionTab({ flow, onSaved }: { flow: WhatsAppFlowItem; onSaved: () => void }) {
  const screens = (flow.flowJson?.screens as any[]) || [];
  // Un Flow publicado no se puede editar en Meta sin crear versión nueva; el
  // editor queda en modo lectura salvo que esté en borrador.
  const canEdit = flow.status !== "published";

  if (!flow.flowJson || screens.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Este Flow no tiene definición cargada todavía.
      </p>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {!canEdit && (
        <div className="mb-3 text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/15 rounded-lg px-3 py-2">
          Este Flow está publicado. Para editarlo, crea una nueva versión en borrador.
        </div>
      )}
      <div className="flex-1 min-h-0">
        <FlowBuilder
          flowJson={flow.flowJson}
          flowId={flow.id}
          canEdit={canEdit}
          onSaved={onSaved}
        />
      </div>

      <details className="mt-4">
        <summary className="text-xs font-semibold text-muted-foreground uppercase cursor-pointer">
          Ver flow.json
        </summary>
        <pre className="text-[10px] font-mono bg-muted/50 rounded-lg p-3 overflow-x-auto max-h-80 border border-border mt-2">
          {JSON.stringify(flow.flowJson, null, 2)}
        </pre>
      </details>
    </div>
  );
}

// === Respuestas (submissions) ===

function SubmissionsTab({ flowId }: { flowId: string }) {
  const [subs, setSubs] = useState<FlowSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<FlowSubmission | null>(null);

  useEffect(() => {
    setLoading(true);
    api
      .get<FlowSubmission[]>(`/whatsapp-flows/submissions/by-flow/${flowId}`)
      .then(({ data }) => setSubs(data))
      .catch(() => setSubs([]))
      .finally(() => setLoading(false));
  }, [flowId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (subs.length === 0) {
    return (
      <div className="text-center py-12">
        <Inbox className="h-7 w-7 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Aún no hay respuestas</p>
        <p className="text-[11px] text-muted-foreground/70 mt-1">
          Las respuestas de los usuarios aparecerán aquí
        </p>
      </div>
    );
  }

  return (
    <div className="flex gap-4">
      <div className="w-64 shrink-0 space-y-1">
        {subs.map((s) => (
          <button
            key={s.id}
            onClick={() => setSelected(s)}
            className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
              selected?.id === s.id ? "border-brand-300 bg-brand-50 dark:bg-brand-700/20" : "border-border hover:bg-muted"
            }`}
          >
            <p className="text-xs font-medium text-foreground truncate">
              {s.contactIdentifier || "Sin identificar"}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[9px] px-1 rounded bg-muted text-muted-foreground">{s.status}</span>
              <span className="text-[9px] text-muted-foreground">
                {new Date(s.createdAt).toLocaleDateString()}
              </span>
            </div>
          </button>
        ))}
      </div>
      <div className="flex-1 min-w-0">
        {selected ? (
          <pre className="text-[10px] font-mono bg-muted/50 rounded-lg p-3 overflow-x-auto border border-border">
            {JSON.stringify(selected.responseData, null, 2)}
          </pre>
        ) : (
          <p className="text-xs text-muted-foreground">Selecciona una respuesta para ver sus datos</p>
        )}
      </div>
    </div>
  );
}


