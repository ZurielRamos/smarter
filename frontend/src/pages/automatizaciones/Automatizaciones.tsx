import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Copy, Loader2, Plus, Search, Trash2, Workflow, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { ConfirmModal } from "@/components/ConfirmModal";
import { automationsApi, statusColors, statusLabels, type AutomationSummary } from "@/services/automatizaciones";
import { NODE_BY_TYPE } from "./nodeCatalog";

export function Automatizaciones() {
  const navigate = useNavigate();
  const { slug } = useParams();
  const { user } = useAuth();
  const tenantId = user?.tenantRoles.find((tr) => tr.tenant.slug === slug)?.tenantId;

  const [list, setList] = useState<AutomationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [toDelete, setToDelete] = useState<AutomationSummary | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    automationsApi
      .list(tenantId)
      .then(setList)
      .catch(() => toast.error("No se pudieron cargar las automatizaciones"))
      .finally(() => setLoading(false));
  }, [tenantId]);

  const open = (id: string) => navigate(`/${slug}/automatizaciones/${id}`);

  const handleCreate = async (name: string, description: string) => {
    if (!tenantId) return;
    const created = await automationsApi.create(tenantId, name, description);
    toast.success("Automatización creada");
    open(created.id);
  };

  const handleDuplicate = async (a: AutomationSummary) => {
    if (!tenantId) return;
    try {
      const copy = await automationsApi.duplicate(a.id, tenantId);
      setList((prev) => [copy, ...prev]);
      toast.success("Automatización duplicada");
    } catch {
      /* el interceptor muestra el error */
    }
  };

  const handleDelete = async () => {
    if (!tenantId || !toDelete) return;
    await automationsApi.remove(toDelete.id, tenantId);
    setList((prev) => prev.filter((a) => a.id !== toDelete.id));
    setToDelete(null);
    toast.success("Automatización eliminada");
  };

  const q = search.toLowerCase();
  const filtered = list.filter((a) => a.name.toLowerCase().includes(q) || (a.description ?? "").toLowerCase().includes(q));

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            aria-label="Buscar automatización"
            placeholder="Buscar automatización…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border bg-background py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="ml-auto flex items-center gap-1.5 rounded-lg bg-brand-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-600"
        >
          <Plus className="h-3.5 w-3.5" /> Nueva automatización
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="mx-auto mt-16 max-w-sm text-center">
            <Workflow className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium text-foreground">{list.length ? "Sin resultados" : "Aún no tienes automatizaciones"}</p>
            {!list.length && (
              <p className="mt-1 text-xs text-muted-foreground">
                Crea tu primer flujo: elige un disparador, agrega acciones e intégralo con Slack, correo, APIs y más.
              </p>
            )}
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((a) => {
              const trig = a.triggerType ? NODE_BY_TYPE[a.triggerType] : null;
              const TrigIcon = trig?.icon ?? Workflow;
              return (
                <li key={a.id} className="group relative rounded-xl border border-border bg-background transition-shadow hover:shadow-md">
                  <button type="button" onClick={() => open(a.id)} className="block w-full rounded-xl p-4 text-left">
                    <div className="flex items-start justify-between gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500 text-white">
                        <TrigIcon className="h-4 w-4" />
                      </span>
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", statusColors[a.status])}>{statusLabels[a.status]}</span>
                    </div>
                    <p className="mt-3 truncate text-sm font-semibold text-foreground">{a.name}</p>
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{a.description || trig?.label || "Sin disparador"}</p>
                    <p className="mt-3 text-[10px] text-muted-foreground">
                      {a.nodeCount} nodos · {a.runCount} ejecuciones
                      {a.lastRunAt ? ` · última ${new Date(a.lastRunAt).toLocaleDateString()}` : ""}
                    </p>
                  </button>
                  <div className="absolute bottom-2 right-2 flex gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                    <button type="button" aria-label="Duplicar" title="Duplicar" onClick={() => handleDuplicate(a)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" aria-label="Eliminar" title="Eliminar" onClick={() => setToDelete(a)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-rose-500">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <CreateModal open={showCreate} onClose={() => setShowCreate(false)} onCreate={handleCreate} />
      <ConfirmModal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={handleDelete}
        title="Eliminar automatización"
        description={`Se eliminará «${toDelete?.name}» junto con su historial de ejecuciones. Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        variant="danger"
      />
    </div>
  );
}

function CreateModal({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (name: string, description: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
    }
  }, [open]);

  if (!open) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await onCreate(name.trim(), description.trim());
    } catch {
      /* el interceptor muestra el error */
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="create-auto-title">
      <div className="absolute inset-0 bg-black/40 animate-in fade-in duration-150" onClick={saving ? undefined : onClose} />
      <form onSubmit={submit} className="relative mx-4 w-full max-w-md overflow-hidden rounded-2xl bg-card text-card-foreground shadow-xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 id="create-auto-title" className="text-sm font-semibold text-foreground">Nueva automatización</h3>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <div>
            <label htmlFor="auto-name" className="mb-1 block text-xs font-medium text-foreground">Nombre</label>
            <input id="auto-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Alertar a ventas por nuevo lead" maxLength={255} className={inputClass} />
          </div>
          <div>
            <label htmlFor="auto-desc" className="mb-1 block text-xs font-medium text-foreground">
              Descripción <span className="font-normal text-muted-foreground">(opcional)</span>
            </label>
            <input id="auto-desc" value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50">
            Cancelar
          </button>
          <button type="submit" disabled={!name.trim() || saving} className="flex items-center gap-1.5 rounded-lg bg-brand-700 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-50">
            {saving && <Loader2 className="h-3 w-3 animate-spin" />} Crear
          </button>
        </div>
      </form>
    </div>
  );
}
