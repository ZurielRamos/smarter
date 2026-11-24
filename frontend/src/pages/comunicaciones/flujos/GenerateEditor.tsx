import { useContext } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { NumberField } from "@/components/ui/number-field";
import { FlowSelect, type SelectOption } from "./FlowSelect";
import { Toggle } from "./Toggle";
import { AiModePicker } from "./AiModePicker";
import { CommaListInput } from "./CommaListInput";
import { VariableTextarea } from "./VariableField";
import { FlowEditorContext } from "./editorContext";
import { VARIABLE_GROUP_LABELS, type VariableOption } from "./variables";
import {
  CREATIVITY_OPTIONS,
  FIELD_TYPE_LABELS,
  GENERATE_DEFAULT_VARIABLE,
  GENERATE_MAX_FIELDS,
  GENERATE_MAX_INSTRUCTIONS,
  GENERATE_MAX_KEYS,
  GENERATE_MAX_MESSAGES,
  GENERATE_MAX_OPTIONS,
  LENGTH_OPTIONS,
  defaultGenerateConfig,
} from "./generate";
import type {
  FlowAiFieldType,
  FlowAiGenerateConfig,
  FlowAiGenerateContext,
  FlowAiGenerateField,
  FlowNodeData,
} from "./types";

const inputClass =
  "w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200";
const smallInput =
  "w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200";
const labelClass = "block text-xs font-medium text-foreground mb-1";
const hintClass = "text-[11px] text-muted-foreground mt-1";

interface Props {
  nodeId: string;
  data: FlowNodeData;
  set: (patch: Partial<FlowNodeData>) => void;
  options: VariableOption[];
}

const cleanVariable = (v: string) => v.replace(/[^\w]/g, "").slice(0, 50);

/** Editor del nodo «Generación IA». */
export function GenerateEditor({ nodeId, data, set, options }: Props) {
  const { recruitment } = useContext(FlowEditorContext);
  const g: FlowAiGenerateConfig = data.generate ?? defaultGenerateConfig();
  const setG = (patch: Partial<FlowAiGenerateConfig>) => set({ generate: { ...g, ...patch } });
  const ctx: FlowAiGenerateContext = g.context ?? {};
  const setCtx = (patch: Partial<FlowAiGenerateContext>) => setG({ context: { ...ctx, ...patch } });
  const structured = g.output === "structured";
  const fields = g.fields ?? [];
  const setField = (i: number, patch: Partial<FlowAiGenerateField>) =>
    setG({ fields: fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) });

  const crmOptions: SelectOption[] = [
    { value: "", label: "No guardar en el CRM" },
    ...options
      .filter((o) => o.writable && (o.group === "crm" || o.group === "custom"))
      .map((o) => ({ value: o.key, label: o.label, hint: o.key, group: VARIABLE_GROUP_LABELS[o.group] })),
  ];
  const keys = ctx.keys ?? [];
  const keyOptions: SelectOption[] = options
    .filter((o) => !keys.includes(o.key) && o.key !== "contact_name")
    .map((o) => ({ value: o.key, label: o.label, hint: o.key, group: VARIABLE_GROUP_LABELS[o.group] }));
  const labelOf = (key: string) => options.find((o) => o.key === key)?.label ?? key;

  return (
    <div className="space-y-5">
      <p className="text-[11px] text-muted-foreground">
        La IA genera un texto o un conjunto de datos con la información que elijas y el flujo sigue de inmediato, sin
        esperar al contacto.
      </p>

      <Section title="Qué generar">
        <div role="radiogroup" aria-label="Tipo de resultado" className="grid grid-cols-2 gap-1.5">
          {(
            [
              { value: "text", label: "Un texto", description: "Respuesta, resumen, mensaje" },
              { value: "structured", label: "Datos", description: "Varios valores con tipo" },
            ] as const
          ).map((o) => {
            const active = g.output === o.value;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() =>
                  setG({
                    output: o.value,
                    ...(o.value === "structured" && !fields.length
                      ? { fields: [{ variable: "", description: "", type: "text" }] }
                      : {}),
                  })
                }
                className={cn(
                  "rounded-lg border px-2 py-1.5 text-left transition-colors",
                  active ? "border-brand-400 bg-brand-100 dark:bg-brand-900/40" : "border-border bg-card hover:bg-muted",
                )}
              >
                <span className={cn("block text-xs font-medium", active ? "text-brand-800 dark:text-brand-100" : "text-foreground")}>
                  {o.label}
                </span>
                <span className="block text-[10px] text-muted-foreground">{o.description}</span>
              </button>
            );
          })}
        </div>

        <div>
          <label className={labelClass} htmlFor={`${nodeId}-gen-instr`}>
            Instrucciones
          </label>
          <VariableTextarea
            id={`${nodeId}-gen-instr`}
            rows={5}
            maxLength={GENERATE_MAX_INSTRUCTIONS}
            value={g.instructions}
            onChange={(v) => setG({ instructions: v })}
            placeholder={
              structured
                ? "Analiza la conversación y clasifica al contacto: qué producto le interesa, qué tan probable es que compre y cuál es su principal objeción."
                : "Resume en dos frases lo que necesita {{contact_name}} para que el asesor lo entienda sin leer el chat."
            }
            className={cn(inputClass, "resize-y")}
          />
          <p className={hintClass}>
            Escribe <code className="font-mono">{"{"}</code> para insertar variables. Sé concreto: qué quieres, para qué y
            con qué tono.
          </p>
        </div>
      </Section>

      <Section title="Información para la IA">
        <label className="block">
          <span className={labelClass}>Últimos mensajes de la conversación</span>
          <NumberField
            value={ctx.messages ?? 0}
            onChange={(n) => setCtx({ messages: n ?? 0 })}
            min={0}
            max={GENERATE_MAX_MESSAGES}
            decimals={0}
            placeholder="0"
          />
        </label>
        <p className={hintClass}>0 = no se envía la conversación. Más mensajes dan más contexto y consumen más créditos.</p>

        <div>
          <span className={labelClass}>Datos concretos</span>
          {keys.length > 0 && (
            <ul className="mb-1.5 flex flex-wrap gap-1" aria-label="Datos incluidos">
              {keys.map((k) => (
                <li
                  key={k}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-1.5 py-0.5 text-[11px]"
                >
                  <span title={k}>{labelOf(k)}</span>
                  <button
                    type="button"
                    aria-label={`Quitar ${labelOf(k)}`}
                    onClick={() => setCtx({ keys: keys.filter((x) => x !== k) })}
                    className="rounded text-muted-foreground hover:text-red-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {keys.length < GENERATE_MAX_KEYS && (
            <FlowSelect
              compact
              searchable
              aria-label="Agregar un dato"
              value=""
              onChange={(v) => v && setCtx({ keys: [...keys, v] })}
              placeholder="Agregar variable o campo…"
              options={keyOptions}
            />
          )}
        </div>
        <Toggle
          checked={!!ctx.allContact}
          onChange={(v) => setCtx({ allContact: v || undefined })}
          label="Todos los datos del contacto"
          description="Campos del CRM con valor, incluidos los personalizados."
        />
        <Toggle
          checked={!!ctx.allVariables}
          onChange={(v) => setCtx({ allVariables: v || undefined })}
          label="Todas las variables del flujo"
          description="Respuestas y valores guardados hasta este punto."
        />
        {recruitment && (
          <Toggle
            checked={!!ctx.projects}
            onChange={(v) => setCtx({ projects: v || undefined })}
            label="Proyectos del contacto"
            description="Proyectos de reclutamiento en los que está, con su estado y perfil."
          />
        )}
        <p className={hintClass}>El nombre del contacto y el canal siempre se incluyen.</p>
      </Section>

      <Section title="Resultado">
        {structured ? (
          <>
            {fields.map((f, i) => (
              <div key={i} className="space-y-1.5 rounded-lg border border-border bg-card p-2">
                <div className="flex items-center gap-1.5">
                  <input
                    aria-label={`Variable del dato ${i + 1}`}
                    value={f.variable}
                    onChange={(e) => setField(i, { variable: cleanVariable(e.target.value) })}
                    placeholder="interes"
                    className={cn(smallInput, "font-mono")}
                  />
                  <button
                    type="button"
                    aria-label={`Eliminar dato ${i + 1}`}
                    onClick={() => setG({ fields: fields.filter((_, j) => j !== i) })}
                    className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-red-600 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <input
                  aria-label={`Qué dato es (${i + 1})`}
                  value={f.description}
                  maxLength={300}
                  onChange={(e) => setField(i, { description: e.target.value })}
                  placeholder="Nivel de interés en comprar según la conversación"
                  className={smallInput}
                />
                <FlowSelect
                  compact
                  aria-label={`Tipo del dato ${i + 1}`}
                  value={f.type}
                  onChange={(v) => setField(i, { type: v as FlowAiFieldType, ...(v === "choice" ? {} : { options: undefined }) })}
                  options={(Object.keys(FIELD_TYPE_LABELS) as FlowAiFieldType[]).map((t) => ({ value: t, label: FIELD_TYPE_LABELS[t] }))}
                />
                {f.type === "choice" && (
                  <CommaListInput
                    aria-label={`Opciones del dato ${i + 1}`}
                    value={f.options ?? []}
                    onChange={(list) => setField(i, { options: list.length ? list : undefined })}
                    max={GENERATE_MAX_OPTIONS}
                    maxLength={100}
                    placeholder="Alto, Medio, Bajo"
                    className={smallInput}
                  />
                )}
                <FlowSelect
                  compact
                  searchable
                  aria-label={`Campo del CRM del dato ${i + 1}`}
                  value={f.saveToField || ""}
                  onChange={(v) => setField(i, { saveToField: v || undefined })}
                  placeholder="No guardar en el CRM"
                  options={crmOptions}
                />
                <label className="flex items-center gap-1.5 text-[11px] text-foreground">
                  <input
                    type="checkbox"
                    checked={!!f.required}
                    onChange={(e) => setField(i, { required: e.target.checked || undefined })}
                    className="h-3.5 w-3.5 rounded border-border accent-brand-600"
                  />
                  Obligatorio (si falta, sale por «Si falla»)
                </label>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setG({ fields: [...fields, { variable: "", description: "", type: "text" }] })}
              disabled={fields.length >= GENERATE_MAX_FIELDS}
              className="flex items-center gap-1 text-[11px] font-medium text-brand-700 hover:underline disabled:opacity-40 dark:text-brand-300"
            >
              <Plus className="h-3 w-3" />
              {fields.length >= GENERATE_MAX_FIELDS ? `Máximo ${GENERATE_MAX_FIELDS} datos` : "Agregar dato"}
            </button>
            <p className={hintClass}>
              Cada dato se valida con su tipo: un número que no es número o una opción que no está en la lista no se guarda.
              Úsalos después como <code className="font-mono">{"{{variable}}"}</code> o en una Condición.
            </p>
          </>
        ) : (
          <>
            <label className="block">
              <span className={labelClass}>Guardar en la variable</span>
              <input
                value={g.variable || ""}
                onChange={(e) => setG({ variable: cleanVariable(e.target.value) || undefined })}
                placeholder={GENERATE_DEFAULT_VARIABLE}
                className={cn(inputClass, "font-mono")}
              />
            </label>
            <div>
              <span className={labelClass}>Extensión</span>
              <Segmented
                label="Extensión"
                value={g.length ?? "medium"}
                options={LENGTH_OPTIONS}
                onChange={(v) => setG({ length: v === "medium" ? undefined : (v as FlowAiGenerateConfig["length"]) })}
              />
            </div>
            <Toggle
              checked={!!g.send}
              onChange={(v) => setG({ send: v || undefined })}
              label="Enviar al contacto"
              description="Además de guardarlo, se envía como mensaje en la conversación."
            />
            <div>
              <span className={labelClass}>Guardar también en el CRM</span>
              <FlowSelect
                searchable
                aria-label="Campo del CRM"
                value={g.saveToField || ""}
                onChange={(v) => setG({ saveToField: v || undefined })}
                placeholder="No guardar en el CRM"
                options={crmOptions}
              />
            </div>
          </>
        )}
      </Section>

      <Section title="Comportamiento">
        <div>
          <span className={labelClass}>Creatividad</span>
          <Segmented
            label="Creatividad"
            value={g.creativity ?? "balanced"}
            options={CREATIVITY_OPTIONS}
            onChange={(v) => setG({ creativity: v === "balanced" ? undefined : (v as FlowAiGenerateConfig["creativity"]) })}
          />
          <p className={hintClass}>Para clasificar o extraer datos, usa «Precisa».</p>
        </div>
        <AiModePicker value={g.mode} onChange={(mode) => setG({ mode })} />
        <p className="text-[11px] text-muted-foreground">
          Usa el modelo de IA predeterminado de tu cuenta y consume créditos según los tokens. Si la IA no responde o falta
          un dato obligatorio, sigue por <strong>Si falla</strong> (sin esa salida, por <strong>Siguiente</strong>) y el
          motivo queda en <code className="font-mono">{"{{ai_error}}"}</code>.
        </p>
      </Section>
    </div>
  );
}

function Segmented({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string; description?: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-3 gap-1.5">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-lg border px-2 py-1.5 text-left transition-colors",
              active ? "border-brand-400 bg-brand-100 dark:bg-brand-900/40" : "border-border bg-card hover:bg-muted",
            )}
          >
            <span className={cn("block text-xs font-medium", active ? "text-brand-800 dark:text-brand-100" : "text-foreground")}>
              {o.label}
            </span>
            {o.description && <span className="block text-[10px] text-muted-foreground">{o.description}</span>}
          </button>
        );
      })}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      {children}
    </section>
  );
}
