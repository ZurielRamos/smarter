import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmModal } from "@/components/ConfirmModal";
import { apiErrorMessage, reclutamientoApi, type Project, type ProjectAction, type ProspectRole } from "@/services/reclutamiento";
import { ROLE_OPTIONS } from "./prospectCatalog";
import { Field, ProjectStatusBadge, Spinner, inputClass, primaryButton, secondaryButton } from "../shared";
import { formatDateTime } from "../format";
import { useTenantId } from "../useTenantId";
import { ProjectFormEditor } from "./ProjectFormEditor";
import { ProjectLandingTab } from "./ProjectLandingTab";
import { ProjectProspects } from "./ProjectProspects";

type Dialog = null | "activate" | "pause" | "resume" | "end" | "delete";

const TABS = [
  { id: "general", label: "General" },
  { id: "landing", label: "Landing" },
  { id: "formulario", label: "Formulario" },
  { id: "prospectos", label: "Prospectos" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const DONE: Record<ProjectAction, string> = {
  activate: "Proyecto activado",
  pause: "Proyecto pausado",
  resume: "Proyecto reanudado",
  end: "Proyecto terminado",
};

/** Detalle de un proyecto: datos generales, landing, formulario y prospectos. */
export function ProyectoDetalle() {
  const { slug, projectId } = useParams();
  const navigate = useNavigate();
  const tenantId = useTenantId();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [error, setError] = useState("");
  const [params, setParams] = useSearchParams();
  const tab: TabId = TABS.find((t) => t.id === params.get("tab"))?.id ?? "general";
  const [visited, setVisited] = useState<Set<TabId>>(() => new Set([tab]));
  const back = () => navigate(`/${slug}/reclutamiento/proyectos`);

  const changeTab = (id: TabId) => {
    setVisited((v) => new Set(v).add(id));
    setParams(id === "general" ? {} : { tab: id }, { replace: true });
  };

  useEffect(() => {
    if (!tenantId || !projectId) return;
    reclutamientoApi
      .project(tenantId, projectId)
      .then(setProject)
      .catch(() => toast.error("No se pudo cargar el proyecto"))
      .finally(() => setLoading(false));
  }, [tenantId, projectId]);

  /** Recarga el proyecto (los conteos y el estado pueden haber cambiado en otra pestaña). */
  const refresh = useCallback(async () => {
    if (tenantId && projectId) setProject(await reclutamientoApi.project(tenantId, projectId));
  }, [tenantId, projectId]);

  if (loading) return <div className="flex-1"><Spinner /></div>;
  if (!project) {
    return (
      <div className="mx-auto mt-16 max-w-sm text-center">
        <p className="text-sm font-medium text-foreground">Proyecto no encontrado</p>
        <button type="button" onClick={back} className={`${secondaryButton} mt-3`}>
          Volver a proyectos
        </button>
      </div>
    );
  }

  const run = async (action: ProjectAction) => {
    try {
      setProject(await reclutamientoApi.projectAction(tenantId, project.id, action));
      setDialog(null);
      setError("");
      toast.success(DONE[action]);
    } catch (err) {
      setDialog(null);
      setError(apiErrorMessage(err, "No se pudo completar la acción"));
    }
  };

  const remove = async () => {
    try {
      await reclutamientoApi.deleteProject(tenantId, project.id);
      toast.success("Borrador eliminado");
      back();
    } catch (err) {
      setDialog(null);
      setError(apiErrorMessage(err, "No se pudo eliminar el proyecto"));
    }
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <button type="button" aria-label="Volver a proyectos" onClick={back} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-sm font-semibold text-foreground">{project.name}</h2>
            <ProjectStatusBadge status={project.status} />
          </div>
          <p className="truncate font-mono text-xs text-muted-foreground">/{project.slug}</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {project.status === "draft" && (
            <>
              <button type="button" onClick={() => setDialog("delete")} className={`${secondaryButton} hover:text-rose-600`}>
                <Trash2 className="h-3.5 w-3.5" /> Eliminar
              </button>
              <button type="button" onClick={() => setDialog("activate")} className={primaryButton}>
                Activar
              </button>
            </>
          )}
          {project.status === "active" && (
            <>
              <button type="button" onClick={() => setDialog("pause")} className={secondaryButton}>
                Pausar
              </button>
              <button type="button" onClick={() => setDialog("end")} className={`${secondaryButton} hover:text-rose-600`}>
                Terminar
              </button>
            </>
          )}
          {project.status === "paused" && (
            <>
              <button type="button" onClick={() => setDialog("resume")} className={primaryButton}>
                Reanudar
              </button>
              <button type="button" onClick={() => setDialog("end")} className={`${secondaryButton} hover:text-rose-600`}>
                Terminar
              </button>
            </>
          )}
        </div>
      </div>
      <div role="tablist" aria-label="Secciones del proyecto" className="flex gap-1 overflow-x-auto border-b border-border px-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => changeTab(t.id)}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
              tab === t.id ? "border-brand-600 text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            {t.id === "prospectos" && project.prospectCount ? <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">{project.prospectCount}</span> : null}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="mx-4 mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:bg-rose-500/15 dark:text-rose-200">
          {error}
        </p>
      )}
      {tab === "general" && (
        <div role="tabpanel" className="flex-1 overflow-y-auto p-4">
          <GeneralTab key={project.updatedAt} tenantId={tenantId} project={project} onSaved={setProject} />
        </div>
      )}
      {/* La landing y el formulario se quedan montados al cambiar de pestaña para no perder lo que se está editando. */}
      {visited.has("landing") && (
        <div role="tabpanel" className={tab === "landing" ? "flex min-h-0 flex-1 flex-col overflow-hidden" : "hidden"}>
          <ProjectLandingTab tenantId={tenantId} project={project} />
        </div>
      )}
      {visited.has("formulario") && (
        <div role="tabpanel" className={tab === "formulario" ? "flex min-h-0 flex-1 flex-col overflow-hidden" : "hidden"}>
          <ProjectFormEditor tenantId={tenantId} projectId={project.id} readOnly={project.status === "ended"} />
        </div>
      )}
      {tab === "prospectos" && (
        <div role="tabpanel" className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <ProjectProspects tenantId={tenantId} project={project} onChanged={refresh} />
        </div>
      )}
      <ConfirmModal
        open={dialog === "activate"}
        onClose={() => setDialog(null)}
        onConfirm={() => run("activate")}
        title="Activar el proyecto"
        description="La dirección pública del proyecto queda disponible. Para que reciba registros, activa «Recibir registros» en la pestaña Landing."
        confirmLabel="Activar"
      />
      <ConfirmModal
        open={dialog === "pause"}
        onClose={() => setDialog(null)}
        onConfirm={() => run("pause")}
        title="Pausar el proyecto"
        description="La dirección pública deja de estar disponible y no se reciben registros. Los prospectos se conservan. Puedes reanudarlo cuando quieras."
        confirmLabel="Pausar"
        variant="warning"
      />
      <ConfirmModal
        open={dialog === "resume"}
        onClose={() => setDialog(null)}
        onConfirm={() => run("resume")}
        title="Reanudar el proyecto"
        description="La dirección pública vuelve a estar disponible."
        confirmLabel="Reanudar"
      />
      <ConfirmModal
        open={dialog === "end"}
        onClose={() => setDialog(null)}
        onConfirm={() => run("end")}
        title="Terminar el proyecto"
        description="Es definitivo: el proyecto no se puede reabrir ni editar, y su dirección pública deja de funcionar. Los prospectos se conservan."
        confirmLabel="Terminar proyecto"
        variant="danger"
      />
      <ConfirmModal
        open={dialog === "delete"}
        onClose={() => setDialog(null)}
        onConfirm={remove}
        title="Eliminar el proyecto"
        description="Se elimina el proyecto con su landing y su formulario. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        variant="danger"
      />
    </div>
  );
}

/** Nombre, dirección y descripción del proyecto. */
function GeneralTab({ tenantId, project, onSaved }: { tenantId: string; project: Project; onSaved: (p: Project) => void }) {
  const [name, setName] = useState(project.name);
  const [slug, setSlug] = useState(project.slug);
  const [description, setDescription] = useState(project.description ?? "");
  const [requiresContract, setRequiresContract] = useState(project.requiresSignedContract);
  const [roles, setRoles] = useState<ProspectRole[]>(project.roles);
  const [defaultRole, setDefaultRole] = useState<ProspectRole>(project.defaultRole);
  const [moderatorSignup, setModeratorSignup] = useState(project.moderatorSignup);
  /** Perfiles con que puede entrar quien se registra: los aceptados, sin moderador salvo que sea el único. */
  const entryRoles = roles.filter((r) => r !== "moderator").length ? roles.filter((r) => r !== "moderator") : roles;
  const toggleRole = (role: ProspectRole, on: boolean) => {
    const next = ROLE_OPTIONS.map((o) => o.value).filter((r) => (r === role ? on : roles.includes(r)));
    if (next.length === 0) return;
    setRoles(next);
    const entry = next.filter((r) => r !== "moderator").length ? next.filter((r) => r !== "moderator") : next;
    if (!entry.includes(defaultRole)) setDefaultRole(entry[0]);
    if (!next.includes("moderator")) setModeratorSignup(false);
  };
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const ended = project.status === "ended";
  const slugLocked = project.status !== "draft";
  const dirty = useMemo(
    () =>
      name.trim() !== project.name ||
      slug.trim() !== project.slug ||
      description.trim() !== (project.description ?? "") ||
      requiresContract !== project.requiresSignedContract ||
      roles.join() !== project.roles.join() ||
      defaultRole !== project.defaultRole ||
      moderatorSignup !== project.moderatorSignup,
    [name, slug, description, requiresContract, roles, defaultRole, moderatorSignup, project],
  );

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      onSaved(await reclutamientoApi.updateProject(tenantId, project.id, { name: name.trim(), slug: slug.trim(), description: description.trim() || null, requiresSignedContract: requiresContract, roles, defaultRole, moderatorSignup }));
      toast.success("Cambios guardados");
    } catch (err) {
      setError(apiErrorMessage(err, "No se pudieron guardar los cambios"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="space-y-4 rounded-xl border border-border bg-background p-4">
        <Field label="Nombre del proyecto" hint="Es interno. En la landing puedes usar otro nombre público.">
          <input value={name} maxLength={80} disabled={ended} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Dirección" hint={slugLocked ? "Solo se puede cambiar mientras el proyecto está en borrador." : "Es la última parte del enlace público del proyecto."}>
          <input value={slug} maxLength={40} disabled={slugLocked} spellCheck={false} onChange={(e) => setSlug(e.target.value.toLowerCase())} className={`${inputClass} font-mono`} />
        </Field>
        <Field label="Descripción" hint="Solo la ve tu equipo.">
          <textarea value={description} maxLength={1000} rows={4} disabled={ended} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
        </Field>
        <fieldset className="space-y-2 rounded-lg border border-border p-3">
          <legend className="px-1 text-xs font-medium text-foreground">Perfiles que acepta el proyecto</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {ROLE_OPTIONS.map((o) => (
              <label key={o.value} className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" checked={roles.includes(o.value)} disabled={ended || (roles.length === 1 && roles[0] === o.value)} onChange={(e) => toggleRole(o.value, e.target.checked)} />
                {o.plural}
              </label>
            ))}
          </div>
          {entryRoles.length > 1 && (
            <label className="block text-xs text-foreground">
              <span className="mb-1 block font-medium">Quien se registra por la landing entra como</span>
              <select value={defaultRole} disabled={ended} onChange={(e) => setDefaultRole(e.target.value as ProspectRole)} className={inputClass}>
                {entryRoles.map((r) => (
                  <option key={r} value={r}>{ROLE_OPTIONS.find((o) => o.value === r)!.label}</option>
                ))}
              </select>
              <span className="mt-1 block text-[11px] text-muted-foreground">Es lo que viene marcado; en el registro la persona puede elegir otro de los aceptados.</span>
            </label>
          )}
          {roles.includes("moderator") && (
            <label className="flex items-start gap-2 text-sm text-foreground">
              <input type="checkbox" className="mt-0.5" checked={moderatorSignup} disabled={ended} onChange={(e) => setModeratorSignup(e.target.checked)} />
              <span>
                Permitir postularse como moderador en el registro
                <span className="block text-[11px] text-muted-foreground">Quien lo elija queda como moderador «Postulado» hasta que tu equipo lo apruebe. Sin esto, los moderadores solo se asignan a mano.</span>
              </span>
            </label>
          )}
          <p className="text-[11px] text-muted-foreground">Quitar un perfil no cambia a las personas que ya lo tienen; solo impide agregar o registrar nuevas con ese perfil.</p>
        </fieldset>
        <label className="flex items-start gap-2 text-sm text-foreground">
          <input type="checkbox" className="mt-0.5" checked={requiresContract} disabled={ended} onChange={(e) => setRequiresContract(e.target.checked)} />
          <span>
            Requiere contrato firmado
            <span className="block text-[11px] text-muted-foreground">Informativo para tu equipo: por ahora no envía contratos ni bloquea ninguna acción.</span>
          </span>
        </label>
        {error && (
          <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}
        {!ended && (
          <div className="flex justify-end">
            <button type="button" onClick={save} disabled={!dirty || saving || name.trim().length < 3} className={primaryButton}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Guardar
            </button>
          </div>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-xl border border-border bg-muted/40 px-4 py-3">
          <dt className="text-muted-foreground">Registro</dt>
          <dd className="mt-0.5 font-medium text-foreground">{project.registrationOpen ? "Abierto" : "Cerrado"}</dd>
        </div>
        <div className="rounded-xl border border-border bg-muted/40 px-4 py-3">
          <dt className="text-muted-foreground">Prospectos</dt>
          <dd className="mt-0.5 font-medium tabular-nums text-foreground">{project.prospectCount ?? 0}</dd>
        </div>
        <div className="rounded-xl border border-border bg-muted/40 px-4 py-3">
          <dt className="text-muted-foreground">Contrato firmado</dt>
          <dd className="mt-0.5 font-medium text-foreground">{project.requiresSignedContract ? "Requerido" : "No requerido"}</dd>
        </div>
        <div className="rounded-xl border border-border bg-muted/40 px-4 py-3">
          <dt className="text-muted-foreground">Creado</dt>
          <dd className="mt-0.5 font-medium text-foreground">{formatDateTime(project.createdAt)}</dd>
        </div>
        {project.endedAt && (
          <div className="rounded-xl border border-border bg-muted/40 px-4 py-3">
            <dt className="text-muted-foreground">Terminado</dt>
            <dd className="mt-0.5 font-medium text-foreground">{formatDateTime(project.endedAt)}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}
