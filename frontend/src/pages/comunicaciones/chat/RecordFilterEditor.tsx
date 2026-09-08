import { Plus, Trash2 } from "lucide-react";
import type { FilterCondition } from "@/pages/FilterPanel";
import type { CustomField } from "@/services/api";

/**
 * Editor compacto de reglas de filtro por campos del contacto, pensado para
 * caber dentro del dropdown de filtros de la lista de chats (ancho ~320px).
 * A diferencia del FilterPanel de la vista de Contactos (layout horizontal),
 * apila campo / operador / valor verticalmente. Usa el mismo formato de datos
 * (FilterCondition) para ser compatible con el backend.
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

const SELECT_CLASS =
  "w-full px-2 py-1.5 text-xs rounded-md border border-gray-200 bg-white text-gray-800 focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500 transition-all";

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

  function getFieldType(fieldKey: string): string {
    return getField(fieldKey)?.fieldType || "text";
  }

  function operatorsForField(fieldKey: string) {
    const type = getFieldType(fieldKey);
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
            <select
              value={filter.field}
              onChange={(e) => {
                const nextOps = operatorsForField(e.target.value);
                const keepOp = nextOps.some((o) => o.value === filter.operator) ? filter.operator : nextOps[0]?.value || "equals";
                updateFilter(filter.id, { field: e.target.value, operator: keepOp, value: "" });
              }}
              className={SELECT_CLASS}
            >
              {fields.map((f) => (
                <option key={f.fieldKey} value={f.fieldKey}>{f.fieldLabel}</option>
              ))}
            </select>

            {/* Operador */}
            <select
              value={filter.operator}
              onChange={(e) => updateFilter(filter.id, { operator: e.target.value })}
              className={SELECT_CLASS}
            >
              {ops.map((op) => (
                <option key={op.value} value={op.value}>{op.label}</option>
              ))}
            </select>

            {/* Valor */}
            {needsValue && (
              options && options.length > 0 ? (
                <select
                  value={filter.value}
                  onChange={(e) => updateFilter(filter.id, { value: e.target.value })}
                  className={SELECT_CLASS}
                >
                  <option value="">Seleccionar...</option>
                  {options.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : (
                <input
                  type={type === "number" ? "number" : type === "date" ? "date" : "text"}
                  value={filter.value}
                  onChange={(e) => updateFilter(filter.id, { value: e.target.value })}
                  placeholder="Valor..."
                  className={SELECT_CLASS}
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
