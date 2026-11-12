import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { automationsApi, type AutomationRun } from "@/services/automatizaciones";
import { RunStatusBadge } from "./RunPanel";
import { formatDuration, triggerLabels } from "./runUtils";

export function AutomationRuns() {
  const { slug } = useParams();
  const { user } = useAuth();
  const tenantId = user?.tenantRoles.find((tr) => tr.tenant.slug === slug)?.tenantId;

  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<AutomationRun | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    automationsApi
      .tenantRuns(tenantId)
      .then(setRuns)
      .catch(() => toast.error("No se pudo cargar el historial"))
      .finally(() => setLoading(false));
  }, [tenantId]);

  const open = async (id: string) => {
    if (!tenantId) return;
    try {
      setDetail(await automationsApi.getRun(id, tenantId));
    } catch {
      toast.error("No se pudo cargar la ejecución");
    }
  };

  return (
    <div className="flex min-w-0 flex-1 overflow-hidden">
      <div className={cn("flex min-w-0 flex-1 flex-col overflow-hidden", detail && "max-w-[55%]")}>
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">Ejecuciones recientes</h2>
          <p className="text-xs text-muted-foreground">Las últimas 50 de todas tus automatizaciones.</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Cargando" />
            </div>
          ) : runs.length === 0 ? (
            <div className="mt-16 text-center">
              <ListChecks className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground">Todavía no hay ejecuciones.</p>
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-card text-[10px] uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Automatización</th>
                  <th className="px-2 py-2 font-medium">Estado</th>
                  <th className="px-2 py-2 font-medium">Origen</th>
                  <th className="px-2 py-2 font-medium">Duración</th>
                  <th className="px-4 py-2 font-medium">Inicio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {runs.map((r) => (
                  <tr key={r.id} className={cn("cursor-pointer hover:bg-muted/50", detail?.id === r.id && "bg-brand-50 dark:bg-brand-700/30")}>
                    <td className="px-4 py-2">
                      <button type="button" onClick={() => open(r.id)} className="max-w-[16rem] truncate text-left font-medium text-foreground hover:underline">
                        {r.automationName}
                      </button>
                    </td>
                    <td className="px-2 py-2"><RunStatusBadge status={r.status} /></td>
                    <td className="px-2 py-2 text-muted-foreground">{triggerLabels[r.triggerType] ?? r.triggerType}</td>
                    <td className="px-2 py-2 text-muted-foreground">{formatDuration(r.durationMs)}</td>
                    <td className="px-4 py-2 text-muted-foreground">{new Date(r.startedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {detail && (
        <aside className="w-[45%] shrink-0 overflow-y-auto border-l border-border p-4" aria-label="Detalle de la ejecución">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RunStatusBadge status={detail.status} />
              <span className="text-xs text-muted-foreground">{formatDuration(detail.durationMs)}</span>
            </div>
            <button type="button" onClick={() => setDetail(null)} className="text-xs text-muted-foreground hover:text-foreground">
              Cerrar
            </button>
          </div>
          {detail.error && <p className="mb-3 rounded-md bg-rose-50 p-2 text-[11px] text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{detail.error}</p>}
          <ol className="space-y-2">
            {detail.steps.map((s, i) => (
              <li key={i} className="rounded-lg border border-border p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-medium text-foreground">
                    {s.label}
                    {s.iteration ? <span className="ml-1 text-[10px] text-muted-foreground">#{s.iteration}</span> : null}
                  </span>
                  <span className={cn("text-[10px]", s.status === "success" ? "text-emerald-600" : "text-rose-600")}>
                    {s.status === "success" ? "OK" : "Error"} · {formatDuration(s.durationMs)}
                  </span>
                </div>
                {s.error && <p className="mt-1 text-[11px] text-rose-600">{s.error}</p>}
                {s.output !== undefined && (
                  <pre className="mt-1.5 max-h-32 overflow-auto whitespace-pre-wrap break-all rounded bg-muted/60 p-1.5 font-mono text-[10px] text-foreground">
                    {typeof s.output === "string" ? s.output : JSON.stringify(s.output, null, 2)}
                  </pre>
                )}
              </li>
            ))}
          </ol>
        </aside>
      )}
    </div>
  );
}
