import { useEffect, useState } from "react";
import { Loader2, Trash2, X } from "lucide-react";
import { api } from "@/services/api";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ConfirmModal";
import { DropdownSelect } from "@/components/ui/dropdown-select";

/** Ejecución del historial de envíos de una campaña. */
export interface EditableSend {
  id: string;
  campaignId: string;
  status: string;
  totalRecipients: number;
  totalSent: number;
  totalDelivered: number;
  totalFailed: number;
  totalUndelivered: number;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

interface EditSendModalProps {
  send: EditableSend | null;
  onClose: () => void;
  /** Se llama con la ejecución ya actualizada por el servidor. */
  onSaved: (updated: EditableSend) => void;
  /** Se llama con el id de la ejecución eliminada. */
  onDeleted: (sendId: string) => void;
}

const STATUS_OPTIONS = [
  { value: "pending", label: "Pendiente" },
  { value: "paused", label: "Pausado" },
  { value: "completed", label: "Completado" },
  { value: "failed", label: "Fallido" },
];

/** ISO -> valor de <input type="datetime-local"> en hora local. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Valor de <input type="datetime-local"> -> ISO (o null si está vacío). */
function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

interface FormState {
  status: string;
  totalRecipients: string;
  totalSent: string;
  totalDelivered: string;
  totalFailed: string;
  totalUndelivered: string;
  errorMessage: string;
  createdAt: string;
  startedAt: string;
  completedAt: string;
}

function toForm(s: EditableSend): FormState {
  return {
    status: s.status,
    totalRecipients: String(s.totalRecipients ?? 0),
    totalSent: String(s.totalSent ?? 0),
    totalDelivered: String(s.totalDelivered ?? 0),
    totalFailed: String(s.totalFailed ?? 0),
    totalUndelivered: String(s.totalUndelivered ?? 0),
    errorMessage: s.errorMessage ?? "",
    createdAt: toLocalInput(s.createdAt),
    startedAt: toLocalInput(s.startedAt),
    completedAt: toLocalInput(s.completedAt),
  };
}

const NUMBER_FIELDS: { key: keyof FormState; label: string }[] = [
  { key: "totalRecipients", label: "Destinos" },
  { key: "totalSent", label: "Enviados" },
  { key: "totalDelivered", label: "Entregados" },
  { key: "totalFailed", label: "Fallidos" },
  { key: "totalUndelivered", label: "No entregados" },
];

const inputClass =
  "w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-brand-500";

export function EditSendModal({ send, onClose, onSaved, onDeleted }: EditSendModalProps) {
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [error, setError] = useState("");

  // Reinicia el formulario cada vez que se abre con otra ejecución.
  useEffect(() => {
    setForm(send ? toForm(send) : null);
    setError("");
    setShowDelete(false);
  }, [send]);

  if (!send || !form) return null;

  const set = (patch: Partial<FormState>) => setForm((prev) => (prev ? { ...prev, ...patch } : prev));

  const handleSave = async () => {
    setError("");

    const numbers: Record<string, number> = {};
    for (const { key, label } of NUMBER_FIELDS) {
      const raw = form[key].trim();
      const n = Number(raw);
      if (raw === "" || !Number.isInteger(n) || n < 0) {
        setError(`"${label}" debe ser un número entero mayor o igual a 0`);
        return;
      }
      numbers[key] = n;
    }

    const startedAt = fromLocalInput(form.startedAt);
    const completedAt = fromLocalInput(form.completedAt);
    const createdAt = fromLocalInput(form.createdAt);
    if (!createdAt) {
      setError("La fecha de creación es obligatoria");
      return;
    }
    if (startedAt && completedAt && new Date(completedAt) < new Date(startedAt)) {
      setError("La fecha de fin no puede ser anterior a la de inicio");
      return;
    }

    setSaving(true);
    try {
      const { data } = await api.patch<EditableSend>(`/campaigns/sends/${send.id}`, {
        status: form.status,
        ...numbers,
        errorMessage: form.errorMessage.trim() || null,
        createdAt,
        startedAt,
        completedAt,
      });
      onSaved(data);
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || "No se pudo guardar la ejecución");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/campaigns/sends/${send.id}`);
      setShowDelete(false);
      onDeleted(send.id);
      onClose();
    } catch (err: any) {
      setShowDelete(false);
      setError(err?.response?.data?.message || "No se pudo eliminar la ejecución");
    } finally {
      setDeleting(false);
    }
  };

  // Las ejecuciones en curso las está procesando un worker: hay que pausarlas antes.
  const isActive = send.status === "queued" || send.status === "sending";
  const statusOptions = STATUS_OPTIONS.some((o) => o.value === form.status)
    ? STATUS_OPTIONS
    : [...STATUS_OPTIONS, { value: form.status, label: form.status }];

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/40" onClick={onClose} />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-send-title"
          className="relative bg-card rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden"
        >
          <div className="flex items-center justify-between p-5 border-b border-border shrink-0">
            <div>
              <h3 id="edit-send-title" className="text-lg font-semibold text-foreground">Editar ejecución</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">{send.id}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="overflow-y-auto p-5 space-y-4">
            {isActive && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Esta ejecución está en curso. Páusala antes de editarla o eliminarla.
              </p>
            )}

            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">Estado</label>
              <DropdownSelect
                value={form.status}
                onChange={(v) => set({ status: v })}
                options={statusOptions}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {NUMBER_FIELDS.map(({ key, label }) => (
                <div key={key}>
                  <label htmlFor={`send-${key}`} className="block text-xs font-medium text-foreground mb-1.5">
                    {label}
                  </label>
                  <input
                    id={`send-${key}`}
                    type="number"
                    min={0}
                    step={1}
                    value={form[key]}
                    onChange={(e) => set({ [key]: e.target.value } as Partial<FormState>)}
                    disabled={isActive}
                    className={inputClass}
                  />
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="send-createdAt" className="block text-xs font-medium text-foreground mb-1.5">Creada</label>
                <input
                  id="send-createdAt"
                  type="datetime-local"
                  value={form.createdAt}
                  onChange={(e) => set({ createdAt: e.target.value })}
                  disabled={isActive}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="send-startedAt" className="block text-xs font-medium text-foreground mb-1.5">Inicio</label>
                <input
                  id="send-startedAt"
                  type="datetime-local"
                  value={form.startedAt}
                  onChange={(e) => set({ startedAt: e.target.value })}
                  disabled={isActive}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="send-completedAt" className="block text-xs font-medium text-foreground mb-1.5">Fin</label>
                <input
                  id="send-completedAt"
                  type="datetime-local"
                  value={form.completedAt}
                  onChange={(e) => set({ completedAt: e.target.value })}
                  disabled={isActive}
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label htmlFor="send-errorMessage" className="block text-xs font-medium text-foreground mb-1.5">
                Mensaje de error
              </label>
              <textarea
                id="send-errorMessage"
                rows={3}
                value={form.errorMessage}
                onChange={(e) => set({ errorMessage: e.target.value })}
                disabled={isActive}
                placeholder="Sin errores"
                className={inputClass}
              />
            </div>

            {error && (
              <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 p-4 border-t border-border shrink-0">
            <Button
              variant="outline"
              onClick={() => setShowDelete(true)}
              disabled={isActive || saving}
              className="text-red-600 border-red-200 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4 mr-1.5" /> Eliminar
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
              <Button onClick={handleSave} disabled={isActive || saving}>
                {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                Guardar
              </Button>
            </div>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDelete}
        title="Eliminar ejecución"
        description="Se eliminará esta ejecución del historial junto con el detalle por destinatario (fallos y no entregados). Los mensajes ya enviados no se revierten ni se devuelven los créditos. Esta acción no se puede deshacer."
        confirmLabel="Eliminar ejecución"
        variant="danger"
        loading={deleting}
      />
    </>
  );
}
