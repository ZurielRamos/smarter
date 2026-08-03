import { useState, useRef, useEffect, useCallback } from "react";
import { X, Plus, Trash2, ChevronDown, Users, Layers } from "lucide-react";
import { motion } from "framer-motion";
import { createRecordList, getCustomFields } from "@/services/api";
import axios from "axios";

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "/api" });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

interface Props {
  tenantId: string;
  onClose: () => void;
  onCreated: () => void;
  editData?: {
    id: string;
    name: string;
    type: "static" | "dynamic";
    filters: any;
  } | null;
}

interface FieldOption {
  value: string;
  label: string;
  type: "text" | "number" | "date" | "select" | "boolean" | "list";
  options?: string[];
}

interface Condition {
  field: string;
  operator: string;
  value: string;
}

interface ConditionGroup {
  logic: "and" | "or";
  conditions: Condition[];
}

const TEXT_OPERATORS = [
  { value: "equals", label: "Es igual a" },
  { value: "not_equals", label: "Es diferente de" },
  { value: "contains", label: "Contiene" },
  { value: "starts_with", label: "Empieza con" },
  { value: "ends_with", label: "Termina con" },
  { value: "is_empty", label: "Está vacío" },
  { value: "is_not_empty", label: "No está vacío" },
];

const NUMBER_OPERATORS = [
  { value: "equals", label: "Es igual a" },
  { value: "not_equals", label: "Es diferente de" },
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

const BOOLEAN_OPERATORS = [{ value: "equals", label: "Es" }];
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
  { value: "city", label: "Ciudad", type: "text" },
  { value: "region", label: "Región", type: "text" },
  { value: "score", label: "Puntaje", type: "number" },
];

export function NewListModal({ tenantId, onClose, onCreated, editData }: Props) {
  const isEdit = !!editData;
  const [name, setName] = useState(editData?.name || "");
  const [type, setType] = useState<"static" | "dynamic">(editData?.type || "dynamic");
  const [groupLogic, setGroupLogic] = useState<"and" | "or">(
    editData?.filters?.groupLogic || editData?.filters?.logic || "and"
  );
  const [groups, setGroups] = useState<ConditionGroup[]>(() => {
    if (editData?.filters?.groups) return editData.filters.groups;
    if (editData?.filters?.conditions) return [{ logic: editData.filters.logic || "and", conditions: editData.filters.conditions }];
    return [{ logic: "and", conditions: [{ field: "status", operator: "equals", value: "" }] }];
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [allFields, setAllFields] = useState<FieldOption[]>(SYSTEM_FIELDS);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Preview en tiempo real (debounced)
  const fetchPreview = useCallback(() => {
    if (type !== "dynamic") return;
    const hasValue = groups.some((g) => g.conditions.some((c) => c.value || c.operator === "is_empty" || c.operator === "is_not_empty"));
    if (!hasValue) { setPreviewCount(null); return; }

    setPreviewLoading(true);
    api.post("/record-lists/preview", { tenantId, filters: { groups, groupLogic } })
      .then(({ data }) => setPreviewCount(data.count))
      .catch(() => setPreviewCount(null))
      .finally(() => setPreviewLoading(false));
  }, [tenantId, groups, groupLogic, type]);

  useEffect(() => {
    if (previewTimeout.current) clearTimeout(previewTimeout.current);
    previewTimeout.current = setTimeout(fetchPreview, 600);
    return () => { if (previewTimeout.current) clearTimeout(previewTimeout.current); };
  }, [fetchPreview]);

  const addGroup = () => {
    setGroups([...groups, { logic: "and", conditions: [{ field: "status", operator: "equals", value: "" }] }]);
  };

  const removeGroup = (gi: number) => {
    if (groups.length <= 1) return;
    setGroups(groups.filter((_, i) => i !== gi));
  };

  const updateGroupLogic = (gi: number, logic: "and" | "or") => {
    setGroups(groups.map((g, i) => (i === gi ? { ...g, logic } : g)));
  };

  const addCondition = (gi: number) => {
    setGroups(groups.map((g, i) => (i === gi ? { ...g, conditions: [...g.conditions, { field: "status", operator: "equals", value: "" }] } : g)));
  };

  const removeCondition = (gi: number, ci: number) => {
    setGroups(groups.map((g, i) => {
      if (i !== gi) return g;
      if (g.conditions.length <= 1) return g;
      return { ...g, conditions: g.conditions.filter((_, j) => j !== ci) };
    }));
  };

  const updateCondition = (gi: number, ci: number, key: string, val: string) => {
    setGroups(groups.map((g, i) => {
      if (i !== gi) return g;
      return {
        ...g,
        conditions: g.conditions.map((c, j) => {
          if (j !== ci) return c;
          const updated = { ...c, [key]: val };
          if (key === "field") { updated.operator = "equals"; updated.value = ""; }
          return updated;
        }),
      };
    }));
  };

  const getFieldDef = (fieldValue: string) => allFields.find((f) => f.value === fieldValue);
  const needsValue = (op: string) => !["is_empty", "is_not_empty"].includes(op);

  const handleSubmit = async () => {
    if (!name.trim()) { setError("Ingresa un nombre para la lista."); return; }
    setSaving(true);
    setError("");
    try {
      if (isEdit && editData) {
        await api.put(`/record-lists/${editData.id}`, {
          name: name.trim(),
          filters: type === "dynamic" ? { groups, groupLogic } : undefined,
        });
      } else {
        await createRecordList({
          tenantId,
          name: name.trim(),
          type,
          filters: type === "dynamic" ? { groups, groupLogic } as any : undefined,
        });
      }
      onCreated();
    } catch { setError("Error al guardar la lista."); } finally { setSaving(false); }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 backdrop-blur-sm py-8 px-4 overflow-y-auto"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-2xl shadow-2xl border border-white/30 p-6"
        style={{ background: "rgba(255, 255, 255, 0.95)", backdropFilter: "blur(20px)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-base font-semibold text-gray-900">{isEdit ? "Editar lista" : "Nueva lista"}</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">{isEdit ? "Modifica las condiciones de la lista" : "Crea una lista estática o dinámica de contactos"}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Nombre de la lista</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Clientes VIP, Inactivos 30 días..."
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-inset focus:ring-brand-500 focus:border-brand-500 outline-none transition-all"
            />
          </div>

          {/* Type */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Tipo de lista</label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setType("static")} className={`px-3 py-2.5 rounded-lg text-sm font-medium border transition-all ${type === "static" ? "border-brand-500 bg-brand-50 text-brand-700" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                <span className="block text-sm font-medium">Estática</span>
                <span className="block text-[10px] text-gray-400 mt-0.5">Contactos fijos</span>
              </button>
              <button type="button" onClick={() => setType("dynamic")} className={`px-3 py-2.5 rounded-lg text-sm font-medium border transition-all ${type === "dynamic" ? "border-brand-500 bg-brand-50 text-brand-700" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                <span className="block text-sm font-medium">Dinámica</span>
                <span className="block text-[10px] text-gray-400 mt-0.5">Basada en filtros</span>
              </button>
            </div>
          </div>

          {/* Dynamic filters */}
          {type === "dynamic" && (
            <div className="space-y-4 pt-3 border-t border-gray-100">
              {/* Preview badge */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-brand-500" />
                  <span className="text-xs font-semibold text-gray-700">Condiciones</span>
                </div>
                <div className="flex items-center gap-3">
                  {previewCount !== null && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-50 border border-brand-200">
                      <Users className="h-3.5 w-3.5 text-brand-600" />
                      <span className="text-xs font-semibold text-brand-700">
                        {previewLoading ? "..." : previewCount.toLocaleString()}
                      </span>
                      <span className="text-[10px] text-brand-500">contactos</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Groups */}
              <div className="space-y-3">
                {groups.map((group, gi) => (
                  <div key={gi}>
                    {/* Group logic badge between groups */}
                    {gi > 0 && (
                      <div className="flex items-center justify-center py-2">
                        <button
                          type="button"
                          onClick={() => setGroupLogic(groupLogic === "and" ? "or" : "and")}
                          className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-all cursor-pointer ${groupLogic === "and" ? "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100" : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"}`}
                        >
                          {groupLogic === "and" ? "Y además" : "O también"}
                        </button>
                      </div>
                    )}

                    {/* Group card */}
                    <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-3 space-y-2">
                      {/* Group header */}
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-medium text-gray-400 uppercase">Grupo {gi + 1}</span>
                          <button
                            type="button"
                            onClick={() => updateGroupLogic(gi, group.logic === "and" ? "or" : "and")}
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${group.logic === "and" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}
                          >
                            {group.logic === "and" ? "Cumple TODAS" : "Cumple ALGUNA"}
                          </button>
                        </div>
                        {groups.length > 1 && (
                          <button type="button" onClick={() => removeGroup(gi)} className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Conditions */}
                      {group.conditions.map((cond, ci) => {
                        const fieldDef = getFieldDef(cond.field);
                        const operators = getOperatorsForType(fieldDef?.type || "text");

                        return (
                          <div key={ci}>
                            {ci > 0 && (
                              <div className="flex items-center justify-center py-0.5">
                                <span className={`text-[9px] font-bold uppercase ${group.logic === "and" ? "text-blue-500" : "text-amber-500"}`}>
                                  {group.logic === "and" ? "Y" : "O"}
                                </span>
                              </div>
                            )}
                            <div className="flex items-center gap-2 p-2 rounded-lg bg-white border border-gray-100">
                              <div className="flex-1 flex items-center gap-2 flex-wrap">
                                <Dropdown
                                  value={cond.field}
                                  options={allFields.map((f) => ({ value: f.value, label: f.label, sublabel: f.type }))}
                                  onChange={(v) => updateCondition(gi, ci, "field", v)}
                                  width="w-36"
                                  placeholder="Campo"
                                />
                                <Dropdown
                                  value={cond.operator}
                                  options={operators}
                                  onChange={(v) => updateCondition(gi, ci, "operator", v)}
                                  width="w-32"
                                  placeholder="Operador"
                                />
                                {needsValue(cond.operator) && (
                                  <>
                                    {fieldDef?.type === "select" && fieldDef.options ? (
                                      <Dropdown
                                        value={cond.value}
                                        options={fieldDef.options.map((o) => ({ value: o, label: o }))}
                                        onChange={(v) => updateCondition(gi, ci, "value", v)}
                                        width="w-32"
                                        placeholder="Valor"
                                      />
                                    ) : fieldDef?.type === "boolean" ? (
                                      <Dropdown
                                        value={cond.value}
                                        options={[{ value: "true", label: "Sí" }, { value: "false", label: "No" }]}
                                        onChange={(v) => updateCondition(gi, ci, "value", v)}
                                        width="w-24"
                                        placeholder="Valor"
                                      />
                                    ) : fieldDef?.type === "date" ? (
                                      <input type="date" value={cond.value} onChange={(e) => updateCondition(gi, ci, "value", e.target.value)} className="px-2 py-1.5 rounded-lg border border-gray-200 text-xs bg-white focus:ring-2 focus:ring-inset focus:ring-brand-500 outline-none" />
                                    ) : (
                                      <input type={fieldDef?.type === "number" ? "number" : "text"} value={cond.value} onChange={(e) => updateCondition(gi, ci, "value", e.target.value)} placeholder="Valor" className="flex-1 min-w-[100px] px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs bg-white focus:ring-2 focus:ring-inset focus:ring-brand-500 outline-none" />
                                    )}
                                  </>
                                )}
                              </div>
                              {group.conditions.length > 1 && (
                                <button type="button" onClick={() => removeCondition(gi, ci)} className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors shrink-0">
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {/* Add condition */}
                      <button type="button" onClick={() => addCondition(gi)} className="flex items-center gap-1 text-[11px] text-brand-600 hover:text-brand-700 font-medium mt-1 px-2 py-1 rounded hover:bg-brand-50 transition-colors">
                        <Plus className="h-3 w-3" /> Agregar condición
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add group */}
              <button type="button" onClick={addGroup} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-brand-600 font-medium px-3 py-2 rounded-lg border border-dashed border-gray-300 hover:border-brand-300 hover:bg-brand-50/30 transition-all w-full justify-center">
                <Plus className="h-3.5 w-3.5" /> Agregar grupo de condiciones
              </button>
            </div>
          )}

          {/* Error */}
          {error && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          {/* Footer */}
          <div className="flex items-center justify-between pt-3 border-t border-gray-100">
            {isEdit ? (
              <button
                type="button"
                onClick={async () => {
                  if (!editData || !confirm("¿Estás seguro de eliminar esta lista? Esta acción no se puede deshacer.")) return;
                  try {
                    await api.delete(`/record-lists/${editData.id}`);
                    onCreated();
                  } catch {}
                }}
                className="px-3 py-2 text-sm text-red-600 rounded-lg hover:bg-red-50 font-medium transition-colors"
              >
                Eliminar lista
              </button>
            ) : <div />}
            <div className="flex items-center gap-3">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100 font-medium transition-colors">
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving || !name.trim()}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-brand-800 hover:bg-brand-700 text-white disabled:opacity-50 transition-colors"
              >
                {saving ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear lista"}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// === Dropdown Component ===
function Dropdown({ value, options, onChange, width = "w-40", placeholder = "Seleccionar" }: {
  value: string;
  options: { value: string; label: string; sublabel?: string }[];
  onChange: (value: string) => void;
  width?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const selected = options.find((o) => o.value === value);
  const filtered = search ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase())) : options;

  return (
    <div ref={ref} className={`relative ${width}`}>
      <button
        type="button"
        onClick={() => { setOpen(!open); setSearch(""); }}
        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs bg-white hover:border-gray-300 transition-colors text-left"
      >
        <span className={selected ? "text-gray-800" : "text-gray-400"}>{selected?.label || placeholder}</span>
        <ChevronDown className={`h-3 w-3 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 w-full min-w-[160px] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          {options.length > 6 && (
            <div className="p-1.5 border-b border-gray-100">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar..."
                autoFocus
                className="w-full px-2 py-1 text-xs rounded border border-gray-200 outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          )}
          <div className="max-h-48 overflow-y-auto py-1">
            {filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => { onChange(o.value); setOpen(false); }}
                className={`w-full flex items-center justify-between px-3 py-1.5 text-xs text-left transition-colors ${o.value === value ? "bg-brand-50 text-brand-700 font-medium" : "text-gray-700 hover:bg-gray-50"}`}
              >
                <span>{o.label}</span>
                {o.sublabel && <span className="text-[9px] text-gray-400 ml-2">{o.sublabel}</span>}
              </button>
            ))}
            {filtered.length === 0 && <p className="px-3 py-2 text-[10px] text-gray-400">Sin resultados</p>}
          </div>
        </div>
      )}
    </div>
  );
}
