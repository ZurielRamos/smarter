import { useState, useEffect, useRef } from "react";
import { X, Plus, Trash2, Filter } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { CustomField } from "@/services/api";

export interface FilterCondition {
  id: string;
  field: string;
  operator: string;
  value: string;
}

/** Filtros de Reclutamiento (campos virtuales que entiende el servidor). */
export const PROJECT_FILTER = "__project";
export const PROJECT_STATUS_FILTER = "__project_status";

/** Proyectos y estados para los filtros de Reclutamiento (null = la cuenta no lo tiene o no hay permiso). */
export interface FilterRecruitment {
  projects: Array<{ id: string; name: string }>;
  states: Array<{ key: string; label: string }>;
}

interface FilterPanelProps {
  open: boolean;
  onClose: () => void;
  filters: FilterCondition[];
  onChange: (filters: FilterCondition[]) => void;
  fields: CustomField[];
  recruitment?: FilterRecruitment | null;
}

/** Tipos internos: los de los campos más los dos de proyecto. */
type FieldType = string;

const ALL = ["text", "url", "email", "phone", "textarea", "select", "number", "date", "boolean", "array"];
const OPERATORS: { value: string; label: string; types: FieldType[] }[] = [
  { value: "equals", label: "es igual a", types: ["text", "url", "email", "phone", "textarea", "select", "number", "date", "boolean"] },
  { value: "not_equals", label: "no es igual a", types: ["text", "url", "email", "phone", "textarea", "select", "number", "date", "boolean"] },
  { value: "equals", label: "incluye la etiqueta", types: ["array"] },
  { value: "not_equals", label: "no incluye la etiqueta", types: ["array"] },
  { value: "contains", label: "contiene", types: ["text", "url", "email", "phone", "textarea", "array"] },
  { value: "starts_with", label: "empieza con", types: ["text", "url", "email", "phone", "textarea"] },
  { value: "greater_than", label: "mayor que", types: ["number", "date"] },
  { value: "less_than", label: "menor que", types: ["number", "date"] },
  { value: "is_empty", label: "está vacío", types: ALL },
  { value: "is_not_empty", label: "no está vacío", types: ALL },
  { value: "in_project", label: "está en", types: ["project"] },
  { value: "not_in_project", label: "no está en", types: ["project"] },
  { value: "equals", label: "es", types: ["project_status"] },
  { value: "not_equals", label: "no es (está en el proyecto)", types: ["project_status"] },
];

const VALUELESS = new Set(["is_empty", "is_not_empty"]);

/** Un filtro sin valor todavía no se aplica (evita que «es igual a» vacío vacíe la lista mientras se escribe). */
export function isFilterComplete(f: FilterCondition): boolean {
  if (VALUELESS.has(f.operator)) return true;
  if (f.field === PROJECT_STATUS_FILTER) {
    const [projectId, list = ""] = f.value.split(":");
    return !!projectId && list.split(",").some(Boolean);
  }
  return f.value.trim() !== "";
}

/** Campos que ofrece el selector: los del CRM y, con Reclutamiento, proyecto y estado en proyecto. */
function buildFields(fields: CustomField[], recruitment?: FilterRecruitment | null): CustomField[] {
  if (!recruitment) return fields;
  const virtual = (fieldKey: string, fieldLabel: string, fieldType: string) =>
    ({ id: fieldKey, tenantId: "", fieldKey, fieldLabel, fieldType, fieldGroup: "reclutamiento", options: null, isRequired: false, isSystem: true, isUnique: false, isNullable: true, defaultValue: null, validations: null, sortOrder: -1 }) as CustomField;
  return [
    virtual(PROJECT_FILTER, "Proyecto de reclutamiento", "project"),
    virtual(PROJECT_STATUS_FILTER, "Estado en proyecto", "project_status"),
    ...fields,
  ];
}

export function FilterPanel({ open, onClose, filters, onChange, fields: baseFields, recruitment }: FilterPanelProps) {
  const fields = buildFields(baseFields, recruitment);

  function addFilter() {
    const firstField = baseFields.find((f) => f.fieldKey === "status") || baseFields[0];
    onChange([...filters, { id: crypto.randomUUID(), field: firstField?.fieldKey || "status", operator: "equals", value: "" }]);
  }

  function updateFilter(id: string, updates: Partial<FilterCondition>) {
    onChange(filters.map((f) => f.id === id ? { ...f, ...updates } : f));
  }

  function removeFilter(id: string) {
    onChange(filters.filter((f) => f.id !== id));
  }

  function clearAll() {
    onChange([]);
  }

  function getFieldType(fieldKey: string): string {
    const field = fields.find((f) => f.fieldKey === fieldKey);
    return field?.fieldType || "text";
  }

  function getFieldOptions(fieldKey: string): string[] | null {
    const field = fields.find((f) => f.fieldKey === fieldKey);
    if (field?.fieldType === "boolean") return ["true", "false"];
    return field?.options || null;
  }

  function getOperatorsForField(fieldKey: string) {
    const type = getFieldType(fieldKey);
    const ops = OPERATORS.filter((op) => op.types.includes(type));
    return ops.length ? ops : OPERATORS.filter((op) => op.types.includes("text"));
  }

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.2 }}
        className="border-b border-border bg-card"
      >
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold text-foreground">Filtros avanzados</span>
              {filters.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-700 dark:bg-brand-700 dark:text-brand-100 font-medium">{filters.length}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {filters.length > 0 && (
                <button onClick={clearAll} className="text-xs text-red-500 hover:text-red-600 font-medium">
                  Limpiar todo
                </button>
              )}
              <button onClick={onClose} className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Filter rows */}
          <div className="space-y-2">
            {filters.map((filter, idx) => (
              <FilterRow
                key={filter.id}
                filter={filter}
                fields={fields}
                operators={getOperatorsForField(filter.field)}
                fieldOptions={getFieldOptions(filter.field)}
                fieldType={getFieldType(filter.field)}
                onUpdate={(updates) => updateFilter(filter.id, updates)}
                onRemove={() => removeFilter(filter.id)}
                isFirst={idx === 0}
                recruitment={recruitment}
              />
            ))}
          </div>

          {/* Add filter button */}
          <button
            onClick={addFilter}
            className="flex items-center gap-1.5 mt-2 px-2.5 py-1.5 rounded-md text-xs text-brand-600 hover:bg-brand-50 font-medium transition-colors"
          >
            <Plus className="h-3 w-3" />
            Agregar condición
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function FilterRow({ filter, fields, operators, fieldOptions, fieldType, onUpdate, onRemove, isFirst, recruitment }: {
  filter: FilterCondition;
  fields: CustomField[];
  operators: { value: string; label: string }[];
  fieldOptions: string[] | null;
  fieldType: string;
  onUpdate: (updates: Partial<FilterCondition>) => void;
  onRemove: () => void;
  isFirst: boolean;
  recruitment?: FilterRecruitment | null;
}) {
  const [fieldOpen, setFieldOpen] = useState(false);
  const [operatorOpen, setOperatorOpen] = useState(false);
  const [valueOpen, setValueOpen] = useState(false);
  const fieldRef = useRef<HTMLDivElement>(null);
  const operatorRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (fieldRef.current && !fieldRef.current.contains(e.target as Node)) setFieldOpen(false);
      if (operatorRef.current && !operatorRef.current.contains(e.target as Node)) setOperatorOpen(false);
      if (valueRef.current && !valueRef.current.contains(e.target as Node)) setValueOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const needsValue = !["is_empty", "is_not_empty"].includes(filter.operator);
  const currentField = fields.find((f) => f.fieldKey === filter.field);

  return (
    <div className="flex items-center gap-2">
      {/* AND label */}
      <span className="text-[10px] text-muted-foreground font-medium w-6 text-center shrink-0">
        {isFirst ? "Si" : "Y"}
      </span>

      {/* Field selector */}
      <div className="relative" ref={fieldRef}>
        <button
          onClick={() => setFieldOpen((v) => !v)}
          className={`px-2.5 py-1.5 rounded-md border text-xs text-left min-w-[120px] transition-all ${fieldOpen ? "border-brand-500 ring-1 ring-brand-500" : "border-border hover:border-gray-300"}`}
        >
          <span className="text-foreground">{currentField?.fieldLabel || filter.field}</span>
        </button>
        {fieldOpen && (
          <div className="absolute left-0 top-full mt-1 w-48 bg-popover text-popover-foreground rounded-lg shadow-lg border border-border py-1 z-50 max-h-48 overflow-auto">
            {fields.map((f) => (
              <button
                key={f.fieldKey}
                onClick={() => {
                  onUpdate({ field: f.fieldKey, operator: f.fieldType === "project" ? "in_project" : "equals", value: "" });
                  setFieldOpen(false);
                }}
                className={`w-full px-3 py-1.5 text-xs text-left transition-colors ${filter.field === f.fieldKey ? "bg-brand-50 text-brand-700 dark:bg-brand-700 dark:text-brand-100 font-medium" : "text-foreground hover:bg-muted"}`}
              >
                {f.fieldLabel}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Operator selector */}
      <div className="relative" ref={operatorRef}>
        <button
          onClick={() => setOperatorOpen((v) => !v)}
          className={`px-2.5 py-1.5 rounded-md border text-xs text-left min-w-[110px] transition-all ${operatorOpen ? "border-brand-500 ring-1 ring-brand-500" : "border-border hover:border-gray-300"}`}
        >
          <span className="text-muted-foreground">{operators.find((o) => o.value === filter.operator)?.label || OPERATORS.find((o) => o.value === filter.operator)?.label || filter.operator}</span>
        </button>
        {operatorOpen && (
          <div className="absolute left-0 top-full mt-1 w-44 bg-popover text-popover-foreground rounded-lg shadow-lg border border-border py-1 z-50">
            {operators.map((op) => (
              <button
                key={`${op.value}-${op.label}`}
                onClick={() => { onUpdate({ operator: op.value }); setOperatorOpen(false); }}
                className={`w-full px-3 py-1.5 text-xs text-left transition-colors ${filter.operator === op.value ? "bg-brand-50 text-brand-700 dark:bg-brand-700 dark:text-brand-100 font-medium" : "text-foreground hover:bg-muted"}`}
              >
                {op.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Value input */}
      {needsValue && fieldType === "project" && (
        <ProjectPicker
          projects={recruitment?.projects ?? []}
          value={filter.value}
          onChange={(value) => onUpdate({ value })}
        />
      )}
      {needsValue && fieldType === "project_status" && (
        <ProjectStatusPicker recruitment={recruitment} value={filter.value} onChange={(value) => onUpdate({ value })} />
      )}
      {needsValue && fieldType !== "project" && fieldType !== "project_status" && (
        <>
          {fieldOptions && fieldOptions.length > 0 ? (
            <div className="relative" ref={valueRef}>
              <button
                onClick={() => setValueOpen((v) => !v)}
                className={`px-2.5 py-1.5 rounded-md border text-xs text-left min-w-[120px] transition-all ${valueOpen ? "border-brand-500 ring-1 ring-brand-500" : "border-border hover:border-gray-300"}`}
              >
                <span className={filter.value ? "text-foreground capitalize" : "text-muted-foreground"}>{optionLabel(filter.value, fieldType) || "Seleccionar..."}</span>
              </button>
              {valueOpen && (
                <div className="absolute left-0 top-full mt-1 w-44 bg-popover text-popover-foreground rounded-lg shadow-lg border border-border py-1 z-50 max-h-48 overflow-auto">
                  {fieldOptions.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => { onUpdate({ value: opt }); setValueOpen(false); }}
                      className={`w-full px-3 py-1.5 text-xs text-left capitalize transition-colors ${filter.value === opt ? "bg-brand-50 text-brand-700 dark:bg-brand-700 dark:text-brand-100 font-medium" : "text-foreground hover:bg-muted"}`}
                    >
                      {optionLabel(opt, fieldType)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <input
              type={fieldType === "number" ? "number" : fieldType === "date" ? "date" : "text"}
              value={filter.value}
              onChange={(e) => onUpdate({ value: e.target.value })}
              placeholder="Valor..."
              className="px-2.5 py-1.5 rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground text-xs min-w-[120px] focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500 transition-all"
            />
          )}
        </>
      )}

      {/* Remove */}
      <button onClick={onRemove} className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors shrink-0">
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}

function optionLabel(value: string, fieldType: string): string {
  if (fieldType === "boolean") return value === "true" ? "Sí" : value === "false" ? "No" : value;
  return value;
}

/** Desplegable simple con cierre al hacer clic fuera. */
function Dropdown({ label, placeholder, children, width = "w-56" }: { label: string; placeholder: string; children: (close: () => void) => React.ReactNode; width?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`px-2.5 py-1.5 rounded-md border text-xs text-left min-w-[140px] max-w-[240px] truncate transition-all ${open ? "border-brand-500 ring-1 ring-brand-500" : "border-border hover:border-gray-300"}`}
      >
        <span className={label ? "text-foreground" : "text-muted-foreground"}>{label || placeholder}</span>
      </button>
      {open && (
        <div className={`absolute left-0 top-full mt-1 ${width} bg-popover text-popover-foreground rounded-lg shadow-lg border border-border py-1 z-50 max-h-60 overflow-auto`}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function ProjectPicker({ projects, value, onChange }: { projects: FilterRecruitment["projects"]; value: string; onChange: (v: string) => void }) {
  const current = projects.find((p) => p.id === value);
  return (
    <Dropdown label={current?.name || (value ? "Proyecto no disponible" : "")} placeholder="Elegir proyecto...">
      {(close) =>
        projects.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">No hay proyectos en la cuenta.</p>
        ) : (
          projects.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => { onChange(p.id); close(); }}
              className={`w-full px-3 py-1.5 text-xs text-left transition-colors ${value === p.id ? "bg-brand-50 text-brand-700 dark:bg-brand-700 dark:text-brand-100 font-medium" : "text-foreground hover:bg-muted"}`}
            >
              {p.name}
            </button>
          ))
        )
      }
    </Dropdown>
  );
}

/** Proyecto y uno o varios estados; el valor viaja como `<proyecto>:<estado>,<estado>`. */
function ProjectStatusPicker({ recruitment, value, onChange }: { recruitment?: FilterRecruitment | null; value: string; onChange: (v: string) => void }) {
  const [projectId = "", list = ""] = value.split(":");
  const selected = list.split(",").filter(Boolean);
  const states = recruitment?.states ?? [];
  const toggle = (key: string) => {
    const next = selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key];
    onChange(`${projectId}:${next.join(",")}`);
  };
  const stateLabel =
    selected.length === 0 ? "" : selected.length <= 2 ? selected.map((k) => states.find((s) => s.key === k)?.label ?? k).join(", ") : `${selected.length} estados`;
  return (
    <>
      <ProjectPicker projects={recruitment?.projects ?? []} value={projectId} onChange={(id) => onChange(`${id}:${selected.join(",")}`)} />
      <Dropdown label={stateLabel} placeholder="Elegir estados...">
        {() =>
          states.map((s) => (
            <label key={s.key} className="flex items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-muted cursor-pointer">
              <input type="checkbox" checked={selected.includes(s.key)} onChange={() => toggle(s.key)} className="h-3.5 w-3.5 accent-brand-600" />
              {s.label}
            </label>
          ))
        }
      </Dropdown>
    </>
  );
}
