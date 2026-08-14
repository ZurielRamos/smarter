import { useState, useEffect, useRef } from "react";
import { X, Trash2, ChevronDown, CheckCheck, Pencil, Tag, Plus, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import type { CustomField } from "@/services/api";

interface BulkActionBarProps {
  count: number;
  allSelected: boolean;
  total: number;
  fields: CustomField[];
  onClear: () => void;
  onSelectAll: () => void;
  onBulkUpdate: (updates: Record<string, any>) => Promise<void> | void;
  onAddTag: (tag: string) => Promise<void> | void;
  onDelete: () => void;
}

// Fields that make sense to edit in bulk
const BULK_EDITABLE_SYSTEM = ["status", "channelSource", "source", "assignedTo", "assignedTeamId", "score", "city", "region", "gender", "optInWhatsapp", "optInEmail"];

export function BulkActionBar({ count, allSelected, total, fields, onClear, onSelectAll, onBulkUpdate, onAddTag, onDelete }: BulkActionBarProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [selectedField, setSelectedField] = useState<CustomField | null>(null);
  const [fieldValue, setFieldValue] = useState("");
  const [tagValue, setTagValue] = useState("");
  const [valueOpen, setValueOpen] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const editRef = useRef<HTMLDivElement>(null);
  const tagRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (editRef.current && !editRef.current.contains(e.target as Node)) { setEditOpen(false); setSelectedField(null); setFieldValue(""); }
      if (tagRef.current && !tagRef.current.contains(e.target as Node)) setTagOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const editableFields = fields.filter((f) =>
    f.fieldType !== "computed" &&
    !["lastContactAt", "lastActivityAt", "fullName"].includes(f.fieldKey) &&
    (f.isSystem ? BULK_EDITABLE_SYSTEM.includes(f.fieldKey) : true)
  );

  function handleApplyEdit() {
    if (!selectedField || (!fieldValue && selectedField.fieldType !== "boolean")) return;
    const key = selectedField.fieldKey;
    let value: any = fieldValue;
    if (selectedField.fieldType === "boolean") value = fieldValue === "true";
    if (selectedField.fieldType === "number") value = Number(fieldValue);
    setBulkLoading(true);
    Promise.resolve(onBulkUpdate({ [key]: value })).finally(() => setBulkLoading(false));
    setEditOpen(false);
    setSelectedField(null);
    setFieldValue("");
  }

  function handleAddTag() {
    if (!tagValue.trim()) return;
    setBulkLoading(true);
    Promise.resolve(onAddTag(tagValue.trim())).finally(() => setBulkLoading(false));
    setTagValue("");
    setTagOpen(false);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-xl bg-gray-900 text-white shadow-2xl border border-gray-700"
    >
      {bulkLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900/90 rounded-xl z-10">
          <Loader2 className="h-5 w-5 animate-spin text-brand-400" />
          <span className="ml-2 text-sm text-gray-300">Procesando...</span>
        </div>
      )}
      {/* Selection count */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">
          {allSelected ? total.toLocaleString() : count} seleccionados
        </span>
        {!allSelected && total > count && (
          <button onClick={onSelectAll} className="flex items-center gap-1 px-2 py-0.5 rounded bg-brand-600 hover:bg-brand-500 text-xs font-medium transition-colors">
            <CheckCheck className="h-3 w-3" />
            Todos ({total.toLocaleString()})
          </button>
        )}
        {allSelected && (
          <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-medium">
            Todos los del filtro
          </span>
        )}
      </div>

      <div className="w-px h-5 bg-gray-700" />

      {/* Edit field */}
      <div className="relative" ref={editRef}>
        <button onClick={() => setEditOpen((v) => !v)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm transition-colors">
          <Pencil className="h-3.5 w-3.5" />
          Editar campo
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
        {editOpen && (
          <div className="absolute bottom-full mb-2 left-0 w-72 bg-white rounded-lg shadow-lg border border-gray-200 overflow-visible">
            {!selectedField ? (
              // Step 1: Choose field
              <div className="max-h-64 overflow-auto py-1">
                <p className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase">Selecciona un campo</p>
                {editableFields.map((f) => (
                  <button
                    key={f.fieldKey}
                    onClick={() => { setSelectedField(f); setFieldValue(""); }}
                    className="w-full px-3 py-2 text-xs text-left text-gray-700 hover:bg-gray-50 flex items-center justify-between"
                  >
                    <span>{f.fieldLabel}</span>
                    <span className="text-[10px] text-gray-400">{f.fieldType}</span>
                  </button>
                ))}
              </div>
            ) : (
              // Step 2: Set value
              <div className="p-3 space-y-3 overflow-visible">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-gray-700">{selectedField.fieldLabel}</p>
                  <button onClick={() => setSelectedField(null)} className="text-[10px] text-brand-600 hover:text-brand-700">← Cambiar</button>
                </div>

                {/* Value input based on field type */}
                {selectedField.fieldType === "select" && selectedField.options ? (
                  <div className="relative" ref={valueRef}>
                    <button
                      onClick={() => setValueOpen((v) => !v)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs text-left flex items-center justify-between"
                    >
                      <span className={fieldValue ? "text-gray-800 capitalize" : "text-gray-400"}>{fieldValue || "Seleccionar..."}</span>
                      <ChevronDown className="h-3 w-3 text-gray-400" />
                    </button>
                    {valueOpen && (
                      <div className="absolute left-0 right-0 bottom-full mb-1 bg-white rounded-lg border border-gray-200 shadow-lg py-1 max-h-36 overflow-auto z-10">
                        {selectedField.options.map((opt) => (
                          <button key={opt} onClick={() => { setFieldValue(opt); setValueOpen(false); }} className={`w-full px-3 py-1.5 text-xs text-left capitalize transition-colors ${fieldValue === opt ? "bg-brand-50 text-brand-700 font-medium" : "text-gray-700 hover:bg-gray-50"}`}>{opt}</button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : selectedField.fieldType === "boolean" ? (
                  <div className="flex items-center gap-3">
                    <button onClick={() => setFieldValue("true")} className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${fieldValue === "true" ? "border-brand-500 bg-brand-50 text-brand-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>Sí</button>
                    <button onClick={() => setFieldValue("false")} className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${fieldValue === "false" ? "border-brand-500 bg-brand-50 text-brand-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>No</button>
                  </div>
                ) : (
                  <input
                    type={selectedField.fieldType === "number" ? "number" : selectedField.fieldType === "date" ? "date" : "text"}
                    value={fieldValue}
                    onChange={(e) => setFieldValue(e.target.value)}
                    placeholder={`Nuevo valor para ${selectedField.fieldLabel}...`}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-brand-500"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter") handleApplyEdit(); }}
                  />
                )}

                <button
                  onClick={handleApplyEdit}
                  disabled={!fieldValue && selectedField.fieldType !== "boolean"}
                  className="w-full px-3 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  Aplicar a {allSelected ? total.toLocaleString() : count} contactos
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add tag */}
      <div className="relative" ref={tagRef}>
        <button onClick={() => setTagOpen((v) => !v)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm transition-colors">
          <Tag className="h-3.5 w-3.5" />
          Tag
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
        {tagOpen && (
          <div className="absolute bottom-full mb-2 left-0 w-60 bg-white rounded-lg shadow-lg border border-gray-200 p-3">
            <p className="text-xs font-medium text-gray-700 mb-2">Agregar tag a seleccionados</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={tagValue}
                onChange={(e) => setTagValue(e.target.value)}
                placeholder="Nombre del tag..."
                className="flex-1 min-w-0 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-brand-500"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") handleAddTag(); }}
              />
              <button onClick={handleAddTag} disabled={!tagValue.trim()} className="px-3 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors disabled:opacity-50 shrink-0">
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Delete */}
      <button onClick={onDelete} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-sm transition-colors">
        <Trash2 className="h-3.5 w-3.5" />
        Eliminar
      </button>

      <div className="w-px h-5 bg-gray-700" />

      {/* Clear selection */}
      <button onClick={onClear} className="h-7 w-7 rounded-full flex items-center justify-center hover:bg-gray-700 transition-colors">
        <X className="h-4 w-4" />
      </button>
    </motion.div>
  );
}
