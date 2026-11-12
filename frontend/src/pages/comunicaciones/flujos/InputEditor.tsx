import { useEffect, useId, useState, type ReactNode } from "react";
import { Plus, Sparkles, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { NumberField } from "@/components/ui/number-field";
import { FlowSelect, type SelectOption } from "./FlowSelect";
import { Toggle } from "./Toggle";
import { VariableInput, VariableTextarea } from "./VariableField";
import { VARIABLE_GROUP_LABELS, type VariableOption } from "./variables";
import { AI_MODE_OPTIONS, REGEX_MAX, inputIssue, isValidPattern } from "./inputs";
import {
  VALIDATION_LABELS,
  type FlowAiExtra,
  type FlowAiMode,
  type FlowInputAi,
  type FlowInputTransform,
  type FlowInputValidation,
  type FlowMediaKind,
  type FlowNodeData,
} from "./types";

// Límites (mismos que el servidor).
const MAX_CHOICES = 20;
const MAX_CHOICE_LENGTH = 100;
const MAX_AI_EXTRAS = 5;
const MAX_AI_INSTRUCTION = 500;
const MAX_RETRIES = 10;
const DEFAULT_RETRIES = 3;

const inputClass =
  "w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200";
const smallInput =
  "w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200";
const labelClass = "block text-xs font-medium text-foreground mb-1";
const hintClass = "text-[11px] text-muted-foreground mt-1";

/** Grupos del selector de tipo de respuesta. */
const TYPE_GROUPS: { group: string; types: FlowInputValidation[] }[] = [
  { group: "Texto", types: ["any", "regex"] },
  { group: "Números, fechas y horas", types: ["number", "date", "time"] },
  { group: "Datos de contacto", types: ["email", "phone", "url"] },
  { group: "Opciones", types: ["yes_no", "choice"] },
  { group: "Archivos y ubicación", types: ["media", "location"] },
];

const TYPE_HINTS: Record<FlowInputValidation, string> = {
  any: "Acepta cualquier texto.",
  regex: "La respuesta debe cumplir el patrón (sin distinguir mayúsculas).",
  number: "Entiende 1.500.000, 12,5 o «tengo 25 años». Se guarda solo el número.",
  date: "Entiende 15/03/2025, 2025-03-15, «15 de marzo», «mañana». Se guarda como AAAA-MM-DD.",
  time: "Entiende 15:30, 3:30 pm, 3pm o «3 de la tarde». Se guarda como HH:MM (24 h).",
  email: "Encuentra el correo aunque venga dentro de una frase. Se guarda en minúsculas.",
  phone: "Entre 7 y 15 dígitos; se quitan espacios, guiones y paréntesis.",
  url: "Acepta enlaces con o sin https://.",
  yes_no: "Entiende sí, claro, dale, ok, no, nop… Se guarda «sí» o «no».",
  choice: "El contacto puede escribir la opción, su número o una frase que la mencione.",
  media: "Se guarda el enlace del archivo recibido.",
  location: "El contacto comparte su ubicación desde el chat. Se guarda como «latitud,longitud».",
};

const DEFAULT_ERRORS: Record<FlowInputValidation, string> = {
  any: "Por favor escribe una respuesta.",
  number: "Por favor escribe un número válido.",
  email: "Por favor escribe un correo electrónico válido.",
  phone: "Por favor escribe un número de teléfono válido.",
  date: "Por favor escribe una fecha válida (por ejemplo 15/03/2025).",
  time: "Por favor escribe una hora válida (por ejemplo 3:30 pm).",
  url: "Por favor escribe un enlace válido.",
  yes_no: "Por favor responde sí o no.",
  choice: "Por favor elige una de las opciones.",
  media: "Por favor envía el archivo solicitado.",
  location: "Por favor comparte tu ubicación.",
  regex: "La respuesta no tiene el formato esperado. Inténtalo de nuevo.",
};

const AI_PLACEHOLDERS: Partial<Record<FlowInputValidation, string>> = {
  any: "El nombre completo de la persona",
  number: "El presupuesto en pesos colombianos",
  date: "La fecha en que quiere la cita",
  time: "La hora en que prefiere que lo llamen",
  email: "El correo electrónico",
  phone: "El número de celular",
  choice: "El plan que le interesa",
  yes_no: "Si acepta recibir información",
  regex: "El número de documento sin puntos",
};

const TRANSFORM_OPTIONS: { value: FlowInputTransform; label: string }[] = [
  { value: "none", label: "Tal como lo escribió" },
  { value: "title", label: "Nombre Propio (María de los Ángeles)" },
  { value: "upper", label: "MAYÚSCULAS" },
  { value: "lower", label: "minúsculas" },
];

const MEDIA_KIND_LABELS: Record<FlowMediaKind, string> = {
  image: "Foto",
  video: "Video",
  audio: "Audio / nota de voz",
  document: "Documento",
};

const DATE_RANGE_OPTIONS = [
  { value: "any", label: "Cualquier fecha" },
  { value: "past", label: "Hoy o antes (p. ej. nacimiento)" },
  { value: "future", label: "Hoy o después (p. ej. una cita)" },
];

/** Tipos que se escriben como texto (la IA solo procesa estos). */
const TEXT_TYPES = new Set<FlowInputValidation>([
  "any",
  "regex",
  "number",
  "date",
  "time",
  "email",
  "phone",
  "url",
  "yes_no",
  "choice",
]);

/** Campos del CRM donde se puede guardar una respuesta, agrupados. */
function crmFieldOptions(options: VariableOption[]): SelectOption[] {
  return [
    { value: "", label: "No guardar en el CRM" },
    ...options
      .filter((o) => o.writable && (o.group === "crm" || o.group === "custom"))
      .map((o) => ({ value: o.key, label: o.label, hint: o.key, group: VARIABLE_GROUP_LABELS[o.group] })),
  ];
}

interface Props {
  nodeId: string;
  data: FlowNodeData;
  set: (patch: Partial<FlowNodeData>) => void;
  /** Campos del CRM y variables (para el selector «Guardar también en el CRM») */
  options: VariableOption[];
  /** id del <datalist> con las variables del flujo */
  variableListId: string;
}

export function InputEditor({ nodeId, data, set, options, variableListId }: Props) {
  const type = data.validation || "any";
  const crmOptions = crmFieldOptions(options);
  const isText = TEXT_TYPES.has(type);
  const issue = inputIssue(data);

  const changeType = (next: FlowInputValidation) => {
    if (next === type) return;
    // Al cambiar de tipo se limpian los ajustes que solo valían para el anterior.
    set({
      validation: next,
      minLength: undefined,
      maxLength: undefined,
      minValue: undefined,
      maxValue: undefined,
      integerOnly: undefined,
      dateRange: undefined,
      pattern: next === "regex" ? data.pattern : undefined,
      choices: next === "choice" ? (data.choices?.length ? data.choices : ["", ""]) : undefined,
      showChoices: next === "choice" ? (data.showChoices ?? true) : undefined,
      mediaKinds: undefined,
      transform: next === "any" || next === "regex" ? data.transform : undefined,
      ai: TEXT_TYPES.has(next) ? data.ai : data.ai ? { ...data.ai, enabled: false } : undefined,
    });
  };

  const pickCrmField = (key: string) => {
    // Sin variable aún: se usa la clave del campo, así queda disponible como {{campo}}.
    set({ saveToField: key || undefined, ...(key && !data.variable ? { variable: key } : {}) });
  };

  return (
    <div className="space-y-5">
      <Section title="Pregunta">
        <VariableTextarea
          id={`${nodeId}-text`}
          aria-label="Pregunta"
          rows={3}
          value={data.text || ""}
          onChange={(v) => set({ text: v })}
          placeholder="¿Cuál es tu correo electrónico?"
          className={cn(inputClass, "resize-y")}
        />
        <p className={hintClass}>Escribe {"{"} para insertar una variable o un campo del CRM.</p>
      </Section>

      <Section title="Tipo de respuesta">
        <FlowSelect
          id={`${nodeId}-type`}
          aria-label="Tipo de respuesta"
          value={type}
          onChange={(v) => changeType(v as FlowInputValidation)}
          options={TYPE_GROUPS.flatMap((g) =>
            g.types.map((t) => ({ value: t, label: VALIDATION_LABELS[t], group: g.group })),
          )}
        />
        <p className={hintClass}>{TYPE_HINTS[type]}</p>
        <TypeSettings nodeId={nodeId} data={data} set={set} />
      </Section>

      <Section title="Guardar la respuesta">
        <div>
          <label className={labelClass} htmlFor={`${nodeId}-var`}>
            En la variable
          </label>
          <input
            id={`${nodeId}-var`}
            list={variableListId}
            value={data.variable || ""}
            onChange={(e) => set({ variable: e.target.value.replace(/[^\w]/g, "").slice(0, 50) || undefined })}
            placeholder="email"
            className={cn(inputClass, "font-mono")}
          />
          <p className={hintClass}>Úsala luego como {"{{variable}}"} en mensajes y condiciones.</p>
        </div>
        <div>
          <label className={labelClass} htmlFor={`${nodeId}-crm`}>
            También en el campo del CRM
          </label>
          <FlowSelect
            id={`${nodeId}-crm`}
            searchable
            value={data.saveToField || ""}
            onChange={pickCrmField}
            placeholder="No guardar en el CRM"
            options={[
              ...(data.saveToField && !crmOptions.some((o) => o.value === data.saveToField)
                ? [{ value: data.saveToField, label: data.saveToField, group: "Otros" }]
                : []),
              ...crmOptions,
            ]}
          />
          <p className={hintClass}>
            Se actualiza el contacto vinculado a la conversación. En WhatsApp no se cambia el teléfono porque identifica
            al contacto.
          </p>
        </div>
        <Toggle
          checked={!!data.skipIfFilled}
          onChange={(v) => set({ skipIfFilled: v || undefined })}
          label="No preguntar si ya tenemos el dato"
          description="Si la variable o el campo del CRM ya tienen valor, el flujo sigue sin preguntar."
        />
      </Section>

      <AiSection nodeId={nodeId} data={data} set={set} isText={isText} crmOptions={crmOptions} />

      <Section title="Si la respuesta no es válida">
        <div>
          <label className={labelClass} htmlFor={`${nodeId}-err`}>
            Mensaje de error
          </label>
          <VariableInput
            id={`${nodeId}-err`}
            value={data.errorMessage || ""}
            onChange={(v) => set({ errorMessage: v || undefined })}
            placeholder={DEFAULT_ERRORS[type]}
            className={inputClass}
          />
        </div>
        <label className="block">
          <span className={labelClass}>Intentos extra</span>
          <NumberField
            value={data.maxRetries ?? null}
            onChange={(n) => set({ maxRetries: n == null ? undefined : n })}
            min={0}
            max={MAX_RETRIES}
            decimals={0}
            placeholder={String(DEFAULT_RETRIES)}
          />
        </label>
        <p className={hintClass}>
          Después de {data.maxRetries ?? DEFAULT_RETRIES}{" "}
          {(data.maxRetries ?? DEFAULT_RETRIES) === 1 ? "intento" : "intentos"} sigue por la salida{" "}
          <strong>Sin respuesta válida</strong>. Si no la conectas, el flujo deja la conversación al bot o a un agente.
        </p>
        <SkipKeywords value={data.skipKeywords || []} onChange={(v) => set({ skipKeywords: v.length ? v : undefined })} />
      </Section>

      {issue && (
        <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
          {issue}
        </p>
      )}
    </div>
  );
}

function Section({ title, children, icon }: { title: string; children: ReactNode; icon?: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {title}
      </h4>
      {children}
    </section>
  );
}

/** Ajustes propios de cada tipo de respuesta. */
function TypeSettings({
  nodeId,
  data,
  set,
}: {
  nodeId: string;
  data: FlowNodeData;
  set: (patch: Partial<FlowNodeData>) => void;
}) {
  const type = data.validation || "any";
  switch (type) {
    case "any":
      return (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className={labelClass}>Mín. caracteres</span>
              <NumberField
                value={data.minLength ?? null}
                onChange={(n) => set({ minLength: n || undefined })}
                min={0}
                max={4096}
                decimals={0}
                placeholder="1"
              />
            </label>
            <label className="block">
              <span className={labelClass}>Máx. caracteres</span>
              <NumberField
                value={data.maxLength ?? null}
                onChange={(n) => set({ maxLength: n || undefined })}
                min={0}
                max={4096}
                decimals={0}
                placeholder="Sin límite"
              />
            </label>
          </div>
          <TransformField nodeId={nodeId} data={data} set={set} />
        </>
      );
    case "number":
      return (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className={labelClass}>Mínimo</span>
              <NumberField
                value={data.minValue ?? null}
                onChange={(n) => set({ minValue: n ?? undefined })}
                decimals={4}
                placeholder="Sin mínimo"
              />
            </label>
            <label className="block">
              <span className={labelClass}>Máximo</span>
              <NumberField
                value={data.maxValue ?? null}
                onChange={(n) => set({ maxValue: n ?? undefined })}
                decimals={4}
                placeholder="Sin máximo"
              />
            </label>
          </div>
          <Toggle
            checked={!!data.integerOnly}
            onChange={(v) => set({ integerOnly: v || undefined })}
            label="Solo números enteros"
          />
        </>
      );
    case "date":
      return (
        <div>
          <label className={labelClass} htmlFor={`${nodeId}-range`}>
            Fechas permitidas
          </label>
          <FlowSelect
            id={`${nodeId}-range`}
            value={data.dateRange || "any"}
            onChange={(v) => set({ dateRange: v === "any" ? undefined : (v as "past" | "future") })}
            options={DATE_RANGE_OPTIONS}
          />
        </div>
      );
    case "choice":
      return <ChoicesEditor data={data} set={set} />;
    case "regex": {
      const bad = !!data.pattern && !isValidPattern(data.pattern);
      return (
        <>
          <div>
            <label className={labelClass} htmlFor={`${nodeId}-pattern`}>
              Patrón
            </label>
            <input
              id={`${nodeId}-pattern`}
              value={data.pattern || ""}
              maxLength={REGEX_MAX}
              onChange={(e) => set({ pattern: e.target.value })}
              placeholder="^\d{6,10}$"
              aria-invalid={bad}
              className={cn(inputClass, "font-mono", bad && "border-amber-400")}
            />
            <p className={cn(hintClass, bad && "text-amber-600 dark:text-amber-400")}>
              {bad ? "El patrón no es válido." : "Ejemplo: ^\\d{6,10}$ para una cédula de 6 a 10 dígitos."}
            </p>
          </div>
          <TransformField nodeId={nodeId} data={data} set={set} />
        </>
      );
    }
    case "media": {
      const picked = new Set(data.mediaKinds || []);
      const toggle = (k: FlowMediaKind) => {
        const next = new Set(picked);
        if (next.has(k)) next.delete(k);
        else next.add(k);
        const list = (Object.keys(MEDIA_KIND_LABELS) as FlowMediaKind[]).filter((x) => next.has(x));
        set({ mediaKinds: list.length ? list : undefined });
      };
      return (
        <div>
          <span className={labelClass}>Archivos aceptados</span>
          <div role="group" aria-label="Archivos aceptados" className="flex flex-wrap gap-1">
            {(Object.keys(MEDIA_KIND_LABELS) as FlowMediaKind[]).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={picked.has(k)}
                onClick={() => toggle(k)}
                className={cn(
                  "rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
                  picked.has(k)
                    ? "border-brand-400 bg-brand-100 text-brand-800 dark:bg-brand-900/40 dark:text-brand-100"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {MEDIA_KIND_LABELS[k]}
              </button>
            ))}
          </div>
          <p className={hintClass}>Sin ninguno marcado se acepta cualquier archivo.</p>
        </div>
      );
    }
    default:
      return null;
  }
}

function TransformField({
  nodeId,
  data,
  set,
}: {
  nodeId: string;
  data: FlowNodeData;
  set: (patch: Partial<FlowNodeData>) => void;
}) {
  return (
    <div>
      <label className={labelClass} htmlFor={`${nodeId}-transform`}>
        Formato al guardar
      </label>
      <FlowSelect
        id={`${nodeId}-transform`}
        value={data.transform || "none"}
        onChange={(v) => set({ transform: v === "none" ? undefined : (v as FlowInputTransform) })}
        options={TRANSFORM_OPTIONS}
      />
    </div>
  );
}

function ChoicesEditor({ data, set }: { data: FlowNodeData; set: (patch: Partial<FlowNodeData>) => void }) {
  const choices = data.choices ?? [];
  const update = (next: string[]) => set({ choices: next });
  return (
    <div className="space-y-1.5">
      <span className={labelClass}>Opciones válidas</span>
      {choices.map((c, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span className="w-4 shrink-0 text-right text-[11px] text-muted-foreground">{i + 1}.</span>
          <input
            aria-label={`Opción ${i + 1}`}
            value={c}
            maxLength={MAX_CHOICE_LENGTH}
            onChange={(e) => update(choices.map((x, j) => (j === i ? e.target.value : x)))}
            placeholder={`Opción ${i + 1}`}
            className={smallInput}
          />
          <button
            type="button"
            aria-label={`Eliminar opción ${i + 1}`}
            onClick={() => update(choices.filter((_, j) => j !== i))}
            className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-red-600 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => update([...choices, ""])}
        disabled={choices.length >= MAX_CHOICES}
        className="flex items-center gap-1 text-[11px] font-medium text-brand-700 hover:underline disabled:opacity-40 dark:text-brand-300"
      >
        <Plus className="h-3 w-3" />
        {choices.length >= MAX_CHOICES ? `Máximo ${MAX_CHOICES} opciones` : "Agregar opción"}
      </button>
      <Toggle
        checked={!!data.showChoices}
        onChange={(v) => set({ showChoices: v || undefined })}
        label="Mostrar la lista numerada en la pregunta"
        description="Se agrega «1. Opción…» debajo de la pregunta. Para botones usa un nodo Mensaje."
      />
    </div>
  );
}

/** Palabras para saltar la pregunta. Se edita como texto y se guarda al salir del campo. */
function SkipKeywords({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const id = useId();
  const joined = value.join(", ");
  const [text, setText] = useState(joined);
  useEffect(() => setText(joined), [joined]);
  const commit = () =>
    onChange(
      text
        .split(",")
        .map((s) => s.trim().slice(0, 40))
        .filter(Boolean)
        .slice(0, 10),
    );
  return (
    <div>
      <label className={labelClass} htmlFor={id}>
        Palabras para saltar la pregunta
      </label>
      <input
        id={id}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        placeholder="omitir, saltar, no tengo"
        className={inputClass}
      />
      <p className={hintClass}>
        Separadas por comas. Si el contacto escribe una, sigue por <strong>Respuesta válida</strong> sin guardar nada.
      </p>
    </div>
  );
}

/** Modo de la IA en botones, como la «Velocidad de respuesta» de los bots. */
function AiModePicker({ value, onChange }: { value?: FlowAiMode; onChange: (v: FlowAiMode | undefined) => void }) {
  const current = value ?? "";
  const labelId = useId();
  return (
    <div>
      <span id={labelId} className={labelClass}>
        Modo
      </span>
      <div role="radiogroup" aria-labelledby={labelId} className="grid grid-cols-2 gap-1.5">
        {AI_MODE_OPTIONS.map((m) => {
          const active = current === m.value;
          return (
            <button
              key={m.value || "balanced"}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(m.value || undefined)}
              className={cn(
                "rounded-lg border px-2 py-1.5 text-left transition-colors",
                active
                  ? "border-brand-400 bg-brand-100 dark:bg-brand-900/40"
                  : "border-border bg-card hover:bg-muted",
              )}
            >
              <span
                className={cn(
                  "block text-xs font-medium",
                  active ? "text-brand-800 dark:text-brand-100" : "text-foreground",
                )}
              >
                {m.label}
              </span>
              <span className="block text-[10px] text-muted-foreground">{m.description}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AiSection({
  nodeId,
  data,
  set,
  isText,
  crmOptions,
}: {
  nodeId: string;
  data: FlowNodeData;
  set: (patch: Partial<FlowNodeData>) => void;
  isText: boolean;
  crmOptions: SelectOption[];
}) {
  const type = data.validation || "any";
  const ai: FlowInputAi = data.ai ?? { enabled: false };
  const setAi = (patch: Partial<FlowInputAi>) => set({ ai: { ...ai, ...patch } });
  const extras = ai.extras ?? [];
  const setExtra = (i: number, patch: Partial<FlowAiExtra>) =>
    setAi({ extras: extras.map((e, j) => (j === i ? { ...e, ...patch } : e)) });

  return (
    <Section title="Inteligencia artificial" icon={<Sparkles className="h-3.5 w-3.5 text-brand-600" />}>
      <Toggle
        checked={ai.enabled && isText}
        disabled={!isText}
        onChange={(v) => setAi({ enabled: v })}
        label="Procesar la respuesta con IA"
        description={
          isText
            ? "La IA lee la respuesta completa y saca solo el dato. Luego se valida con el tipo de respuesta."
            : "No disponible para archivos ni ubicaciones."
        }
      />
      {ai.enabled && isText && (
        <div className="space-y-3 rounded-lg border border-brand-200 bg-brand-50/40 p-2.5 dark:border-brand-700/50 dark:bg-brand-900/10">
          <div>
            <label className={labelClass} htmlFor={`${nodeId}-ai`}>
              ¿Qué dato debe obtener?
            </label>
            <textarea
              id={`${nodeId}-ai`}
              rows={2}
              maxLength={MAX_AI_INSTRUCTION}
              value={ai.instruction || ""}
              onChange={(e) => setAi({ instruction: e.target.value || undefined })}
              placeholder={AI_PLACEHOLDERS[type] ?? "El dato que responde a la pregunta"}
              className={cn(smallInput, "resize-y")}
            />
            <p className={hintClass}>
              Ejemplo: a «me llamo Ana Gómez y vivo en Cali» con «el nombre completo» se guarda «Ana Gómez».
            </p>
          </div>

          <div className="space-y-2">
            <span className={labelClass}>Datos adicionales de la misma respuesta</span>
            {extras.map((e, i) => (
              <div key={i} className="space-y-1.5 rounded-lg border border-border bg-card p-2">
                <div className="flex items-center gap-1.5">
                  <input
                    aria-label={`Variable del dato adicional ${i + 1}`}
                    value={e.variable}
                    onChange={(ev) => setExtra(i, { variable: ev.target.value.replace(/[^\w]/g, "").slice(0, 50) })}
                    placeholder="ciudad"
                    className={cn(smallInput, "font-mono")}
                  />
                  <button
                    type="button"
                    aria-label={`Eliminar dato adicional ${i + 1}`}
                    onClick={() => setAi({ extras: extras.filter((_, j) => j !== i) })}
                    className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-red-600 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <input
                  aria-label={`Qué dato es (adicional ${i + 1})`}
                  value={e.description}
                  maxLength={200}
                  onChange={(ev) => setExtra(i, { description: ev.target.value })}
                  placeholder="La ciudad donde vive"
                  className={smallInput}
                />
                <FlowSelect
                  compact
                  searchable
                  aria-label={`Campo del CRM del dato adicional ${i + 1}`}
                  value={e.saveToField || ""}
                  onChange={(v) => setExtra(i, { saveToField: v || undefined })}
                  placeholder="No guardar en el CRM"
                  options={crmOptions}
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() => setAi({ extras: [...extras, { variable: "", description: "" }] })}
              disabled={extras.length >= MAX_AI_EXTRAS}
              className="flex items-center gap-1 text-[11px] font-medium text-brand-700 hover:underline disabled:opacity-40 dark:text-brand-300"
            >
              <Plus className="h-3 w-3" />
              {extras.length >= MAX_AI_EXTRAS ? `Máximo ${MAX_AI_EXTRAS} datos` : "Agregar dato adicional"}
            </button>
            <p className={hintClass}>Si el contacto no los menciona, se dejan como estaban.</p>
          </div>

          <AiModePicker value={ai.mode} onChange={(mode) => setAi({ mode })} />

          <Toggle
            checked={!!ai.transcribeAudio}
            onChange={(v) => setAi({ transcribeAudio: v || undefined })}
            label="Entender notas de voz"
            description="Si el contacto responde con un audio, se transcribe y se procesa igual."
          />
          <p className="text-[11px] text-muted-foreground">
            Usa el modelo de IA predeterminado de tu cuenta con el modo elegido y consume créditos según los tokens. Si la IA no está
            disponible o no hay créditos, la respuesta se valida sin IA.
          </p>
        </div>
      )}
    </Section>
  );
}
