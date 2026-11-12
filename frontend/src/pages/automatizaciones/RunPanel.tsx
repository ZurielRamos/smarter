import { useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, Loader2, XCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AutomationRun, AutomationStepLog } from "@/services/automatizaciones";
import { formatDuration, triggerLabels } from "./runUtils";

export function RunStatusBadge({ status }: { status: AutomationRun["status"] }) {
  const map = {
    running: { cls: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300", text: "En curso" },
    success: { cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300", text: "Exitosa" },
    error: { cls: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300", text: "Con error" },
  }[status];
  return <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", map.cls)}>{map.text}</span>;
}

function Json({ value }: { value: unknown }) {
  if (value === undefined) return null;
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return (
    <pre className="max-h-48 overflow-auto rounded-md bg-muted/60 p-2 font-mono text-[10px] leading-relaxed text-foreground whitespace-pre-wrap break-all">
      {text}
    </pre>
  );
}

function Step({ step, onSelect }: { step: AutomationStepLog; onSelect?: (nodeId: string) => void }) {
  const [open, setOpen] = useState(step.status === "error");
  return (
    <li className="rounded-lg border border-border">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          onSelect?.(step.nodeId);
        }}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-muted/50"
      >
        {open ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
        {step.status === "success" ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
        ) : (
          <XCircle className="h-3.5 w-3.5 text-rose-500" />
        )}
        <span className="flex-1 truncate text-xs font-medium text-foreground">
          {step.label}
          {step.iteration ? <span className="ml-1.5 text-[10px] text-muted-foreground">#{step.iteration}</span> : null}
        </span>
        {step.attempts > 1 && <span className="text-[10px] text-amber-600">{step.attempts} intentos</span>}
        <span className="text-[10px] text-muted-foreground">{formatDuration(step.durationMs)}</span>
      </button>
      {open && (
        <div className="space-y-1.5 border-t border-border p-2">
          {step.error && <p className="rounded-md bg-rose-50 p-2 text-[11px] text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{step.error}</p>}
          {step.input !== undefined && (
            <div>
              <p className="mb-0.5 text-[10px] font-semibold uppercase text-muted-foreground">Entrada</p>
              <Json value={step.input} />
            </div>
          )}
          {step.output !== undefined && (
            <div>
              <p className="mb-0.5 text-[10px] font-semibold uppercase text-muted-foreground">Salida</p>
              <Json value={step.output} />
            </div>
          )}
        </div>
      )}
    </li>
  );
}

interface Props {
  run: AutomationRun | null;
  history: AutomationRun[];
  running: boolean;
  testInput: string;
  onTestInput: (v: string) => void;
  onOpenRun: (id: string) => void;
  onSelectNode: (id: string) => void;
  onClose: () => void;
}

export function RunPanel({ run, history, running, testInput, onTestInput, onOpenRun, onSelectNode, onClose }: Props) {
  const [tab, setTab] = useState<"result" | "history" | "input">("result");
  const tabs = [
    { key: "result", label: "Resultado" },
    { key: "history", label: `Historial (${history.length})` },
    { key: "input", label: "Datos de prueba" },
  ] as const;

  return (
    <section className="flex h-72 shrink-0 flex-col border-t border-border bg-card" aria-label="Ejecuciones">
      <div className="flex items-center gap-1 border-b border-border px-3" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "border-b-2 px-2.5 py-2 text-xs font-medium transition-colors",
              tab === t.key ? "border-brand-600 text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
        <button type="button" aria-label="Cerrar panel" onClick={onClose} className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3" role="tabpanel">
        {tab === "result" &&
          (running ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Ejecutando…
            </p>
          ) : !run ? (
            <p className="text-xs text-muted-foreground">Pulsa «Probar» para ejecutar la automatización y ver el resultado de cada nodo.</p>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <RunStatusBadge status={run.status} />
                <span className="text-muted-foreground">
                  {triggerLabels[run.triggerType] ?? run.triggerType} · {formatDuration(run.durationMs)} · {new Date(run.startedAt).toLocaleString()}
                </span>
              </div>
              {run.error && <p className="rounded-md bg-rose-50 p-2 text-[11px] text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{run.error}</p>}
              <ul className="space-y-1.5">
                {run.steps.map((s, i) => (
                  <Step key={`${s.nodeId}-${i}`} step={s} onSelect={onSelectNode} />
                ))}
              </ul>
            </div>
          ))}

        {tab === "history" &&
          (history.length === 0 ? (
            <p className="text-xs text-muted-foreground">Aún no hay ejecuciones.</p>
          ) : (
            <ul className="divide-y divide-border">
              {history.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onOpenRun(h.id);
                      setTab("result");
                    }}
                    className="flex w-full items-center gap-3 px-1 py-2 text-left hover:bg-muted/50"
                  >
                    <RunStatusBadge status={h.status} />
                    <span className="text-xs text-foreground">{triggerLabels[h.triggerType] ?? h.triggerType}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {formatDuration(h.durationMs)} · {new Date(h.startedAt).toLocaleString()}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ))}

        {tab === "input" && (
          <div className="space-y-1.5">
            <label htmlFor="test-input" className="block text-[11px] font-medium text-foreground">
              JSON que se inyecta como <span className="font-mono">{"{{trigger}}"}</span> al probar
            </label>
            <textarea
              id="test-input"
              rows={7}
              value={testInput}
              onChange={(e) => onTestInput(e.target.value)}
              spellCheck={false}
              placeholder={'{\n  "body": { "email": "cliente@ejemplo.com" }\n}'}
              className="w-full resize-y rounded-lg border border-border bg-background p-2 font-mono text-[11px] text-foreground focus:border-brand-300 focus:outline-none focus:ring-1 focus:ring-brand-200"
            />
          </div>
        )}
      </div>
    </section>
  );
}
