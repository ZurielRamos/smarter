import { createContext, useContext, useId } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { VariableInput } from "./VariableField";
import { FlowSelect } from "./FlowSelect";
import { VARIABLE_GROUP_LABELS, type VariableOption } from "./variables";
import {
  CHANNEL_OPTIONS,
  OPERATOR_BY_KEY,
  SOURCES,
  STATUS_OPTIONS,
  WEEKDAYS,
  defaultOperatorForType,
  newBranch,
  optionLabel,
  newRule,
  operatorsForRule,
  ruleIssue,
} from "./conditions";
import {
  type FlowConditionBranch,
  type FlowConditionOperator,
  type FlowConditionRule,
  type FlowConditionSource,
  type FlowNodeData,
  type InboxOption,
  type LabelOption,
} from "./types";

const MAX_BRANCHES = 12;
const MAX_RULES = 12;
const MAX_VALUE = 500;

const inputClass =
  "w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200";
const iconButton =
  "p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent transition-colors";

const TYPE_CAPTIONS: Record<string, string> = {
  text: "texto",
  number: "número",
  date: "fecha",
  boolean: "sí / no",
  select: "lista",
  array: "varios valores",
};

interface Lookups {
  /** Campos del CRM, personalizados, variables del flujo y especiales */
  options: VariableOption[];
  labels: LabelOption[];
  inboxes: InboxOption[];
}

/**
 * Los datos llegan por props y se reparten con un contexto propio de este
 * archivo: así las filas no dependen de que el contexto del editor sea la misma
 * instancia (tras una recarga en caliente podía llegar vacío).
 */
const LookupsContext = createContext<Lookups>({ options: [], labels: [], inboxes: [] });

interface Props extends Lookups {
  data: FlowNodeData;
  set: (patch: Partial<FlowNodeData>) => void;
}

/** Editor del nodo Condición: ramas «si / si no» con varias reglas cada una. */
export function ConditionEditor({ data, set, options, labels, inboxes }: Props) {
  const branches = data.branches ?? [];
  const update = (next: FlowConditionBranch[]) => set({ branches: next });
  const patchBranch = (id: string, patch: Partial<FlowConditionBranch>) =>
    update(branches.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= branches.length) return;
    const next = [...branches];
    [next[index], next[target]] = [next[target], next[index]];
    update(next);
  };

  return (
    <LookupsContext.Provider value={{ options, labels, inboxes }}>
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">
        Se revisan las ramas de arriba hacia abajo y el contacto sigue por la <strong>primera</strong> que se cumpla. Si
        ninguna se cumple, sale por <strong>Si no</strong>.
      </p>

      {branches.map((branch, i) => (
        <BranchCard
          key={branch.id}
          branch={branch}
          index={i}
          total={branches.length}
          onChange={(patch) => patchBranch(branch.id, patch)}
          onMove={(dir) => move(i, dir)}
          onDelete={() => update(branches.filter((b) => b.id !== branch.id))}
        />
      ))}

      <button
        type="button"
        onClick={() => update([...branches, newBranch(branches.length + 1)])}
        disabled={branches.length >= MAX_BRANCHES}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:border-brand-300 hover:text-foreground disabled:opacity-40 transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        {branches.length >= MAX_BRANCHES ? `Máximo ${MAX_BRANCHES} ramas` : "Agregar rama (si no, si…)"}
      </button>

      <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">Si no</span>: salida para cuando no se cumple ninguna rama. Siempre
        está disponible.
      </div>
    </div>
    </LookupsContext.Provider>
  );
}

function BranchCard({
  branch,
  index,
  total,
  onChange,
  onMove,
  onDelete,
}: {
  branch: FlowConditionBranch;
  index: number;
  total: number;
  onChange: (patch: Partial<FlowConditionBranch>) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
}) {
  const nameId = useId();
  const setRule = (id: string, next: FlowConditionRule) =>
    onChange({ rules: branch.rules.map((r) => (r.id === id ? next : r)) });

  return (
    <section className="rounded-xl border border-border bg-background/50" aria-label={`Rama ${branch.name}`}>
      <header className="flex items-center gap-1 border-b border-border px-2.5 py-2">
        <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
          {index === 0 ? "Si" : "Si no, si"}
        </span>
        <label htmlFor={nameId} className="sr-only">
          Nombre de la rama
        </label>
        <input
          id={nameId}
          value={branch.name}
          maxLength={40}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Nombre de la rama"
          className="min-w-0 flex-1 bg-transparent text-xs font-medium text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        <button type="button" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Subir rama" className={iconButton}>
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onMove(1)}
          disabled={index === total - 1}
          aria-label="Bajar rama"
          className={iconButton}
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={total <= 1}
          aria-label="Eliminar rama"
          className={cn(iconButton, "hover:!text-red-600")}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </header>

      <div className="space-y-2 p-2.5">
        {branch.rules.length > 1 && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            Se cumple si
            <FlowSelect
              compact
              value={branch.match}
              onChange={(v) => onChange({ match: v as "all" | "any" })}
              aria-label="Cuántas reglas deben cumplirse"
              className="w-44"
              options={[
                { value: "all", label: "se cumplen todas" },
                { value: "any", label: "se cumple cualquiera" },
              ]}
            />
            las reglas
          </div>
        )}

        {branch.rules.length === 0 && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400">Sin reglas: esta rama nunca se cumple.</p>
        )}

        {branch.rules.map((rule, i) => (
          <div key={rule.id}>
            {i > 0 && (
              <p className="mb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {branch.match === "any" ? "o" : "y"}
              </p>
            )}
            <RuleRow
              rule={rule}
              onChange={(next) => setRule(rule.id, next)}
              onDelete={() => onChange({ rules: branch.rules.filter((r) => r.id !== rule.id) })}
            />
          </div>
        ))}

        <button
          type="button"
          onClick={() => onChange({ rules: [...branch.rules, newRule()] })}
          disabled={branch.rules.length >= MAX_RULES}
          className="flex items-center gap-1 text-[11px] font-medium text-brand-700 hover:underline disabled:opacity-40 dark:text-brand-300"
        >
          <Plus className="h-3 w-3" />
          {branch.rules.length >= MAX_RULES ? `Máximo ${MAX_RULES} reglas` : "Agregar regla"}
        </button>
      </div>
    </section>
  );
}

function RuleRow({
  rule,
  onChange,
  onDelete,
}: {
  rule: FlowConditionRule;
  onChange: (next: FlowConditionRule) => void;
  onDelete: () => void;
}) {
  const uid = useId();
  const { options } = useContext(LookupsContext);
  const field = rule.source === "variable" ? options.find((o) => o.key === rule.field) : undefined;
  const operators = operatorsForRule(rule, field?.type);
  const op = OPERATOR_BY_KEY[rule.operator];
  const issue = ruleIssue(rule);

  const changeSource = (source: FlowConditionSource) => {
    if (source === rule.source) return;
    onChange({ ...newRule(source), id: rule.id });
  };

  const changeField = (key: string) => {
    if (key === rule.field) return;
    const prev = field;
    const next = options.find((o) => o.key === key);
    // Mismo tipo y mismas opciones: se conserva lo elegido. Si no, se empieza con el
    // operador típico del nuevo tipo y sin valor, para no arrastrar algo que ya no aplica.
    const sameShape =
      !!prev &&
      prev.type === next?.type &&
      (prev.options ?? []).join("\u0000") === (next?.options ?? []).join("\u0000");
    if (sameShape) {
      onChange({ ...rule, field: key });
      return;
    }
    onChange({ ...rule, field: key, operator: defaultOperatorForType(next?.type), value: "", value2: undefined });
  };

  const changeOperator = (operator: FlowConditionOperator) => {
    const def = OPERATOR_BY_KEY[operator];
    onChange({ ...rule, operator, value2: def?.arity === 2 ? (rule.value2 ?? "") : undefined });
  };

  return (
    <div
      className={cn(
        "space-y-1.5 rounded-lg border bg-card p-2",
        issue ? "border-amber-300 dark:border-amber-700" : "border-border",
      )}
    >
      <div className="flex items-center gap-1">
        <FlowSelect
          compact
          aria-label="Qué evaluar"
          value={rule.source}
          onChange={(v) => changeSource(v as FlowConditionSource)}
          className="min-w-0 flex-1"
          options={SOURCES.map((x) => ({ value: x.key, label: x.label, group: x.group }))}
        />
        <button type="button" onClick={onDelete} aria-label="Eliminar regla" className={cn(iconButton, "hover:!text-red-600")}>
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <SourceTarget uid={uid} rule={rule} onChange={onChange} onPickField={changeField} fieldType={field?.type} />

      {/* Hasta elegir el campo no se sabe qué condiciones aplican. */}
      {(rule.source !== "variable" || !!rule.field) && operators.length > 1 && (
        <>
          <FlowSelect
            compact
            aria-label="Condición"
            value={rule.operator}
            onChange={(v) => changeOperator(v as FlowConditionOperator)}
            options={[
              ...(!operators.some((o) => o.key === rule.operator) && op ? [{ value: op.key, label: op.label }] : []),
              ...operators.map((o) => ({ value: o.key, label: o.label })),
            ]}
          />
        </>
      )}

      {(rule.source !== "variable" || !!rule.field) && (
        <ValueEditor uid={uid} rule={rule} fieldOptions={field?.options} fieldType={field?.type} onChange={onChange} />
      )}

      {issue && (
        <p role="status" className="text-[10px] text-amber-600 dark:text-amber-400">
          {issue}
        </p>
      )}
    </div>
  );
}

/** Lo que identifica a qué se aplica la regla: el campo, la etiqueta… */
function SourceTarget({
  uid,
  rule,
  onChange,
  onPickField,
  fieldType,
}: {
  uid: string;
  rule: FlowConditionRule;
  onChange: (next: FlowConditionRule) => void;
  onPickField: (key: string) => void;
  fieldType?: string;
}) {
  const { options, labels } = useContext(LookupsContext);

  if (rule.source === "variable") {
    const known = options.some((o) => o.key === rule.field);
    const fieldOptionCount = options.find((o) => o.key === rule.field)?.options?.length ?? 0;
    return (
      <div>
        <FlowSelect
          compact
          searchable
          id={`${uid}-field`}
          aria-label="Campo o variable"
          placeholder="Elige un campo o variable…"
          value={rule.field ?? ""}
          onChange={onPickField}
          options={[
            ...(rule.field && !known ? [{ value: rule.field, label: rule.field, group: "Otras" }] : []),
            ...options.map((o) => ({
              value: o.key,
              label: o.label,
              hint: o.label === o.key ? undefined : o.key,
              group: VARIABLE_GROUP_LABELS[o.group],
            })),
          ]}
        />
        {fieldType && (
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            Tipo: {TYPE_CAPTIONS[fieldType] ?? fieldType}
            {fieldOptionCount ? ` · ${fieldOptionCount} ${fieldOptionCount === 1 ? "opción" : "opciones"}` : ""}
          </p>
        )}
      </div>
    );
  }

  if (rule.source === "label") {
    return (
      <>
        <FlowSelect
          compact
          searchable={labels.length > 8}
          aria-label="Etiqueta"
          placeholder="Elige una etiqueta…"
          value={rule.field ?? ""}
          onChange={(v) => onChange({ ...rule, field: v })}
          options={labels.map((l) => ({ value: l.id, label: l.label }))}
        />
      </>
    );
  }
  return null;
}

function ValueEditor({
  uid,
  rule,
  fieldOptions,
  fieldType,
  onChange,
}: {
  uid: string;
  rule: FlowConditionRule;
  fieldOptions?: string[];
  fieldType?: string;
  onChange: (next: FlowConditionRule) => void;
}) {
  const { inboxes } = useContext(LookupsContext);
  const op = OPERATOR_BY_KEY[rule.operator];
  const value = rule.value ?? "";
  const setValue = (v: string) => onChange({ ...rule, value: v });
  const setValue2 = (v: string) => onChange({ ...rule, value2: v });

  if (!op || op.arity === 0) return null;

  switch (rule.source) {
    case "channel":
      return <SimpleSelect uid={uid} value={value} onChange={setValue} options={CHANNEL_OPTIONS} label="Canal" />;
    case "conversation_status":
      return <SimpleSelect uid={uid} value={value} onChange={setValue} options={STATUS_OPTIONS} label="Estado" />;
    case "inbox":
      return (
        <SimpleSelect
          uid={uid}
          value={value}
          onChange={setValue}
          options={inboxes.map((i) => ({ value: i.id, label: i.name }))}
          label="Bandeja"
          placeholder="Elige una bandeja…"
        />
      );
    case "weekday": {
      const picked = new Set(value.split(",").filter(Boolean));
      const toggle = (day: string) => {
        const next = new Set(picked);
        if (next.has(day)) next.delete(day);
        else next.add(day);
        setValue(WEEKDAYS.filter((d) => next.has(d.value)).map((d) => d.value).join(","));
      };
      return (
        <div role="group" aria-label="Días de la semana" className="flex flex-wrap gap-1">
          {WEEKDAYS.map((d) => (
            <button
              key={d.value}
              type="button"
              aria-pressed={picked.has(d.value)}
              title={d.label}
              onClick={() => toggle(d.value)}
              className={cn(
                "rounded-md border px-1.5 py-1 text-[11px] font-medium transition-colors",
                picked.has(d.value)
                  ? "border-brand-400 bg-brand-100 text-brand-800 dark:bg-brand-900/40 dark:text-brand-100"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {d.short}
            </button>
          ))}
        </div>
      );
    }
    case "time_of_day":
      return (
        <div className="flex items-center gap-1.5">
          <input
            type="time"
            aria-label={op.arity === 2 ? "Desde" : "Hora"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className={inputClass}
          />
          {op.arity === 2 && (
            <>
              <span className="text-[11px] text-muted-foreground">y</span>
              <input
                type="time"
                aria-label="Hasta"
                value={rule.value2 ?? ""}
                onChange={(e) => setValue2(e.target.value)}
                className={inputClass}
              />
            </>
          )}
        </div>
      );
    case "random":
      return (
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={0}
            max={100}
            aria-label="Porcentaje"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className={inputClass}
          />
          <span className="text-xs text-muted-foreground">%</span>
        </div>
      );
    case "inbound_count":
      return <NumberPair rule={rule} arity={op.arity} setValue={setValue} setValue2={setValue2} />;
    case "date":
      return <DatePair rule={rule} arity={op.arity} setValue={setValue} setValue2={setValue2} />;
    default:
      break;
  }

  // Campo con valores cerrados (selección, «Último botón»…): se elige de la lista.
  if (rule.source === "variable" && fieldOptions?.length && rule.operator !== "regex") {
    const choices = fieldOptions.map((o) => ({ value: o, label: optionLabel(rule.field, o) }));
    if (rule.operator === "in_list" || rule.operator === "not_in_list") {
      return <OptionChips value={value} onChange={setValue} options={choices} />;
    }
    return (
      <SimpleSelect uid={uid} value={value} onChange={setValue} options={choices} label="Valor" placeholder="Elige un valor…" />
    );
  }

  if (op.kind === "number" || rule.operator === "percent") {
    return op.arity === 2 || fieldType === "number" ? (
      <NumberPair rule={rule} arity={op.arity} setValue={setValue} setValue2={setValue2} />
    ) : (
      <VariableInput
        id={`${uid}-val`}
        aria-label="Valor"
        value={value}
        maxLength={MAX_VALUE}
        onChange={setValue}
        placeholder="Número o {{variable}}"
        className={inputClass}
      />
    );
  }

  if (op.kind === "date") {
    if (rule.operator === "within_last_days" || rule.operator === "older_than_days") {
      return (
        <input
          type="number"
          min={0}
          aria-label="Días"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Cantidad de días"
          className={inputClass}
        />
      );
    }
    return <DatePair rule={rule} arity={op.arity} setValue={setValue} setValue2={setValue2} />;
  }

  const isList = rule.operator === "in_list" || rule.operator === "not_in_list";
  const isRegex = rule.operator === "regex";
  return (
    <div>
      <VariableInput
        id={`${uid}-val`}
        aria-label="Valor"
        value={value}
        maxLength={isRegex ? 200 : MAX_VALUE}
        onChange={setValue}
        placeholder={isList ? "bogotá, medellín, cali" : isRegex ? "^\\d{10}$" : fieldType === "boolean" ? "sí" : "Valor o {{variable}}"}
        className={cn(inputClass, isRegex && "font-mono")}
      />
      <p className="mt-0.5 text-[10px] text-muted-foreground">
        {isList
          ? "Separa los valores con comas."
          : isRegex
            ? "Sin distinguir mayúsculas. Máximo 200 caracteres."
            : "No distingue mayúsculas ni tildes. Escribe { para usar una variable."}
      </p>
    </div>
  );
}

/** Selección múltiple de valores conocidos; se guarda separada por comas, como espera el servidor. */
function OptionChips({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const picked = new Set(
    value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean),
  );
  const toggle = (v: string) => {
    const next = new Set(picked);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange(options.filter((o) => next.has(o.value)).map((o) => o.value).join(","));
  };
  return (
    <div role="group" aria-label="Valores" className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={picked.has(o.value)}
          onClick={() => toggle(o.value)}
          className={cn(
            "max-w-full truncate rounded-md border px-1.5 py-1 text-[11px] font-medium transition-colors",
            picked.has(o.value)
              ? "border-brand-400 bg-brand-100 text-brand-800 dark:bg-brand-900/40 dark:text-brand-100"
              : "border-border text-muted-foreground hover:bg-muted",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function SimpleSelect({
  uid,
  value,
  onChange,
  options,
  label,
  placeholder,
}: {
  uid: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label: string;
  placeholder?: string;
}) {
  return (
    <FlowSelect
      compact
      id={`${uid}-sel`}
      aria-label={label}
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
      searchable={options.length > 8}
    />
  );
}

function NumberPair({
  rule,
  arity,
  setValue,
  setValue2,
}: {
  rule: FlowConditionRule;
  arity: 0 | 1 | 2;
  setValue: (v: string) => void;
  setValue2: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        aria-label={arity === 2 ? "Mínimo" : "Valor"}
        value={rule.value ?? ""}
        onChange={(e) => setValue(e.target.value)}
        className={inputClass}
      />
      {arity === 2 && (
        <>
          <span className="text-[11px] text-muted-foreground">y</span>
          <input
            type="number"
            aria-label="Máximo"
            value={rule.value2 ?? ""}
            onChange={(e) => setValue2(e.target.value)}
            className={inputClass}
          />
        </>
      )}
    </div>
  );
}

/** Las fechas se guardan como ISO (aaaa-mm-dd), que el servidor entiende igual que dd/mm/aaaa. */
function DatePair({
  rule,
  arity,
  setValue,
  setValue2,
}: {
  rule: FlowConditionRule;
  arity: 0 | 1 | 2;
  setValue: (v: string) => void;
  setValue2: (v: string) => void;
}) {
  const asIso = (v?: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v ?? "") ? (v as string) : "");
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="date"
        aria-label={arity === 2 ? "Desde" : "Fecha"}
        value={asIso(rule.value)}
        onChange={(e) => setValue(e.target.value)}
        className={inputClass}
      />
      {arity === 2 && (
        <>
          <span className="text-[11px] text-muted-foreground">y</span>
          <input
            type="date"
            aria-label="Hasta"
            value={asIso(rule.value2)}
            onChange={(e) => setValue2(e.target.value)}
            className={inputClass}
          />
        </>
      )}
    </div>
  );
}
