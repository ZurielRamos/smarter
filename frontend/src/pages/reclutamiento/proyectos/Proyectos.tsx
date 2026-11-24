import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FolderKanban, Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { apiErrorMessage, reclutamientoApi, type Project, type ProjectStatus } from "@/services/reclutamiento";
import { Field, ModalShell, ProjectStatusBadge, Segmented, Spinner, inputClass, primaryButton, secondaryButton } from "../shared";
import { formatDateTime } from "../format";
import { useTenantId } from "../useTenantId";

const FILTERS: { value: "" | ProjectStatus; label: string }[] = [
  { value: "", label: "Todos" },
  { value: "draft", label: "Borradores" },
  { value: "active", label: "Activos" },
  { value: "paused", label: "Pausados" },
  { value: "ended", label: "Terminados" },
];

const PAGE_SIZE = 25;

/** Lista de proyectos de reclutamiento: cada uno con su landing y sus prospectos. */
export function Proyectos() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const tenantId = useTenantId();
  const [items, setItems] = useState<Project[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<"" | ProjectStatus>("");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const open = (id: string) => navigate(`/${slug}/reclutamiento/proyectos/${id}`);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => setPage(1), [status, debounced]);

  const load = useCallback(() => {
    if (!tenantId) return;
    setLoading(true);
    reclutamientoApi
      .projects(tenantId, { status: status || undefined, search: debounced || undefined, page, limit: PAGE_SIZE })
      .then((r) => {
        setItems(r.data);
        setTotal(r.total);
      })
      .catch(() => toast.error("No se pudieron cargar los proyectos"))
      .finally(() => setLoading(false));
  }, [tenantId, status, debounced, page]);
  useEffect(load, [load]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = !!status || !!debounced;

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Proyectos</h2>
          <p className="text-xs text-muted-foreground">Convocatorias con su propia landing y registro de prospectos. {total} en total.</p>
        </div>
        <div className="relative ml-auto w-56">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar proyecto" aria-label="Buscar proyectos" className={`${inputClass} pl-8`} />
        </div>
        <button type="button" onClick={() => setShowNew(true)} className={primaryButton}>
          <Plus className="h-3.5 w-3.5" /> Nuevo proyecto
        </button>
      </div>
      <div className="border-b border-border px-4 py-2">
        <div className="max-w-xl">
          <Segmented<"" | ProjectStatus> label="Estado" value={status} onChange={setStatus} options={FILTERS.map((f) => ({ value: f.value, label: f.label }))} />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <Spinner />
        ) : items.length === 0 ? (
          <div className="mx-auto mt-16 max-w-sm text-center">
            <FolderKanban className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium text-foreground">{filtered ? "Sin resultados" : "Aún no tienes proyectos"}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {filtered ? "Prueba con otro filtro o búsqueda." : "Un proyecto tiene su propia landing y su formulario de registro. Quienes se registran quedan como prospectos del proyecto."}
            </p>
            {!filtered && (
              <button type="button" onClick={() => setShowNew(true)} className={`${primaryButton} mt-4`}>
                <Plus className="h-3.5 w-3.5" /> Crear el primer proyecto
              </button>
            )}
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-card text-[11px] uppercase text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-4 py-2 font-medium">Proyecto</th>
                <th className="px-4 py-2 font-medium">Estado</th>
                <th className="px-4 py-2 font-medium">Registro</th>
                <th className="px-4 py-2 text-right font-medium">Prospectos</th>
                <th className="px-4 py-2 font-medium">Creado</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} onClick={() => open(p.id)} className="cursor-pointer border-b border-border transition-colors hover:bg-muted/50">
                  <td className="px-4 py-2.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        open(p.id);
                      }}
                      className="text-left font-medium text-foreground hover:underline"
                    >
                      {p.name}
                    </button>
                    <p className="font-mono text-[11px] text-muted-foreground">/{p.slug}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    <ProjectStatusBadge status={p.status} />
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{p.registrationOpen ? "Abierto" : "Cerrado"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{p.prospectCount ?? 0}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{formatDateTime(p.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted-foreground">
          <span>
            Página {page} de {pages}
          </span>
          <div className="flex gap-2">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className={secondaryButton}>
              Anterior
            </button>
            <button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className={secondaryButton}>
              Siguiente
            </button>
          </div>
        </div>
      )}
      {showNew && (
        <NewProjectModal
          tenantId={tenantId}
          onClose={() => setShowNew(false)}
          onCreated={(p) => {
            setShowNew(false);
            open(p.id);
          }}
        />
      )}
    </div>
  );
}

/** Un proyecto se crea solo con nombre (y, si se quiere, una descripción). La landing y el formulario se preparan en el detalle. */
function NewProjectModal({ tenantId, onClose, onCreated }: { tenantId: string; onClose: () => void; onCreated: (p: Project) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const create = async () => {
    setCreating(true);
    setError("");
    try {
      onCreated(await reclutamientoApi.createProject(tenantId, { name: name.trim(), description: description.trim() || null }));
    } catch (err) {
      setError(apiErrorMessage(err, "No se pudo crear el proyecto"));
    } finally {
      setCreating(false);
    }
  };

  return (
    <ModalShell title="Nuevo proyecto" onClose={onClose} busy={creating}>
      <div className="space-y-4 px-5 py-4">
        <Field label="Nombre del proyecto" hint="Es interno. En la landing podrás usar otro nombre público.">
          <input value={name} maxLength={80} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && name.trim().length >= 3 && create()} className={inputClass} />
        </Field>
        <Field label="Descripción (opcional)" hint="Solo la ve tu equipo.">
          <textarea value={description} maxLength={1000} rows={3} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
        </Field>
        {error && (
          <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
        <button type="button" onClick={onClose} disabled={creating} className={secondaryButton}>
          Cancelar
        </button>
        <button type="button" onClick={create} disabled={name.trim().length < 3 || creating} className={primaryButton}>
          {creating && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Crear borrador
        </button>
      </div>
    </ModalShell>
  );
}
