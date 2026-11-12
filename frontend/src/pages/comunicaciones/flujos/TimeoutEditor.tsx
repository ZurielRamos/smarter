import { useId, useState } from "react";
import { ChevronDown, Clock, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { NumberField } from "@/components/ui/number-field";
import { FlowSelect } from "./FlowSelect";
import { Toggle } from "./Toggle";
import { VariableInput, VariableTextarea } from "./VariableField";
import { MAX_REMINDERS, MAX_TEMPLATE_PARAMS, timeoutIssue } from "./timeout";
import type {
  FlowNodeData,
  FlowNodeType,
  FlowTimeUnit,
  FlowTimeoutConfig,
  FlowTimeoutReminder,
  FlowTimeoutTemplate,
} from "./types";

const smallInput =
  "w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200";
const labelClass = "block text-xs font-medium text-foreground mb-1";
const hintClass = "text-[11px] text-muted-foreground mt-1";

const UNIT_OPTIONS: { value: FlowTimeUnit; label: string }[] = [
  { value: "minutes", label: "minutos" },
  { value: "hours", label: "horas" },
  { value: "days", label: "días" },
];

const DEFAULT_CONFIG: FlowTimeoutConfig = { enabled: true, after: 30, unit: "minutes" };

interface Props {
  nodeType: FlowNodeType;
  data: FlowNodeData;
  set: (p: Partial<FlowNodeData>) => void;
}

/** «Si no responde»: recordatorios y salida «Sin respuesta» de un nodo que espera. */
export function TimeoutEditor({ nodeType, data, set }: Props) {
  const t = data.timeout;
  const enabled = !!t?.enabled;
  const cfg: FlowTimeoutConfig = t ?? { ...DEFAULT_CONFIG, enabled: false };
  const setCfg = (patch: Partial<FlowTimeoutConfig>) => set({ timeout: { ...cfg, ...patch } });
  const reminders = cfg.reminders ?? [];
  const setReminder = (i: number, patch: Partial<FlowTimeoutReminder>) =>
    setCfg({ reminders: reminders.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const issue = timeoutIssue(t);
  const repeatLabel =
    nodeType === "message"
      ? "Repetir las opciones con el recordatorio"
      : nodeType === "user_input"
        ? "Repetir la pregunta con el recordatorio"
        : null;

  return (
    <fieldset className="rounded-lg border border-border p-2.5 space-y-3">
      <legend className="flex items-center gap-1 px-1 text-xs font-medium text-foreground">
        <Clock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        Si no responde
      </legend>
      <Toggle
        checked={enabled}
        onChange={(v) => set({ timeout: v ? { ...DEFAULT_CONFIG, ...t, enabled: true } : t ? { ...t, enabled: false } : undefined })}
        label="Seguir por «Sin respuesta» si no responde a tiempo"
        description="Puedes enviar recordatorios antes. Si responde, todo se cancela y el plazo vuelve a empezar en el siguiente paso."
      />

      {enabled && (
        <>
          <DurationField
            label="Plazo"
            amount={cfg.after}
            unit={cfg.unit}
            onChange={(after, unit) => setCfg({ after, unit })}
          />
          <p className={hintClass}>
            Cuenta desde que el flujo empieza a esperar en este paso. Entre 1 minuto y 30 días.
          </p>

          <div className="space-y-2">
            <span className={labelClass}>Recordatorios antes del plazo</span>
            {reminders.map((r, i) => (
              <ReminderCard
                key={i}
                index={i}
                reminder={r}
                repeatLabel={repeatLabel}
                onChange={(patch) => setReminder(i, patch)}
                onDelete={() => setCfg({ reminders: reminders.filter((_, j) => j !== i) })}
              />
            ))}
            <button
              type="button"
              onClick={() =>
                setCfg({
                  reminders: [
                    ...reminders,
                    {
                      after: reminders.length ? reminders[reminders.length - 1].after * 2 : 10,
                      unit: reminders.length ? reminders[reminders.length - 1].unit : "minutes",
                      message: reminders.length ? "" : "¿Sigues ahí? 🙂",
                      repeatOptions: repeatLabel ? true : undefined,
                    },
                  ],
                })
              }
              disabled={reminders.length >= MAX_REMINDERS}
              className="flex items-center gap-1 text-[11px] font-medium text-brand-700 hover:underline disabled:opacity-40 dark:text-brand-300"
            >
              <Plus className="h-3 w-3" />
              {reminders.length >= MAX_REMINDERS ? `Máximo ${MAX_REMINDERS} recordatorios` : "Agregar recordatorio"}
            </button>
          </div>

          <div className="rounded-lg bg-muted/50 px-2.5 py-2 text-[11px] text-muted-foreground space-y-1">
            <p>
              Al vencer, sigue por <strong>Sin respuesta</strong> y suma 1 a{" "}
              <code className="font-mono">{"{{timeout_count}}"}</code>. Sin nada conectado, el flujo termina.
            </p>
            <p>
              WhatsApp solo permite mensajes libres hasta 24 h después del último mensaje del contacto. Fuera de esa
              ventana, los recordatorios usan su plantilla (si la tienen) y «Sin respuesta» aplica etiquetas, CRM o
              transferencias pero no envía mensajes.
            </p>
          </div>

          {issue && (
            <p role="status" className="text-[11px] text-amber-600 dark:text-amber-400">
              {issue}
            </p>
          )}
        </>
      )}
    </fieldset>
  );
}

function DurationField({
  label,
  amount,
  unit,
  onChange,
}: {
  label: string;
  amount: number;
  unit: FlowTimeUnit;
  onChange: (amount: number, unit: FlowTimeUnit) => void;
}) {
  const id = useId();
  return (
    <div>
      <span id={id} className={labelClass}>
        {label}
      </span>
      <div role="group" aria-labelledby={id} className="flex items-center gap-1.5">
        <NumberField
          value={amount}
          onChange={(n) => onChange(n ?? 0, unit)}
          min={1}
          max={unit === "minutes" ? 43_200 : unit === "hours" ? 720 : 30}
          decimals={0}
          className="w-20 shrink-0 py-1.5 text-xs"
        />
        <FlowSelect
          compact
          aria-label={`Unidad de ${label.toLowerCase()}`}
          value={unit}
          onChange={(v) => onChange(amount, v as FlowTimeUnit)}
          options={UNIT_OPTIONS}
          className="flex-1"
        />
      </div>
    </div>
  );
}

function ReminderCard({
  index,
  reminder,
  repeatLabel,
  onChange,
  onDelete,
}: {
  index: number;
  reminder: FlowTimeoutReminder;
  repeatLabel: string | null;
  onChange: (patch: Partial<FlowTimeoutReminder>) => void;
  onDelete: () => void;
}) {
  const [showTemplate, setShowTemplate] = useState(!!reminder.template?.name);
  const tpl: FlowTimeoutTemplate = reminder.template ?? { name: "", language: "es", params: [] };
  const setTpl = (patch: Partial<FlowTimeoutTemplate>) => {
    const next = { ...tpl, ...patch };
    onChange({ template: next.name || next.params?.length ? next : undefined });
  };
  const params = tpl.params ?? [];

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-2">
      <div className="flex items-end gap-1.5">
        <div className="flex-1">
          <DurationField
            label={`Recordatorio ${index + 1} a los`}
            amount={reminder.after}
            unit={reminder.unit}
            onChange={(after, unit) => onChange({ after, unit })}
          />
        </div>
        <button
          type="button"
          aria-label={`Eliminar recordatorio ${index + 1}`}
          onClick={onDelete}
          className="mb-1 p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-red-600 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <VariableTextarea
        aria-label={`Mensaje del recordatorio ${index + 1}`}
        rows={2}
        value={reminder.message}
        onChange={(v) => onChange({ message: v })}
        placeholder="¿Sigues ahí? Cuando quieras, elige una opción 🙂"
        className={cn(smallInput, "resize-y")}
      />
      {repeatLabel && (
        <Toggle
          checked={!!reminder.repeatOptions}
          onChange={(v) => onChange({ repeatOptions: v || undefined })}
          label={repeatLabel}
        />
      )}

      <button
        type="button"
        aria-expanded={showTemplate}
        onClick={() => setShowTemplate((v) => !v)}
        className="flex w-full items-center justify-between text-[11px] font-medium text-muted-foreground hover:text-foreground"
      >
        <span>
          Plantilla si la ventana de 24 h está cerrada
          {tpl.name ? <span className="ml-1 font-mono text-foreground">({tpl.name})</span> : " (opcional)"}
        </span>
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showTemplate && "rotate-180")} />
      </button>
      {showTemplate && (
        <div className="space-y-1.5">
          <div className="grid grid-cols-[1fr_4.5rem] gap-1.5">
            <input
              aria-label={`Nombre de la plantilla del recordatorio ${index + 1}`}
              value={tpl.name}
              onChange={(e) => setTpl({ name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })}
              placeholder="recordatorio_respuesta"
              className={cn(smallInput, "font-mono")}
            />
            <input
              aria-label={`Idioma de la plantilla del recordatorio ${index + 1}`}
              value={tpl.language ?? "es"}
              maxLength={15}
              onChange={(e) => setTpl({ language: e.target.value.trim() || "es" })}
              placeholder="es"
              className={cn(smallInput, "font-mono")}
            />
          </div>
          {params.map((p, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="w-8 shrink-0 text-right font-mono text-[10px] text-muted-foreground">{`{{${i + 1}}}`}</span>
              <VariableInput
                aria-label={`Variable ${i + 1} de la plantilla`}
                value={p}
                onChange={(v) => setTpl({ params: params.map((x, j) => (j === i ? v : x)) })}
                placeholder="{{contact_name}}"
                className={smallInput}
              />
              <button
                type="button"
                aria-label={`Quitar variable ${i + 1}`}
                onClick={() => setTpl({ params: params.filter((_, j) => j !== i) })}
                className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-red-600 transition-colors"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setTpl({ params: [...params, ""] })}
            disabled={params.length >= MAX_TEMPLATE_PARAMS}
            className="flex items-center gap-1 text-[11px] font-medium text-brand-700 hover:underline disabled:opacity-40 dark:text-brand-300"
          >
            <Plus className="h-3 w-3" /> Variable del cuerpo
          </button>
          <p className={hintClass}>
            Nombre exacto de una plantilla aprobada en Meta. Se cobra como plantilla y no se envía si el contacto
            desactivó el opt-in de WhatsApp. Sin plantilla, el recordatorio se omite fuera de la ventana.
          </p>
        </div>
      )}
    </div>
  );
}
