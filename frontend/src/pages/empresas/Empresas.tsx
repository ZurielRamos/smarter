import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, ChevronDown, Loader2, Map as MapIcon, Plus, Search, TableProperties, Upload, Users } from "lucide-react";
import { toast } from "sonner";
import { ConfirmModal } from "@/components/ConfirmModal";
import { Button } from "@/components/ui/button";
import {
  companiesApi,
  EMPLOYEE_RANGE_LABELS,
  ORGANIZATION_TYPE_LABELS,
  type MapPoint,
  type MigrationReport,
  type OrganizationListItem,
  type OrganizationStatus,
  type OrganizationType,
} from "@/services/companies";
import { CompaniesMap } from "./CompaniesMap";
import { CompanyFormModal } from "./CompanyFormModal";
import { EmpresasHeader } from "./EmpresasHeader";
import { glassButton, glassGroup, glassInput, glassSegment } from "./glass";
import { GlassSelect } from "./GlassSelect";
import { StatusBadge, TypeBadge } from "./shared";
import { formatPlace, useCompaniesAccess } from "./useCompaniesAccess";

const PAGE_SIZE = 25;

const STATUS_FILTERS: { value: "" | OrganizationStatus; label: string }[] = [
  { value: "", label: "Todas" },
  { value: "active", label: "Activas" },
  { value: "inactive", label: "Inactivas" },
];

export function Empresas() {
  const navigate = useNavigate();
  const { slug, tenantId, canWrite, canDelete } = useCompaniesAccess();

  const [items, setItems] = useState<OrganizationListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [type, setType] = useState<"" | OrganizationType>("");
  const [status, setStatus] = useState<"" | OrganizationStatus>("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<"list" | "map">("list");
  const [points, setPoints] = useState<MapPoint[]>([]);
  const [mapTruncated, setMapTruncated] = useState(false);
  const [mapLoading, setMapLoading] = useState(false);
  const [migration, setMigration] = useState<MigrationReport | null>(null);
  const [migrating, setMigrating] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [type, status, debouncedSearch]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  const load = useCallback(() => {
    if (!tenantId) return;
    setLoading(true);
    companiesApi
      .list(tenantId, {
        type: type || undefined,
        status: status || undefined,
        search: debouncedSearch || undefined,
        page,
        limit: PAGE_SIZE,
      })
      .then((res) => {
        setItems(res.data);
        setTotal(res.total);
      })
      .catch(() => toast.error("No se pudieron cargar las empresas"))
      .finally(() => setLoading(false));
  }, [tenantId, type, status, debouncedSearch, page]);

  useEffect(load, [load]);

  // El mapa usa los mismos filtros que la lista, pero sin paginación.
  useEffect(() => {
    if (view !== "map" || !tenantId) return;
    let alive = true;
    setMapLoading(true);
    companiesApi
      .mapPoints(tenantId, { type: type || undefined, status: status || undefined, search: debouncedSearch || undefined })
      .then((res) => {
        if (!alive) return;
        setPoints(res.data);
        setMapTruncated(res.truncated);
      })
      .catch(() => alive && toast.error("No se pudo cargar el mapa"))
      .finally(() => alive && setMapLoading(false));
    return () => {
      alive = false;
    };
  }, [view, tenantId, type, status, debouncedSearch]);

  const previewMigration = async () => {
    setMigrating(true);
    try {
      const report = await companiesApi.migrateFromContacts(tenantId, true);
      if (report.toCreate === 0 && report.contactsToLink === 0) {
        toast.info("No hay nada que traer: los contactos no tienen empresas nuevas ni vínculos pendientes.");
      } else {
        setMigration(report);
      }
    } catch {
      // El interceptor de la API muestra el motivo.
    } finally {
      setMigrating(false);
    }
  };

  const applyMigration = async () => {
    try {
      const done = await companiesApi.migrateFromContacts(tenantId, false);
      toast.success(`Se crearon ${done.toCreate} empresas y ${done.contactsToLink} vínculos`);
      setMigration(null);
      load();
    } catch {
      setMigration(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = !!(type || status || debouncedSearch);

  const emptyState = (
    <div className="flex-1 flex items-center justify-center bg-background px-6">
      <div className="bg-card rounded-xl border border-border p-6 max-w-md w-full">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Building2 className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold text-foreground">{filtered ? "Sin resultados" : "Sin empresas registradas"}</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            {filtered
              ? "Prueba con otro filtro o búsqueda."
              : "Registra tus clientes y los establecimientos que vas a visitar, o importa un archivo CSV o Excel."}
          </p>
          {!filtered && canWrite && (
            <Button onClick={() => navigate(`/${slug}/empresas/importar`)} size="sm" className="mt-4 bg-accent-500 hover:bg-accent-600 text-white">
              Importar datos
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  const loader = (
    <div className="flex-1 min-h-0 flex flex-col items-center justify-center bg-card rounded-xl border border-border overflow-hidden">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Cargando" />
    </div>
  );

  return (
    <>
      <EmpresasHeader title="Empresas" subtitle="Clientes, establecimientos y sucursales, con sus contactos vinculados">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/60" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar empresa, correo o teléfono"
            aria-label="Buscar empresas"
            className={`${glassInput} w-64 pl-8 pr-3`}
          />
        </div>

        <div className={glassGroup} role="group" aria-label="Vista">
          <button type="button" aria-label="Vista de lista" aria-pressed={view === "list"} onClick={() => setView("list")} className={glassSegment(view === "list")}>
            <TableProperties className="h-4 w-4" />
          </button>
          <button type="button" aria-label="Vista de mapa" aria-pressed={view === "map"} onClick={() => setView("map")} className={glassSegment(view === "map")}>
            <MapIcon className="h-4 w-4" />
          </button>
        </div>

        <div className={glassGroup} role="group" aria-label="Estado">
          {STATUS_FILTERS.map((f) => (
            <button key={f.value} type="button" aria-pressed={status === f.value} onClick={() => setStatus(f.value)} className={glassSegment(status === f.value)}>
              {f.label}
            </button>
          ))}
        </div>

        <GlassSelect
          label="Todos los tipos"
          value={type}
          onChange={(v) => setType(v as "" | OrganizationType)}
          options={[
            { value: "", label: "Todos los tipos" },
            ...(Object.keys(ORGANIZATION_TYPE_LABELS) as OrganizationType[]).map((t) => ({ value: t, label: ORGANIZATION_TYPE_LABELS[t] })),
          ]}
        />

        {canWrite && (
          <div className="relative flex" ref={menuRef}>
            <button type="button" onClick={() => setShowCreate(true)} className={`${glassButton} rounded-r-none`}>
              <Plus className="h-4 w-4" />
              <span>Nueva empresa</span>
            </button>
            <button
              type="button"
              aria-label="Más acciones"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center justify-center px-1.5 py-1.5 rounded-r-lg bg-white/15 hover:bg-white/25 text-white border-l border-white/20 transition-colors"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-popover text-popover-foreground rounded-lg shadow-lg border border-border py-1 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    navigate(`/${slug}/empresas/importar`);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                >
                  <Upload className="h-4 w-4 text-muted-foreground" />
                  Importar datos
                </button>
                {canDelete && (
                  <button
                    type="button"
                    disabled={migrating}
                    onClick={() => {
                      setMenuOpen(false);
                      previewMigration();
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                  >
                    <Users className="h-4 w-4 text-muted-foreground" />
                    Traer desde contactos
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </EmpresasHeader>

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden pt-4">
        {view === "map" ? (
          mapLoading ? (
            loader
          ) : points.length === 0 ? (
            <div className="flex-1 flex items-center justify-center bg-background px-6">
              <div className="bg-card rounded-xl border border-border p-6 max-w-md w-full">
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                    <MapIcon className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h2 className="text-xl font-semibold text-foreground">Sin empresas con ubicación</h2>
                  <p className="text-muted-foreground mt-2 text-sm">Agrega latitud y longitud a las empresas para verlas en el mapa.</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 min-h-0 flex flex-col bg-card rounded-xl border border-border overflow-hidden p-3">
              <div className="min-h-[320px] flex-1">
                <CompaniesMap
                  markers={points.map((p) => ({ ...p, subtitle: p.city || p.address }))}
                  onSelect={(id) => navigate(`/${slug}/empresas/${id}`)}
                />
              </div>
              {mapTruncated && (
                <p className="pt-2 text-xs text-muted-foreground">
                  Se muestran las primeras {points.length} empresas. Usa los filtros para acotar.
                </p>
              )}
            </div>
          )
        ) : loading ? (
          loader
        ) : total === 0 ? (
          emptyState
        ) : (
          <div className="flex-1 min-h-0 flex flex-col bg-card rounded-xl border border-border overflow-hidden">
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="text-sm" style={{ minWidth: "100%", width: "max-content" }}>
                <thead className="sticky top-0 z-10">
                  <tr className="bg-muted text-muted-foreground border-b border-border">
                    <th className="px-4 py-3 text-left font-semibold text-foreground whitespace-nowrap">Empresa</th>
                    <th className="px-4 py-3 text-left font-semibold text-foreground whitespace-nowrap">Tipo</th>
                    <th className="px-4 py-3 text-left font-semibold text-foreground whitespace-nowrap">Documento</th>
                    <th className="px-4 py-3 text-left font-semibold text-foreground whitespace-nowrap">Teléfono</th>
                    <th className="px-4 py-3 text-left font-semibold text-foreground whitespace-nowrap">Sector</th>
                    <th className="px-4 py-3 text-left font-semibold text-foreground whitespace-nowrap">Empleados</th>
                    <th className="px-4 py-3 text-left font-semibold text-foreground whitespace-nowrap">Ubicación</th>
                    <th className="px-4 py-3 text-left font-semibold text-foreground whitespace-nowrap">Sucursales</th>
                    <th className="px-4 py-3 text-left font-semibold text-foreground whitespace-nowrap">Contactos</th>
                    <th className="px-4 py-3 text-left font-semibold text-foreground whitespace-nowrap">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((o) => (
                    <tr
                      key={o.id}
                      onClick={() => navigate(`/${slug}/empresas/${o.id}`)}
                      className="cursor-pointer border-b border-border transition-colors hover:bg-muted/50"
                    >
                      <td className="px-4 py-2.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/${slug}/empresas/${o.id}`);
                          }}
                          className="text-left"
                        >
                          <span className="block font-medium text-foreground">{o.name}</span>
                          {o.parentName && <span className="block text-xs text-muted-foreground">Sucursal de {o.parentName}</span>}
                        </button>
                      </td>
                      <td className="px-4 py-2.5">
                        <TypeBadge type={o.type} />
                      </td>
                      <td className="px-4 py-2.5 text-foreground whitespace-nowrap">
                        {[o.documentType, o.documentNumber].filter(Boolean).join(" ") || "—"}
                      </td>
                      <td className="px-4 py-2.5 text-foreground whitespace-nowrap">{o.phones?.[0]?.number || "—"}</td>
                      <td className="px-4 py-2.5 text-foreground">{o.industry || "—"}</td>
                      <td className="px-4 py-2.5 text-foreground whitespace-nowrap">
                        {o.employeeRange ? EMPLOYEE_RANGE_LABELS[o.employeeRange] : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-foreground">{formatPlace(o)}</td>
                      <td className="px-4 py-2.5 text-foreground">{o.childCount || "—"}</td>
                      <td className="px-4 py-2.5 text-foreground">{o.contactCount || "—"}</td>
                      <td className="px-4 py-2.5">
                        <StatusBadge status={o.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="shrink-0 flex items-center justify-between px-4 py-3 border-t border-border bg-card rounded-b-xl">
              <p className="text-sm text-muted-foreground">
                {total.toLocaleString()} empresas · Página {page} de {totalPages} · {PAGE_SIZE} por página
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="hover:bg-muted transition-colors">
                  Anterior
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="hover:bg-muted transition-colors">
                  Siguiente
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        open={!!migration}
        onClose={() => setMigration(null)}
        onConfirm={applyMigration}
        title="Traer empresas desde contactos"
        description={
          migration
            ? `Se crearán ${migration.toCreate} empresas de tipo cliente (${migration.existing} ya existen y se reutilizan) y se vincularán ${migration.contactsToLink} contactos como empleados.${
                migration.skipped ? ` Se omiten ${migration.skipped} nombres por tener menos de 2 o más de 200 caracteres.` : ""
              } El campo "empresa" de los contactos no se modifica.`
            : ""
        }
        confirmLabel="Traer empresas"
      />

      {showCreate && tenantId && (
        <CompanyFormModal
          tenantId={tenantId}
          onClose={() => setShowCreate(false)}
          onSaved={(org) => {
            setShowCreate(false);
            toast.success("Empresa creada");
            navigate(`/${slug}/empresas/${org.id}`);
          }}
        />
      )}
    </>
  );
}
