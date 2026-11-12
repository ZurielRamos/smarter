import { memo, useEffect } from "react";
import { Handle, Position, useUpdateNodeInternals, type Node, type NodeProps } from "@xyflow/react";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AutomationNodeData } from "@/services/automatizaciones";
import { NODE_BY_TYPE } from "./nodeCatalog";
import { useEditor } from "./editorContext";

type AutoFlowNode = Node<AutomationNodeData>;

interface Branch {
  id: string;
  label?: string;
}

const handleClass =
  "!h-3 !w-3 !border-2 !border-card !bg-brand-600 hover:!bg-brand-500 transition-colors";

/** Resumen de una línea que muestra la configuración clave del nodo. */
function summary(type: string, d: AutomationNodeData): string {
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  switch (type) {
    case "http_request":
      return `${s(d.method) || "GET"} ${s(d.url) || "—"}`;
    case "trigger_schedule":
      return s(d.cron) || "Sin frecuencia";
    case "trigger_webhook":
      return `Método: ${s(d.method) || "ANY"}`;
    case "send_email":
      return s(d.to) ? `Para: ${s(d.to)}` : "Sin destinatario";
    case "slack":
    case "discord":
    case "telegram":
      return s(d.text) || "Sin mensaje";
    case "ai_prompt":
      return s(d.model) || "Sin modelo";
    case "trigger_message_received":
      return s(d.keywords) ? `Palabras: ${s(d.keywords)}` : "Cualquier mensaje";
    case "trigger_contact_created":
    case "trigger_conversation_created":
      return "Evento del CRM";
    case "send_message":
      return s(d.text) || "Sin mensaje";
    case "contact_upsert":
    case "contact_find":
      return s(d.phone) || s(d.email) || "Sin identificador";
    case "delay":
      return `${d.amount ?? 0} ${d.unit === "minutes" ? "min" : "s"}`;
    case "loop":
      return s(d.items) || "Sin lista";
    case "set_variable":
      return `${Array.isArray(d.assignments) ? d.assignments.filter((a: { name?: string }) => a?.name).length : 0} variable(s)`;
    case "stop":
      return d.mode === "error" ? "Termina con error" : "Termina con éxito";
    default:
      return "";
  }
}

function AutoNodeImpl({ id, type, data, selected }: NodeProps<AutoFlowNode>) {
  const def = NODE_BY_TYPE[type];
  const { runInfo, issueNodeIds } = useEditor();
  const updateInternals = useUpdateNodeInternals();
  const run = runInfo[id];
  const hasIssue = issueNodeIds.has(id);

  const branches: Branch[] = def?.outputs === "condition" && Array.isArray(data.branches) ? (data.branches as Branch[]) : [];
  const errorOut = data.onError === "continue";

  // Los handles cambian al editar ramas o la ruta de error: se recalculan.
  const sig = branches.map((b) => b.id).join(",") + String(errorOut);
  useEffect(() => {
    updateInternals(id);
  }, [id, sig, updateInternals]);

  if (!def) return null;
  const Icon = def.icon;
  const isTrigger = def.category === "trigger";
  const text = summary(type, data);

  const outputs: { handle: string; label: string }[] =
    def.outputs === "condition"
      ? [...branches.map((b, i) => ({ handle: `cond:${b.id}`, label: b.label || `Rama ${i + 1}` })), { handle: "else", label: "Si no" }]
      : def.outputs === "loop"
        ? [
            { handle: "each", label: "Por cada elemento" },
            { handle: "done", label: "Al terminar" },
          ]
        : def.outputs === "default"
          ? [{ handle: "next", label: "" }]
          : [];

  return (
    <div
      className={cn(
        "w-60 rounded-xl border bg-card text-card-foreground shadow-sm transition-shadow",
        selected ? "border-brand-500 ring-2 ring-brand-500/30 shadow-md" : "border-border",
        run?.status === "success" && "!border-emerald-500",
        run?.status === "error" && "!border-rose-500",
        hasIssue && "!border-amber-500",
      )}
    >
      {!isTrigger && <Handle type="target" position={Position.Left} className={handleClass} />}

      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white", def.accent)}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-foreground">{data.label || def.label}</p>
          <p className="truncate text-[10px] text-muted-foreground">{def.label}</p>
        </div>
        {run?.status === "success" && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-label="Ejecutado con éxito" />}
        {run?.status === "error" && <XCircle className="h-4 w-4 shrink-0 text-rose-500" aria-label="Falló" />}
        {hasIssue && !run && <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" aria-label="Requiere configuración" />}
      </div>

      {text && (
        <p className="mx-3 mb-2.5 truncate rounded-md bg-muted/60 px-2 py-1 font-mono text-[10px] text-muted-foreground">{text}</p>
      )}

      {/* Salida simple: handle centrado a la derecha */}
      {def.outputs === "default" && <Handle id="next" type="source" position={Position.Right} className={handleClass} />}

      {/* Salidas múltiples: una fila por salida */}
      {(def.outputs === "condition" || def.outputs === "loop") && (
        <div className="border-t border-border">
          {outputs.map((o) => (
            <div key={o.handle} className="relative flex h-7 items-center justify-end px-3 text-[10px] text-muted-foreground">
              <span className="truncate">{o.label}</span>
              <Handle id={o.handle} type="source" position={Position.Right} className={handleClass} />
            </div>
          ))}
        </div>
      )}

      {errorOut && def.outputs !== "none" && (
        <div className="relative flex h-7 items-center justify-end border-t border-border px-3 text-[10px] text-rose-500">
          <span>Si falla</span>
          <Handle id="error" type="source" position={Position.Right} className={cn(handleClass, "!bg-rose-500")} />
        </div>
      )}

      {run && <p className="px-3 pb-2 text-right text-[9px] text-muted-foreground">{run.durationMs} ms</p>}
    </div>
  );
}

export const AutoNode = memo(AutoNodeImpl);
