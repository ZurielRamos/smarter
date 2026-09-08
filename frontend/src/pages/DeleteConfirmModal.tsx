import { useState, useEffect } from "react";
import { AlertTriangle, Trash2, Archive, Loader2, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";

const tenantApi = axios.create({ baseURL: import.meta.env.VITE_API_URL || "/api" });
tenantApi.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

interface DeleteConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  payload: any; // { ids } or { tenantId, filters, ... }
}

interface Preview {
  withHistory: number;
  withoutHistory: number;
  total: number;
}

export function DeleteConfirmModal({ open, onClose, onConfirm, payload }: DeleteConfirmModalProps) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setPreview(null);
    tenantApi.post("/records/bulk/delete-preview", payload)
      .then(({ data }) => setPreview(data))
      .catch(() => setPreview({ withHistory: 0, withoutHistory: 0, total: 0 }))
      .finally(() => setLoading(false));
  }, [open, payload]);

  async function handleConfirm() {
    setConfirming(true);
    await onConfirm();
    setConfirming(false);
  }

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-md rounded-2xl shadow-2xl bg-card overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 pt-6 pb-4">
            <div className="flex items-start gap-4">
              <div className="h-11 w-11 rounded-full bg-red-100 dark:bg-red-500/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-foreground">Eliminar contactos</h3>
                <p className="text-sm text-muted-foreground mt-1">Esta acción tiene consecuencias diferentes según el historial de cada contacto.</p>
              </div>
              <button onClick={onClose} className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-muted text-muted-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Preview info */}
          <div className="px-6 pb-4">
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : preview && (
              <div className="space-y-3">
                {preview.withoutHistory > 0 && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20">
                    <Trash2 className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-red-800 dark:text-red-300">{preview.withoutHistory} se eliminarán permanentemente</p>
                      <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">No tienen conversaciones ni notas. Se borrarán de la base de datos sin posibilidad de recuperación.</p>
                    </div>
                  </div>
                )}
                {preview.withHistory > 0 && (
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20">
                    <Archive className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-amber-800 dark:text-amber-300">{preview.withHistory} se archivarán (soft delete)</p>
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">Tienen historial de conversaciones o notas. Se ocultarán de las vistas pero podrás restaurarlos desde "Eliminados".</p>
                    </div>
                  </div>
                )}
                <div className="px-1 pt-1">
                  <p className="text-xs text-muted-foreground">Total: <span className="font-medium text-foreground">{preview.total} contactos</span> afectados</p>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border bg-muted">
            <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors">
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              disabled={confirming || loading}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {confirming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              {confirming ? "Eliminando..." : "Confirmar eliminación"}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
