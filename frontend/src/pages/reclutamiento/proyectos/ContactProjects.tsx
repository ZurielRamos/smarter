import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FolderKanban, Star } from "lucide-react";
import { reclutamientoApi, type ContactProjectLink, type PersonSummary } from "@/services/reclutamiento";
import { ProjectStatusBadge, ProspectStatusBadge } from "../shared";
import { formatDate } from "../format";
import { ROLE_OPTIONS, useProspectCatalog } from "./prospectCatalog";

/**
 * Proyectos de reclutamiento de un contacto, para su ficha: perfil y estado en
 * cada uno, su calificación, y el resumen en la cuenta (promedio, participaciones
 * y última participación). Solo lectura. Si no está en ninguno, no ocupa espacio.
 */
export function ContactProjects({ slug, tenantId, recordId }: { slug: string; tenantId: string; recordId: string }) {
  const [items, setItems] = useState<ContactProjectLink[]>([]);
  const [summary, setSummary] = useState<PersonSummary | null>(null);
  const catalog = useProspectCatalog(tenantId);

  useEffect(() => {
    let alive = true;
    reclutamientoApi
      .contactProjects(tenantId, recordId)
      .then((r) => {
        if (!alive) return;
        setItems(r.data);
        setSummary(r.summary);
      })
      .catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, [tenantId, recordId]);

  if (items.length === 0) return null;
  return (
    <div className="bg-card rounded-xl border border-border p-5">
      <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground">
        <FolderKanban className="h-4 w-4 text-muted-foreground" /> Proyectos de reclutamiento
      </h3>
      {summary && (
        <p className="mb-3 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Star className={`h-3 w-3 ${summary.ratingAverage !== null ? "fill-amber-400 text-amber-400" : ""}`} />
            {summary.ratingAverage !== null ? `${summary.ratingAverage} de 5 (${summary.ratingCount})` : "Sin calificar"}
          </span>
          <span>{summary.participations} {summary.participations === 1 ? "participación" : "participaciones"}</span>
          {summary.lastParticipationAt && <span>Última: {formatDate(summary.lastParticipationAt)}</span>}
        </p>
      )}
      <ul className="divide-y divide-border">
        {items.map((p) => (
          <li key={p.prospectId} className="flex items-center justify-between gap-3 py-2">
            <Link to={`/${slug}/reclutamiento/proyectos/${p.projectId}?tab=prospectos`} className="min-w-0">
              <span className="block truncate text-sm font-medium text-foreground hover:underline">{p.projectName}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {ROLE_OPTIONS.find((o) => o.value === p.role)?.label} · desde {formatDate(p.registeredAt)}
                {p.rating !== null && ` · ${p.rating}★`}
              </span>
            </Link>
            <div className="flex shrink-0 items-center gap-1.5">
              <ProspectStatusBadge catalog={catalog} status={p.status} />
              {p.projectStatus !== "active" && <ProjectStatusBadge status={p.projectStatus} />}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
