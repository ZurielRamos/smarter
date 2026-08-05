import { useState, useEffect, useMemo } from "react";
import { X, Download, GripVertical, Loader2 } from "lucide-react";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { useParams } from "react-router-dom";
import { getCustomFields } from "@/services/api";
import axios from "axios";

const tenantApi = axios.create({ baseURL: import.meta.env.VITE_API_URL || "/api" });
tenantApi.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

interface ExportModalProps {
  open: boolean;
  onClose: () => void;
  filters?: Array<{ field: string; operator: string; value: string }>;
  assignedTo?: string;
  assignedTeamId?: string;
  total: number;
}

interface FieldItem {
  key: string;
  label: string;
  group: string;
  selected: boolean;
}

const SEPARATORS = [
  { value: ",", label: "Coma (,)", desc: "Compatible con Excel" },
  { value: ";", label: "Punto y coma (;)", desc: "Para configuraciones regionales en español" },
  { value: "\t", label: "Tabulación", desc: "TSV format" },
];

export function ExportModal({ open, onClose, filters, assignedTo, assignedTeamId, total }: ExportModalProps) {
  const { slug } = useParams();
  const { user } = useAuth();
  const tenantRole = user?.tenantRoles.find((tr) => tr.tenant.slug === slug);
  const tenantId = tenantRole?.tenantId || "";

  const [allFields, setAllFields] = useState<FieldItem[]>([]);
  const [selectedFields, setSelectedFields] = useState<FieldItem[]>([]);
  const [separator, setSeparator] = useState(",");
  const [includeHeaders, setIncludeHeaders] = useState(true);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!open || !tenantId) return;
    setLoading(true);
    getCustomFields(tenantId).then((fields) => {
      const items: FieldItem[] = fields
        .filter((f) => f.fieldType !== "computed")
        .map((f) => ({ key: f.fieldKey, label: f.fieldLabel, group: f.fieldGroup || "general", selected: true }));
      const extraSystem: FieldItem[] = [
        { key: "id", label: "ID", group: "sistema", selected: false },
        { key: "createdAt", label: "Fecha de creación", group: "sistema", selected: false },
        { key: "updatedAt", label: "Última actualización", group: "sistema", selected: false },
      ];
      const combined = [...items, ...extraSystem.filter((e) => !items.find((i) => i.key === e.key))];
      setAllFields(combined);
      setSelectedFields(combined.filter((f) => f.selected));
    }).catch(() => {}).finally(() => setLoading(false));
  }, [open, tenantId]);

  function toggleField(field: FieldItem) {
    const isSelected = selectedFields.find((f) => f.key === field.key);
    if (isSelected) {
      setSelectedFields((prev) => prev.filter((f) => f.key !== field.key));
    } else {
      setSelectedFields((prev) => [...prev, field]);
    }
  }

  function selectAll() {
    setSelectedFields([...allFields]);
  }

  function selectNone() {
    setSelectedFields([]);
  }

  async function handleExport() {
    if (selectedFields.length === 0) return;
    setExporting(true);
    try {
      const response = await tenantApi.post("/records/export", {
        tenantId,
        fields: selectedFields.map((f) => ({ key: f.key, label: f.label })),
        filters: filters && filters.length > 0 ? filters : undefined,
        assignedTo,
        assignedTeamId,
        separator,
        includeHeaders,
      }, { responseType: "blob" });

      const blob = new Blob([response.data], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `contactos_${new Date().toISOString().split("T")[0]}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      onClose();
    } catch {
      // error handled by interceptor
    } finally {
      setExporting(false);
    }
  }

  const groupedFields = useMemo(() => {
    const groups: Record<string, FieldItem[]> = {};
    allFields.forEach((f) => {
      if (!groups[f.group]) groups[f.group] = [];
      groups[f.group].push(f);
    });
    return groups;
  }, [allFields]);

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-2xl max-h-[85vh] rounded-2xl shadow-2xl border border-white/30 flex flex-col overflow-hidden"
          style={{ background: "rgba(255, 255, 255, 0.96)", backdropFilter: "blur(24px)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
            <div>
              <h3 className="text-base font-semibold text-gray-900">Exportar contactos</h3>
              <p className="text-xs text-gray-500 mt-0.5">{total.toLocaleString()} contactos serán exportados con los filtros actuales</p>
            </div>
            <button onClick={onClose} className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
            ) : (
              <div className="space-y-5">
                {/* Field selection */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-medium text-gray-900">Campos a exportar</h4>
                    <div className="flex items-center gap-2">
                      <button onClick={selectAll} className="text-xs text-brand-600 hover:text-brand-700 font-medium">Todos</button>
                      <span className="text-gray-300">|</span>
                      <button onClick={selectNone} className="text-xs text-gray-500 hover:text-gray-700 font-medium">Ninguno</button>
                      <span className="text-xs text-gray-400 ml-2">{selectedFields.length} seleccionados</span>
                    </div>
                  </div>

                  <div className="space-y-3 max-h-[40vh] overflow-y-auto border border-gray-200 rounded-lg p-3">
                    {Object.entries(groupedFields).map(([group, fields]) => (
                      <div key={group}>
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 capitalize">{group}</p>
                        <div className="grid grid-cols-2 gap-1">
                          {fields.map((field) => {
                            const isSelected = selectedFields.some((f) => f.key === field.key);
                            return (
                              <button
                                key={field.key}
                                type="button"
                                onClick={() => toggleField(field)}
                                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer transition-colors ${isSelected ? "bg-brand-50" : "hover:bg-gray-50"}`}
                              >
                                <div className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors ${isSelected ? "bg-brand-600 border-brand-600" : "border-gray-300"}`}>
                                  {isSelected && <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                                </div>
                                <span className={`text-xs ${isSelected ? "text-brand-700 font-medium" : "text-gray-600"}`}>{field.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Selected fields order */}
                {selectedFields.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 mb-2">Orden de columnas</h4>
                    <p className="text-xs text-gray-400 mb-2">Arrastra para reordenar</p>
                    <Reorder.Group axis="y" values={selectedFields} onReorder={setSelectedFields} className="space-y-1 max-h-32 overflow-y-auto border border-gray-200 rounded-lg p-2">
                      {selectedFields.map((field) => (
                        <Reorder.Item key={field.key} value={field} className="flex items-center gap-2 px-2 py-1.5 rounded bg-white border border-gray-100 cursor-grab active:cursor-grabbing active:shadow-sm">
                          <GripVertical className="h-3 w-3 text-gray-300" />
                          <span className="text-xs text-gray-700">{field.label}</span>
                        </Reorder.Item>
                      ))}
                    </Reorder.Group>
                  </div>
                )}

                {/* Options */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 mb-2">Separador</h4>
                    <div className="space-y-1.5">
                      {SEPARATORS.map((sep) => (
                        <label key={sep.value} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${separator === sep.value ? "border-brand-500 bg-brand-50" : "border-gray-200 hover:bg-gray-50"}`}>
                          <input type="radio" name="separator" checked={separator === sep.value} onChange={() => setSeparator(sep.value)} className="h-3.5 w-3.5 text-brand-600 focus:ring-brand-500" />
                          <div>
                            <p className={`text-xs ${separator === sep.value ? "text-brand-700 font-medium" : "text-gray-700"}`}>{sep.label}</p>
                            <p className="text-[10px] text-gray-400">{sep.desc}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 mb-2">Opciones</h4>
                    <label className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50">
                      <span className="text-xs text-gray-700">Incluir encabezados</span>
                      <button
                        type="button"
                        onClick={() => setIncludeHeaders(!includeHeaders)}
                        className={`relative w-9 h-5 rounded-full transition-colors ${includeHeaders ? "bg-brand-600" : "bg-gray-300"}`}
                      >
                        <span className={`absolute top-[2px] left-[2px] w-4 h-4 rounded-full bg-white shadow transition-transform ${includeHeaders ? "translate-x-4" : ""}`} />
                      </button>
                    </label>
                    <div className="mt-3 px-3 py-2.5 rounded-lg bg-gray-50 border border-gray-100">
                      <p className="text-[11px] text-gray-500">El archivo se descargará con codificación UTF-8 y BOM para compatibilidad con Excel.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 shrink-0">
            <p className="text-xs text-gray-400">{selectedFields.length} campos · {total.toLocaleString()} registros</p>
            <div className="flex items-center gap-2">
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 rounded-lg hover:bg-gray-100 transition-colors">Cancelar</button>
              <button
                onClick={handleExport}
                disabled={exporting || selectedFields.length === 0}
                className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-50 shadow-sm"
              >
                {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                {exporting ? "Exportando..." : "Descargar CSV"}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
