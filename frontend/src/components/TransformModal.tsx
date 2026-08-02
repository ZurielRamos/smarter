import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Zap, ChevronDown } from "lucide-react";
import type { TransformConfig, TransformType } from "@/types";

const TRANSFORMS: { value: TransformType; label: string; description: string }[] = [
  { value: "none", label: "Sin transformación", description: "Asignar el valor tal cual" },
  { value: "concat", label: "Concatenar", description: "Unir múltiples campos con un separador" },
  { value: "uppercase", label: "Mayúsculas", description: "Convertir todo el texto a MAYÚSCULAS" },
  { value: "lowercase", label: "Minúsculas", description: "Convertir todo el texto a minúsculas" },
  { value: "trim", label: "Recortar espacios", description: "Eliminar espacios al inicio y final" },
  { value: "extract", label: "Extraer", description: "Obtener una parte del texto (primeros/últimos N caracteres)" },
  { value: "replace", label: "Reemplazar", description: "Sustituir un texto por otro" },
  { value: "date_format", label: "Formatear fecha", description: "Cambiar el formato de una fecha" },
  { value: "math", label: "Operación numérica", description: "Aplicar una operación matemática (+, -, ×, ÷)" },
  { value: "fixed", label: "Valor fijo", description: "Ignorar la fuente y asignar un valor constante" },
  { value: "template", label: "Plantilla", description: "Construir texto con variables {{columna}}" },
];

interface TransformModalProps {
  open: boolean;
  onClose: () => void;
  fieldLabel: string;
  sourceFields: string[];
  value: TransformConfig;
  onChange: (config: TransformConfig) => void;
}

export function TransformModal({ open, onClose, fieldLabel, sourceFields, value, onChange }: TransformModalProps) {
  const [config, setConfig] = useState<TransformConfig>(value);
  const [typeOpen, setTypeOpen] = useState(false);

  const selectedTransform = TRANSFORMS.find((t) => t.value === config.type);

  const handleSave = () => {
    onChange(config);
    onClose();
  };

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
            transition={{ duration: 0.25 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl shadow-2xl border border-white/30 overflow-visible"
            style={{ background: 'rgba(255, 255, 255, 0.9)', backdropFilter: 'blur(20px)' }}
          >
            <div className="p-5 overflow-visible">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-purple-50 flex items-center justify-center">
                    <Zap className="h-4 w-4 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Transformar: {fieldLabel}</h3>
                    <p className="text-[11px] text-gray-400">Aplica una operación antes de guardar el valor</p>
                  </div>
                </div>
                <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X className="h-4 w-4" /></button>
              </div>

              {/* Transform type selector + config in grid */}
              <div className="space-y-3">
                {/* Type selector */}
                <div className="relative">
                  <label className="block text-[11px] text-gray-500 mb-1">Operación</label>
                  <button
                    type="button"
                    onClick={() => setTypeOpen((v) => !v)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-left flex items-center justify-between"
                  >
                    <span className="text-gray-800">{selectedTransform?.label || "Seleccionar"}</span>
                    <ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform ${typeOpen ? 'rotate-180' : ''}`} />
                  </button>
                  <AnimatePresence>
                    {typeOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className="absolute left-0 right-0 top-full mt-1 bg-white rounded-lg border border-gray-200 shadow-lg py-1 z-50 max-h-52 overflow-auto"
                      >
                        {TRANSFORMS.map((t) => (
                          <button
                            key={t.value}
                            type="button"
                            onClick={() => { setConfig({ type: t.value }); setTypeOpen(false); }}
                            className={`w-full px-3 py-2 text-left transition-colors ${config.type === t.value ? 'bg-brand-50' : 'hover:bg-gray-50'}`}
                          >
                            <span className={`text-xs ${config.type === t.value ? 'font-medium text-brand-700' : 'text-gray-700'}`}>{t.label}</span>
                            <p className="text-[10px] text-gray-400">{t.description}</p>
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Config based on type */}
                {config.type === "concat" && (
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">Separador entre campos</label>
                    <input type="text" value={config.separator || ""} onChange={(e) => setConfig({ ...config, separator: e.target.value })} placeholder='" " (espacio)' className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                    <p className="text-[10px] text-gray-400 mt-1">Los {sourceFields.length} campo(s) mapeados se unirán con este separador</p>
                  </div>
                )}

                {config.type === "extract" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-gray-500 mb-1">Desde posición</label>
                      <input type="number" value={config.start ?? ""} onChange={(e) => setConfig({ ...config, start: e.target.value ? Number(e.target.value) : undefined })} placeholder="0" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                    </div>
                    <div>
                      <label className="block text-[11px] text-gray-500 mb-1">Hasta posición</label>
                      <input type="number" value={config.end ?? ""} onChange={(e) => setConfig({ ...config, end: e.target.value ? Number(e.target.value) : undefined })} placeholder="Final" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                    </div>
                  </div>
                )}

                {config.type === "replace" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-gray-500 mb-1">Buscar</label>
                      <input type="text" value={config.from || ""} onChange={(e) => setConfig({ ...config, from: e.target.value })} placeholder="Texto a buscar" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                    </div>
                    <div>
                      <label className="block text-[11px] text-gray-500 mb-1">Reemplazar por</label>
                      <input type="text" value={config.to || ""} onChange={(e) => setConfig({ ...config, to: e.target.value })} placeholder="Nuevo texto" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                    </div>
                  </div>
                )}

                {config.type === "date_format" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-gray-500 mb-1">Formato origen</label>
                      <input type="text" value={config.fromFormat || ""} onChange={(e) => setConfig({ ...config, fromFormat: e.target.value })} placeholder="DD/MM/YYYY" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500" />
                    </div>
                    <div>
                      <label className="block text-[11px] text-gray-500 mb-1">Formato destino</label>
                      <input type="text" value={config.toFormat || ""} onChange={(e) => setConfig({ ...config, toFormat: e.target.value })} placeholder="YYYY-MM-DD" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500" />
                    </div>
                  </div>
                )}

                {config.type === "math" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-gray-500 mb-1">Operador</label>
                      <div className="flex gap-1">
                        {["+", "-", "*", "/"].map((op) => (
                          <button key={op} type="button" onClick={() => setConfig({ ...config, operator: op })} className={`flex-1 py-2 rounded-lg border text-sm font-mono transition-colors ${config.operator === op ? 'bg-brand-50 border-brand-300 text-brand-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{op}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] text-gray-500 mb-1">Valor</label>
                      <input type="number" value={config.operand ?? ""} onChange={(e) => setConfig({ ...config, operand: e.target.value ? Number(e.target.value) : undefined })} placeholder="0" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                    </div>
                  </div>
                )}

                {config.type === "fixed" && (
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">Valor fijo a asignar</label>
                    <input type="text" value={config.fixedValue || ""} onChange={(e) => setConfig({ ...config, fixedValue: e.target.value })} placeholder="Valor constante" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                )}

                {config.type === "template" && (
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">Plantilla</label>
                    <input type="text" value={config.template || ""} onChange={(e) => setConfig({ ...config, template: e.target.value })} placeholder="{{Nombre}} {{Apellido}}" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500" />
                    <div className="flex flex-wrap gap-1 mt-2">
                      {sourceFields.map((f) => (
                        <button key={f} type="button" onClick={() => setConfig({ ...config, template: (config.template || "") + `{{${f}}}` })} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 hover:bg-brand-50 hover:text-brand-700 transition-colors">{`{{${f}}}`}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-gray-100">
                <button onClick={onClose} className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-800 rounded-lg hover:bg-gray-100 transition-colors">Cancelar</button>
                <button onClick={handleSave} className="px-4 py-1.5 text-xs rounded-lg bg-brand-800 hover:bg-brand-700 text-white font-medium transition-colors">Aplicar</button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
