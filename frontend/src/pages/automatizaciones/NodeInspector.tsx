import { useRef, useState } from "react";
import { Braces, Copy, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { ConfirmModal } from "@/components/ConfirmModal";
import { cn } from "@/lib/utils";
import type { AutomationNode, AutomationNodeData } from "@/services/automatizaciones";
import { CONDITION_OPERATORS, CRON_PRESETS, NODE_BY_TYPE, type FieldWithShow } from "./nodeCatalog";
import { useEditor } from "./editorContext";

const inputClass =
  "w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200";

const labelClass = "block text-[11px] font-medium text-foreground mb-1";

// ─── Selector de variables ─────────────────────────────────────

function useVariableOptions(currentId: string) {
  const { nodes } = useEditor();
  const opts: { group: string; label: string; value: string }[] = [
    { group: "Disparador", label: "Cuerpo (body)", value: "{{trigger.body}}" },
    { group: "Disparador", label: "Query params", value: "{{trigger.query}}" },
    { group: "Disparador", label: "Datos completos", value: "{{trigger}}" },
    { group: "Evento del CRM", label: "Contacto: nombre", value: "{{trigger.contact.firstName}}" },
    { group: "Evento del CRM", label: "Contacto: teléfono", value: "{{trigger.contact.phone}}" },
    { group: "Evento del CRM", label: "Contacto: email", value: "{{trigger.contact.email}}" },
    { group: "Evento del CRM", label: "Contacto: id", value: "{{trigger.contact.id}}" },
    { group: "Evento del CRM", label: "Mensaje: texto", value: "{{trigger.content}}" },
    { group: "Evento del CRM", label: "Conversación: id", value: "{{trigger.conversationId}}" },
    { group: "Bucle", label: "Elemento actual", value: "{{vars.item}}" },
    { group: "Bucle", label: "Índice", value: "{{vars.index}}" },
    { group: "Sistema", label: "Fecha/hora actual (ISO)", value: "{{now}}" },
  ];
  for (const n of nodes) {
    if (n.id === currentId || n.type.startsWith("trigger_")) continue;
    const name = (n.data.label as string) || NODE_BY_TYPE[n.type]?.label || n.type;
    opts.push({ group: "Resultados de nodos", label: `${name} → salida`, value: `{{steps.${n.id}.output}}` });
  }
  return opts;
}

function VariablePicker({ nodeId, onPick }: { nodeId: string; onPick: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const options = useVariableOptions(nodeId);
  const groups = [...new Set(options.map((o) => o.group))];
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Insertar variable"
        aria-label="Insertar variable"
        aria-expanded={open}
        className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      >
        <Braces className="h-3.5 w-3.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 max-h-64 w-64 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
            {groups.map((g) => (
              <div key={g}>
                <p className="px-2 pt-1.5 pb-0.5 text-[9px] font-semibold uppercase text-muted-foreground">{g}</p>
                {options
                  .filter((o) => o.group === g)
                  .map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => {
                        onPick(o.value);
                        setOpen(false);
                      }}
                      className="flex w-full flex-col rounded-md px-2 py-1 text-left hover:bg-muted"
                    >
                      <span className="text-xs text-foreground">{o.label}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">{o.value}</span>
                    </button>
                  ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Campo de texto con botón para insertar {{variables}} en la posición del cursor. */
function ExprField({
  nodeId,
  value,
  onChange,
  multiline,
  rows,
  mono,
  placeholder,
  id,
}: {
  nodeId: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  rows?: number;
  mono?: boolean;
  placeholder?: string;
  id?: string;
}) {
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const insert = (token: string) => {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    onChange(value.slice(0, start) + token + value.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };
  return (
    <div className="relative">
      {multiline ? (
        <textarea
          id={id}
          ref={ref}
          rows={rows ?? 4}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={cn(inputClass, "resize-y pr-8", mono && "font-mono")}
        />
      ) : (
        <input
          id={id}
          ref={ref}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={cn(inputClass, "pr-8", mono && "font-mono")}
        />
      )}
      <div className="absolute right-1 top-1">
        <VariablePicker nodeId={nodeId} onPick={insert} />
      </div>
    </div>
  );
}

// ─── Editores de campos compuestos ─────────────────────────────

function KeyValueEditor({
  nodeId,
  value,
  onChange,
  keyPlaceholder,
  valuePlaceholder,
}: {
  nodeId: string;
  value: { key: string; value: string }[];
  onChange: (v: { key: string; value: string }[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      {value.map((row, i) => (
        <div key={i} className="flex items-start gap-1.5">
          <input
            aria-label="Nombre"
            value={row.key}
            placeholder={keyPlaceholder ?? "clave"}
            onChange={(e) => onChange(value.map((r, j) => (j === i ? { ...r, key: e.target.value } : r)))}
            className={cn(inputClass, "w-2/5")}
          />
          <div className="flex-1">
            <ExprField
              nodeId={nodeId}
              value={row.value}
              placeholder={valuePlaceholder ?? "valor"}
              onChange={(v) => onChange(value.map((r, j) => (j === i ? { ...r, value: v } : r)))}
            />
          </div>
          <button
            type="button"
            aria-label="Quitar fila"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
            className="mt-1 p-1 rounded-md text-muted-foreground hover:text-rose-500 hover:bg-muted"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...value, { key: "", value: "" }])}
        className="flex items-center gap-1 text-[11px] font-medium text-brand-700 hover:underline"
      >
        <Plus className="h-3 w-3" /> Agregar
      </button>
    </div>
  );
}

interface Assignment {
  name: string;
  value: string;
  type?: string;
}

function AssignmentsEditor({ nodeId, value, onChange }: { nodeId: string; value: Assignment[]; onChange: (v: Assignment[]) => void }) {
  return (
    <div className="space-y-2">
      {value.map((a, i) => (
        <div key={i} className="rounded-lg border border-border p-2 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <input
              aria-label="Nombre de la variable"
              value={a.name}
              placeholder="nombre"
              onChange={(e) => onChange(value.map((r, j) => (j === i ? { ...r, name: e.target.value.replace(/[^\w]/g, "_") } : r)))}
              className={cn(inputClass, "flex-1 font-mono")}
            />
            <select
              aria-label="Tipo"
              value={a.type || "string"}
              onChange={(e) => onChange(value.map((r, j) => (j === i ? { ...r, type: e.target.value } : r)))}
              className={cn(inputClass, "w-24")}
            >
              <option value="string">Texto</option>
              <option value="number">Número</option>
              <option value="boolean">Booleano</option>
              <option value="json">JSON</option>
            </select>
            <button
              type="button"
              aria-label="Quitar variable"
              onClick={() => onChange(value.filter((_, j) => j !== i))}
              className="p-1 rounded-md text-muted-foreground hover:text-rose-500 hover:bg-muted"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <ExprField
            nodeId={nodeId}
            value={a.value}
            placeholder="Valor o {{expresión}}"
            onChange={(v) => onChange(value.map((r, j) => (j === i ? { ...r, value: v } : r)))}
          />
          {a.name && <p className="font-mono text-[10px] text-muted-foreground">{`{{vars.${a.name}}}`}</p>}
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...value, { name: "", value: "", type: "string" }])}
        className="flex items-center gap-1 text-[11px] font-medium text-brand-700 hover:underline"
      >
        <Plus className="h-3 w-3" /> Agregar variable
      </button>
    </div>
  );
}

interface Rule {
  left: string;
  operator: string;
  right?: string;
}
interface Branch {
  id: string;
  label?: string;
  match: "all" | "any";
  rules: Rule[];
}

function BranchesEditor({ nodeId, value, onChange }: { nodeId: string; value: Branch[]; onChange: (v: Branch[]) => void }) {
  const patch = (i: number, p: Partial<Branch>) => onChange(value.map((b, j) => (j === i ? { ...b, ...p } : b)));
  return (
    <div className="space-y-3">
      {value.map((b, i) => (
        <div key={b.id} className="rounded-lg border border-border p-2.5 space-y-2">
          <div className="flex items-center gap-1.5">
            <input
              aria-label="Nombre de la rama"
              value={b.label ?? ""}
              placeholder={`Rama ${i + 1}`}
              onChange={(e) => patch(i, { label: e.target.value })}
              className={cn(inputClass, "flex-1 font-medium")}
            />
            <select
              aria-label="Modo de coincidencia"
              value={b.match}
              onChange={(e) => patch(i, { match: e.target.value as "all" | "any" })}
              className={cn(inputClass, "w-24")}
            >
              <option value="all">Todas</option>
              <option value="any">Alguna</option>
            </select>
            <button
              type="button"
              aria-label="Quitar rama"
              onClick={() => onChange(value.filter((_, j) => j !== i))}
              className="p-1 rounded-md text-muted-foreground hover:text-rose-500 hover:bg-muted"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          {b.rules.map((r, k) => {
            const unary = CONDITION_OPERATORS.find((o) => o.value === r.operator)?.unary;
            const setRule = (p: Partial<Rule>) => patch(i, { rules: b.rules.map((x, y) => (y === k ? { ...x, ...p } : x)) });
            return (
              <div key={k} className="space-y-1 rounded-md bg-muted/40 p-1.5">
                <ExprField nodeId={nodeId} value={r.left} placeholder="{{trigger.body.estado}}" onChange={(v) => setRule({ left: v })} />
                <div className="flex items-center gap-1.5">
                  <select
                    aria-label="Operador"
                    value={r.operator}
                    onChange={(e) => setRule({ operator: e.target.value })}
                    className={cn(inputClass, "flex-1")}
                  >
                    {CONDITION_OPERATORS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  {b.rules.length > 1 && (
                    <button
                      type="button"
                      aria-label="Quitar regla"
                      onClick={() => patch(i, { rules: b.rules.filter((_, y) => y !== k) })}
                      className="p-1 rounded-md text-muted-foreground hover:text-rose-500"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {!unary && <ExprField nodeId={nodeId} value={r.right ?? ""} placeholder="Valor" onChange={(v) => setRule({ right: v })} />}
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => patch(i, { rules: [...b.rules, { left: "", operator: "equals", right: "" }] })}
            className="flex items-center gap-1 text-[11px] font-medium text-brand-700 hover:underline"
          >
            <Plus className="h-3 w-3" /> Agregar regla
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          onChange([
            ...value,
            { id: `b${Math.random().toString(36).slice(2, 8)}`, match: "all", rules: [{ left: "", operator: "equals", right: "" }] },
          ])
        }
        className="flex items-center gap-1 text-[11px] font-medium text-brand-700 hover:underline"
      >
        <Plus className="h-3 w-3" /> Agregar rama
      </button>
      <p className="text-[10px] text-muted-foreground">Se evalúan en orden; gana la primera que se cumple. Si ninguna, sigue la salida «Si no».</p>
    </div>
  );
}

function CronEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="*/15 * * * *" className={cn(inputClass, "font-mono")} />
      <div className="flex flex-wrap gap-1">
        {CRON_PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => onChange(p.value)}
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px] transition-colors",
              value === p.value ? "border-brand-400 bg-brand-50 text-brand-700 dark:bg-brand-700/40" : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground">Formato: minuto hora día-mes mes día-semana. Usa la zona horaria de la automatización.</p>
    </div>
  );
}

function WebhookInfo() {
  const { webhookToken, onRotateWebhook } = useEditor();
  const [confirm, setConfirm] = useState(false);
  const base = (import.meta.env.VITE_API_URL as string | undefined) || "/api";
  const origin = base.startsWith("http") ? base : `${window.location.origin}${base}`;
  const url = `${origin}/automatizaciones/hooks/${webhookToken}`;
  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast.success("Copiado");
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <input readOnly value={url} aria-label="URL del webhook" className={cn(inputClass, "font-mono text-[10px]")} onFocus={(e) => e.currentTarget.select()} />
        <button type="button" aria-label="Copiar URL" onClick={() => copy(url)} className="p-1.5 rounded-md border border-border hover:bg-muted text-muted-foreground">
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button type="button" aria-label="Regenerar URL" onClick={() => setConfirm(true)} className="p-1.5 rounded-md border border-border hover:bg-muted text-muted-foreground">
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Solo responde si la automatización está activa. Añade <span className="font-mono">?wait=1</span> para esperar el resultado en la respuesta.
      </p>
      <ConfirmModal
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          await onRotateWebhook();
          setConfirm(false);
        }}
        title="Regenerar URL del webhook"
        description="La URL actual dejará de funcionar de inmediato. Tendrás que actualizarla en los sistemas que la usan."
        confirmLabel="Regenerar"
        variant="warning"
      />
    </div>
  );
}

// ─── Inspector ─────────────────────────────────────────────────

interface Props {
  node: AutomationNode;
  onChange: (id: string, data: AutomationNodeData) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function NodeInspector({ node, onChange, onDelete, onClose }: Props) {
  const def = NODE_BY_TYPE[node.type];
  const { connections, inboxes } = useEditor();
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (!def) return null;
  const d = node.data;
  const set = (key: string, value: unknown) => onChange(node.id, { ...d, [key]: value });
  const Icon = def.icon;

  const renderField = (f: FieldWithShow) => {
    if (f.showWhen && !f.showWhen(d)) return null;
    const id = `f-${node.id}-${f.key}`;
    const val = d[f.key];
    const help = "help" in f && f.help ? <p className="mt-1 text-[10px] text-muted-foreground">{f.help}</p> : null;

    switch (f.kind) {
      case "text":
        return (
          <div key={f.key}>
            <label htmlFor={id} className={labelClass}>{f.label}</label>
            <ExprField id={id} nodeId={node.id} value={(val as string) ?? ""} placeholder={f.placeholder} onChange={(v) => set(f.key, v)} />
            {help}
          </div>
        );
      case "textarea":
        return (
          <div key={f.key}>
            <label htmlFor={id} className={labelClass}>{f.label}</label>
            <ExprField id={id} multiline rows={f.rows} mono={f.mono} nodeId={node.id} value={(val as string) ?? ""} placeholder={f.placeholder} onChange={(v) => set(f.key, v)} />
            {help}
          </div>
        );
      case "number":
        return (
          <div key={f.key}>
            <label htmlFor={id} className={labelClass}>{f.label}</label>
            <input
              id={id}
              type="number"
              min={f.min}
              max={f.max}
              step="any"
              value={(val as number | undefined) ?? ""}
              onChange={(e) => set(f.key, e.target.value === "" ? undefined : Number(e.target.value))}
              className={inputClass}
            />
            {help}
          </div>
        );
      case "select":
        return (
          <div key={f.key}>
            <label htmlFor={id} className={labelClass}>{f.label}</label>
            <select id={id} value={(val as string) ?? f.options[0].value} onChange={(e) => set(f.key, e.target.value)} className={inputClass}>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {help}
          </div>
        );
      case "toggle":
        return (
          <div key={f.key}>
            <label className="flex items-center gap-2 text-[11px] font-medium text-foreground cursor-pointer">
              <input type="checkbox" checked={val === undefined ? false : !!val} onChange={(e) => set(f.key, e.target.checked)} className="accent-brand-600" />
              {f.label}
            </label>
            {help}
          </div>
        );
      case "keyvalue":
        return (
          <div key={f.key}>
            <span className={labelClass}>{f.label}</span>
            <KeyValueEditor
              nodeId={node.id}
              value={(Array.isArray(val) ? val : []) as { key: string; value: string }[]}
              onChange={(v) => set(f.key, v)}
              keyPlaceholder={f.keyPlaceholder}
              valuePlaceholder={f.valuePlaceholder}
            />
          </div>
        );
      case "connection": {
        const options = connections.filter((c) => f.types.includes(c.type));
        return (
          <div key={f.key}>
            <label htmlFor={id} className={labelClass}>{f.label}</label>
            <select id={id} value={(val as string) ?? ""} onChange={(e) => set(f.key, e.target.value || undefined)} className={inputClass}>
              <option value="">{f.optional ? "Ninguna" : "Selecciona una conexión…"}</option>
              {options.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {options.length === 0 && (
              <a href="conexiones" target="_blank" rel="noreferrer" className="mt-1 inline-block text-[10px] text-brand-700 hover:underline">
                Crear una conexión compatible
              </a>
            )}
          </div>
        );
      }
      case "inbox":
        return (
          <div key={f.key}>
            <label htmlFor={id} className={labelClass}>{f.label}</label>
            <select id={id} value={(val as string) ?? ""} onChange={(e) => set(f.key, e.target.value || undefined)} className={inputClass}>
              <option value="">{f.optional ? "Todos los canales" : "Selecciona un canal…"}</option>
              {inboxes.map((i) => (
                <option key={i.id} value={i.id}>{i.name} · {i.channel}</option>
              ))}
            </select>
            {help}
          </div>
        );
      case "cron":
        return (
          <div key={f.key}>
            <span className={labelClass}>{f.label}</span>
            <CronEditor value={(val as string) ?? ""} onChange={(v) => set(f.key, v)} />
          </div>
        );
      case "assignments":
        return (
          <div key={f.key}>
            <span className={labelClass}>{f.label}</span>
            <AssignmentsEditor nodeId={node.id} value={(Array.isArray(val) ? val : []) as Assignment[]} onChange={(v) => set(f.key, v)} />
          </div>
        );
      case "branches":
        return (
          <div key={f.key}>
            <span className={labelClass}>{f.label}</span>
            <BranchesEditor nodeId={node.id} value={(Array.isArray(val) ? val : []) as Branch[]} onChange={(v) => set(f.key, v)} />
          </div>
        );
      case "webhookInfo":
        return (
          <div key={f.key}>
            <span className={labelClass}>{f.label}</span>
            <WebhookInfo />
          </div>
        );
    }
  };

  const isTrigger = def.category === "trigger";

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-border bg-card" aria-label="Configuración del nodo">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg text-white", def.accent)}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-foreground">{def.label}</p>
          <p className="truncate text-[10px] text-muted-foreground">ID: {node.id}</p>
        </div>
        <button type="button" aria-label="Cerrar panel" onClick={onClose} className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-3.5 overflow-y-auto px-3 py-3">
        <div>
          <label htmlFor={`label-${node.id}`} className={labelClass}>Nombre del nodo</label>
          <input id={`label-${node.id}`} value={(d.label as string) ?? ""} onChange={(e) => set("label", e.target.value)} className={inputClass} />
        </div>

        {def.fields.map(renderField)}

        {!isTrigger && def.outputs !== "none" && def.outputs !== "loop" && (
          <details className="rounded-lg border border-border">
            <summary className="cursor-pointer px-2.5 py-2 text-[11px] font-medium text-foreground">Manejo de errores</summary>
            <div className="space-y-2.5 border-t border-border p-2.5">
              <div>
                <label htmlFor={`onerr-${node.id}`} className={labelClass}>Si el nodo falla</label>
                <select id={`onerr-${node.id}`} value={d.onError ?? "stop"} onChange={(e) => set("onError", e.target.value)} className={inputClass}>
                  <option value="stop">Detener la ejecución</option>
                  <option value="continue">Continuar por la salida «Si falla»</option>
                </select>
              </div>
              <div>
                <label htmlFor={`retries-${node.id}`} className={labelClass}>Reintentos</label>
                <input
                  id={`retries-${node.id}`}
                  type="number"
                  min={0}
                  max={5}
                  value={d.retries ?? 0}
                  onChange={(e) => set("retries", Math.min(5, Math.max(0, Number(e.target.value) || 0)))}
                  className={inputClass}
                />
              </div>
            </div>
          </details>
        )}

        <div>
          <label htmlFor={`notes-${node.id}`} className={labelClass}>Notas</label>
          <textarea id={`notes-${node.id}`} rows={2} value={(d.notes as string) ?? ""} onChange={(e) => set("notes", e.target.value)} className={cn(inputClass, "resize-y")} />
        </div>
      </div>

      <div className="border-t border-border p-3">
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          disabled={isTrigger}
          title={isTrigger ? "Para cambiar el disparador, arrastra otro desde la paleta" : undefined}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-rose-900 dark:hover:bg-rose-950/40"
        >
          <Trash2 className="h-3.5 w-3.5" /> Eliminar nodo
        </button>
      </div>

      <ConfirmModal
        open={confirmDelete && !isTrigger}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          onDelete(node.id);
          setConfirmDelete(false);
        }}
        title="Eliminar nodo"
        description={`Se eliminará «${d.label || def.label}» y sus conexiones.`}
        confirmLabel="Eliminar"
        variant="danger"
      />
    </aside>
  );
}
