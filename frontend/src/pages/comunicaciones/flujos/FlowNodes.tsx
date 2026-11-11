import { useContext, type ReactNode } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import {
  Play,
  MessageSquare,
  TextCursorInput,
  Zap,
  GitFork,
  Workflow,
  AlertCircle,
  FileText,
  Video,
  ExternalLink,
  Phone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ACTION_LABELS, OPERATOR_LABELS, VALIDATION_LABELS, type FlowNodeData } from "./types";
import { FlowEditorContext } from "./editorContext";

type FlowNode = Node<FlowNodeData>;

const handleClass = "!w-3 !h-3 !border-2 !border-card !bg-brand-400";

// ─── Contenedor común ───

function NodeShell({
  selected,
  header,
  headerClass,
  icon,
  children,
  hasTarget = true,
  warning,
}: {
  selected: boolean;
  header: string;
  headerClass: string;
  icon: ReactNode;
  children: ReactNode;
  hasTarget?: boolean;
  warning?: string | null;
}) {
  return (
    <div
      className={cn(
        "w-64 rounded-xl border bg-card shadow-sm transition-shadow",
        selected ? "border-brand-400 ring-2 ring-brand-300/50 shadow-md" : "border-border",
      )}
    >
      {hasTarget && <Handle type="target" position={Position.Left} className={handleClass} />}
      <div className={cn("flex items-center justify-center gap-1.5 rounded-t-xl px-3 py-1.5 text-xs font-semibold", headerClass)}>
        {icon}
        {header}
      </div>
      <div className="px-3 py-2.5 text-xs text-foreground space-y-2">{children}</div>
      {warning && (
        <div className="flex items-center gap-1 border-t border-border px-3 py-1.5 text-[10px] text-amber-600 dark:text-amber-400">
          <AlertCircle className="h-3 w-3 shrink-0" />
          {warning}
        </div>
      )}
    </div>
  );
}

function Placeholder({ children }: { children: ReactNode }) {
  return <p className="text-muted-foreground italic">{children}</p>;
}

/** Fila con salida propia (botones, ramas de condición, "siguiente"). */
function OutputRow({ id, label, className }: { id: string; label: ReactNode; className?: string }) {
  return (
    <div className={cn("relative rounded-lg border border-border bg-background px-2.5 py-1.5 text-center text-[11px] font-medium", className)}>
      {label}
      <Handle type="source" position={Position.Right} id={id} className={cn(handleClass, "!-right-[19px]")} />
    </div>
  );
}

function NextHandle() {
  return (
    <div className="relative flex justify-end pt-1">
      <span className="text-[10px] text-muted-foreground pr-2">Siguiente</span>
      <Handle type="source" position={Position.Right} id="next" className={cn(handleClass, "!-right-[19px]")} />
    </div>
  );
}

// ─── Nodos ───

export function StartNode({ selected }: NodeProps<FlowNode>) {
  return (
    <div
      className={cn(
        "relative flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm",
        selected && "ring-2 ring-emerald-300",
      )}
    >
      <Play className="h-3.5 w-3.5" />
      Inicio
      <Handle type="source" position={Position.Right} id="next" className={handleClass} />
    </div>
  );
}

/**
 * Fila de un botón de enlace o llamada. Un enlace con seguimiento activo tiene
 * salida «Al hacer clic» (`handleId`); una llamada o un enlace sin seguimiento no.
 */
function ActionRow({
  type,
  label,
  target,
  handleId,
}: {
  type: "url" | "call";
  label: string;
  target?: string;
  handleId?: string;
}) {
  const Icon = type === "url" ? ExternalLink : Phone;
  const incomplete = !target?.trim();
  return (
    <div
      className={cn(
        "relative flex items-center justify-center gap-1.5 rounded-lg border border-dashed px-2.5 py-1.5 text-[11px] font-medium",
        incomplete ? "border-amber-400 text-amber-600 dark:text-amber-400" : "border-border text-brand-600 dark:text-brand-200",
      )}
      title={incomplete ? (type === "url" ? "Falta el enlace" : "Falta el teléfono") : target}
    >
      <Icon className="h-3 w-3 shrink-0" />
      <span className="truncate">{label || "(sin título)"}</span>
      {handleId && (
        <>
          <span className="shrink-0 text-[9px] font-normal text-muted-foreground">· al abrir</span>
          <Handle type="source" position={Position.Right} id={handleId} className={cn(handleClass, "!-right-[19px]")} />
        </>
      )}
    </div>
  );
}

export function MessageNode({ data, selected }: NodeProps<FlowNode>) {
  const buttons = data.buttons || [];
  const replies = buttons.filter((b) => (b.type ?? "reply") === "reply");
  const actions = buttons.filter((b) => b.type === "url" || b.type === "call");
  const hasMedia = !!data.headerType && data.headerType !== "text" && !!data.headerMediaUrl;
  return (
    <NodeShell
      selected={selected}
      header="Mensaje"
      headerClass="bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
      icon={<MessageSquare className="h-3.5 w-3.5" />}
      warning={
        data.headerType && data.headerType !== "text" && !data.headerMediaUrl
          ? "Falta el archivo del encabezado"
          : !data.text?.trim() && buttons.length === 0 && !data.headerMediaUrl
            ? "Mensaje vacío"
            : null
      }
    >
      {data.headerType && data.headerType !== "text" && data.headerMediaUrl && (
        <div className="overflow-hidden rounded-lg border border-border">
          {data.headerType === "image" ? (
            <img src={data.headerMediaUrl} alt="" className="h-24 w-full object-cover" />
          ) : (
            <div className="flex items-center gap-1.5 px-2.5 py-2 text-[11px] text-muted-foreground">
              {data.headerType === "video" ? <Video className="h-3.5 w-3.5 shrink-0" /> : <FileText className="h-3.5 w-3.5 shrink-0" />}
              <span className="truncate">{data.headerMediaName || (data.headerType === "video" ? "Video" : "Documento")}</span>
            </div>
          )}
        </div>
      )}
      {data.text?.trim() || data.header || data.footer ? (
        <div className="rounded-lg bg-muted/60 px-2.5 py-2 space-y-1">
          {data.header && <p className="font-semibold break-words">{data.header}</p>}
          {data.text?.trim() && <p className="whitespace-pre-wrap break-words line-clamp-6">{data.text}</p>}
          {data.footer && <p className="text-[10px] text-muted-foreground break-words">{data.footer}</p>}
        </div>
      ) : (
        <Placeholder>Escribe el mensaje…</Placeholder>
      )}
      {buttons.length > 0 && (
        <div className="space-y-1.5">
          {/* Solo las respuestas tienen salida; enlaces y llamadas no ramifican. */}
          {replies.map((b) => (
            <OutputRow key={b.id} id={`btn:${b.id}`} label={b.title || "(sin título)"} />
          ))}
          {actions.map((b) => (
            <ActionRow
              key={b.id}
              type={b.type as "url" | "call"}
              label={b.title}
              target={b.type === "url" ? b.url : b.phone}
              handleId={b.type === "url" && b.track !== false ? `click:${b.id}` : undefined}
            />
          ))}
          {replies.length > 3 && (
            <p className="text-[10px] text-muted-foreground text-center">
              {hasMedia && data.overflow !== "list"
                ? "WhatsApp lo paginará con «Más opciones»"
                : hasMedia
                  ? "WhatsApp enviará el archivo y luego una lista"
                  : "WhatsApp lo mostrará como lista"}
            </p>
          )}
        </div>
      )}
      {replies.length === 0 && <NextHandle />}
    </NodeShell>
  );
}

export function UserInputNode({ data, selected }: NodeProps<FlowNode>) {
  return (
    <NodeShell
      selected={selected}
      header="Entrada de usuario"
      headerClass="bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300"
      icon={<TextCursorInput className="h-3.5 w-3.5" />}
      warning={!data.variable ? "Elige una variable" : null}
    >
      {data.text?.trim() ? (
        <p className="whitespace-pre-wrap break-words line-clamp-4 rounded-lg bg-muted/60 px-2.5 py-2">{data.text}</p>
      ) : (
        <Placeholder>Pregunta al contacto…</Placeholder>
      )}
      <div className="rounded-lg border border-dashed border-sky-300 dark:border-sky-500/40 px-2.5 py-1.5 text-[11px]">
        <span className="text-sky-700 dark:text-sky-300">{VALIDATION_LABELS[data.validation || "any"]}</span>
        {data.variable && (
          <span className="text-muted-foreground">
            {" "}
            → <code className="font-mono">{`{{${data.variable}}}`}</code>
          </span>
        )}
      </div>
      <NextHandle />
    </NodeShell>
  );
}

export function ActionNode({ data, selected }: NodeProps<FlowNode>) {
  const { labels } = useContext(FlowEditorContext);
  const actions = data.actions || [];
  const terminal = actions.some((a) => a.type === "handoff" || a.type === "resolve");
  const labelName = (id?: string) => labels.find((l) => l.id === id)?.label || "(etiqueta)";

  return (
    <NodeShell
      selected={selected}
      header="Acción"
      headerClass="bg-purple-600 text-white"
      icon={<Zap className="h-3.5 w-3.5" />}
      warning={actions.length === 0 ? "Sin acciones" : null}
    >
      {actions.length === 0 ? (
        <Placeholder>Agrega una acción…</Placeholder>
      ) : (
        <ul className="space-y-1">
          {actions.map((a, i) => (
            <li key={i} className="text-center text-[11px]">
              {a.type === "set_variable" ? (
                <>
                  Asignar <span className="rounded bg-muted px-1 font-mono">{a.value || "∅"}</span> a{" "}
                  <span className="rounded bg-muted px-1 font-mono">{a.variable || "?"}</span>
                </>
              ) : a.type === "add_label" || a.type === "remove_label" ? (
                <>
                  {a.type === "add_label" ? "Agregar" : "Quitar"} etiqueta{" "}
                  <span className="rounded bg-muted px-1">{labelName(a.labelId)}</span>
                </>
              ) : (
                ACTION_LABELS[a.type]
              )}
            </li>
          ))}
        </ul>
      )}
      {terminal ? (
        <p className="text-[10px] text-muted-foreground text-center">El flujo termina aquí</p>
      ) : (
        <NextHandle />
      )}
    </NodeShell>
  );
}

export function ConditionNode({ data, selected }: NodeProps<FlowNode>) {
  const op = data.conditionOperator || "equals";
  const needsValue = op !== "is_set" && op !== "is_not_set";
  return (
    <NodeShell
      selected={selected}
      header="Condición"
      headerClass="bg-amber-500 text-white"
      icon={<GitFork className="h-3.5 w-3.5" />}
      warning={!data.conditionVariable ? "Elige una variable" : null}
    >
      <p className="text-center text-[11px]">
        Si <span className="rounded bg-muted px-1 font-mono">{data.conditionVariable || "?"}</span> {OPERATOR_LABELS[op]}{" "}
        {needsValue && <span className="rounded bg-muted px-1 font-mono">{data.conditionValue || "∅"}</span>}
      </p>
      <div className="space-y-1.5">
        <OutputRow id="true" label="Sí" className="text-green-700 dark:text-green-300" />
        <OutputRow id="false" label="No" className="text-red-600 dark:text-red-300" />
      </div>
    </NodeShell>
  );
}

export function StartFlowNode({ data, selected }: NodeProps<FlowNode>) {
  const { flows, currentFlowId } = useContext(FlowEditorContext);
  const target = flows.find((f) => f.id === data.targetFlowId);
  return (
    <NodeShell
      selected={selected}
      header="Iniciar flujo"
      headerClass="bg-brand-700 text-white"
      icon={<Workflow className="h-3.5 w-3.5" />}
      warning={
        !data.targetFlowId
          ? "Elige el flujo a iniciar"
          : data.targetFlowId === currentFlowId
            ? "Reinicia este mismo flujo"
            : !target
              ? "El flujo ya no existe"
              : null
      }
    >
      {target ? (
        <p className="text-center font-medium">{target.name}</p>
      ) : (
        <Placeholder>Sin flujo seleccionado</Placeholder>
      )}
      <p className="text-[10px] text-muted-foreground text-center">Continúa en el flujo seleccionado</p>
    </NodeShell>
  );
}
