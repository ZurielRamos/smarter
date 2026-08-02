import { useState } from "react";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import { X } from "lucide-react";

interface ColumnDef {
  key: string;
  label: string;
  visible: boolean;
}

export function ColumnConfigModal({
  columns,
  allColumns,
  onAccept,
  onCancel,
}: {
  columns: ColumnDef[];
  allColumns: ColumnDef[];
  onAccept: (cols: ColumnDef[]) => void;
  onCancel: () => void;
}) {
  const [tempColumns, setTempColumns] = useState<ColumnDef[]>(columns);
  const availableToAdd = allColumns.filter((ac) => !tempColumns.some((c) => c.key === ac.key));

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4"
      onClick={onCancel}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl shadow-2xl border border-white/30 p-5 max-h-[80vh] flex flex-col"
        style={{ background: 'rgba(255, 255, 255, 0.92)', backdropFilter: 'blur(20px)' }}
      >
        <div className="flex items-center justify-between mb-4 shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Configurar tabla</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">Arrastra para reordenar. Los cambios se aplican al aceptar.</p>
          </div>
          <button onClick={onCancel} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Add column */}
        {availableToAdd.length > 0 && (
          <div className="mb-3 shrink-0">
            <ColumnAddSelector
              available={availableToAdd}
              onAdd={(key) => {
                const colDef = allColumns.find((c) => c.key === key);
                if (colDef) setTempColumns([...tempColumns, { ...colDef, visible: true }]);
              }}
            />
          </div>
        )}

        {/* Draggable list */}
        <div className="flex-1 min-h-0 overflow-auto py-1 -mx-1 px-1">
          <Reorder.Group axis="y" values={tempColumns} onReorder={setTempColumns} className="space-y-1">
            {tempColumns.map((col) => (
              <Reorder.Item
                key={col.key}
                value={col}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-gray-100 shadow-sm cursor-grab active:cursor-grabbing active:shadow-md active:border-brand-200"
                whileDrag={{ scale: 1.02, boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
              >
                <svg className="h-4 w-4 text-gray-300 shrink-0" viewBox="0 0 16 16" fill="currentColor"><circle cx="5" cy="4" r="1.5"/><circle cx="11" cy="4" r="1.5"/><circle cx="5" cy="8" r="1.5"/><circle cx="11" cy="8" r="1.5"/><circle cx="5" cy="12" r="1.5"/><circle cx="11" cy="12" r="1.5"/></svg>
                <span className="text-sm text-gray-700 flex-1">{col.label}</span>
                {col.key.startsWith("custom_") && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-500 font-medium">Custom</span>
                )}
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => setTempColumns(tempColumns.filter((c) => c.key !== col.key))}
                  className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </Reorder.Item>
            ))}
          </Reorder.Group>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 mt-4 pt-3 border-t border-gray-100 shrink-0">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 rounded-lg hover:bg-gray-100 transition-colors font-medium">
            Cancelar
          </button>
          <button
            onClick={() => onAccept(tempColumns)}
            className="px-5 py-2 text-sm rounded-lg bg-brand-800 hover:bg-brand-700 text-white font-medium transition-colors"
          >
            Aceptar
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ColumnAddSelector({ available, onAdd }: { available: ColumnDef[]; onAdd: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  const systemAvailable = available.filter((c) => !c.key.startsWith("custom_"));
  const customAvailable = available.filter((c) => c.key.startsWith("custom_"));

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-dashed border-gray-200 hover:border-brand-300 text-xs text-gray-500 hover:text-brand-600 transition-colors"
      >
        <span>+ Agregar columna</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute left-0 right-0 top-full mt-1 bg-white rounded-lg border border-gray-200 shadow-lg py-1 z-50 max-h-52 overflow-auto"
          >
            {systemAvailable.length > 0 && (
              <>
                <p className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase bg-gray-50">Sistema</p>
                {systemAvailable.map((col) => (
                  <button
                    key={col.key}
                    onClick={() => { onAdd(col.key); setOpen(false); }}
                    className="w-full px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-between"
                  >
                    <span>{col.label}</span>
                    <span className="text-[10px] text-gray-400 font-mono">{col.key}</span>
                  </button>
                ))}
              </>
            )}
            {customAvailable.length > 0 && (
              <>
                <p className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase bg-gray-50">Personalizados</p>
                {customAvailable.map((col) => (
                  <button
                    key={col.key}
                    onClick={() => { onAdd(col.key); setOpen(false); }}
                    className="w-full px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-between"
                  >
                    <span>{col.label}</span>
                    <span className="text-[10px] text-purple-500 font-mono">{col.key.replace("custom_", "")}</span>
                  </button>
                ))}
              </>
            )}
            {available.length === 0 && (
              <p className="px-3 py-2 text-xs text-gray-400">Todas las columnas ya están agregadas</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
