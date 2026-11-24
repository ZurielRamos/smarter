import { useEffect, useState } from "react";
import { ArrowLeft, Check, FolderKanban, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { apiErrorMessage, reclutamientoApi, type Project, type ProspectRole } from "@/services/reclutamiento";
import { Field, ModalShell, ProjectStatusBadge, Spinner, inputClass, primaryButton, secondaryButton } from "../shared";
import { ROLE_OPTIONS, useProspectCatalog } from "./prospectCatalog";

/**
 * Agrega un contacto del CRM a un proyecto de reclutamiento, desde el menú de
 * un chat. Primero se elige el proyecto (los que no han terminado; marca
 * aquellos donde ya está) y luego con qué perfil y en qué estado entra.
 */
export function AddToProjectModal({ tenantId, recordId, contactName, onClose }: { tenantId: string; recordId: string; contactName: string; onClose: () => void }) {
  const catalog = useProspectCatalog(tenantId);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [inProjects, setInProjects] = useState<Set<string>>(new Set());
  const [chosen, setChosen] = useState<Project | null>(null);
  const [role, setRole] = useState<ProspectRole>("participant");
  const [status, setStatus] = useState("nuevo");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    reclutamientoApi
      .contactProjects(tenantId, recordId)
      .then((r) => setInProjects(new Set(r.data.map((x) => x.projectId))))
      .catch(() => undefined);
  }, [tenantId, recordId]);

  useEffect(() => {
    let alive = true;
    setProjects(null);
    reclutamientoApi
      .projects(tenantId, { search: debounced || undefined, limit: 50 })
      .then((r) => alive && setProjects(r.data.filter((p) => p.status !== "ended")))
      .catch((err) => alive && (setProjects([]), setError(apiErrorMessage(err, "No se pudieron cargar los proyectos"))));
    return () => {
      alive = false;
    };
  }, [tenantId, debounced]);

  const choose = (p: Project) => {
    setChosen(p);
    setRole(p.defaultRole);
    setStatus(catalog?.initial ?? "nuevo");
    setError("");
  };

  const add = async () => {
    if (!chosen) return;
    setSaving(true);
    setError("");
    try {
      await reclutamientoApi.addProspect(tenantId, chosen.id, recordId, role, status);
      setInProjects((s) => new Set(s).add(chosen.id));
      const roleLabel = ROLE_OPTIONS.find((o) => o.value === role)!.label.toLowerCase();
      const statusLabel = catalog?.states.find((s) => s.key === status)?.label ?? status;
      toast.success(`${contactName} quedó en ${chosen.name} como ${roleLabel}, en «${statusLabel}»`);
      setChosen(null);
    } catch (err) {
      setError(apiErrorMessage(err, "No se pudo agregar al proyecto"));
    } finally {
      setSaving(false);
    }
  };

  const help = catalog?.states.find((s) => s.key === status)?.help;

  return (
    <ModalShell title={`Agregar a ${contactName} a un proyecto`} onClose={onClose} busy={saving}>
      {chosen ? (
        <div className="space-y-4 px-5 py-4">
          <button type="button" onClick={() => setChosen(null)} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Elegir otro proyecto
          </button>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{chosen.name}</p>
              <p className="truncate font-mono text-[11px] text-muted-foreground">/{chosen.slug}</p>
            </div>
            <ProjectStatusBadge status={chosen.status} />
          </div>
          {chosen.roles.length > 1 ? (
            <Field label="Perfil">
              <select value={role} onChange={(e) => setRole(e.target.value as ProspectRole)} className={inputClass}>
                {chosen.roles.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_OPTIONS.find((o) => o.value === r)!.label}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <p className="text-xs text-muted-foreground">
              Perfil: <span className="font-medium text-foreground">{ROLE_OPTIONS.find((o) => o.value === chosen.roles[0])?.label}</span> (el único que acepta el proyecto)
            </p>
          )}
          <Field label="Estado" hint={help}>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass} disabled={!catalog}>
              {catalog?.states.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          {error && (
            <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setChosen(null)} disabled={saving} className={secondaryButton}>
              Cancelar
            </button>
            <button type="button" onClick={add} disabled={saving || !catalog} className={primaryButton}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Agregar al proyecto
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 px-5 py-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input value={search} autoFocus onChange={(e) => setSearch(e.target.value)} placeholder="Buscar proyecto" aria-label="Buscar proyectos" className={`${inputClass} pl-8`} />
          </div>
          {error && (
            <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
              {error}
            </p>
          )}
          {projects === null ? (
            <Spinner />
          ) : projects.length === 0 ? (
            <div className="py-6 text-center">
              <FolderKanban className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground">{debounced ? "Ningún proyecto coincide con la búsqueda." : "No hay proyectos abiertos. Créalos en Reclutamiento → Proyectos."}</p>
            </div>
          ) : (
            <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-xl border border-border">
              {projects.map((p) => {
                const already = inProjects.has(p.id);
                return (
                  <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
                      <p className="truncate font-mono text-[11px] text-muted-foreground">/{p.slug}</p>
                    </div>
                    <ProjectStatusBadge status={p.status} />
                    {already ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-300">
                        <Check className="h-3.5 w-3.5" /> Ya está
                      </span>
                    ) : (
                      <button type="button" onClick={() => choose(p)} className={secondaryButton}>
                        Agregar
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-[11px] text-muted-foreground">Después de elegir el proyecto, indicas con qué perfil y en qué estado entra. No tendrá respuestas al formulario del proyecto.</p>
        </div>
      )}
    </ModalShell>
  );
}
