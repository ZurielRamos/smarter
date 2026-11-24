import { useEffect, useState } from "react";
import { ChevronDown, FolderKanban } from "lucide-react";
import { reclutamientoApi, type Project } from "@/services/reclutamiento";
import { useProspectCatalog } from "./prospectCatalog";

/** Filtro de la lista de chats: contactos en uno o varios proyectos y, si se quiere, en ciertos estados. */
export interface ProjectChatFilterValue {
  projectIds: string[];
  statuses: string[];
}

export const EMPTY_PROJECT_FILTER: ProjectChatFilterValue = { projectIds: [], statuses: [] };

/**
 * Sección «Proyectos» del menú de filtros de los chats. Lista los proyectos de
 * la cuenta (los terminados al final) y los estados. Sin estados elegidos, se
 * muestran todos los estados.
 */
export function ProjectChatFilter({ tenantId, value, onChange }: { tenantId: string; value: ProjectChatFilterValue; onChange: (v: ProjectChatFilterValue) => void }) {
  const catalog = useProspectCatalog(tenantId);
  const [expanded, setExpanded] = useState(value.projectIds.length > 0);
  const [projects, setProjects] = useState<Project[] | null>(null);

  useEffect(() => {
    if (!expanded || projects !== null) return;
    reclutamientoApi
      .projects(tenantId, { limit: 100 })
      .then((r) => setProjects([...r.data].sort((a, b) => Number(a.status === "ended") - Number(b.status === "ended"))))
      .catch(() => setProjects([]));
  }, [expanded, projects, tenantId]);

  const toggle = (list: string[], key: string) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);
  const chip = (on: boolean) =>
    `rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${on ? "bg-brand-50 text-brand-700 ring-1 ring-brand-300 dark:bg-brand-700 dark:text-brand-100" : "bg-muted text-muted-foreground hover:text-foreground"}`;

  return (
    <div className="border-t border-border mt-1 pt-1">
      <button type="button" onClick={() => setExpanded((v) => !v)} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors">
        <FolderKanban className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="flex-1 text-left">Filtrar por proyecto</span>
        {value.projectIds.length > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-700 dark:bg-brand-700 dark:text-brand-100 font-medium">{value.projectIds.length}</span>
        )}
        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
      {expanded && (
        <div className="space-y-2 px-3 pb-2">
          {projects === null ? (
            <p className="text-[11px] text-muted-foreground">Cargando proyectos…</p>
          ) : projects.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">La cuenta no tiene proyectos.</p>
          ) : (
            <ul className="max-h-40 space-y-0.5 overflow-y-auto">
              {projects.map((p) => (
                <li key={p.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-xs text-foreground hover:bg-muted">
                    <input type="checkbox" checked={value.projectIds.includes(p.id)} onChange={() => onChange({ ...value, projectIds: toggle(value.projectIds, p.id) })} />
                    <span className="flex-1 truncate">{p.name}</span>
                    {p.status !== "active" && <span className="text-[10px] text-muted-foreground">{p.status === "ended" ? "Terminado" : p.status === "paused" ? "Pausado" : "Borrador"}</span>}
                  </label>
                </li>
              ))}
            </ul>
          )}
          {value.projectIds.length > 0 && catalog && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Estado en el proyecto</p>
              <div className="flex flex-wrap gap-1">
                <button type="button" onClick={() => onChange({ ...value, statuses: [] })} className={chip(value.statuses.length === 0)}>
                  Todos
                </button>
                {catalog.states.map((s) => (
                  <button key={s.key} type="button" title={s.help} onClick={() => onChange({ ...value, statuses: toggle(value.statuses, s.key) })} className={chip(value.statuses.includes(s.key))}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {value.projectIds.length > 0 && (
            <button type="button" onClick={() => onChange(EMPTY_PROJECT_FILTER)} className="text-[11px] text-muted-foreground hover:text-foreground">
              Quitar filtro de proyecto
            </button>
          )}
        </div>
      )}
    </div>
  );
}
