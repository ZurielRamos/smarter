import { useState, useRef, useEffect } from "react";
import { X, Loader2, Plus, Trash2, ChevronDown } from "lucide-react";
import { motion } from "framer-motion";
import { createRecordList, getCustomFields } from "@/services/api";

interface Props {
  tenantId: string;
  onClose: () => void;
  onCreated: () => void;
}

interface FieldOption {
  value: string;
  label: string;
  type: "text" | "number" | "date" | "select" | "boolean" | "list";
  options?: string[]; // for select fields
}

const TEXT_OPERATORS = [
  { value: "equals", label: "Igual a" },
  { value: "not_equals", label: "Diferente de" },
  { value: "contains", label: "Contiene" },
  { value: "starts_with", label: "Empieza con" },
  { value: "ends_with", label: "Termina con" },
  { value: "is_empty", label: "Está vacío" },
  { value: "is_not_empty", label: "No está vacío" },
];

const NUMBER_OPERATORS = [
  { value: "equals", label: "Igual a" },
  { value: "not_equals", label: "Diferente de" },
  { value: "greater_than", label: "Mayor que" },
  { value: "less_than", label: "Menor que" },
  { value: "is_empty", label: "Está vacío" },
  { value: "is_not_empty", label: "No está vacío" },
];

const DATE_OPERATORS = [
  { value: "equals", label: "Igual a" },
  { value: "greater_than", label: "Después de" },
  { value: "less_than", label: "Antes de" },
  { value: "is_empty", label: "Está vacío" },
  { value: "is_not_empty", label: "No está vacío" },
];

const SELECT_OPERATORS = [
  { value: "equals", label: "Es" },
  { value: "not_equals", label: "No es" },
  { value: "in_list", label: "Está en" },
  { value: "is_empty", label: "Está vacío" },
  { value: "is_not_empty", label: "No está vacío" },
];

const BOOLEAN_OPERATORS = [
  { value: "equals", label: "Es" },
];

const LIST_OPERATORS = [
  { value: "contains", label: "Contiene" },
  { value: "is_empty", label: "Está vacío" },
  { value: "is_not_empty", label: "No está vacío" },
];

function getOperatorsForType(type: string) {
  switch (type) {
    case "number": return NUMBER_OPERATORS;
    case "date": return DATE_OPERATORS;
    case "select": return SELECT_OPERATORS;
    case "boolean": return BOOLEAN_OPERATORS;
    case "list": return LIST_OPERATORS;
    default: return TEXT_OPERATORS;
  }
}

const SYSTEM_FIELDS: FieldOption[] = [
  { value: "firstName", label: "Nombre", type: "text" },
  { value: "lastName", label: "Apellido", type: "text" },
  { value: "phone", label: "Teléfono", type: "text" },
  { value: "email", label: "Email", type: "text" },
  { value: "status", label: "Estado", type: "select", options: ["active", "inactive", "blocked"] },
  { value: "channelSource", label: "Canal", type: "select", options: ["whatsapp", "web", "import", "manual"] },
  { value: "tags", label: "Tags", type: "list" },
];

export function NewListModal({ tenantId, onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"static" | "dynamic">("static");
  const [logic, setLogic] = useState<"and" | "or">("and");
  const [conditions, setConditions] = useState<{ field: string; operator: string; value: string }[]>([
    { field: "status", operator: "equals", value: "" },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [allFields, setAllFields] = useState<FieldOption[]>(SYSTEM_FIELDS);

  useEffect(() => {
    getCustomFields(tenantId).then((fields) => {
      const customOpts: FieldOption[] = fields
        .filter((f) => !f.isSystem)
        .map((f) => ({
          value: f.fieldKey,
          label: f.fieldLabel,
          type: (f.fieldType === "computed" ? "text" : f.fieldType) as FieldOption["type"],
          options: f.options || undefined,
        }));
      setAllFields([...SYSTEM_FIELDS, ...customOpts]);
    }).catch(() => {});
  }, [tenantId]);

  const addCondition = () => {
    setConditions([...conditions, { field: "status", operator: "equals", value: "" }]);
  };

  const removeCondition = (index: number) => {
    setConditions(conditions.filter((_, i) => i !== index));
  };

  const updateCondition = (index: number, key: string, val: string) => {
    setConditions(conditions.map((c, i) => {
      if (i !== index) return c;
      const updated = { ...c, [key]: val };
      // Reset operator and value when field changes
      if (key === "field") {
        updated.operator = "equals";
        updated.value = "";
      }
      return updated;
    }));
  };

  const getFieldDef = (fieldValue: string) => allFields.find((f) => f.value === fieldValue);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("Ingresa un nombre para la lista.");
      return;
    }
    if (type === "dynamic" && conditions.every((c) => !c.value && c.operator !== "is_empty" && c.operator !== "is_not_empty")) {
      setError("Agrega al menos un filtro con valor.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await createRecordList({
        tenantId,
        name: name.trim(),
        type,
        filters: type === "dynamic" ? { logic, conditions: conditions.filter((c) => c.field) } : undefined,
      });
      onCreated();
    } catch {
      setError("Error al crear la lista.");
    } finally {
      setSaving(false);
    }
  };

  const needsValue = (op: string) => !["is_empty", "is_not_empty"].includes(op);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 backdrop-blur-sm py-12 px-4 overflow-y-auto"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-2xl shadow-2xl border border-white/30 p-6"
        style={{ background: 'rgba(255, 255, 255, 0.92)', backdropFilter: 'blur(20px)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5 shrink-0">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Nueva lista</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">Crea una lista estática o dinámica de contactos</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <div className="space-y-4 pb-1">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Nombre de la lista</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Clientes VIP, Inactivos 30 días..."
              autoComplete="off"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-inset focus:ring-brand-500 focus:border-brand-500 outline-none transition-all bg-white/60"
            />
          </div>

          {/* Type selector */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Tipo de lista</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setType("static")}
                className={`px-3 py-2.5 rounded-lg text-sm font-medium border transition-all ${type === "static" ? "border-brand-500 bg-brand-50 text-brand-700" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}
              >
                <span className="block text-sm font-medium">Estática</span>
                <span className="block text-[10px] text-gray-400 mt-0.5">Contactos fijos</span>
              </button>
              <button
                type="button"
                onClick={() => setType("dynamic")}
                className={`px-3 py-2.5 rounded-lg text-sm font-medium border transition-all ${type === "dynamic" ? "border-brand-500 bg-brand-50 text-brand-700" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}
              >
                <span className="block text-sm font-medium">Dinámica</span>
                <span className="block text-[10px] text-gray-400 mt-0.5">Basada en filtros</span>
              </button>
            </div>
          </div>

          {/* Dynamic filters */}
          {type === "dynamic" && (
            <div className="space-y-3 pt-3 border-t border-gray-100">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-gray-600">Condiciones</label>
                <Dropdown
                  value={logic}
                  options={[{ value: "and", label: "Cumple TODAS" }, { value: "or", label: "Cumple ALGUNA" }]}
                  onChange={(v) => setLogic(v as "and" | "or")}
                  width="w-36"
                />
              </div>

              <div className="space-y-2">
                {conditions.map((cond, i) => {
                  const fieldDef = getFieldDef(cond.field);
                  const operators = getOperatorsForType(fieldDef?.type || "text");

                  return (
                    <div key={i} className="flex items-start gap-2 p-3 rounded-lg bg-gray-50/80 border border-gray-100">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <Dropdown
                            value={cond.field}
                            options={allFields.map((f) => ({ value: f.value, label: f.label, sublabel: f.type }))}
                            onChange={(v) => updateCondition(i, "field", v)}
                            width="flex-1"
                            placeholder="Campo"
                          />
                          <Dropdown
                            value={cond.operator}
                            options={operators}
                            onChange={(v) => updateCondition(i, "operator", v)}
                            width="w-36"
                            placeholder="Operador"
                          />
                        </div>
                        {needsValue(cond.operator) && (
                          <div>
                            {fieldDef?.type === "select" && fieldDef.options ? (
                              <Dropdown
                                value={cond.value}
                                options={fieldDef.options.map((o) => ({ value: o, label: o }))}
                                onChange={(v) => updateCondition(i, "value", v)}
                                width="w-full"
                                placeholder="Seleccionar valor"
                              />
                            ) : fieldDef?.type === "boolean" ? (
                              <Dropdown
                                value={cond.value}
                                options={[{ value: "true", label: "Sí" }, { value: "false", label: "No" }]}
                                onChange={(v) => updateCondition(i, "value", v)}
                                width="w-full"
                                placeholder="Seleccionar"
                              />
                            ) : fieldDef?.type === "date" ? (
                              <input
                                type="date"
                                value={cond.value}
                                onChange={(e) => updateCondition(i, "value", e.target.value)}
                                className="w-full px-2.5 py-2 rounded-lg border border-gray-200 text-xs bg-white focus:ring-2 focus:ring-inset focus:ring-brand-500 outline-none"
                              />
                            ) : (
                              <input
                                type={fieldDef?.type === "number" ? "number" : "text"}
                                value={cond.value}
                                onChange={(e) => updateCondition(i, "value", e.target.value)}
                                placeholder={fieldDef?.type === "number" ? "0" : "Valor"}
                                className="w-full px-2.5 py-2 rounded-lg border border-gray-200 text-xs bg-white focus:ring-2 focus:ring-inset focus:ring-brand-500 outline-none"
                              />
                            )}
                          </div>
                        )}
                      </div>
                      {conditions.length > 1 && (
                        <button onClick={() => removeCondition(i)} className="p-1.5 mt-1 text-gray-400 hover:text-red-500 transition-colors rounded hover:bg-red-50">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={addCondition}
                className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-800 font-medium transition-colors"
              >
                <Plus className="h-3 w-3" />
                Agregar condición
              </button>
            </div>
          )}

          {type === "static" && (
            <p className="text-xs text-gray-400 bg-gray-50 px-3 py-2 rounded-lg">
              La lista se creará vacía. Podrás agregarle contactos desde la tabla principal.
            </p>
          )}

          {/* Error */}
          {error && (
            <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-gray-100 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 rounded-lg hover:bg-gray-100 transition-colors font-medium"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !name.trim()}
            className="relative px-5 py-2 text-sm rounded-lg bg-brand-800 hover:bg-brand-700 text-white font-medium transition-all disabled:opacity-50 flex items-center gap-2 overflow-hidden shadow-lg border border-white/10"
          >
            <span className="absolute inset-0 rounded-lg bg-gradient-to-br from-white/20 via-white/5 to-transparent pointer-events-none" />
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin relative z-10" />}
            <span className="relative z-10">{saving ? "Creando..." : "Crear lista"}</span>
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* Custom Dropdown component */
function Dropdown({
  value,
  options,
  onChange,
  width = "w-full",
  placeholder = "Seleccionar",
}: {
  value: string;
  options: { value: string; label: string; sublabel?: string }[];
  onChange: (value: string) => void;
  width?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className={`relative ${width}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg border border-gray-200 text-xs bg-white hover:border-gray-300 transition-colors text-left"
      >
        <span className={`truncate ${selected ? "text-gray-700" : "text-gray-400"}`}>
          {selected?.label || placeholder}
        </span>
        <ChevronDown className={`h-3 w-3 text-gray-400 shrink-0 ml-1 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-lg border border-gray-200 shadow-lg py-1 z-[60] max-h-48 overflow-y-auto">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full px-3 py-1.5 text-xs text-left transition-colors flex items-center justify-between ${opt.value === value ? "bg-brand-50 text-brand-700 font-medium" : "text-gray-700 hover:bg-gray-50"}`}
            >
              <span>{opt.label}</span>
              {opt.sublabel && <span className="text-[10px] text-gray-400">{opt.sublabel}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
