import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, X, Lock, ChevronDown, Settings2, Zap, ArrowLeft, Loader2 } from "lucide-react";
import headerBg from "@/assets/header-background.jpg";
import { useAuth } from "@/context/AuthContext";
import {
  getCustomFields,
  createCustomField,
  updateCustomField,
  deleteCustomField,
  generateFieldValues,
} from "@/services/api";
import type { CustomField } from "@/services/api";

const SYSTEM_FIELD_KEYS = [
  "firstName", "lastName", "fullName", "documentType", "documentNumber",
  "phone", "countryCode", "email", "gender", "birthDate",
  "city", "region",
  "status", "channelSource", "source", "score",
  "optInWhatsapp", "optInEmail",
  "lastContactAt", "lastActivityAt", "tags",
];

const FIELD_TYPES = [
  { value: "text", label: "Texto" },
  { value: "number", label: "Número" },
  { value: "date", label: "Fecha" },
  { value: "select", label: "Selección" },
  { value: "boolean", label: "Sí/No" },
  { value: "url", label: "URL" },
  { value: "array", label: "Lista" },
  { value: "computed", label: "Campo inteligente" },
];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

// === Glass Modal ===
function GlassModal({ open, onClose, children, wide }: { open: boolean; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className={`w-full rounded-2xl shadow-2xl border border-white/30 ${wide ? 'max-w-3xl' : 'max-w-lg'}`}
            style={{
              background: 'rgba(255, 255, 255, 0.88)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
            }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// === Toggle Component ===
function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-700">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`relative w-10 h-[22px] rounded-full transition-colors ${value ? "bg-brand-600" : "bg-gray-300"}`}
      >
        <span className={`absolute top-[3px] left-[3px] w-4 h-4 rounded-full bg-white shadow transition-transform ${value ? "translate-x-[18px]" : ""}`} />
      </button>
    </div>
  );
}

// === Group Autocomplete ===
function GroupAutocomplete({ value, onChange, existingGroups }: { value: string; onChange: (v: string) => void; existingGroups: string[] }) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setInputValue(value); }, [value]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const filtered = existingGroups.filter((g) =>
    g.toLowerCase().includes(inputValue.toLowerCase())
  );

  return (
    <div className="relative" ref={ref}>
      <input
        type="text"
        value={inputValue}
        onChange={(e) => { setInputValue(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => { setTimeout(() => onChange(inputValue.trim() || "general"), 150); }}
        onKeyDown={(e) => { if (e.key === "Enter") { onChange(inputValue.trim() || "general"); setOpen(false); } }}
        placeholder="Escribe o selecciona un grupo..."
        className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
      />
      {open && filtered.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-lg border border-gray-200 shadow-lg py-1 z-50 max-h-48 overflow-auto">
          {filtered.map((group) => (
            <button
              key={group}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(group); setInputValue(group); setOpen(false); }}
              className={`w-full px-4 py-2 text-sm text-left transition-colors capitalize ${value === group ? "bg-brand-50 text-brand-700 font-medium" : "text-gray-700 hover:bg-gray-50"}`}
            >
              {group}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// === Chip Input Component with drag & drop ===
// === Chip Input Component with drag reorder via framer-motion ===
import { Reorder } from "framer-motion";

function ChipItem({ chip, onRemove }: { chip: string; onRemove: () => void }) {
  return (
    <Reorder.Item
      value={chip}
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-200 text-gray-700 text-xs font-medium cursor-grab active:cursor-grabbing select-none active:shadow-md active:scale-105 active:bg-brand-100 active:text-brand-800 transition-colors"
      whileDrag={{ scale: 1.08, boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}
    >
      {chip}
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="h-3.5 w-3.5 rounded-full flex items-center justify-center hover:bg-gray-300 transition-colors"
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </Reorder.Item>
  );
}

function ChipInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === "," || e.key === "Enter") && inputValue.trim()) {
      e.preventDefault();
      onChange([...value, inputValue.trim()]);
      setInputValue("");
    } else if (e.key === "Backspace" && inputValue === "" && value.length > 0) {
      const lastChip = value[value.length - 1];
      onChange(value.slice(0, -1));
      setInputValue(lastChip);
    }
  };

  const handleBlur = () => {
    if (inputValue.trim()) {
      onChange([...value, inputValue.trim()]);
      setInputValue("");
    }
  };

  return (
    <div
      className="flex flex-wrap items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 focus-within:ring-2 focus-within:ring-brand-500 focus-within:border-transparent min-h-[42px] cursor-text"
      onClick={() => inputRef.current?.focus()}
    >
      <Reorder.Group
        axis="x"
        values={value}
        onReorder={onChange}
        className="flex flex-wrap items-center gap-1.5 list-none m-0 p-0"
      >
        {value.map((chip, i) => (
          <ChipItem
            key={chip}
            chip={chip}
            onRemove={() => onChange(value.filter((_, idx) => idx !== i))}
          />
        ))}
      </Reorder.Group>
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={value.length === 0 ? "Escribe y presiona , o Enter" : ""}
        className="flex-1 min-w-[80px] text-sm outline-none bg-transparent placeholder:text-gray-400"
      />
    </div>
  );
}

// === Default Value Selector (for select fields) ===
function DefaultValueSelector({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
      >
        <span className={value ? "text-gray-800" : "text-gray-400"}>
          {value || "Sin valor por defecto"}
        </span>
        <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 right-0 top-full mt-1 bg-white rounded-lg border border-gray-200 shadow-lg py-1 z-50 max-h-40 overflow-auto"
          >
            <button
              type="button"
              onClick={() => { onChange(""); setOpen(false); }}
              className={`w-full px-4 py-2 text-sm text-left transition-colors ${!value ? 'bg-brand-50 text-brand-700 font-medium' : 'text-gray-500 italic hover:bg-gray-50'}`}
            >
              Sin valor por defecto
            </button>
            {options.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => { onChange(opt); setOpen(false); }}
                className={`w-full px-4 py-2 text-sm text-left transition-colors ${value === opt ? 'bg-brand-50 text-brand-700 font-medium' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                {opt}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// === Computed Field Operations ===
interface OpDef {
  value: string;
  label: string;
  description: string;
  minFields: number;
  maxFields: number;
  outputType: string;
  hasSeparator?: boolean;
  hasTemplate?: boolean;
  hasCondition?: boolean;
}

const OPERATIONS: { category: string; ops: OpDef[] }[] = [
  {
    category: "Texto",
    ops: [
      { value: "concat", label: "Concatenar", description: "Une el valor de varios campos", minFields: 2, maxFields: 10, outputType: "text", hasSeparator: true },
      { value: "first_word", label: "Primera palabra", description: "Toma la primera palabra de un campo de texto", minFields: 1, maxFields: 1, outputType: "text" },
      { value: "uppercase", label: "Mayúsculas", description: "Convierte el texto a mayúsculas", minFields: 1, maxFields: 1, outputType: "text" },
      { value: "lowercase", label: "Minúsculas", description: "Convierte el texto a minúsculas", minFields: 1, maxFields: 1, outputType: "text" },
      { value: "template", label: "Plantilla", description: "Texto con variables {{campo}}", minFields: 0, maxFields: 0, outputType: "text", hasTemplate: true },
    ],
  },
  {
    category: "Numérico",
    ops: [
      { value: "sum", label: "Suma", description: "Suma los valores de los campos", minFields: 2, maxFields: 10, outputType: "number" },
      { value: "subtract", label: "Resta", description: "Resta el segundo campo del primero", minFields: 2, maxFields: 2, outputType: "number" },
      { value: "multiply", label: "Multiplicación", description: "Multiplica los valores", minFields: 2, maxFields: 10, outputType: "number" },
      { value: "divide", label: "División", description: "Divide el primer campo entre el segundo", minFields: 2, maxFields: 2, outputType: "number" },
      { value: "percentage", label: "Porcentaje", description: "Calcula el porcentaje (A/B × 100)", minFields: 2, maxFields: 2, outputType: "number" },
    ],
  },
  {
    category: "Lógica",
    ops: [
      { value: "if_then", label: "Si / Entonces", description: "Si un campo cumple una condición, retorna un valor", minFields: 1, maxFields: 1, outputType: "text", hasCondition: true },
      { value: "coalesce", label: "Primer valor disponible", description: "Retorna el primer campo que no esté vacío", minFields: 2, maxFields: 10, outputType: "text" },
    ],
  },
  {
    category: "Fecha",
    ops: [
      { value: "days_diff", label: "Diferencia en días", description: "Días entre dos fechas", minFields: 2, maxFields: 2, outputType: "number" },
      { value: "age", label: "Edad", description: "Calcula la edad basada en una fecha de nacimiento", minFields: 1, maxFields: 1, outputType: "number" },
    ],
  },
  {
    category: "Agregación",
    ops: [
      { value: "count", label: "Contar", description: "Cuenta los elementos de un campo lista/tags", minFields: 1, maxFields: 1, outputType: "number" },
    ],
  },
];

const ALL_OPS = OPERATIONS.flatMap((c) => c.ops);

interface ComputedConfig {
  operation: string;
  fields: string[];
  separator?: string;
  template?: string;
  condition?: { operator: string; value: string; thenValue: string; elseValue: string };
  outputType?: string;
}

// === Computed Field Builder ===
function ComputedFieldBuilder({
  value,
  onChange,
  availableFields,
}: {
  value: ComputedConfig;
  onChange: (v: ComputedConfig) => void;
  availableFields: { key: string; label: string }[];
}) {
  const [opSelectorOpen, setOpSelectorOpen] = useState(false);
  const [fieldSelectorOpen, setFieldSelectorOpen] = useState(false);
  const selectedOp = ALL_OPS.find((o) => o.value === value.operation);

  const addField = (key: string) => {
    if (selectedOp && value.fields.length >= (selectedOp.maxFields || 10)) return;
    onChange({ ...value, fields: [...value.fields, key] });
    setFieldSelectorOpen(false);
  };

  const removeField = (index: number) => {
    onChange({ ...value, fields: value.fields.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-4 pt-3 border-t border-gray-100">
      <div className="flex items-center gap-2">
        <div className="h-6 w-6 rounded-lg bg-purple-50 flex items-center justify-center">
          <Zap className="h-3.5 w-3.5 text-purple-600" />
        </div>
        <p className="text-xs font-semibold text-gray-700">Campo inteligente</p>
        <span className="text-[10px] text-gray-400">— Se calcula automáticamente</span>
      </div>

      {/* Step 1: Operation */}
      <div className="bg-gray-50 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="h-5 w-5 rounded-full bg-brand-600 text-white text-[10px] font-bold flex items-center justify-center">1</span>
          <span className="text-xs font-medium text-gray-700">¿Qué operación quieres realizar?</span>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setOpSelectorOpen((v) => !v)}
            className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <div className="flex items-center gap-2">
              {selectedOp ? (
                <>
                  <span className="text-gray-800 font-medium">{selectedOp.label}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-600">{OPERATIONS.find((c) => c.ops.includes(selectedOp))?.category}</span>
                </>
              ) : (
                <span className="text-gray-400">Selecciona una operación...</span>
              )}
            </div>
            <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${opSelectorOpen ? 'rotate-180' : ''}`} />
          </button>
          <AnimatePresence>
            {opSelectorOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="absolute left-0 right-0 top-full mt-1 bg-white rounded-lg border border-gray-200 shadow-lg py-1 z-50 max-h-60 overflow-auto"
              >
                {OPERATIONS.map((cat) => (
                  <div key={cat.category}>
                    <p className="px-4 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider bg-gray-50">{cat.category}</p>
                    {cat.ops.map((op) => (
                      <button
                        key={op.value}
                        type="button"
                        onClick={() => {
                          onChange({ ...value, operation: op.value, fields: [], outputType: op.outputType });
                          setOpSelectorOpen(false);
                        }}
                        className={`w-full px-4 py-2.5 text-left transition-colors ${value.operation === op.value ? 'bg-brand-50' : 'hover:bg-gray-50'}`}
                      >
                        <span className={`text-sm ${value.operation === op.value ? 'font-medium text-brand-700' : 'text-gray-700'}`}>{op.label}</span>
                        <p className="text-[11px] text-gray-400 mt-0.5">{op.description}</p>
                      </button>
                    ))}
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {selectedOp && (
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white border border-gray-100">
            <div className="text-[11px] text-gray-500">{selectedOp.description}</div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-50 text-brand-600 font-medium shrink-0">
              Resultado: {selectedOp.outputType === "text" ? "Texto" : "Número"}
            </span>
          </div>
        )}
      </div>

      {/* Step 2: Fields (if needed) */}
      {selectedOp && selectedOp.maxFields > 0 && (
        <div className="bg-gray-50 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-5 w-5 rounded-full bg-brand-600 text-white text-[10px] font-bold flex items-center justify-center">2</span>
              <span className="text-xs font-medium text-gray-700">¿Con cuáles campos?</span>
            </div>
            <span className="text-[10px] text-gray-400">{value.fields.length} de {selectedOp.maxFields} máx.</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {value.fields.map((fieldKey, i) => {
              const f = availableFields.find((af) => af.key === fieldKey);
              return (
                <motion.span
                  key={`${fieldKey}-${i}`}
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-xs font-medium text-gray-700 shadow-sm"
                >
                  <span className="text-[10px] text-gray-400 font-mono">{i + 1}.</span>
                  {f?.label || fieldKey}
                  <button type="button" onClick={() => removeField(i)} className="h-4 w-4 rounded flex items-center justify-center hover:bg-red-50 hover:text-red-500 text-gray-400 transition-colors">
                    <X className="h-3 w-3" />
                  </button>
                </motion.span>
              );
            })}

            {value.fields.length < (selectedOp.maxFields || 10) && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setFieldSelectorOpen((v) => !v)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-2 border-dashed border-gray-300 hover:border-brand-400 text-xs text-gray-500 hover:text-brand-600 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Campo
                </button>
                <AnimatePresence>
                  {fieldSelectorOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                      className="absolute left-0 top-full mt-1 w-52 bg-white rounded-lg border border-gray-200 shadow-lg py-1 z-50 max-h-48 overflow-auto"
                    >
                      {availableFields.map((af) => (
                        <button
                          key={af.key}
                          type="button"
                          onClick={() => addField(af.key)}
                          className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-between"
                        >
                          <span>{af.label}</span>
                          <span className="text-[10px] text-gray-400 font-mono">{af.key}</span>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 3: Extra config */}
      {selectedOp && (selectedOp.hasSeparator || selectedOp.hasTemplate || selectedOp.hasCondition) && (
        <div className="bg-gray-50 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="h-5 w-5 rounded-full bg-brand-600 text-white text-[10px] font-bold flex items-center justify-center">3</span>
            <span className="text-xs font-medium text-gray-700">Configuración adicional</span>
          </div>

          {selectedOp.hasSeparator && (
            <div>
              <label className="block text-xs text-gray-600 mb-1">Separador entre valores</label>
              <input
                type="text"
                value={value.separator || ""}
                onChange={(e) => onChange({ ...value, separator: e.target.value })}
                placeholder='Ej: " " (espacio), " - ", ", "'
                className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
            </div>
          )}

          {selectedOp.hasTemplate && (
            <div>
              <label className="block text-xs text-gray-600 mb-1">Plantilla de texto</label>
              <input
                type="text"
                value={value.template || ""}
                onChange={(e) => onChange({ ...value, template: e.target.value })}
                placeholder="Hola {{firstName}}, tu estado es {{status}}"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent font-mono"
              />
              <p className="text-[11px] text-gray-400 mt-1">Usa {"{{campo}}"} para insertar valores dinámicos</p>
            </div>
          )}

          {selectedOp.hasCondition && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Si el campo...</label>
                  <ConditionOperatorSelector
                    value={value.condition?.operator || "equals"}
                    onChange={(op) => onChange({ ...value, condition: { operator: op, value: value.condition?.value || "", thenValue: value.condition?.thenValue || "", elseValue: value.condition?.elseValue || "" } })}
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Este valor:</label>
                  <input
                    type="text"
                    value={value.condition?.value || ""}
                    onChange={(e) => onChange({ ...value, condition: { ...value.condition!, value: e.target.value } })}
                    placeholder="Valor"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">✓ Entonces retorna:</label>
                  <input
                    type="text"
                    value={value.condition?.thenValue || ""}
                    onChange={(e) => onChange({ ...value, condition: { ...value.condition!, thenValue: e.target.value } })}
                    placeholder="Resultado verdadero"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">✗ Si no, retorna:</label>
                  <input
                    type="text"
                    value={value.condition?.elseValue || ""}
                    onChange={(e) => onChange({ ...value, condition: { ...value.condition!, elseValue: e.target.value } })}
                    placeholder="Resultado falso"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Preview formula */}
      {selectedOp && value.fields.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-purple-50 border border-purple-100">
          <Zap className="h-3.5 w-3.5 text-purple-500 shrink-0" />
          <p className="text-xs text-purple-700 font-mono">
            {value.operation === "concat" && `${value.fields.join(` ${value.separator ? `"${value.separator}"` : "+"} `)}`}
            {value.operation === "sum" && value.fields.join(" + ")}
            {value.operation === "subtract" && value.fields.join(" - ")}
            {value.operation === "multiply" && value.fields.join(" × ")}
            {value.operation === "divide" && value.fields.join(" ÷ ")}
            {value.operation === "percentage" && `(${value.fields[0]} / ${value.fields[1]}) × 100`}
            {value.operation === "uppercase" && `UPPER(${value.fields[0]})`}
            {value.operation === "lowercase" && `LOWER(${value.fields[0]})`}
            {value.operation === "age" && `AGE(${value.fields[0]})`}
            {value.operation === "days_diff" && `DAYS(${value.fields[0]} → ${value.fields[1]})`}
            {value.operation === "count" && `COUNT(${value.fields[0]})`}
            {value.operation === "coalesce" && `FIRST_NOT_EMPTY(${value.fields.join(", ")})`}
            {value.operation === "if_then" && `IF(${value.fields[0]} ${value.condition?.operator || "="} "${value.condition?.value || "?"}") → "${value.condition?.thenValue || "..."}" : "${value.condition?.elseValue || "..."}"`}
          </p>
        </div>
      )}
    </div>
  );
}

// === Condition Operator Selector ===
function ConditionOperatorSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const operators = [
    { value: "equals", label: "Es igual a" },
    { value: "not_equals", label: "No es igual a" },
    { value: "contains", label: "Contiene" },
    { value: "greater_than", label: "Mayor que" },
    { value: "less_than", label: "Menor que" },
    { value: "is_empty", label: "Está vacío" },
    { value: "is_not_empty", label: "No está vacío" },
  ];
  const selected = operators.find((o) => o.value === value);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
      >
        <span className="text-gray-700">{selected?.label || "Seleccionar"}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 right-0 top-full mt-1 bg-white rounded-lg border border-gray-200 shadow-lg py-1 z-50"
          >
            {operators.map((op) => (
              <button
                key={op.value}
                type="button"
                onClick={() => { onChange(op.value); setOpen(false); }}
                className={`w-full px-3 py-1.5 text-sm text-left transition-colors ${value === op.value ? 'bg-brand-50 text-brand-700 font-medium' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                {op.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ClientSchema() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [allFields, setAllFields] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(true);

  // Create modal
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Edit modal (unified)
  const [editField, setEditField] = useState<CustomField | null>(null);
  const [editForm, setEditForm] = useState({
    fieldLabel: "",
    fieldGroup: "general",
    options: [] as string[],
    isRequired: false,
    isUnique: false,
    isNullable: true,
    defaultValue: "",
    validations: {} as Record<string, any>,
  });

  // Create form
  const [createForm, setCreateForm] = useState({
    fieldLabel: "",
    fieldType: "text",
    options: [] as string[],
    isRequired: false,
    isUnique: false,
    isNullable: true,
    defaultValue: "",
    validations: {} as Record<string, any>,
  });
  const [fieldTypeOpen, setFieldTypeOpen] = useState(false);
  const fieldTypeRef = useRef<HTMLDivElement>(null);

  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateResult, setGenerateResult] = useState("");
  const [showGenerateConfirm, setShowGenerateConfirm] = useState(false);

  const tenantRole = user?.tenantRoles.find((tr) => tr.tenant.slug === slug);
  const tenantId = tenantRole?.tenantId || "";

  const systemFieldsRaw = allFields.filter((f) => f.isSystem || SYSTEM_FIELD_KEYS.includes(f.fieldKey));
  const seenKeys = new Set<string>();
  const systemFields = systemFieldsRaw.filter((f) => {
    if (seenKeys.has(f.fieldKey)) return false;
    seenKeys.add(f.fieldKey);
    return true;
  });
  const customFields = allFields.filter((f) => !f.isSystem && !SYSTEM_FIELD_KEYS.includes(f.fieldKey));

  useEffect(() => { if (tenantId) loadFields(); }, [tenantId]);

  const loadFields = async () => {
    setLoading(true);
    try { setAllFields(await getCustomFields(tenantId)); } catch {} finally { setLoading(false); }
  };

  // === Open edit modal ===
  const openEditModal = (field: CustomField) => {
    setEditField(field);
    setGenerateResult("");
    setEditForm({
      fieldLabel: field.fieldLabel,
      fieldGroup: field.fieldGroup || "general",
      options: field.options || [],
      isRequired: field.isRequired,
      isUnique: field.isUnique ?? false,
      isNullable: field.isNullable ?? true,
      defaultValue: field.defaultValue || "",
      validations: field.validations || {},
    });
  };

  // === Save edit ===
  const handleSaveEdit = async () => {
    if (!editField || !editForm.fieldLabel.trim()) return;
    setSaving(true);
    try {
      const payload: any = {
        fieldLabel: editForm.fieldLabel.trim(),
        fieldGroup: editForm.fieldGroup,
        isRequired: editForm.isRequired,
        isUnique: editForm.isUnique,
        isNullable: editForm.isNullable,
        defaultValue: editForm.defaultValue.trim() || null,
        validations: Object.keys(editForm.validations).length > 0 ? editForm.validations : null,
      };
      if (editField.fieldType === "select") {
        payload.options = editForm.options;
      }
      await updateCustomField(editField.id, payload);
      setAllFields((prev) =>
        prev.map((f) => (f.id === editField.id ? { ...f, ...payload } : f))
      );
      setEditField(null);
    } catch {} finally { setSaving(false); }
  };

  // === Create ===
  const handleCreate = async (andGenerate = false) => {
    if (!createForm.fieldLabel.trim()) return;
    setSaving(true);
    try {
      const created = await createCustomField({
        tenantId,
        fieldKey: slugify(createForm.fieldLabel),
        fieldLabel: createForm.fieldLabel.trim(),
        fieldType: createForm.fieldType,
        options: createForm.fieldType === "select" ? createForm.options : undefined,
        isRequired: createForm.isRequired,
        sortOrder: customFields.length,
        validations: Object.keys(createForm.validations).length > 0 ? createForm.validations : undefined,
      });
      // If computed field and user wants to generate values now
      if (andGenerate && createForm.fieldType === "computed" && created?.id) {
        try {
          await generateFieldValues(created.id);
        } catch {
          // silently continue — field was created successfully
        }
      }
      setShowCreateModal(false);
      setCreateForm({ fieldLabel: "", fieldType: "text", options: [], isRequired: false, isUnique: false, isNullable: true, defaultValue: "", validations: {} });
      setFieldTypeOpen(false);
      await loadFields();
    } catch {} finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    try { await deleteCustomField(id); setAllFields((prev) => prev.filter((f) => f.id !== id)); } catch {}
  };

  // === Render field card ===
  const renderFieldCard = (field: CustomField, isSystem: boolean) => (
    <div
      key={field.id}
      className={`flex flex-col p-4 rounded-xl border hover:shadow-sm transition-all group cursor-pointer ${isSystem ? "bg-gray-50/80 border-gray-100 hover:border-gray-200" : "bg-emerald-50/30 border-emerald-100/60 hover:border-emerald-200"}`}
      onClick={() => openEditModal(field)}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-800">{field.fieldLabel}</span>
        <div className="flex items-center gap-1">
          {!isSystem && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">Custom</span>
          )}
          <button className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-white text-gray-400 hover:text-brand-600 transition-all">
            <Settings2 className="h-3.5 w-3.5" />
          </button>
          {!isSystem && (
            <button
              onClick={(e) => { e.stopPropagation(); handleDelete(field.id); }}
              className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500 transition-all"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      <span className="text-xs text-gray-400 mt-1 font-mono">{field.fieldKey}</span>
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 font-medium">
          {FIELD_TYPES.find((t) => t.value === field.fieldType)?.label || field.fieldType}
        </span>
        {field.isRequired && (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-50 text-red-600 font-medium">Requerido</span>
        )}
        {field.isUnique && (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-purple-50 text-purple-600 font-medium">Único</span>
        )}
      </div>
      {field.fieldType === "select" && field.options && field.options.length > 0 && (
        <div className="mt-2 flex items-center gap-1 flex-wrap">
          {field.options.slice(0, 4).map((opt) => (
            <span key={opt} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200/80 text-gray-600">{opt}</span>
          ))}
          {field.options.length > 4 && (
            <span className="text-[10px] text-gray-400">+{field.options.length - 4}</span>
          )}
        </div>
      )}
      {field.defaultValue && (
        <span className="text-[11px] text-gray-400 mt-1.5">Default: {field.defaultValue}</span>
      )}
    </div>
  );

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Hero */}
      <div className="px-8 pt-16 pb-4 shrink-0 rounded-b-2xl" style={{ backgroundImage: `url(${headerBg})`, backgroundSize: "cover", backgroundPosition: "center" }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(`/${slug}/clients`)}
              className="h-8 w-8 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-white">Esquema de Contactos</h1>
              <p className="text-brand-300 mt-0.5 text-sm">Gestiona los campos de información de tus contactos</p>
            </div>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="relative flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-sm font-medium transition-all overflow-hidden bg-white/15 hover:bg-white/25 border border-white/20"
          >
            <Plus className="h-4 w-4" />
            <span>Agregar campo</span>
          </button>
        </div>
      </div>

      {/* Content - All fields unified in one card */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1, ease: "easeOut" }} className="flex-1 min-h-0 overflow-auto py-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-5">
            <h2 className="text-base font-semibold text-gray-800">Campos del esquema</h2>
            <span className="text-xs text-gray-400">{allFields.length} campos · Click para editar</span>
          </div>
          {loading ? (
            <p className="text-sm text-gray-500">Cargando...</p>
          ) : (() => {
            // Merge all fields, group by fieldGroup
            const allUniqueFields = [...systemFields, ...customFields];
            const grouped: Record<string, CustomField[]> = {};
            for (const f of allUniqueFields) {
              const g = (f as any).fieldGroup || "general";
              if (!grouped[g]) grouped[g] = [];
              grouped[g].push(f);
            }
            // Sort groups: known ones first, then alphabetical
            const KNOWN_ORDER = ["identificacion", "contacto", "demografia", "ubicacion", "segmentacion", "consentimiento", "actividad"];
            const groupKeys = Object.keys(grouped).sort((a, b) => {
              const ia = KNOWN_ORDER.indexOf(a);
              const ib = KNOWN_ORDER.indexOf(b);
              if (ia !== -1 && ib !== -1) return ia - ib;
              if (ia !== -1) return -1;
              if (ib !== -1) return 1;
              if (a === "general") return 1;
              if (b === "general") return -1;
              return a.localeCompare(b);
            });

            return groupKeys.map((g) => (
              <div key={g} className="mb-5 last:mb-0">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2.5 px-1">{g}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {grouped[g].map((f) => renderFieldCard(f, f.isSystem || SYSTEM_FIELD_KEYS.includes(f.fieldKey)))}
                </div>
              </div>
            ));
          })()}
        </div>
      </motion.div>

      {/* === EDIT FIELD MODAL (unified) === */}
      <GlassModal wide={editField?.fieldType === "computed"} open={!!editField} onClose={() => setEditField(null)}>
        <div className="p-6 max-h-[80vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Configurar campo</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Modifica las propiedades de <span className="font-mono text-gray-500">{editField?.fieldKey}</span>
              </p>
            </div>
            <button onClick={() => setEditField(null)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X className="h-5 w-5" /></button>
          </div>

          <div className="space-y-4">
            {/* Label */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Etiqueta</label>
              <input
                autoFocus
                type="text"
                value={editForm.fieldLabel}
                onChange={(e) => setEditForm((f) => ({ ...f, fieldLabel: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-400 mt-1">API: <span className="font-mono text-gray-500">{editField?.fieldKey}</span> · Tipo: <span className="text-brand-600">{FIELD_TYPES.find((t) => t.value === editField?.fieldType)?.label}</span></p>
            </div>

            {/* Group - autocomplete */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Agrupación</label>
              <GroupAutocomplete
                value={editForm.fieldGroup}
                onChange={(v) => setEditForm((f) => ({ ...f, fieldGroup: v }))}
                existingGroups={[...new Set(allFields.map((f) => f.fieldGroup).filter(Boolean))]}
              />
            </div>

            {/* Options (if select) */}
            {editField?.fieldType === "select" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Valores permitidos</label>
                <ChipInput
                  value={editForm.options}
                  onChange={(v) => setEditForm((f) => ({ ...f, options: v }))}
                />
              </div>
            )}

            {/* Default value */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valor por defecto</label>
              {editField?.fieldType === "select" && editForm.options.length > 0 ? (
                <DefaultValueSelector
                  options={editForm.options}
                  value={editForm.defaultValue}
                  onChange={(v) => setEditForm((f) => ({ ...f, defaultValue: v }))}
                />
              ) : (
                <input
                  type="text"
                  value={editForm.defaultValue}
                  onChange={(e) => setEditForm((f) => ({ ...f, defaultValue: e.target.value }))}
                  placeholder="Dejar vacío si no aplica"
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              )}
            </div>

            {/* Type-specific configurations */}
            {editField?.fieldType === "text" && (
              <div className="space-y-3 pt-3 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Configuración de texto</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Longitud máxima</label>
                    <input
                      type="number"
                      value={editForm.validations.maxLength || ""}
                      onChange={(e) => setEditForm((f) => ({ ...f, validations: { ...f.validations, maxLength: e.target.value ? Number(e.target.value) : undefined } }))}
                      placeholder="Sin límite"
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Patrón (regex)</label>
                    <input
                      type="text"
                      value={editForm.validations.pattern || ""}
                      onChange={(e) => setEditForm((f) => ({ ...f, validations: { ...f.validations, pattern: e.target.value || undefined } }))}
                      placeholder="Ej: ^[A-Z].*"
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Placeholder</label>
                  <input
                    type="text"
                    value={editForm.validations.placeholder || ""}
                    onChange={(e) => setEditForm((f) => ({ ...f, validations: { ...f.validations, placeholder: e.target.value || undefined } }))}
                    placeholder="Texto de ayuda en el campo"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  />
                </div>
              </div>
            )}

            {editField?.fieldType === "number" && (
              <div className="space-y-3 pt-3 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Configuración numérica</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Mínimo</label>
                    <input
                      type="number"
                      value={editForm.validations.min ?? ""}
                      onChange={(e) => setEditForm((f) => ({ ...f, validations: { ...f.validations, min: e.target.value !== "" ? Number(e.target.value) : undefined } }))}
                      placeholder="—"
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Máximo</label>
                    <input
                      type="number"
                      value={editForm.validations.max ?? ""}
                      onChange={(e) => setEditForm((f) => ({ ...f, validations: { ...f.validations, max: e.target.value !== "" ? Number(e.target.value) : undefined } }))}
                      placeholder="—"
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Decimales</label>
                    <input
                      type="number"
                      min="0"
                      value={editForm.validations.decimals ?? ""}
                      onChange={(e) => setEditForm((f) => ({ ...f, validations: { ...f.validations, decimals: e.target.value !== "" ? Number(e.target.value) : undefined } }))}
                      placeholder="0"
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>
            )}

            {editField?.fieldType === "date" && (
              <div className="space-y-3 pt-3 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Configuración de fecha</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Fecha mínima</label>
                    <input
                      type="date"
                      value={editForm.validations.minDate || ""}
                      onChange={(e) => setEditForm((f) => ({ ...f, validations: { ...f.validations, minDate: e.target.value || undefined } }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Fecha máxima</label>
                    <input
                      type="date"
                      value={editForm.validations.maxDate || ""}
                      onChange={(e) => setEditForm((f) => ({ ...f, validations: { ...f.validations, maxDate: e.target.value || undefined } }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>
            )}

            {editField?.fieldType === "select" && (
              <div className="space-y-3 pt-3 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Configuración de selección</p>
                <Toggle
                  label="Permitir selección múltiple"
                  value={editForm.validations.multiple || false}
                  onChange={(v) => setEditForm((f) => ({ ...f, validations: { ...f.validations, multiple: v } }))}
                />
              </div>
            )}

            {editField?.fieldType === "boolean" && (
              <div className="space-y-3 pt-3 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Configuración booleano</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Etiqueta para Sí</label>
                    <input
                      type="text"
                      value={editForm.validations.trueLabel || ""}
                      onChange={(e) => setEditForm((f) => ({ ...f, validations: { ...f.validations, trueLabel: e.target.value || undefined } }))}
                      placeholder="Sí"
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Etiqueta para No</label>
                    <input
                      type="text"
                      value={editForm.validations.falseLabel || ""}
                      onChange={(e) => setEditForm((f) => ({ ...f, validations: { ...f.validations, falseLabel: e.target.value || undefined } }))}
                      placeholder="No"
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>
            )}

            {editField?.fieldType === "url" && (
              <div className="space-y-3 pt-3 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Configuración de URL</p>
                <Toggle
                  label="Validar formato URL"
                  value={editForm.validations.validateFormat !== false}
                  onChange={(v) => setEditForm((f) => ({ ...f, validations: { ...f.validations, validateFormat: v } }))}
                />
              </div>
            )}

            {editField?.fieldType === "array" && (
              <div className="space-y-3 pt-3 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Configuración de lista</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Máximo de elementos</label>
                    <input
                      type="number"
                      min="1"
                      value={editForm.validations.maxItems || ""}
                      onChange={(e) => setEditForm((f) => ({ ...f, validations: { ...f.validations, maxItems: e.target.value ? Number(e.target.value) : undefined } }))}
                      placeholder="Sin límite"
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Separador</label>
                    <input
                      type="text"
                      value={editForm.validations.separator || ""}
                      onChange={(e) => setEditForm((f) => ({ ...f, validations: { ...f.validations, separator: e.target.value || undefined } }))}
                      placeholder=","
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>
            )}

            {editField?.fieldType === "computed" && (
              <ComputedFieldBuilder
                value={editForm.validations.computed || { operation: "", fields: [] }}
                onChange={(computed) => setEditForm((f) => ({ ...f, validations: { ...f.validations, computed } }))}
                availableFields={allFields.filter((f) => f.id !== editField.id).map((f) => ({ key: f.fieldKey, label: f.fieldLabel }))}
              />
            )}

            {/* General toggles - inline */}
            <div className="flex items-center gap-6 pt-3 border-t border-gray-100">
              <Toggle label="Requerido" value={editForm.isRequired} onChange={(v) => setEditForm((f) => ({ ...f, isRequired: v }))} />
              <Toggle label="Único" value={editForm.isUnique} onChange={(v) => setEditForm((f) => ({ ...f, isUnique: v }))} />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-between gap-3 mt-6 pt-4 border-t border-gray-100">
            <div className="flex items-center gap-3">
              {editField?.fieldType === "computed" && (
                <button
                  type="button"
                  onClick={() => setShowGenerateConfirm(true)}
                  disabled={generating}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-purple-700 rounded-lg hover:bg-purple-50 transition-colors border border-purple-200 disabled:opacity-50"
                >
                  {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                  {generating ? "Generando..." : "Generar valores"}
                </button>
              )}
              {generateResult && (
                <span className={`text-xs font-medium ${generateResult.startsWith("✓") ? "text-green-600" : "text-red-500"}`}>
                  {generateResult}
                </span>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setEditField(null)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 rounded-lg hover:bg-gray-100 transition-colors">Cancelar</button>
              <button
                onClick={handleSaveEdit}
                disabled={saving || !editForm.fieldLabel.trim()}
                className="relative px-5 py-2.5 rounded-lg text-white font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden bg-brand-800 hover:bg-brand-700 shadow-lg border border-white/10"
              >
                <span className="absolute inset-0 rounded-lg bg-gradient-to-br from-white/20 via-white/5 to-transparent pointer-events-none" />
                <span className="relative">{saving ? "Guardando..." : "Guardar cambios"}</span>
              </button>
            </div>
          </div>
        </div>
      </GlassModal>

      {/* === CREATE FIELD MODAL === */}
      <GlassModal wide={createForm.fieldType === "computed"} open={showCreateModal} onClose={() => { setShowCreateModal(false); setFieldTypeOpen(false); }}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Nuevo campo</h3>
              <p className="text-xs text-gray-400 mt-0.5">Agrega un campo personalizado al esquema de contactos</p>
            </div>
            <button onClick={() => { setShowCreateModal(false); setFieldTypeOpen(false); }} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X className="h-5 w-5" /></button>
          </div>

          <div className="space-y-4">
            {/* Row 1: Label + Type side by side */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Etiqueta</label>
                <input
                  autoFocus
                  type="text"
                  value={createForm.fieldLabel}
                  onChange={(e) => setCreateForm((f) => ({ ...f, fieldLabel: e.target.value }))}
                  placeholder="Ej: Empresa, Cargo..."
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
                {createForm.fieldLabel && (
                  <p className="text-xs text-gray-400 mt-1">Key: <span className="font-mono text-gray-500">{slugify(createForm.fieldLabel)}</span></p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de campo</label>
                <div className="relative" ref={fieldTypeRef}>
                  <button
                    type="button"
                    onClick={() => setFieldTypeOpen((v) => !v)}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  >
                    <span>{FIELD_TYPES.find((t) => t.value === createForm.fieldType)?.label}</span>
                    <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${fieldTypeOpen ? 'rotate-180' : ''}`} />
                  </button>
                  <AnimatePresence>
                    {fieldTypeOpen && (
                      <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }} className="absolute left-0 right-0 top-full mt-1 bg-white rounded-lg border border-gray-200 shadow-lg py-1 z-50">
                        {FIELD_TYPES.map((t) => (
                          <button key={t.value} type="button" onClick={() => { setCreateForm((f) => ({ ...f, fieldType: t.value })); setFieldTypeOpen(false); }} className={`w-full px-4 py-2 text-sm text-left transition-colors ${createForm.fieldType === t.value ? 'bg-brand-50 text-brand-700 font-medium' : 'text-gray-700 hover:bg-gray-50'}`}>
                            {t.label}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>

            {/* Row 2: Options + Default value side by side */}
            {createForm.fieldType === "select" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Opciones</label>
                <ChipInput
                  value={createForm.options}
                  onChange={(v) => setCreateForm((f) => ({ ...f, options: v }))}
                />
              </div>
            )}

            {/* Default value */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valor por defecto</label>
              {createForm.fieldType === "select" && createForm.options.length > 0 ? (
                <DefaultValueSelector
                  options={createForm.options}
                  value={createForm.defaultValue}
                  onChange={(v) => setCreateForm((f) => ({ ...f, defaultValue: v }))}
                />
              ) : (
                <input type="text" value={createForm.defaultValue} onChange={(e) => setCreateForm((f) => ({ ...f, defaultValue: e.target.value }))} placeholder="Opcional" className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent" />
              )}
            </div>

            {/* Type-specific configurations */}
            {createForm.fieldType === "text" && (
              <div className="space-y-3 pt-3 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Configuración de texto</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Longitud máxima</label>
                    <input type="number" value={createForm.validations.maxLength || ""} onChange={(e) => setCreateForm((f) => ({ ...f, validations: { ...f.validations, maxLength: e.target.value ? Number(e.target.value) : undefined } }))} placeholder="Sin límite" className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Placeholder</label>
                    <input type="text" value={createForm.validations.placeholder || ""} onChange={(e) => setCreateForm((f) => ({ ...f, validations: { ...f.validations, placeholder: e.target.value || undefined } }))} placeholder="Texto de ayuda" className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent" />
                  </div>
                </div>
              </div>
            )}

            {createForm.fieldType === "number" && (
              <div className="space-y-3 pt-3 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Configuración numérica</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Mínimo</label>
                    <input type="number" value={createForm.validations.min ?? ""} onChange={(e) => setCreateForm((f) => ({ ...f, validations: { ...f.validations, min: e.target.value !== "" ? Number(e.target.value) : undefined } }))} placeholder="—" className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Máximo</label>
                    <input type="number" value={createForm.validations.max ?? ""} onChange={(e) => setCreateForm((f) => ({ ...f, validations: { ...f.validations, max: e.target.value !== "" ? Number(e.target.value) : undefined } }))} placeholder="—" className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Decimales</label>
                    <input type="number" min="0" value={createForm.validations.decimals ?? ""} onChange={(e) => setCreateForm((f) => ({ ...f, validations: { ...f.validations, decimals: e.target.value !== "" ? Number(e.target.value) : undefined } }))} placeholder="0" className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent" />
                  </div>
                </div>
              </div>
            )}

            {createForm.fieldType === "date" && (
              <div className="space-y-3 pt-3 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Configuración de fecha</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Fecha mínima</label>
                    <input type="date" value={createForm.validations.minDate || ""} onChange={(e) => setCreateForm((f) => ({ ...f, validations: { ...f.validations, minDate: e.target.value || undefined } }))} className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Fecha máxima</label>
                    <input type="date" value={createForm.validations.maxDate || ""} onChange={(e) => setCreateForm((f) => ({ ...f, validations: { ...f.validations, maxDate: e.target.value || undefined } }))} className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent" />
                  </div>
                </div>
              </div>
            )}

            {createForm.fieldType === "select" && (
              <div className="space-y-3 pt-3 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Configuración de selección</p>
                <Toggle label="Permitir selección múltiple" value={createForm.validations.multiple || false} onChange={(v) => setCreateForm((f) => ({ ...f, validations: { ...f.validations, multiple: v } }))} />
              </div>
            )}

            {createForm.fieldType === "boolean" && (
              <div className="space-y-3 pt-3 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Configuración booleano</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Etiqueta para Sí</label>
                    <input type="text" value={createForm.validations.trueLabel || ""} onChange={(e) => setCreateForm((f) => ({ ...f, validations: { ...f.validations, trueLabel: e.target.value || undefined } }))} placeholder="Sí" className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Etiqueta para No</label>
                    <input type="text" value={createForm.validations.falseLabel || ""} onChange={(e) => setCreateForm((f) => ({ ...f, validations: { ...f.validations, falseLabel: e.target.value || undefined } }))} placeholder="No" className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent" />
                  </div>
                </div>
              </div>
            )}

            {createForm.fieldType === "url" && (
              <div className="space-y-3 pt-3 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Configuración de URL</p>
                <Toggle label="Validar formato URL" value={createForm.validations.validateFormat !== false} onChange={(v) => setCreateForm((f) => ({ ...f, validations: { ...f.validations, validateFormat: v } }))} />
              </div>
            )}

            {createForm.fieldType === "array" && (
              <div className="space-y-3 pt-3 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Configuración de lista</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Máximo de elementos</label>
                    <input type="number" min="1" value={createForm.validations.maxItems || ""} onChange={(e) => setCreateForm((f) => ({ ...f, validations: { ...f.validations, maxItems: e.target.value ? Number(e.target.value) : undefined } }))} placeholder="Sin límite" className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Separador</label>
                    <input type="text" value={createForm.validations.separator || ""} onChange={(e) => setCreateForm((f) => ({ ...f, validations: { ...f.validations, separator: e.target.value || undefined } }))} placeholder="," className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent" />
                  </div>
                </div>
              </div>
            )}

            {createForm.fieldType === "computed" && (
              <ComputedFieldBuilder
                value={createForm.validations.computed || { operation: "", fields: [] }}
                onChange={(computed) => setCreateForm((f) => ({ ...f, validations: { ...f.validations, computed } }))}
                availableFields={allFields.map((f) => ({ key: f.fieldKey, label: f.fieldLabel }))}
              />
            )}

            {/* Toggles - inline */}
            <div className="flex items-center gap-6 pt-3 border-t border-gray-100">
              <Toggle label="Campo requerido" value={createForm.isRequired} onChange={(v) => setCreateForm((f) => ({ ...f, isRequired: v }))} />
              <Toggle label="Valor único" value={createForm.isUnique} onChange={(v) => setCreateForm((f) => ({ ...f, isUnique: v }))} />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
            <button onClick={() => { setShowCreateModal(false); setFieldTypeOpen(false); }} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 rounded-lg hover:bg-gray-100 transition-colors">Cancelar</button>
            {createForm.fieldType === "computed" && (
              <button
                onClick={() => handleCreate(true)}
                disabled={!createForm.fieldLabel.trim() || saving}
                className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-purple-700 rounded-lg hover:bg-purple-50 transition-colors border border-purple-200 disabled:opacity-50"
              >
                <Zap className="h-3.5 w-3.5" />
                Crear y generar
              </button>
            )}
            <button
              onClick={() => handleCreate(false)}
              disabled={!createForm.fieldLabel.trim() || saving}
              className="relative px-5 py-2.5 rounded-lg text-white font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden bg-brand-800 hover:bg-brand-700 shadow-lg border border-white/10"
            >
              <span className="absolute inset-0 rounded-lg bg-gradient-to-br from-white/20 via-white/5 to-transparent pointer-events-none" />
              <span className="relative">{saving ? "Creando..." : "Crear campo"}</span>
            </button>
          </div>
        </div>
      </GlassModal>

      {/* === GENERATE CONFIRM MODAL === */}
      <GlassModal open={showGenerateConfirm} onClose={() => setShowGenerateConfirm(false)}>
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center">
              <Zap className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Generar valores</h3>
              <p className="text-xs text-gray-500 mt-0.5">Esta acción recalculará el campo para todos los contactos existentes</p>
            </div>
          </div>
          <p className="text-sm text-gray-600 mb-5">
            Se generarán/actualizarán los valores del campo <strong>{editField?.fieldLabel}</strong> en todos los contactos del tenant. Esto puede tardar unos segundos dependiendo de la cantidad de contactos.
          </p>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setShowGenerateConfirm(false)}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={async () => {
                if (!editField) return;
                setShowGenerateConfirm(false);
                setGenerating(true);
                setGenerateResult("");
                try {
                  const result = await generateFieldValues(editField.id);
                  setGenerateResult(`✓ ${result.updated} contactos actualizados`);
                } catch {
                  setGenerateResult("Error: verifica que la fórmula esté configurada correctamente");
                } finally {
                  setGenerating(false);
                }
              }}
              className="flex items-center gap-1.5 px-5 py-2 text-sm font-medium text-white rounded-lg bg-purple-600 hover:bg-purple-700 transition-colors"
            >
              <Zap className="h-3.5 w-3.5" />
              Generar ahora
            </button>
          </div>
        </div>
      </GlassModal>
    </div>
  );
}
