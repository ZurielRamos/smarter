import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { Megaphone, MessageSquarePlus, Plus, Reply, Tag, Trash2, X, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  START_SOURCE_LABELS,
  TRIGGER_LABELS,
  flowsApi,
  type FlowKeywordMatch,
  type FlowTrigger,
  type FlowTriggerOverview,
  type FlowTriggers,
  type FlowTriggerType,
  type InboxOption,
  type LabelOption,
} from "./types";
import { FLOW_CHANNELS } from "./editorContext";
import { FlowSelect } from "./FlowSelect";
import { Toggle } from "./Toggle";
import { CommaListInput } from "./CommaListInput";
import { RuleListEditor } from "./ConditionEditor";
import { WEEKDAYS } from "./conditions";
import { newTrigger, triggerIssue } from "./triggers";
import type { VariableOption } from "./variables";

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  messenger: "Messenger",
  instagram: "Instagram",
  chat: "Chat web",
  evolution: "WhatsApp (Evolution)",
};

const MATCH_LABELS: Record<FlowKeywordMatch, string> = {
  exact: "El mensaje es exactamente la palabra",
  contains: "El mensaje contiene la palabra",
  starts_with: "El mensaje empieza por la palabra",
  regex: "Expresión regular",
};

const TRIGGER_ICONS: Record<FlowTriggerType, ReactNode> = {
  keyword: <Tag className="h-3.5 w-3.5" />,
  new_conversation: <MessageSquarePlus className="h-3.5 w-3.5" />,
  template_reply: <Reply className="h-3.5 w-3.5" />,
  ad_click: <Megaphone className="h-3.5 w-3.5" />,
};

const TRIGGER_HINTS: Record<FlowTriggerType, string> = {
  keyword: "El contacto escribe una palabra o frase.",
  new_conversation: "Primer mensaje de una conversación nueva.",
  template_reply: "El contacto responde a una plantilla de WhatsApp.",
  ad_click: "El contacto llega desde un anuncio Click-to-WhatsApp.",
};

const MAX_TRIGGERS = 20;
const MAX_AUDIENCE_RULES = 10;

const inputClass =
  "w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200";
const labelClass = "block text-[11px] font-medium text-foreground mb-1";
const hintClass = "text-[11px] text-muted-foreground mt-1";

/** Plantilla aprobada de WhatsApp (GET /campaigns/whatsapp/templates). */
interface WaTemplate {
  name: string;
  language: string;
  components: { type: string; buttons?: { type: string; text?: string }[] }[];
}

interface TriggersModalProps {
  open: boolean;
  flowId: string;
  tenantId?: string;
  triggers: FlowTriggers;
  inboxes: InboxOption[];
  labels: LabelOption[];
  variableOptions: VariableOption[];
  onClose: () => void;
  onSave: (t: FlowTriggers) => void;
}

export function TriggersModal({
  open,
  flowId,
  tenantId,
  triggers,
  inboxes,
  labels,
  variableOptions,
  onClose,
  onSave,
}: TriggersModalProps) {
  const [draft, setDraft] = useState<FlowTriggers>(triggers);
  const [overview, setOverview] = useState<FlowTriggerOverview | null>(null);
  const [templates, setTemplates] = useState<WaTemplate[] | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(triggers);
      setAdding(false);
    }
  }, [open, triggers]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Resumen: inicios, flujos que lo llaman y campañas que lo usan.
  useEffect(() => {
    if (!open || !tenantId || !flowId) return;
    flowsApi
      .get<FlowTriggerOverview>(`/conversation-flows/${flowId}/trigger-overview`, { params: { tenantId } })
      .then(({ data }) => setOverview(data))
      .catch(() => setOverview(null));
  }, [open, tenantId, flowId]);

  const eligibleInboxes = inboxes.filter((i) => FLOW_CHANNELS.has(i.channel));
  const waInboxIds = useMemo(
    () =>
      inboxes
        .filter((i) => i.channel === "whatsapp" && (draft.inboxIds.length === 0 || draft.inboxIds.includes(i.id)))
        .map((i) => i.id),
    [inboxes, draft.inboxIds],
  );
  const needsTemplates = draft.items.some((i) => i.type === "template_reply");

  // Plantillas aprobadas de las bandejas de WhatsApp donde aplica el flujo.
  useEffect(() => {
    if (!open || !needsTemplates) return;
    let cancelled = false;
    Promise.all(
      waInboxIds.map((inboxId) =>
        flowsApi
          .get<WaTemplate[]>("/campaigns/whatsapp/templates", { params: { inboxId } })
          .then(({ data }) => data)
          .catch(() => [] as WaTemplate[]),
      ),
    ).then((lists) => {
      if (cancelled) return;
      const byName = new Map<string, WaTemplate>();
      for (const t of lists.flat()) if (!byName.has(t.name)) byName.set(t.name, t);
      setTemplates([...byName.values()].sort((a, b) => a.name.localeCompare(b.name)));
    });
    return () => {
      cancelled = true;
    };
  }, [open, needsTemplates, waInboxIds]);

  if (!open) return null;

  const patch = (p: Partial<FlowTriggers>) => setDraft((d) => ({ ...d, ...p }));
  const patchItem = (id: string, p: Partial<FlowTrigger>) =>
    setDraft((d) => ({ ...d, items: d.items.map((i) => (i.id === id ? { ...i, ...p } : i)) }));
  const removeItem = (id: string) => setDraft((d) => ({ ...d, items: d.items.filter((i) => i.id !== id) }));
  const addItem = (type: FlowTriggerType) => {
    setDraft((d) => ({ ...d, items: [...d.items, newTrigger(type)] }));
    setAdding(false);
  };
  const toggleInbox = (id: string) =>
    patch({ inboxIds: draft.inboxIds.includes(id) ? draft.inboxIds.filter((x) => x !== id) : [...draft.inboxIds, id] });

  const issues = draft.subflowOnly
    ? []
    : [
        ...draft.items.map(triggerIssue),
        draft.schedule && !draft.schedule.days.length ? "Horario sin días" : null,
      ].filter(Boolean);
  const hasNewConversation = draft.items.some((i) => i.type === "new_conversation");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="triggers-title">
      <div className="absolute inset-0 bg-black/40 animate-in fade-in duration-150" onClick={onClose} />
      <div className="relative bg-card text-card-foreground rounded-2xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-brand-600 dark:text-brand-200" />
            <h3 id="triggers-title" className="text-sm font-semibold text-foreground">
              Disparadores del flujo
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          <OverviewStrip overview={overview} />

          <p className="text-xs text-muted-foreground">
            Los disparadores solo funcionan con el flujo <strong>activo</strong>. Un flujo activo también se puede iniciar
            desde otro flujo (nodo <strong>Iniciar flujo</strong>), una campaña (<strong>Flujo al responder</strong>), el
            chat (menú de la conversación → <strong>Iniciar flujo</strong>), una automatización o la API.
          </p>

          <Toggle
            checked={!!draft.subflowOnly}
            onChange={(v) => patch({ subflowOnly: v || undefined })}
            label="Solo como subflujo"
            description="No se inicia solo: únicamente desde otro flujo, una campaña, el chat, una automatización o la API. Los disparadores y reglas de abajo se ignoran."
          />

          {/* Disparadores */}
          <section className={cn("space-y-2", draft.subflowOnly && "opacity-50 pointer-events-none")} aria-disabled={draft.subflowOnly}>
            <SectionTitle title="Cómo se inicia" hint="Basta con que se cumpla uno. Puedes combinar varios." />
            {draft.items.length === 0 && (
              <p className="rounded-lg border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground">
                Sin disparadores: el flujo solo se inicia desde otro flujo o una campaña.
              </p>
            )}
            {draft.items.map((item) => (
              <TriggerCard key={item.id} item={item} onRemove={() => removeItem(item.id)}>
                {item.type === "keyword" && <KeywordFields item={item} onChange={(p) => patchItem(item.id, p)} />}
                {item.type === "new_conversation" && (
                  <p className="text-[11px] text-muted-foreground">
                    Se inicia con el primer mensaje del contacto. Si la bandeja de WhatsApp tiene activa la plantilla de
                    bienvenida, en ese primer mensaje se envía la plantilla en lugar de este flujo. No se inicia si un agente
                    tomó la conversación.
                  </p>
                )}
                {item.type === "template_reply" && (
                  <TemplateReplyFields
                    item={item}
                    templates={templates}
                    hasWhatsApp={waInboxIds.length > 0}
                    onChange={(p) => patchItem(item.id, p)}
                  />
                )}
                {item.type === "ad_click" && <AdFields item={item} onChange={(p) => patchItem(item.id, p)} />}
                {triggerIssue(item) && <p className="text-[11px] text-red-600 dark:text-red-400">{triggerIssue(item)}</p>}
              </TriggerCard>
            ))}
            {adding ? (
              <div className="grid grid-cols-2 gap-2 rounded-xl border border-border p-2">
                {(Object.keys(TRIGGER_LABELS) as FlowTriggerType[]).map((type) => {
                  const taken = type === "new_conversation" && hasNewConversation;
                  return (
                    <button
                      key={type}
                      type="button"
                      disabled={taken}
                      onClick={() => addItem(type)}
                      className="flex items-start gap-2 rounded-lg border border-border px-3 py-2 text-left hover:border-brand-300 hover:bg-brand-50 dark:hover:bg-brand-700/30 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                    >
                      <span className="mt-0.5 text-brand-600 dark:text-brand-200">{TRIGGER_ICONS[type]}</span>
                      <span>
                        <span className="block text-xs font-medium text-foreground">{TRIGGER_LABELS[type]}</span>
                        <span className="block text-[11px] text-muted-foreground">{TRIGGER_HINTS[type]}</span>
                      </span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setAdding(false)}
                  className="col-span-2 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAdding(true)}
                disabled={draft.items.length >= MAX_TRIGGERS}
                className="flex w-full items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-brand-300 text-xs font-medium text-brand-600 dark:text-brand-200 hover:bg-brand-50 dark:hover:bg-brand-700/30 disabled:opacity-40 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> Agregar disparador
              </button>
            )}
          </section>

          {/* Reglas */}
          <section className={cn("space-y-5", draft.subflowOnly && "opacity-50 pointer-events-none")} aria-disabled={draft.subflowOnly}>
            <SectionTitle title="Reglas" hint="Se aplican a todos los disparadores de este flujo." />

            <div>
              <span className={labelClass}>Bandejas</span>
              <p className="text-[11px] text-muted-foreground mb-2">Sin selección, aplica a todas las bandejas de mensajería.</p>
              {eligibleInboxes.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No hay bandejas de mensajería configuradas.</p>
              ) : (
                <div className="grid grid-cols-2 gap-1">
                  {eligibleInboxes.map((i) => {
                    const checked = draft.inboxIds.includes(i.id);
                    return (
                      <label
                        key={i.id}
                        className={cn(
                          "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs cursor-pointer transition-colors",
                          checked ? "border-brand-300 bg-brand-50 dark:bg-brand-700/30 dark:border-brand-600" : "border-border hover:bg-muted",
                        )}
                      >
                        <input type="checkbox" checked={checked} onChange={() => toggleInbox(i.id)} className="accent-brand-600" />
                        <span className="flex-1 truncate text-foreground">{i.name}</span>
                        <span className="text-[10px] text-muted-foreground">{CHANNEL_LABELS[i.channel] || i.channel}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <ScheduleFields value={draft.schedule ?? null} onChange={(schedule) => patch({ schedule })} />

            <div className="space-y-2">
              <Toggle
                checked={!!draft.audience}
                onChange={(v) => patch({ audience: v ? { match: "all", rules: [] } : null })}
                label="Solo para cierta audiencia"
                description="Condiciones sobre el contacto y la conversación: estado, etiquetas, campos del CRM, canal…"
              />
              {draft.audience && (
                <div className="ml-9 rounded-lg border border-border p-2.5">
                  <RuleListEditor
                    match={draft.audience.match}
                    rules={draft.audience.rules}
                    onChange={(audience) => patch({ audience })}
                    max={MAX_AUDIENCE_RULES}
                    options={variableOptions}
                    labels={labels}
                    inboxes={inboxes}
                  />
                </div>
              )}
            </div>

            <FrequencyFields value={draft.frequency ?? null} onChange={(frequency) => patch({ frequency })} />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass} htmlFor="trg-running">
                  Si el contacto está en otro flujo
                </label>
                <FlowSelect
                  id="trg-running"
                  value={draft.ifRunning ?? "interrupt"}
                  onChange={(v) => patch({ ifRunning: v === "skip" ? "skip" : undefined })}
                  options={[
                    { value: "interrupt", label: "Interrumpirlo e iniciar este" },
                    { value: "skip", label: "No iniciar este flujo" },
                  ]}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="trg-priority">
                  Prioridad (0–100)
                </label>
                <input
                  id="trg-priority"
                  type="number"
                  min={0}
                  max={100}
                  value={draft.priority ?? 0}
                  onChange={(e) => {
                    const n = Math.max(0, Math.min(100, Math.floor(Number(e.target.value) || 0)));
                    patch({ priority: n || undefined });
                  }}
                  className={inputClass}
                />
                <p className={hintClass}>Si varios flujos coinciden con el mismo mensaje, gana el de mayor prioridad.</p>
              </div>
            </div>
          </section>

          <VariablesHint />
        </div>

        <div className="px-5 py-3 border-t border-border flex items-center justify-between gap-2">
          <p className="text-[11px] text-red-600 dark:text-red-400">
            {issues.length ? `Hay ${issues.length === 1 ? "un problema" : `${issues.length} problemas`} por corregir` : ""}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={issues.length > 0}
              onClick={() => onSave(draft)}
              className="px-4 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 disabled:opacity-50 text-white text-xs font-medium transition-colors"
            >
              Aplicar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Piezas ───────────────────────────────────────────────────

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-foreground">{title}</h4>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function OverviewStrip({ overview }: { overview: FlowTriggerOverview | null }) {
  if (!overview) return null;
  const starts = Object.entries(overview.starts30d).sort((a, b) => b[1] - a[1]);
  const total = starts.reduce((n, [, c]) => n + c, 0);
  const hasLinks = overview.callers.length > 0 || overview.campaigns.length > 0;
  if (!total && !hasLinks) return null;
  return (
    <div className="rounded-xl border border-border bg-muted/40 px-3 py-2.5 space-y-1.5 text-[11px]">
      <p className="text-foreground">
        <span className="font-medium">{total}</span> {total === 1 ? "inicio" : "inicios"} en los últimos 30 días
        {starts.length > 0 && (
          <span className="text-muted-foreground">
            {" · "}
            {starts.map(([src, n]) => `${START_SOURCE_LABELS[src] ?? src}: ${n}`).join(" · ")}
          </span>
        )}
      </p>
      {overview.callers.length > 0 && (
        <p className="text-muted-foreground">
          Lo inician con <strong>Iniciar flujo</strong>: {overview.callers.map((c) => c.name).join(", ")}
        </p>
      )}
      {overview.campaigns.length > 0 && (
        <p className="text-muted-foreground">
          <strong>Flujo al responder</strong> de las campañas: {overview.campaigns.map((c) => c.name).join(", ")}
        </p>
      )}
    </div>
  );
}

function TriggerCard({ item, onRemove, children }: { item: FlowTrigger; onRemove: () => void; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-background/50">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="text-brand-600 dark:text-brand-200">{TRIGGER_ICONS[item.type]}</span>
        <span className="flex-1 text-xs font-medium text-foreground">{TRIGGER_LABELS[item.type]}</span>
        <button
          type="button"
          aria-label={`Quitar disparador ${TRIGGER_LABELS[item.type]}`}
          onClick={onRemove}
          className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-red-600 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="space-y-2.5 p-3">{children}</div>
    </div>
  );
}

/** Palabras como etiquetas: Enter o coma para agregar. */
function ChipsInput({
  id,
  value,
  onChange,
  placeholder,
  mono,
}: {
  id: string;
  value: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  mono?: boolean;
}) {
  const [text, setText] = useState("");
  const add = () => {
    const v = text.trim().slice(0, 200);
    if (v && !value.some((k) => k.toLowerCase() === v.toLowerCase()) && value.length < 50) onChange([...value, v]);
    setText("");
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || (e.key === "," && !mono)) {
      e.preventDefault();
      add();
    } else if (e.key === "Backspace" && !text && value.length) {
      onChange(value.slice(0, -1));
    }
  };
  return (
    <div className="flex flex-wrap gap-1.5 rounded-lg border border-border bg-background p-1.5 focus-within:border-brand-300 focus-within:ring-1 focus-within:ring-brand-200">
      {value.map((k) => (
        <span
          key={k}
          className={cn(
            "inline-flex items-center gap-1 rounded-full bg-brand-50 dark:bg-brand-700/40 px-2 py-0.5 text-xs text-brand-700 dark:text-brand-100",
            mono && "font-mono",
          )}
        >
          {k}
          <button type="button" aria-label={`Quitar ${k}`} onClick={() => onChange(value.filter((x) => x !== k))} className="hover:text-red-600">
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
        onBlur={add}
        placeholder={value.length ? "" : placeholder}
        className={cn(
          "flex-1 min-w-[120px] bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none px-1",
          mono && "font-mono",
        )}
      />
    </div>
  );
}

function KeywordFields({ item, onChange }: { item: FlowTrigger; onChange: (p: Partial<FlowTrigger>) => void }) {
  const regex = item.matchType === "regex";
  return (
    <>
      <div>
        <label className={labelClass} htmlFor={`${item.id}-kw`}>
          {regex ? "Expresiones regulares" : "Palabras clave"}
        </label>
        <ChipsInput
          id={`${item.id}-kw`}
          value={item.keywords ?? []}
          onChange={(keywords) => onChange({ keywords })}
          placeholder={regex ? "^pedido\\s*#?\\d+$" : "menu, hola, me interesa…"}
          mono={regex}
        />
        <p className={hintClass}>
          Pulsa Enter para agregar. No distingue mayúsculas ni tildes.
          {regex && " Las expresiones se evalúan sobre el mensaje original, sin distinguir mayúsculas."}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass} htmlFor={`${item.id}-match`}>
            Coincidencia
          </label>
          <FlowSelect
            id={`${item.id}-match`}
            value={item.matchType ?? "exact"}
            onChange={(v) => onChange({ matchType: v as FlowKeywordMatch })}
            options={(Object.keys(MATCH_LABELS) as FlowKeywordMatch[]).map((m) => ({ value: m, label: MATCH_LABELS[m] }))}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor={`${item.id}-ex`}>
            No iniciar si contiene
          </label>
          <CommaListInput
            id={`${item.id}-ex`}
            value={item.exclude ?? []}
            onChange={(exclude) => onChange({ exclude: exclude.length ? exclude : undefined })}
            max={50}
            maxLength={100}
            placeholder="no quiero, cancelar"
            className={inputClass}
          />
        </div>
      </div>
    </>
  );
}

function quickReplies(t: WaTemplate | undefined): string[] {
  const out: string[] = [];
  for (const c of t?.components ?? []) {
    if (c.type !== "BUTTONS") continue;
    for (const b of c.buttons ?? []) if (b.type === "QUICK_REPLY" && b.text) out.push(b.text);
  }
  return out;
}

function TemplateReplyFields({
  item,
  templates,
  hasWhatsApp,
  onChange,
}: {
  item: FlowTrigger;
  templates: WaTemplate[] | null;
  hasWhatsApp: boolean;
  onChange: (p: Partial<FlowTrigger>) => void;
}) {
  const selected = templates?.find((t) => t.name === item.templateName);
  const replies = quickReplies(selected);
  const buttons = item.buttons ?? [];
  const toggleButton = (b: string) =>
    onChange({ buttons: buttons.includes(b) ? buttons.filter((x) => x !== b) : [...buttons, b] });
  return (
    <>
      {!hasWhatsApp && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">
          Ninguna de las bandejas seleccionadas es de WhatsApp Cloud: solo ahí se envían plantillas.
        </p>
      )}
      <div>
        <label className={labelClass} htmlFor={`${item.id}-tpl`}>
          Plantilla
        </label>
        <FlowSelect
          id={`${item.id}-tpl`}
          searchable
          value={item.templateName ?? ""}
          onChange={(v) => onChange({ templateName: v || undefined, buttons: [] })}
          placeholder={templates === null ? "Cargando plantillas…" : "Cualquier plantilla"}
          options={[
            { value: "", label: "Cualquier plantilla" },
            ...(item.templateName && !templates?.some((t) => t.name === item.templateName)
              ? [{ value: item.templateName, label: item.templateName, hint: "no encontrada" }]
              : []),
            ...(templates ?? []).map((t) => ({ value: t.name, label: t.name, hint: t.language })),
          ]}
        />
        <p className={hintClass}>
          Sirve igual si la plantilla la envió una campaña, un agente, una automatización o la bienvenida.
        </p>
      </div>
      <div>
        <span className={labelClass}>Botones que inician el flujo</span>
        {selected && replies.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {replies.map((b) => {
              const on = buttons.some((x) => x.toLowerCase() === b.toLowerCase());
              return (
                <button
                  key={b}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleButton(b)}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                    on
                      ? "border-brand-300 bg-brand-50 text-brand-700 dark:bg-brand-700/40 dark:text-brand-100"
                      : "border-border text-muted-foreground hover:bg-muted",
                  )}
                >
                  {b}
                </button>
              );
            })}
          </div>
        ) : (
          <CommaListInput
            value={buttons}
            onChange={(v) => onChange({ buttons: v })}
            max={10}
            maxLength={25}
            placeholder="Me interesa, Quiero más info"
            className={inputClass}
            aria-label="Títulos de botón"
          />
        )}
        <p className={hintClass}>
          {selected && replies.length === 0
            ? "Esta plantilla no tiene botones de respuesta rápida."
            : "Sin selección, cualquier botón inicia el flujo."}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 items-start">
        <Toggle
          checked={!!item.anyReply}
          onChange={(v) => onChange({ anyReply: v || undefined })}
          label="También si responde con texto"
          description="Su primera respuesta después de la plantilla, aunque no pulse un botón."
        />
        <div>
          <label className={labelClass} htmlFor={`${item.id}-hours`}>
            La respuesta cuenta durante
          </label>
          <div className="flex items-center gap-1.5">
            <input
              id={`${item.id}-hours`}
              type="number"
              min={1}
              max={720}
              value={item.withinHours ?? 72}
              onChange={(e) => onChange({ withinHours: Math.max(1, Math.min(720, Math.floor(Number(e.target.value) || 1))) })}
              className={cn(inputClass, "w-20")}
            />
            <span className="text-xs text-muted-foreground">horas desde el envío</span>
          </div>
        </div>
      </div>
    </>
  );
}

function AdFields({ item, onChange }: { item: FlowTrigger; onChange: (p: Partial<FlowTrigger>) => void }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass} htmlFor={`${item.id}-ads`}>
            Ids de anuncio (opcional)
          </label>
          <CommaListInput
            id={`${item.id}-ads`}
            value={item.adIds ?? []}
            onChange={(adIds) => onChange({ adIds })}
            max={50}
            maxLength={64}
            placeholder="120210000000000"
            className={cn(inputClass, "font-mono")}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor={`${item.id}-head`}>
            El titular contiene (opcional)
          </label>
          <input
            id={`${item.id}-head`}
            value={item.headlineContains ?? ""}
            onChange={(e) => onChange({ headlineContains: e.target.value.slice(0, 200) || undefined })}
            placeholder="Promo de verano"
            className={inputClass}
          />
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Sin filtros, cualquier anuncio Click-to-WhatsApp inicia el flujo. El id es el del anuncio en el Administrador de
        anuncios de Meta. Solo WhatsApp Cloud informa el anuncio de origen.
      </p>
    </>
  );
}

function ScheduleFields({
  value,
  onChange,
}: {
  value: FlowTriggers["schedule"] | null;
  onChange: (v: FlowTriggers["schedule"] | null) => void;
}) {
  const days = new Set(value?.days ?? []);
  const toggleDay = (d: number) => {
    if (!value) return;
    const next = new Set(days);
    if (next.has(d)) next.delete(d);
    else next.add(d);
    onChange({ ...value, days: [...next].sort() });
  };
  return (
    <div className="space-y-2">
      <Toggle
        checked={!!value}
        onChange={(v) => onChange(v ? { mode: "inside", days: [1, 2, 3, 4, 5], from: "08:00", to: "18:00" } : null)}
        label="Limitar por horario"
        description="Hora de Colombia (America/Bogota), la misma de las condiciones."
      />
      {value && (
        <div className="ml-9 space-y-2 rounded-lg border border-border p-2.5">
          <FlowSelect
            compact
            aria-label="Modo del horario"
            value={value.mode}
            onChange={(v) => onChange({ ...value, mode: v === "outside" ? "outside" : "inside" })}
            options={[
              { value: "inside", label: "Solo dentro de este horario" },
              { value: "outside", label: "Solo fuera de este horario" },
            ]}
          />
          <div className="flex flex-wrap gap-1">
            {WEEKDAYS.map((d) => {
              const on = days.has(Number(d.value));
              return (
                <button
                  key={d.value}
                  type="button"
                  aria-pressed={on}
                  aria-label={d.label}
                  onClick={() => toggleDay(Number(d.value))}
                  className={cn(
                    "rounded-md border px-2 py-0.5 text-[11px] transition-colors",
                    on
                      ? "border-brand-300 bg-brand-50 text-brand-700 dark:bg-brand-700/40 dark:text-brand-100"
                      : "border-border text-muted-foreground hover:bg-muted",
                  )}
                >
                  {d.short}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            de
            <input
              type="time"
              aria-label="Desde"
              value={value.from}
              onChange={(e) => onChange({ ...value, from: e.target.value })}
              className={cn(inputClass, "w-28")}
            />
            a
            <input
              type="time"
              aria-label="Hasta"
              value={value.to}
              onChange={(e) => onChange({ ...value, to: e.target.value })}
              className={cn(inputClass, "w-28")}
            />
          </div>
          {days.size === 0 && <p className="text-[11px] text-red-600 dark:text-red-400">Elige al menos un día.</p>}
          {value.from > value.to && (
            <p className={hintClass}>Cruza la medianoche: cuenta desde el día en que empieza.</p>
          )}
        </div>
      )}
    </div>
  );
}

function FrequencyFields({
  value,
  onChange,
}: {
  value: FlowTriggers["frequency"] | null;
  onChange: (v: FlowTriggers["frequency"] | null) => void;
}) {
  const mode = value?.mode ?? "always";
  return (
    <div>
      <label className={labelClass} htmlFor="trg-freq">
        Frecuencia por contacto
      </label>
      <div className="flex items-center gap-2">
        <FlowSelect
          id="trg-freq"
          className="w-64"
          value={mode}
          onChange={(v) =>
            onChange(
              v === "once" ? { mode: "once" } : v === "cooldown" ? { mode: "cooldown", after: 1, unit: "days" } : null,
            )
          }
          options={[
            { value: "always", label: "Cada vez que se cumpla un disparador" },
            { value: "once", label: "Una sola vez" },
            { value: "cooldown", label: "Como máximo una vez cada…" },
          ]}
        />
        {value?.mode === "cooldown" && (
          <>
            <input
              type="number"
              min={1}
              aria-label="Cantidad"
              value={value.after ?? 1}
              onChange={(e) => onChange({ ...value, after: Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
              className={cn(inputClass, "w-20")}
            />
            <FlowSelect
              compact
              className="w-24"
              aria-label="Unidad"
              value={value.unit ?? "days"}
              onChange={(v) => onChange({ ...value, unit: v === "hours" ? "hours" : "days" })}
              options={[
                { value: "hours", label: "horas" },
                { value: "days", label: "días" },
              ]}
            />
          </>
        )}
      </div>
      <p className={hintClass}>
        Se cuenta por contacto del CRM (o por conversación si no tiene). Los inicios desde otro flujo o una campaña no se
        limitan.
      </p>
    </div>
  );
}

function VariablesHint() {
  return (
    <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
      En el flujo puedes usar{" "}
      {["trigger_type", "trigger_keyword", "template_name", "template_button", "campaign_name", "ad_headline"].map((v, i) => (
        <span key={v}>
          {i > 0 && ", "}
          <code className="font-mono text-foreground">{`{{${v}}}`}</code>
        </span>
      ))}{" "}
      para saber cómo se inició.
    </div>
  );
}
