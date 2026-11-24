import { Fragment, useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronDown, ChevronRight, History, Link2, Link2Off, Loader2, Save, Search, Star, Trash2, UserRound, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmModal } from "@/components/ConfirmModal";
import {
  apiErrorMessage,
  reclutamientoApi,
  type LinkCandidate,
  type ProspectCatalog,
  type Project,
  type Prospect,
  type ProspectEvent,
  type ProspectRole,
} from "@/services/reclutamiento";
import { ModalShell, Pill, ProspectStatusBadge, ReasonModal, Segmented, Spinner, inputClass, primaryButton, secondaryButton, stateClass } from "../shared";
import { formatDate, formatDateTime } from "../format";
import { ROLE_OPTIONS, useProspectCatalog } from "./prospectCatalog";

const PAGE_SIZE = 25;

type LinkFilter = "" | "yes" | "no";
type Pending = { kind: "unlink" | "delete"; prospect: Prospect } | { kind: "role"; prospect: Prospect; role: ProspectRole } | null;

const formatAnswer = (value: unknown, type?: string): string => {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (type === "date" && typeof value === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  }
  return String(value ?? "");
};

const roleLabel = (r: ProspectRole) => ROLE_OPTIONS.find((o) => o.value === r)!.label;

/** Estrellas de 1 a 5, solo lectura. */
function Stars({ value, size = "h-3 w-3" }: { value: number | null; size?: string }) {
  if (value === null) return <span className="text-[11px] text-muted-foreground">Sin calificar</span>;
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} de 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`${size} ${n <= Math.round(value) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`} />
      ))}
    </span>
  );
}

/**
 * Prospectos del proyecto, separados por perfil (participantes, encuestadores,
 * moderadores). Todos pasan por los mismos estados; cada persona tiene una
 * calificación en el proyecto y su historial. Cada prospecto es también un
 * contacto del CRM.
 */
export function ProjectProspects({ tenantId, project, onChanged }: { tenantId: string; project: Project; onChanged: () => void }) {
  const projectId = project.id;
  const { slug } = useParams();
  const catalog = useProspectCatalog(tenantId);
  const [items, setItems] = useState<Prospect[]>([]);
  const [total, setTotal] = useState(0);
  const [roleCounts, setRoleCounts] = useState<Partial<Record<ProspectRole, number>>>({});
  const [page, setPage] = useState(1);
  const [role, setRole] = useState<ProspectRole>(project.roles[0] ?? "participant");
  const [linked, setLinked] = useState<LinkFilter>("");
  const [statusFilter, setStatusFilter] = useState("");
  const [discarding, setDiscarding] = useState<{ prospect: Prospect; status: string } | null>(null);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [linking, setLinking] = useState<Prospect | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [autoBusy, setAutoBusy] = useState(false);
  const ended = project.status === "ended";
  // Pestañas: los perfiles que acepta el proyecto y los que ya tienen personas (aunque se hayan dejado de aceptar).
  const tabs = ROLE_OPTIONS.filter((o) => project.roles.includes(o.value) || (roleCounts[o.value] ?? 0) > 0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => setPage(1), [role, linked, statusFilter, debounced]);
  useEffect(() => setStatusFilter(""), [role]);

  const load = useCallback(() => {
    setLoading(true);
    reclutamientoApi
      .prospects(tenantId, projectId, { role, linked: linked || undefined, status: statusFilter || undefined, search: debounced || undefined, page, limit: PAGE_SIZE })
      .then((r) => {
        setItems(r.data);
        setTotal(r.total);
        setRoleCounts(r.roleCounts ?? {});
      })
      .catch(() => toast.error("No se pudieron cargar los prospectos"))
      .finally(() => setLoading(false));
  }, [tenantId, projectId, role, linked, statusFilter, debounced, page]);
  useEffect(load, [load]);

  /** Reemplaza la fila conservando el resumen de la persona (el listado lo trae, las acciones no). */
  const replace = (next: Prospect) => setItems((rows) => rows.map((r) => (r.id === next.id ? { ...next, person: next.person ?? r.person } : r)));

  const changeStatus = async (p: Prospect, status: string, reason?: string) => {
    try {
      replace(await reclutamientoApi.setProspectStatus(tenantId, projectId, p.id, status, reason));
      const label = catalog?.states.find((s) => s.key === status)?.label ?? status;
      toast.success(`${p.fullName}: ${label.toLowerCase()}`);
    } catch (err) {
      toast.error(apiErrorMessage(err, "No se pudo cambiar el estado"));
    }
  };

  const pickStatus = (p: Prospect, status: string) => {
    if (status === p.status) return;
    const state = catalog?.states.find((s) => s.key === status);
    if (state?.negative) setDiscarding({ prospect: p, status });
    else void changeStatus(p, status);
  };

  const autoLink = async () => {
    setAutoBusy(true);
    try {
      const r = await reclutamientoApi.autoLinkProspects(tenantId, projectId);
      if (r.linked > 0) toast.success(`${r.linked} ${r.linked === 1 ? "prospecto vinculado" : "prospectos vinculados"}`);
      else toast.message("No hubo coincidencias nuevas");
      if (r.ambiguous > 0) toast.message(`${r.ambiguous} con varios contactos posibles: vincúlalos a mano`);
      load();
    } catch (err) {
      toast.error(apiErrorMessage(err, "No se pudo vincular"));
    } finally {
      setAutoBusy(false);
    }
  };

  const confirmPending = async () => {
    if (!pending) return;
    const { prospect } = pending;
    try {
      if (pending.kind === "unlink") {
        replace(await reclutamientoApi.unlinkProspect(tenantId, projectId, prospect.id));
        toast.success("Vínculo quitado");
      } else if (pending.kind === "role") {
        await reclutamientoApi.setProspectRole(tenantId, projectId, prospect.id, pending.role);
        toast.success(`${prospect.fullName} ahora es ${roleLabel(pending.role).toLowerCase()}`);
        setExpanded(null);
        load();
      } else {
        await reclutamientoApi.deleteProspect(tenantId, projectId, prospect.id);
        toast.success("Prospecto eliminado");
        load();
        onChanged();
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, "No se pudo completar la acción"));
    } finally {
      setPending(null);
    }
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = !!linked || !!statusFilter || !!debounced;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Prospectos</h3>
          <p className="text-xs text-muted-foreground">Personas del proyecto según su perfil. Cada una es también un contacto del CRM.</p>
        </div>
        <div className="relative ml-auto w-56">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar nombre, correo o teléfono" aria-label="Buscar prospectos" className={`${inputClass} pl-8`} />
        </div>
        <button type="button" onClick={autoLink} disabled={autoBusy} className={secondaryButton} title="Vincula los prospectos sin contacto cuyo correo o teléfono coincide con un único contacto">
          {autoBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />} Buscar coincidencias
        </button>
      </div>
      {tabs.length > 1 && (
        <div role="tablist" aria-label="Perfiles" className="flex gap-1 border-b border-border px-4">
          {tabs.map((t) => (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={role === t.value}
              onClick={() => setRole(t.value)}
              className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-xs font-medium transition-colors ${role === t.value ? "border-brand-600 text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {t.plural}
              <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">{roleCounts[t.value] ?? 0}</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2 border-b border-border px-4 py-2">
        <label className="block w-64 text-xs">
          <span className="mb-1.5 block font-medium text-foreground">Estado</span>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={inputClass} disabled={!catalog}>
            <option value="">Todos los estados</option>
            {catalog?.states.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <div className="max-w-md">
          <Segmented<LinkFilter>
            label="Vínculo con contactos"
            value={linked}
            onChange={setLinked}
            options={[
              { value: "", label: "Todos" },
              { value: "yes", label: "Vinculados" },
              { value: "no", label: "Sin vincular" },
            ]}
          />
        </div>
      </div>
      {role === "moderator" && (
        <p className="border-b border-border bg-muted/40 px-4 py-2 text-[11px] text-muted-foreground">
          Los moderadores se postulan desde el registro (si lo permites en General) o los asignas cambiando el perfil de una persona o desde un chat. Entran como «Nuevo» y pasan a «Seleccionado» cuando tu equipo los aprueba.
        </p>
      )}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <Spinner />
        ) : items.length === 0 ? (
          <div className="mx-auto mt-16 max-w-sm text-center">
            <UserRound className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium text-foreground">{filtered ? "Sin resultados" : `Aún no hay ${ROLE_OPTIONS.find((o) => o.value === role)!.plural.toLowerCase()}`}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {filtered ? "Prueba con otro filtro o búsqueda." : "Llegan por la landing del proyecto (activo y con el registro abierto) o agregándolos desde un chat."}
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-card text-[11px] uppercase text-muted-foreground">
              <tr className="border-b border-border">
                <th className="w-8 px-2 py-2" />
                <th className="px-2 py-2 font-medium">Persona</th>
                <th className="px-4 py-2 font-medium">Estado</th>
                <th className="px-4 py-2 font-medium">Calificación</th>
                <th className="px-4 py-2 font-medium">Contacto del CRM</th>
                <th className="px-4 py-2 font-medium">Ingreso</th>
                <th className="px-4 py-2 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => {
                const open = expanded === p.id;
                const record = p.link?.record ?? null;
                return (
                  <Fragment key={p.id}>
                    <tr className="border-b border-border">
                      <td className="px-2 py-2.5">
                        <button type="button" aria-expanded={open} aria-label={open ? "Ocultar detalle" : "Ver detalle"} onClick={() => setExpanded(open ? null : p.id)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </button>
                      </td>
                      <td className="px-2 py-2.5">
                        <p className="font-medium text-foreground">{p.fullName}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {p.email ?? p.phone}
                          {p.source === "manual" && " · Agregado por tu equipo"}
                        </p>
                      </td>
                      <td className="px-4 py-2.5">
                        <ProspectStatusBadge catalog={catalog} status={p.status} />
                      </td>
                      <td className="px-4 py-2.5">
                        <Stars value={p.rating} />
                        {p.person && p.person.ratingCount > 0 && (
                          <p className="mt-0.5 text-[10px] text-muted-foreground" title="Promedio en todos los proyectos de la cuenta">
                            Promedio {p.person.ratingAverage} · {p.person.ratingCount} {p.person.ratingCount === 1 ? "proyecto" : "proyectos"}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {p.link ? (
                          <div className="flex items-center gap-2">
                            {record ? (
                              <Link to={`/${slug}/clients/${record.id}`} className="font-medium text-foreground hover:underline">
                                {record.name}
                              </Link>
                            ) : (
                              <span className="text-xs text-muted-foreground">Contacto eliminado</span>
                            )}
                            {p.link.method === "manual" && p.source !== "manual" && <Pill cls="bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-300">Manual</Pill>}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Sin vincular</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{formatDateTime(p.createdAt)}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-1">
                          {p.link ? (
                            <button type="button" onClick={() => setPending({ kind: "unlink", prospect: p })} aria-label={`Quitar el vínculo de ${p.fullName}`} title="Quitar vínculo" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                              <Link2Off className="h-3.5 w-3.5" />
                            </button>
                          ) : (
                            <button type="button" onClick={() => setLinking(p)} aria-label={`Vincular a ${p.fullName} con un contacto`} title="Vincular con un contacto" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                              <Link2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button type="button" onClick={() => setPending({ kind: "delete", prospect: p })} aria-label={`Eliminar a ${p.fullName}`} title="Eliminar prospecto" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-rose-600">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {open && (
                      <tr className="border-b border-border bg-muted/30">
                        <td />
                        <td colSpan={6} className="px-2 py-3">
                          <ProspectDetail
                            tenantId={tenantId}
                            project={project}
                            prospect={p}
                            catalog={catalog}
                            readOnly={ended}
                            onPickStatus={(status) => pickStatus(p, status)}
                            onPickRole={(next) => setPending({ kind: "role", prospect: p, role: next })}
                            onSaved={replace}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted-foreground">
          <span>
            Página {page} de {pages} · {total} personas
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
      {linking && (
        <LinkModal
          tenantId={tenantId}
          projectId={projectId}
          prospect={linking}
          onClose={() => setLinking(null)}
          onLinked={(next) => {
            replace(next);
            setLinking(null);
            toast.success("Prospecto vinculado");
          }}
        />
      )}
      <ReasonModal
        open={!!discarding}
        title={`Marcar como «${(discarding && catalog?.states.find((s) => s.key === discarding.status)?.label) ?? ""}»`}
        description={`${discarding?.prospect.fullName ?? "La persona"} no verá este estado ni el motivo: solo que su participación no siguió. El motivo es para tu equipo y es opcional.`}
        confirmLabel="Guardar"
        required={false}
        onClose={() => setDiscarding(null)}
        onConfirm={async (reason) => {
          if (discarding) await changeStatus(discarding.prospect, discarding.status, reason);
          setDiscarding(null);
        }}
      />
      <ConfirmModal
        open={pending?.kind === "role"}
        onClose={() => setPending(null)}
        onConfirm={confirmPending}
        title="Cambiar el perfil"
        description={
          pending?.kind === "role"
            ? `${pending.prospect.fullName} pasa a ${roleLabel(pending.role).toLowerCase()} y vuelve a «Nuevo», porque lo decidido valía para el perfil anterior. El cambio queda en su historial.`
            : ""
        }
        confirmLabel="Cambiar perfil"
        variant="warning"
      />
      <ConfirmModal
        open={pending?.kind === "unlink"}
        onClose={() => setPending(null)}
        onConfirm={confirmPending}
        title="Quitar el vínculo"
        description={`${pending?.prospect.fullName ?? "El prospecto"} deja de estar vinculado a su contacto. El contacto y el prospecto se conservan.`}
        confirmLabel="Quitar vínculo"
        variant="warning"
      />
      <ConfirmModal
        open={pending?.kind === "delete"}
        onClose={() => setPending(null)}
        onConfirm={confirmPending}
        title="Eliminar el prospecto"
        description={`Se elimina a ${pending?.prospect.fullName ?? "esta persona"} de este proyecto, con sus respuestas, su calificación y su historial. El contacto del CRM no se toca. No se puede deshacer.`}
        confirmLabel="Eliminar"
        variant="danger"
      />
    </div>
  );
}

/** Detalle de una persona en el proyecto: perfil, estado, calificación, datos y respuestas, e historial. */
function ProspectDetail({
  tenantId,
  project,
  prospect: p,
  catalog,
  readOnly,
  onPickStatus,
  onPickRole,
  onSaved,
}: {
  tenantId: string;
  project: Project;
  prospect: Prospect;
  catalog: ProspectCatalog | null;
  readOnly: boolean;
  onPickStatus: (status: string) => void;
  onPickRole: (role: ProspectRole) => void;
  onSaved: (p: Prospect) => void;
}) {
  const [rating, setRating] = useState<number | null>(p.rating);
  const [note, setNote] = useState(p.ratingNote ?? "");
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<ProspectEvent[] | null>(null);
  const ratingDirty = rating !== p.rating || note.trim() !== (p.ratingNote ?? "");
  const state = catalog?.states.find((s) => s.key === p.status);
  const otherRoles = project.roles.filter((r) => r !== p.role);
  const stateLabel = (key: string | null) => (key ? catalog?.states.find((s) => s.key === key)?.label ?? key : "—");
  // Al simplificar los estados, algunos cambios antiguos quedaron como «X → X»: no aportan y se ocultan.
  const events = (history ?? []).filter((e) => e.fromRole || e.fromStatus !== e.toStatus);

  const loadHistory = () =>
    reclutamientoApi
      .prospectHistory(tenantId, project.id, p.id)
      .then(setHistory)
      .catch(() => toast.error("No se pudo cargar el historial"));
  // El historial se recarga cuando cambia el estado o el perfil.
  useEffect(() => {
    if (history !== null) void loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.status, p.role]);

  const saveRating = async () => {
    setSaving(true);
    try {
      onSaved(await reclutamientoApi.rateProspect(tenantId, project.id, p.id, rating, note.trim()));
      toast.success(rating === null ? "Calificación quitada" : "Calificación guardada");
    } catch (err) {
      toast.error(apiErrorMessage(err, "No se pudo guardar la calificación"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-medium text-foreground">Perfil: {roleLabel(p.role)}</span>
        {!readOnly && otherRoles.length > 0 && (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            Cambiar a
            {otherRoles.map((r) => (
              <button key={r} type="button" onClick={() => onPickRole(r)} className="rounded-md border border-border px-2 py-0.5 text-[11px] hover:bg-muted hover:text-foreground">
                {roleLabel(r)}
              </button>
            ))}
          </span>
        )}
      </div>

      {catalog && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-foreground">Estado</p>
          <div className="flex flex-wrap gap-1.5">
            {catalog.states.map((s) => {
              const current = s.key === p.status;
              return (
                <button
                  key={s.key}
                  type="button"
                  title={s.help}
                  disabled={readOnly}
                  aria-pressed={current}
                  onClick={() => onPickStatus(s.key)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors disabled:cursor-not-allowed ${current ? `${stateClass(s, s.key === catalog.initial)} ring-1 ring-current` : "bg-background text-muted-foreground ring-1 ring-border hover:text-foreground"}`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {state?.help}
            {state?.negative && p.statusReason ? ` Motivo (interno): ${p.statusReason}` : ""}
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-background p-3">
          <p className="mb-1.5 text-xs font-medium text-foreground">Calificación en este proyecto</p>
          <div className="flex items-center gap-1" role="radiogroup" aria-label="Calificación">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} de 5`}
                disabled={readOnly}
                onClick={() => setRating(rating === n ? null : n)}
                className="rounded p-0.5 hover:bg-muted disabled:cursor-not-allowed"
              >
                <Star className={`h-5 w-5 ${rating !== null && n <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`} />
              </button>
            ))}
            {rating !== null && !readOnly && (
              <button type="button" onClick={() => setRating(null)} className="ml-2 text-[11px] text-muted-foreground hover:text-foreground">
                Quitar
              </button>
            )}
          </div>
          <textarea
            value={note}
            disabled={readOnly || rating === null}
            maxLength={1000}
            rows={2}
            onChange={(e) => setNote(e.target.value)}
            placeholder={rating === null ? "Elige una calificación para agregar una nota" : "Nota para tu equipo (opcional)"}
            className={`${inputClass} mt-2`}
          />
          {!readOnly && (
            <div className="mt-2 flex justify-end">
              <button type="button" onClick={saveRating} disabled={!ratingDirty || saving} className={primaryButton}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Guardar calificación
              </button>
            </div>
          )}
        </div>
        <div className="rounded-lg border border-border bg-background p-3 text-xs">
          <p className="mb-1.5 font-medium text-foreground">En toda la cuenta</p>
          {p.person ? (
            <dl className="grid grid-cols-2 gap-2">
              <div>
                <dt className="text-muted-foreground">Calificación promedio</dt>
                <dd className="mt-0.5 flex items-center gap-1.5 text-foreground">
                  <Stars value={p.person.ratingAverage} />
                  {p.person.ratingAverage !== null && <span>{p.person.ratingAverage}</span>}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Participaciones</dt>
                <dd className="mt-0.5 text-foreground">{p.person.participations}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-muted-foreground">Última participación</dt>
                <dd className="mt-0.5 text-foreground">{p.person.lastParticipationAt ? formatDate(p.person.lastParticipationAt) : "Ninguna todavía"}</dd>
              </div>
            </dl>
          ) : (
            <p className="text-muted-foreground">Sin contacto vinculado: no hay historial en otros proyectos.</p>
          )}
        </div>
      </div>

      <dl className="grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Correo</dt>
          <dd className="text-foreground">{p.email ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Teléfono</dt>
          <dd className="text-foreground">{p.phone ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Origen</dt>
          <dd className="text-foreground">{p.source === "manual" ? "Agregado por tu equipo" : "Registro por la landing"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Aceptó el tratamiento de datos</dt>
          <dd className="text-foreground">{p.consentAt ? formatDateTime(p.consentAt) : "No aplica (agregado por tu equipo)"}</dd>
        </div>
        {p.answers.map((a) => (
          <div key={a.id}>
            <dt className="text-muted-foreground">{a.label}</dt>
            <dd className="whitespace-pre-wrap text-foreground">{formatAnswer(a.value, a.type) || "—"}</dd>
          </div>
        ))}
      </dl>

      <div>
        {history === null ? (
          <button type="button" onClick={loadHistory} className={secondaryButton}>
            <History className="h-3.5 w-3.5" /> Ver historial
          </button>
        ) : (
          <div className="rounded-lg border border-border bg-background p-3">
            <p className="mb-2 text-xs font-medium text-foreground">Historial</p>
            {events.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">Sin cambios registrados.</p>
            ) : (
              <ol className="space-y-1.5 text-[11px]">
                {events.map((e) => (
                  <li key={e.id} className="flex flex-wrap gap-x-2 text-muted-foreground">
                    <span className="tabular-nums">{formatDateTime(e.createdAt)}</span>
                    <span className="text-foreground">
                      {e.fromRole
                        ? `Perfil: ${roleLabel(e.fromRole)} → ${roleLabel(e.role)}`
                        : e.fromStatus
                          ? `${stateLabel(e.fromStatus)} → ${stateLabel(e.toStatus)}`
                          : `Ingresó como ${roleLabel(e.role).toLowerCase()} (${stateLabel(e.toStatus)})`}
                    </span>
                    {e.reason && <span>· Motivo: {e.reason}</span>}
                    <span>· {e.by === "team" ? "tu equipo" : e.by === "flow" ? "un flujo de conversación" : "registro por la landing"}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Elige el contacto del CRM con el que se vincula un prospecto: primero los que coinciden en datos, y una búsqueda para el resto. */
function LinkModal({ tenantId, projectId, prospect, onClose, onLinked }: { tenantId: string; projectId: string; prospect: Prospect; onClose: () => void; onLinked: (p: Prospect) => void }) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [candidates, setCandidates] = useState<LinkCandidate[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    reclutamientoApi
      .prospectCandidates(tenantId, projectId, prospect.id, debounced || undefined)
      .then((rows) => !cancelled && setCandidates(rows))
      .catch((err) => !cancelled && setError(apiErrorMessage(err, "No se pudieron buscar contactos")));
    return () => {
      cancelled = true;
    };
  }, [tenantId, projectId, prospect.id, debounced]);

  const choose = async (c: LinkCandidate) => {
    setBusyId(c.id);
    setError("");
    try {
      onLinked(await reclutamientoApi.linkProspect(tenantId, projectId, prospect.id, c.id));
    } catch (err) {
      setError(apiErrorMessage(err, "No se pudo vincular"));
      setBusyId(null);
    }
  };

  return (
    <ModalShell title={`Vincular a ${prospect.fullName}`} onClose={onClose} busy={!!busyId}>
      <div className="space-y-3 px-5 py-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input value={search} autoFocus onChange={(e) => setSearch(e.target.value)} placeholder="Buscar otro contacto por nombre, correo o teléfono" aria-label="Buscar contactos" className={`${inputClass} pl-8`} />
        </div>
        {error && (
          <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}
        {candidates === null ? (
          <Spinner />
        ) : candidates.length === 0 ? (
          <p className="rounded-lg bg-muted/50 px-3 py-6 text-center text-xs text-muted-foreground">{debounced ? "Ningún contacto coincide con la búsqueda." : "No hay contactos con el mismo correo o teléfono. Usa la búsqueda."}</p>
        ) : (
          <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-xl border border-border">
            {candidates.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{c.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{[c.email, c.phone].filter(Boolean).join(" · ") || "Sin datos de contacto"}</p>
                </div>
                {c.matchesData && <Pill cls="bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300">Coincide</Pill>}
                <button type="button" onClick={() => choose(c)} disabled={!!busyId} className={secondaryButton}>
                  {busyId === c.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Vincular
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ModalShell>
  );
}
