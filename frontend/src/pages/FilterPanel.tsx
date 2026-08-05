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

interface FilterPanelProps {
  open: boolean;
  onClose: () => void;
  filters: FilterCondition[];
  onChange: (filters: FilterCondition[]) => void;
  fields: CustomField[];
}

const OPERATORS = [
  { value: "equals", label: "es igual a", types: ["text", "select", "number", "date"] },
  { value: "not_equals", label: "no es igual a", types: ["text", "select", "number", "date"] },
  { value: "contains", label: "contiene", types: ["text"] },
  { value: "starts_with", label: "empieza con", types: ["text"] },
  { value: "greater_than", label: "mayor que", types: ["number", "date"] },
  { value: "less_than", label: "menor que", types: ["number", "date"] },
  { value: "is_empty", label: "está vacío", types: ["text", "select", "number", "date", "boolean", "array"] },
  { value: "is_not_empty", label: "no está vacío", types: ["text", "select", "number", "date", "boolean", "array"] },
];

export function FilterPanel({ open, onClose, filters, onChange, fields }: FilterPanelProps) {
  function addFilter() {
    const firstField = fields[0];
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
    return field?.options || null;
  }

  function getOperatorsForField(fieldKey: string) {
    const type = getFieldType(fieldKey);
    return OPERATORS.filter((op) => op.types.includes(type));
  }

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.2 }}
        className="border-b border-gray-200 bg-white"
      >
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Filter className="h-3.5 w-3.5 text-gray-500" />
              <span className="text-xs font-semibold text-gray-700">Filtros avanzados</span>
              {filters.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-700 font-medium">{filters.length}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {filters.length > 0 && (
                <button onClick={clearAll} className="text-xs text-red-500 hover:text-red-600 font-medium">
                  Limpiar todo
                </button>
              )}
              <button onClick={onClose} className="h-6 w-6 rounded flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100">
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

function FilterRow({ filter, fields, operators, fieldOptions, fieldType, onUpdate, onRemove, isFirst }: {
  filter: FilterCondition;
  fields: CustomField[];
  operators: { value: string; label: string }[];
  fieldOptions: string[] | null;
  fieldType: string;
  onUpdate: (updates: Partial<FilterCondition>) => void;
  onRemove: () => void;
  isFirst: boolean;
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
      <span className="text-[10px] text-gray-400 font-medium w-6 text-center shrink-0">
        {isFirst ? "Si" : "Y"}
      </span>

      {/* Field selector */}
      <div className="relative" ref={fieldRef}>
        <button
          onClick={() => setFieldOpen((v) => !v)}
          className={`px-2.5 py-1.5 rounded-md border text-xs text-left min-w-[120px] transition-all ${fieldOpen ? "border-brand-500 ring-1 ring-brand-500" : "border-gray-200 hover:border-gray-300"}`}
        >
          <span className="text-gray-800">{currentField?.fieldLabel || filter.field}</span>
        </button>
        {fieldOpen && (
          <div className="absolute left-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 max-h-48 overflow-auto">
            {fields.map((f) => (
              <button
                key={f.fieldKey}
                onClick={() => { onUpdate({ field: f.fieldKey, operator: "equals", value: "" }); setFieldOpen(false); }}
                className={`w-full px-3 py-1.5 text-xs text-left transition-colors ${filter.field === f.fieldKey ? "bg-brand-50 text-brand-700 font-medium" : "text-gray-700 hover:bg-gray-50"}`}
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
          className={`px-2.5 py-1.5 rounded-md border text-xs text-left min-w-[110px] transition-all ${operatorOpen ? "border-brand-500 ring-1 ring-brand-500" : "border-gray-200 hover:border-gray-300"}`}
        >
          <span className="text-gray-600">{operators.find((o) => o.value === filter.operator)?.label || filter.operator}</span>
        </button>
        {operatorOpen && (
          <div className="absolute left-0 top-full mt-1 w-44 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
            {operators.map((op) => (
              <button
                key={op.value}
                onClick={() => { onUpdate({ operator: op.value }); setOperatorOpen(false); }}
                className={`w-full px-3 py-1.5 text-xs text-left transition-colors ${filter.operator === op.value ? "bg-brand-50 text-brand-700 font-medium" : "text-gray-700 hover:bg-gray-50"}`}
              >
                {op.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Value input */}
      {needsValue && (
        <>
          {fieldOptions && fieldOptions.length > 0 ? (
            <div className="relative" ref={valueRef}>
              <button
                onClick={() => setValueOpen((v) => !v)}
                className={`px-2.5 py-1.5 rounded-md border text-xs text-left min-w-[120px] transition-all ${valueOpen ? "border-brand-500 ring-1 ring-brand-500" : "border-gray-200 hover:border-gray-300"}`}
              >
                <span className={filter.value ? "text-gray-800 capitalize" : "text-gray-400"}>{filter.value || "Seleccionar..."}</span>
              </button>
              {valueOpen && (
                <div className="absolute left-0 top-full mt-1 w-44 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 max-h-48 overflow-auto">
                  {fieldOptions.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => { onUpdate({ value: opt }); setValueOpen(false); }}
                      className={`w-full px-3 py-1.5 text-xs text-left capitalize transition-colors ${filter.value === opt ? "bg-brand-50 text-brand-700 font-medium" : "text-gray-700 hover:bg-gray-50"}`}
                    >
                      {opt}
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
              className="px-2.5 py-1.5 rounded-md border border-gray-200 text-xs min-w-[120px] focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500 transition-all"
            />
          )}
        </>
      )}

      {/* Remove */}
      <button onClick={onRemove} className="h-6 w-6 rounded flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0">
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}
