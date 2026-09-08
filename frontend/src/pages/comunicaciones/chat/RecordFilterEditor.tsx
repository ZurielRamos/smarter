import { useState, useRef, useEffect } from "react";
import { Plus, Trash2, ChevronDown } from "lucide-react";
import type { FilterCondition } from "@/pages/FilterPanel";
import type { CustomField } from "@/services/api";

/**
 * Editor compacto de reglas de filtro por campos del contacto, pensado para
 * caber dentro del dropdown de filtros de la lista de chats (ancho ~320px).
 * A diferencia del FilterPanel de la vista de Contactos (layout horizontal),
 * apila campo / operador / valor verticalmente. Usa el mismo formato de datos
 * (FilterCondition) para ser compatible con el backend. Los selectores son
 * dropdowns personalizados (no <select> nativos) para mantener el estilo de la
 * app.
 */

const OPERATORS: { value: string; label: string; types: string[] }[] = [
  { value: "equals", label: "es igual a", types: ["text", "select", "number", "date"] },
  { value: "not_equals", label: "no es igual a", types: ["text", "select", "number", "date"] },
  { value: "contains", label: "contiene", types: ["text"] },
  { value: "starts_with", label: "empieza con", types: ["text"] },
  { value: "greater_than", label: "mayor que", types: ["number", "date"] },
  { value: "less_than", label: "menor que", types: ["number", "date"] },
  { value: "is_empty", label: "está vacío", types: ["text", "select", "number", "date", "boolean", "array"] },
  { value: "is_not_empty", label: "no está vacío", types: ["text", "select", "number", "date", "boolean", "array"] },
];

const INPUT_CLASS =
  "w-full px-2 py-1.5 text-xs rounded-md border border-gray-200 bg-white text-gray-800 focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500 transition-all";

/** Dropdown personalizado (reemplaza al <select> nativo). */
function RuleSelect({
  value,
  options,
  placeholder = "Seleccionar...",
  capitalize = false,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  placeholder?: string;
  capitalize?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const selected = options.find((o) => o.value === value);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`${INPUT_CLASS} flex items-center justify-between text-left ${open ? "ring-1 ring-brand-500 border-brand-500" : "hover:border-gray-300"}`}
      >
        <span className={`truncate ${selected ? "text-gray-800" : "text-gray-400"} ${capitalize ? "capitalize" : ""}`}>
          {selected?.label || placeholder}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 text-gray-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-lg border border-gray-200 shadow-lg py-1 z-[60] max-h-48 overflow-auto">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full px-3 py-1.5 text-xs text-left transition-colors ${capitalize ? "capitalize" : ""} ${value === opt.value ? "bg-brand-50 text-brand-700 font-medium" : "text-gray-700 hover:bg-gray-50"}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function RecordFilterEditor({
  filters,
  onChange,
  fields,
}: {
  filters: FilterCondition[];
  onChange: (filters: FilterCondition[]) => void;
  fields: CustomField[];
}) {
  function getField(fieldKey: string): CustomField | undefined {
    return fields.find((f) => f.fieldKey === fieldKey);
  }

  function operatorsForField(fieldKey: string) {
    const type = getField(fieldKey)?.fieldType || "text";
    return OPERATORS.filter((op) => op.types.includes(type));
  }

  function addFilter() {
    const firstField = fields[0];
    onChange([
      ...filters,
      { id: crypto.randomUUID(), field: firstField?.fieldKey || "", operator: "equals", value: "" },
    ]);
  }

  function updateFilter(id: string, updates: Partial<FilterCondition>) {
    onChange(filters.map((f) => (f.id === id ? { ...f, ...updates } : f)));
  }

  function removeFilter(id: string) {
    onChange(filters.filter((f) => f.id !== id));
  }

  return (
    <div className="px-3 py-1 space-y-2">
      {filters.map((filter, idx) => {
        const field = getField(filter.field);
        const type = field?.fieldType || "text";
        const options = field?.options || null;
        const ops = operatorsForField(filter.field);
        const needsValue = !["is_empty", "is_not_empty"].includes(filter.operator);

        return (
          <div key={filter.id} className="rounded-lg border border-gray-200 bg-gray-50/60 p-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                {idx === 0 ? "Donde" : "Y"}
              </span>
              <button
                onClick={() => removeFilter(filter.id)}
                className="h-5 w-5 rounded flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                title="Eliminar regla"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>

            {/* Campo */}
            <RuleSelect
              value={filter.field}
              options={fields.map((f) => ({ value: f.fieldKey, label: f.fieldLabel }))}
              placeholder="Campo..."
              onChange={(fieldKey) => {
                const nextOps = operatorsForField(fieldKey);
                const keepOp = nextOps.some((o) => o.value === filter.operator) ? filter.operator : nextOps[0]?.value || "equals";
                updateFilter(filter.id, { field: fieldKey, operator: keepOp, value: "" });
              }}
            />

            {/* Operador */}
            <RuleSelect
              value={filter.operator}
              options={ops.map((op) => ({ value: op.value, label: op.label }))}
              onChange={(operator) => updateFilter(filter.id, { operator })}
            />

            {/* Valor */}
            {needsValue && (
              options && options.length > 0 ? (
                <RuleSelect
                  value={filter.value}
                  options={options.map((opt) => ({ value: opt, label: opt }))}
                  placeholder="Seleccionar..."
                  capitalize
                  onChange={(value) => updateFilter(filter.id, { value })}
                />
              ) : (
                <input
                  type={type === "number" ? "number" : type === "date" ? "date" : "text"}
                  value={filter.value}
                  onChange={(e) => updateFilter(filter.id, { value: e.target.value })}
                  placeholder="Valor..."
                  className={INPUT_CLASS}
                />
              )
            )}
          </div>
        );
      })}

      <button
        onClick={addFilter}
        disabled={fields.length === 0}
        className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md text-xs text-brand-600 hover:bg-brand-50 font-medium transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <Plus className="h-3 w-3" />
        Agregar condición
      </button>
    </div>
  );
}
