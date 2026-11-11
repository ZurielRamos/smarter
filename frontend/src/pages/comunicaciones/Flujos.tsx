import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Outlet, useNavigate, useParams } from "react-router-dom";
import { Loader2, Plus, Search, Workflow, X, Zap } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { flowsApi, statusColors, statusLabels, type ConversationFlowSummary } from "./flujos/types";
import type { FlujosOutletContext } from "./flujos/FlujoEditor";

export function Flujos() {
  const navigate = useNavigate();
  const { slug, flowId } = useParams();
  const { user } = useAuth();
  const tenantId = user?.tenantRoles.find((tr) => tr.tenant.slug === slug)?.tenantId;

  const [flows, setFlows] = useState<ConversationFlowSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    flowsApi
      .get<ConversationFlowSummary[]>("/conversation-flows", { params: { tenantId } })
      .then(({ data }) => setFlows(data))
      .catch(() => toast.error("No se pudieron cargar los flujos"))
      .finally(() => setLoading(false));
  }, [tenantId]);

  const upsertFlow = useCallback((f: ConversationFlowSummary) => {
    setFlows((prev) => {
      const exists = prev.some((p) => p.id === f.id);
      const next = exists ? prev.map((p) => (p.id === f.id ? { ...p, ...f } : p)) : [f, ...prev];
      return [...next].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
    });
  }, []);

  const removeFlow = useCallback((id: string) => setFlows((prev) => prev.filter((f) => f.id !== id)), []);

  const handleCreate = async (name: string, description: string) => {
    if (!tenantId) return;
    const { data } = await flowsApi.post<ConversationFlowSummary>("/conversation-flows", {
      tenantId,
      name,
      description: description || null,
    });
    upsertFlow(data);
    setShowCreate(false);
    toast.success("Flujo creado");
    navigate(`/${slug}/comunicaciones/flujos/${data.id}`);
  };

  const q = search.toLowerCase();
  const filtered = flows.filter(
    (f) => f.name.toLowerCase().includes(q) || (f.description || "").toLowerCase().includes(q),
  );

  const outletContext: FlujosOutletContext = { flows, upsertFlow, removeFlow };

  return (
    <>
      {/* List panel */}
      <div className={cn("border-r border-border flex flex-col shrink-0", flowId ? "w-64" : "w-80")}>
        <div className="px-3 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase">Flujos</h3>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Nuevo flujo"
            aria-label="Nuevo flujo"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="px-3 py-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              aria-label="Buscar flujo"
              placeholder="Buscar flujo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-border bg-background text-foreground placeholder:text-muted-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-14 bg-muted rounded-lg animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-center">
              <Workflow className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">{flows.length ? "Sin resultados" : "No hay flujos"}</p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {filtered.map((f) => {
                const t = f.triggers;
                const triggerText = [
                  t?.keywords?.length ? t.keywords.slice(0, 3).join(", ") + (t.keywords.length > 3 ? "…" : "") : null,
                  t?.onNewConversation ? "conversación nueva" : null,
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => navigate(`/${slug}/comunicaciones/flujos/${f.id}`)}
                    className={cn(
                      "w-full text-left p-3 rounded-lg transition-colors",
                      flowId === f.id
                        ? "bg-brand-50 dark:bg-brand-700/40 border border-brand-200 dark:border-brand-600"
                        : "hover:bg-muted border border-transparent",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-foreground truncate">{f.name}</span>
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0", statusColors[f.status])}>
                        {statusLabels[f.status]}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground">
                      {triggerText ? (
                        <>
                          <Zap className="h-3 w-3 shrink-0" />
                          <span className="truncate">{triggerText}</span>
                        </>
                      ) : (
                        <span className="truncate">{f.description || "Sin disparadores"}</span>
                      )}
                      <span className="ml-auto shrink-0">{f.runCount} inicios</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <Outlet context={outletContext} />

      <CreateFlowModal open={showCreate} onClose={() => setShowCreate(false)} onCreate={handleCreate} />
    </>
  );
}

function CreateFlowModal({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, description: string) => Promise<void>;
}) {
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
      toast.error("Error al crear el flujo");
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="create-flow-title">
      <div className="absolute inset-0 bg-black/40 animate-in fade-in duration-150" onClick={saving ? undefined : onClose} />
      <form
        onSubmit={submit}
        className="relative bg-card text-card-foreground rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h3 id="create-flow-title" className="text-sm font-semibold text-foreground">
            Nuevo flujo
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <label htmlFor="flow-name" className="block text-xs font-medium text-foreground mb-1">
              Nombre
            </label>
            <input
              id="flow-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Atención al cliente"
              maxLength={255}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="flow-desc" className="block text-xs font-medium text-foreground mb-1">
              Descripción <span className="text-muted-foreground font-normal">(opcional)</span>
            </label>
            <input
              id="flow-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Menú principal con opciones de soporte"
              className={inputClass}
            />
          </div>
        </div>
        <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!name.trim() || saving}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-xs font-medium transition-colors disabled:opacity-50"
          >
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            Crear flujo
          </button>
        </div>
      </form>
    </div>
  );
}
