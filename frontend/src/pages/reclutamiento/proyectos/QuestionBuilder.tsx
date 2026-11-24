import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertCircle,
  AlignLeft,
  ArrowDown,
  ArrowUp,
  CalendarDays,
  CheckSquare,
  ChevronDown,
  CircleDot,
  ClipboardList,
  Copy,
  Eye,
  GripVertical,
  Hash,
  Pencil,
  Plus,
  SlidersHorizontal,
  Sparkles,
  ToggleLeft,
  Trash2,
  Type,
  X,
} from "lucide-react";
import type { QuestionType } from "@/services/reclutamiento";
import { cn } from "@/lib/utils";
import { inputClass, secondaryButton } from "../shared";
import { QuestionFields } from "../portal/QuestionFields";
import type { Answers } from "../portal/answers";
import {
  MAX_OPTIONS,
  MAX_QUESTIONS,
  SCALE_MAX,
  SUGGESTED,
  draftIssues,
  emptyDraft,
  isChoice,
  newKey,
  newQuestionId,
  option,
  toPayload,
  withType,
  type Draft,
} from "./questionDrafts";

const TYPES: Array<{ value: QuestionType; label: string; description: string; icon: ReactNode }> = [
  { value: "short", label: "Respuesta corta", description: "Una línea de texto", icon: <Type className="h-4 w-4" /> },
  { value: "long", label: "Párrafo", description: "Texto largo, hasta 1000 caracteres", icon: <AlignLeft className="h-4 w-4" /> },
  { value: "single", label: "Una opción", description: "Elige una de la lista", icon: <CircleDot className="h-4 w-4" /> },
  { value: "multi", label: "Varias opciones", description: "Marca todas las que apliquen", icon: <CheckSquare className="h-4 w-4" /> },
  { value: "yesno", label: "Sí / No", description: "Dos botones", icon: <ToggleLeft className="h-4 w-4" /> },
  { value: "number", label: "Número", description: "Con rango opcional", icon: <Hash className="h-4 w-4" /> },
  { value: "scale", label: "Escala", description: "Del 1 al 5, del 0 al 10…", icon: <SlidersHorizontal className="h-4 w-4" /> },
  { value: "date", label: "Fecha", description: "Selector de calendario", icon: <CalendarDays className="h-4 w-4" /> },
];
const typeMeta = (t: QuestionType) => TYPES.find((x) => x.value === t)!;

const smallInput =
  "w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200";

interface Props {
  drafts: Draft[];
  /** Admite una función (como setState) para que varios cambios seguidos no se pisen. */
  onChange: (update: (drafts: Draft[]) => Draft[]) => void;
  readOnly: boolean;
  /** Pregunta a abrir desde fuera (p. ej. la primera con errores al guardar). */
  focusKey?: string | null;
}

/**
 * Constructor de preguntas: tarjetas plegables con tipo, opciones editables una
 * a una, validación en vivo, duplicar y reordenar (arrastrando o con flechas),
 * preguntas sugeridas y vista previa tal como la verá quien se registra.
 */
export function QuestionBuilder({ drafts, onChange, readOnly, focusKey }: Props) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [previewAnswers, setPreviewAnswers] = useState<Answers>({});

  useEffect(() => {
    if (!focusKey) return;
    setMode("edit");
    setOpenKey(focusKey);
    requestAnimationFrame(() => document.getElementById(`question-${focusKey}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }, [focusKey]);

  const edit = (key: string, fn: (d: Draft) => Draft) => onChange((list) => list.map((d) => (d.key === key ? fn(d) : d)));
  const add = (d: Draft) => {
    onChange((list) => [...list, d]);
    setOpenKey(d.key);
    requestAnimationFrame(() => {
      document.getElementById(`question-${d.key}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      document.getElementById(`question-${d.key}-label`)?.focus();
    });
  };
  const duplicate = (i: number) => {
    const src = drafts[i];
    const copy: Draft = { ...src, key: newKey(), id: newQuestionId(), label: src.label ? `${src.label} (copia)`.slice(0, 200) : "", options: src.options.map((o) => option(o.text)) };
    onChange((list) => {
      const next = [...list];
      next.splice(i + 1, 0, copy);
      return next;
    });
    setOpenKey(copy.key);
  };
  const move = (from: number, to: number) => {
    if (from < 0 || to < 0 || to >= drafts.length || from === to) return;
    onChange((list) => {
      const next = [...list];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  const previewQuestions = useMemo(() => drafts.map((d) => ({ ...toPayload(d), id: d.key })).filter((q) => q.label), [drafts]);
  const full = drafts.length >= MAX_QUESTIONS;

  return (
    <section aria-label="Preguntas del proyecto" className="rounded-xl border border-border bg-background">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <div>
          <h4 className="text-xs font-semibold text-foreground">Preguntas del proyecto</h4>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {drafts.length} de {MAX_QUESTIONS} · Las respuestas solo las ve tu cuenta.
          </p>
        </div>
        <div role="tablist" aria-label="Modo" className="ml-auto inline-flex rounded-lg border border-border bg-muted/50 p-0.5">
          {(
            [
              { value: "edit", label: "Editar", icon: <Pencil className="h-3 w-3" /> },
              { value: "preview", label: "Vista previa", icon: <Eye className="h-3 w-3" /> },
            ] as const
          ).map((m) => (
            <button
              key={m.value}
              type="button"
              role="tab"
              aria-selected={mode === m.value}
              onClick={() => setMode(m.value)}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
                mode === m.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m.icon}
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {mode === "preview" ? (
        <div className="p-4">
          {previewQuestions.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">Agrega preguntas para ver cómo se verán.</p>
          ) : (
            <div className="mx-auto max-w-md rounded-xl border border-border bg-card p-5 shadow-sm">
              <p className="mb-4 text-[11px] text-muted-foreground">Así lo verá quien se registre (después de sus datos de contacto). Puedes probar las respuestas: no se guardan.</p>
              <QuestionFields questions={previewQuestions} answers={previewAnswers} onChange={(id, v) => setPreviewAnswers((a) => ({ ...a, [id]: v }))} />
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2 p-4">
          <p className="rounded-lg bg-muted/60 px-3 py-2 text-[11px] text-muted-foreground">
            Pregunta solo lo necesario para decidir. No se admiten datos sensibles (salud, religión, origen étnico, orientación sexual, opiniones políticas o sindicales, datos biométricos o antecedentes judiciales).
          </p>

          {drafts.length === 0 && (
            <div className="mx-auto max-w-sm py-6 text-center">
              <ClipboardList className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm font-medium text-foreground">Sin preguntas propias</p>
              <p className="mt-1 text-xs text-muted-foreground">Quien se registre dejará sus datos de contacto y los datos personales elegidos arriba. Agrega preguntas para filtrar a los candidatos.</p>
            </div>
          )}

          {drafts.map((d, i) => (
            <QuestionCard
              key={d.key}
              index={i}
              total={drafts.length}
              draft={d}
              open={openKey === d.key}
              readOnly={readOnly}
              canDuplicate={!full}
              dragging={dragKey === d.key}
              onToggle={() => setOpenKey(openKey === d.key ? null : d.key)}
              onEdit={(fn) => edit(d.key, fn)}
              onDuplicate={() => duplicate(i)}
              onMove={(dir) => move(i, i + dir)}
              onRemove={() => onChange((list) => list.filter((x) => x.key !== d.key))}
              onDragStart={() => setDragKey(d.key)}
              onDragEnter={() => {
                if (!dragKey || dragKey === d.key) return;
                move(
                  drafts.findIndex((x) => x.key === dragKey),
                  i,
                );
              }}
              onDragEnd={() => setDragKey(null)}
            />
          ))}

          {!readOnly && <AddQuestion disabled={full} onAdd={add} />}
          {readOnly && <p className="pt-2 text-center text-[11px] text-muted-foreground">El proyecto terminó: el formulario ya no se puede editar.</p>}
        </div>
      )}
    </section>
  );
}

function QuestionCard({
  index,
  total,
  draft: d,
  open,
  readOnly,
  canDuplicate,
  dragging,
  onToggle,
  onEdit,
  onDuplicate,
  onMove,
  onRemove,
  onDragStart,
  onDragEnter,
  onDragEnd,
}: {
  index: number;
  total: number;
  draft: Draft;
  open: boolean;
  readOnly: boolean;
  canDuplicate: boolean;
  dragging: boolean;
  onToggle: () => void;
  onEdit: (fn: (d: Draft) => Draft) => void;
  onDuplicate: () => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragEnd: () => void;
}) {
  const meta = typeMeta(d.type);
  const issues = draftIssues(d);
  const [handleDown, setHandleDown] = useState(false);
  const set = (patch: Partial<Draft>) => onEdit((x) => ({ ...x, ...patch }));
  const n = index + 1;
  const summary = isChoice(d.type)
    ? `${d.options.filter((o) => o.text.trim()).length} opciones${d.allowOther ? " + Otra" : ""}`
    : d.type === "scale"
      ? `${d.min || 1} a ${d.max || 5}`
      : d.type === "number" && (d.min || d.max)
        ? [d.min && `mín. ${d.min}`, d.max && `máx. ${d.max}`].filter(Boolean).join(" · ")
        : null;

  return (
    <div
      id={`question-${d.key}`}
      draggable={!readOnly && handleDown}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnter={onDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragEnd={() => {
        setHandleDown(false);
        onDragEnd();
      }}
      className={cn(
        "rounded-xl border bg-card transition-shadow",
        open ? "border-brand-300 shadow-sm ring-1 ring-brand-200/60" : "border-border hover:border-brand-200",
        dragging && "opacity-50",
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        {!readOnly && (
          <span
            onMouseDown={() => setHandleDown(true)}
            onMouseUp={() => setHandleDown(false)}
            title="Arrastrar para reordenar"
            className="cursor-grab text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4" />
          </span>
        )}
        <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={`question-${d.key}-body`} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground" title={meta.label}>
            {meta.icon}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-foreground">
              <span className="text-muted-foreground">{n}. </span>
              {d.label.trim() || <span className="font-normal italic text-muted-foreground">Pregunta sin texto</span>}
              {d.required && <span className="text-rose-500"> *</span>}
            </span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {meta.label}
              {summary ? ` · ${summary}` : ""}
              {d.required ? " · Obligatoria" : " · Opcional"}
            </span>
          </span>
          {issues.length > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" title={issues.join(" ")}>
              <AlertCircle className="h-3 w-3" /> Por completar
            </span>
          )}
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>
        {!readOnly && (
          <div className="flex shrink-0 items-center gap-0.5">
            <IconButton label={`Subir la pregunta ${n}`} disabled={index === 0} onClick={() => onMove(-1)}>
              <ArrowUp className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton label={`Bajar la pregunta ${n}`} disabled={index === total - 1} onClick={() => onMove(1)}>
              <ArrowDown className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton label={`Duplicar la pregunta ${n}`} disabled={!canDuplicate} onClick={onDuplicate}>
              <Copy className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton label={`Quitar la pregunta ${n}`} onClick={onRemove} danger>
              <Trash2 className="h-3.5 w-3.5" />
            </IconButton>
          </div>
        )}
      </div>

      {open && (
        <fieldset id={`question-${d.key}-body`} disabled={readOnly} className="space-y-4 border-t border-border px-4 py-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_13rem]">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-foreground">Pregunta</span>
              <input
                id={`question-${d.key}-label`}
                value={d.label}
                maxLength={200}
                onChange={(e) => set({ label: e.target.value })}
                placeholder="¿En qué ciudad vives?"
                className={cn(inputClass, "font-medium")}
              />
            </label>
            <div>
              <span className="mb-1 block text-xs font-medium text-foreground">Tipo de respuesta</span>
              <TypePicker value={d.type} onChange={(type) => onEdit((x) => withType(x, type))} />
            </div>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-foreground">Descripción (opcional)</span>
            <input value={d.help} maxLength={300} onChange={(e) => set({ help: e.target.value })} placeholder="Aclara qué esperas o por qué lo preguntas" className={inputClass} />
          </label>

          {isChoice(d.type) && <OptionsEditor draft={d} onEdit={onEdit} />}

          {(d.type === "short" || d.type === "long" || d.type === "number") && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-foreground">Texto de ejemplo (opcional)</span>
              <input value={d.placeholder} maxLength={100} onChange={(e) => set({ placeholder: e.target.value })} placeholder={d.type === "number" ? "Ej.: 25" : "Ej.: Bogotá"} className={inputClass} />
              <span className="mt-1 block text-[11px] text-muted-foreground">Se muestra en gris dentro del campo vacío.</span>
            </label>
          )}

          {d.type === "number" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-foreground">Mínimo (opcional)</span>
                <input type="number" value={d.min} onChange={(e) => set({ min: e.target.value })} className={inputClass} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-foreground">Máximo (opcional)</span>
                <input type="number" value={d.max} onChange={(e) => set({ max: e.target.value })} className={inputClass} />
              </label>
            </div>
          )}

          {d.type === "scale" && <ScaleEditor draft={d} set={set} />}

          {issues.length > 0 && (
            <ul className="space-y-1 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
              {issues.map((m) => (
                <li key={m} className="flex items-start gap-1.5">
                  <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" /> {m}
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center justify-between border-t border-border pt-3">
            <Switch checked={d.required} onChange={(required) => set({ required })} label="Obligatoria" />
            <span className="text-[11px] text-muted-foreground">{d.required ? "No se puede enviar sin responderla." : "Se puede dejar en blanco."}</span>
          </div>
        </fieldset>
      )}
    </div>
  );
}

/** Opciones una a una: Enter agrega la siguiente, Retroceso en una vacía la quita y pegar varias líneas crea varias. */
function OptionsEditor({ draft: d, onEdit }: { draft: Draft; onEdit: (fn: (d: Draft) => Draft) => void }) {
  const refs = useRef<Record<string, HTMLInputElement | null>>({});
  const [focus, setFocus] = useState<string | null>(null);
  useEffect(() => {
    if (focus) {
      refs.current[focus]?.focus();
      setFocus(null);
    }
  }, [focus, d.options]);
  const filled = d.options.filter((o) => o.text.trim()).length;
  const full = d.options.length >= MAX_OPTIONS;
  const setText = (key: string, text: string) => onEdit((x) => ({ ...x, options: x.options.map((o) => (o.key === key ? { ...o, text } : o)) }));
  const insertAfter = (index: number, texts: string[] = [""]) => {
    const created = texts.slice(0, MAX_OPTIONS - d.options.length).map((t) => option(t));
    if (!created.length) return;
    onEdit((x) => {
      const options = [...x.options];
      options.splice(index + 1, 0, ...created);
      return { ...x, options };
    });
    setFocus(created[created.length - 1].key);
  };
  const remove = (index: number) => {
    const prev = d.options[index - 1] ?? d.options[index + 1];
    onEdit((x) => ({ ...x, options: x.options.filter((_, j) => j !== index) }));
    if (prev) setFocus(prev.key);
  };
  const marker = (i: number) =>
    d.type === "single" ? <span className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-muted-foreground/40" /> : <span className="h-3.5 w-3.5 shrink-0 rounded border-2 border-muted-foreground/40" aria-hidden data-i={i} />;
  const normalized = d.options.map((o) => o.text.trim().toLowerCase());

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">Opciones</span>
        <span className="text-[11px] text-muted-foreground">
          {filled}/{MAX_OPTIONS}
        </span>
      </div>
      <ol className="space-y-1.5">
        {d.options.map((o, i) => {
          const repeated = !!o.text.trim() && normalized.indexOf(o.text.trim().toLowerCase()) !== i;
          return (
            <li key={o.key} className="flex items-center gap-2">
              {marker(i)}
              <input
                ref={(el) => {
                  refs.current[o.key] = el;
                }}
                aria-label={`Opción ${i + 1}`}
                aria-invalid={repeated || undefined}
                value={o.text}
                maxLength={80}
                placeholder={`Opción ${i + 1}`}
                onChange={(e) => setText(o.key, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (!full) insertAfter(i);
                  } else if (e.key === "Backspace" && !o.text && d.options.length > 1) {
                    e.preventDefault();
                    remove(i);
                  }
                }}
                onPaste={(e) => {
                  const lines = e.clipboardData
                    .getData("text")
                    .split(/\r?\n/)
                    .map((l) => l.trim())
                    .filter(Boolean);
                  if (lines.length < 2) return;
                  e.preventDefault();
                  setText(o.key, o.text ? o.text : lines[0]);
                  insertAfter(i, o.text ? lines : lines.slice(1));
                }}
                className={cn(smallInput, repeated && "border-amber-400 focus:border-amber-400 focus:ring-amber-200")}
              />
              <button
                type="button"
                aria-label={`Quitar la opción ${i + 1}`}
                disabled={d.options.length <= 2}
                onClick={() => remove(i)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-rose-500 disabled:opacity-30"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          );
        })}
        {d.allowOther && (
          <li className="flex items-center gap-2">
            {marker(-1)}
            <span className="flex-1 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-sm italic text-muted-foreground">Otra: la persona escribe su respuesta</span>
            <button type="button" aria-label="Quitar la opción «Otra»" onClick={() => onEdit((x) => ({ ...x, allowOther: false }))} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-rose-500">
              <X className="h-3.5 w-3.5" />
            </button>
          </li>
        )}
      </ol>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px]">
        <button type="button" disabled={full} onClick={() => insertAfter(d.options.length - 1)} className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline disabled:opacity-40 dark:text-brand-300">
          <Plus className="h-3 w-3" /> {full ? `Máximo ${MAX_OPTIONS} opciones` : "Agregar opción"}
        </button>
        {!d.allowOther && (
          <button type="button" onClick={() => onEdit((x) => ({ ...x, allowOther: true }))} className="font-medium text-brand-700 hover:underline dark:text-brand-300">
            Agregar «Otra»
          </button>
        )}
        <span className="text-muted-foreground">Enter agrega otra · puedes pegar una lista</span>
      </div>
    </div>
  );
}

function ScaleEditor({ draft: d, set }: { draft: Draft; set: (patch: Partial<Draft>) => void }) {
  const min = Number(d.min || 1);
  const max = Number(d.max || 5);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <PillGroup label="Desde" value={String(min)} options={["0", "1"]} onChange={(v) => set({ min: v })} />
        <PillGroup label="Hasta" value={String(max)} options={Array.from({ length: SCALE_MAX - 1 }, (_, i) => String(i + 2))} onChange={(v) => set({ max: v })} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-foreground">Etiqueta de {min} (opcional)</span>
          <input value={d.minLabel} maxLength={40} onChange={(e) => set({ minLabel: e.target.value })} placeholder="Nada probable" className={inputClass} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-foreground">Etiqueta de {max} (opcional)</span>
          <input value={d.maxLabel} maxLength={40} onChange={(e) => set({ maxLabel: e.target.value })} placeholder="Muy probable" className={inputClass} />
        </label>
      </div>
    </div>
  );
}

function PillGroup({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-foreground">{label}</span>
      <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={value === o}
            onClick={() => onChange(o)}
            className={cn(
              "h-8 min-w-8 rounded-md border px-2 text-xs font-medium transition-colors",
              value === o ? "border-brand-500 bg-brand-600 text-white" : "border-border text-foreground hover:bg-muted",
            )}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Selector de tipo con icono y descripción, en un menú propio. */
function TypePicker({ value, onChange }: { value: QuestionType; onChange: (t: QuestionType) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);
  const meta = typeMeta(value);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        className={cn(inputClass, "flex items-center gap-2 text-left")}
      >
        <span className="text-muted-foreground">{meta.icon}</span>
        <span className="flex-1 truncate">{meta.label}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      {open && (
        <ul role="listbox" aria-label="Tipo de respuesta" className="absolute right-0 z-30 mt-1 w-64 rounded-xl border border-border bg-popover p-1 shadow-lg">
          {TYPES.map((t) => (
            <li key={t.value}>
              <button
                type="button"
                role="option"
                aria-selected={t.value === value}
                onClick={() => {
                  onChange(t.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors",
                  t.value === value ? "bg-brand-50 text-brand-800 dark:bg-brand-700/30 dark:text-brand-100" : "hover:bg-muted",
                )}
              >
                <span className="text-muted-foreground">{t.icon}</span>
                <span>
                  <span className="block text-sm text-foreground">{t.label}</span>
                  <span className="block text-[11px] text-muted-foreground">{t.description}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** «Agregar pregunta»: elige el tipo o parte de una pregunta sugerida. */
function AddQuestion({ disabled, onAdd }: { disabled: boolean; onAdd: (d: Draft) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);
  return (
    <div ref={ref} className="relative pt-1">
      <button type="button" disabled={disabled} onClick={() => setOpen((v) => !v)} aria-expanded={open} className={secondaryButton}>
        <Plus className="h-3.5 w-3.5" /> {disabled ? `Máximo ${MAX_QUESTIONS} preguntas` : "Agregar pregunta"}
        {!disabled && <ChevronDown className="h-3 w-3" />}
      </button>
      {open && (
        <div className="absolute left-0 z-30 mt-1 w-[34rem] max-w-[calc(100vw-3rem)] rounded-xl border border-border bg-popover p-2 shadow-lg">
          <p className="px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Tipo de respuesta</p>
          <div className="grid grid-cols-2 gap-1">
            {TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => {
                  onAdd(emptyDraft(t.value));
                  setOpen(false);
                }}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-muted"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">{t.icon}</span>
                <span>
                  <span className="block text-sm text-foreground">{t.label}</span>
                  <span className="block text-[11px] text-muted-foreground">{t.description}</span>
                </span>
              </button>
            ))}
          </div>
          <p className="mt-2 flex items-center gap-1 border-t border-border px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Sparkles className="h-3 w-3" /> Sugeridas
          </p>
          <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
            {SUGGESTED.map((s) => (
              <button
                key={s.title}
                type="button"
                onClick={() => {
                  onAdd(s.build());
                  setOpen(false);
                }}
                className="truncate rounded-lg px-2.5 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-muted"
              >
                {s.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function IconButton({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn("rounded-md p-1 text-muted-foreground hover:bg-muted disabled:opacity-30", danger ? "hover:text-rose-500" : "hover:text-foreground")}
    >
      {children}
    </button>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-foreground">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn("relative h-5 w-9 rounded-full transition-colors", checked ? "bg-brand-600" : "bg-muted-foreground/30")}
      >
        <span className={cn("absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform", checked && "translate-x-4")} />
      </button>
      {label}
    </label>
  );
}

function useClickOutside(ref: React.RefObject<HTMLElement | null>, onOutside: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onOutside();
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", esc);
    };
  }, [ref, onOutside, active]);
}
