import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Pencil, Plus, Search, Trash2, Unlink } from "lucide-react";
import { toast } from "sonner";
import { ConfirmModal } from "@/components/ConfirmModal";
import { DropdownSelect } from "@/components/ui/dropdown-select";
import { globalSearch, type GlobalSearchResult } from "@/services/api";
import {
  CONTACT_ROLE_LABELS,
  EMPLOYEE_RANGE_LABELS,
  SIZE_LABELS,
  companiesApi,
  type ContactOrgRole,
  type OrganizationContact,
  type OrganizationDetail,
} from "@/services/companies";
import { CompaniesMap } from "./CompaniesMap";
import { CompanyFormModal } from "./CompanyFormModal";
import { EmpresasHeader } from "./EmpresasHeader";
import { glassButton } from "./glass";
import { Field, ModalShell, inputClass, primaryButton, secondaryButton } from "../reclutamiento/shared";
import { StatusBadge, TypeBadge } from "./shared";
import { formatPlace, useCompaniesAccess } from "./useCompaniesAccess";

export function EmpresaDetail() {
  const { companyId } = useParams();
  const navigate = useNavigate();
  const { slug, tenantId, canWrite, canDelete } = useCompaniesAccess();

  const [data, setData] = useState<OrganizationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [addingBranch, setAddingBranch] = useState(false);
  const [linking, setLinking] = useState(false);
  const [unlinkTarget, setUnlinkTarget] = useState<OrganizationContact | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(() => {
    if (!tenantId || !companyId) return;
    setLoading(true);
    companiesApi
      .detail(tenantId, companyId)
      .then(setData)
      .catch(() => {
        toast.error("No se pudo cargar la empresa");
        navigate(`/${slug}/empresas`, { replace: true });
      })
      .finally(() => setLoading(false));
  }, [tenantId, companyId, slug, navigate]);

  useEffect(load, [load]);

  if (loading && !data) {
    return (
      <>
        <EmpresasHeader title="Empresa" />
        <div className="flex-1 min-h-0 flex items-center justify-center pt-4">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Cargando" />
        </div>
      </>
    );
  }
  if (!data || !tenantId || !companyId) return null;

  const { organization: org, parent, children, contacts } = data;
  const isBranch = !!org.parentId;

  const doDelete = async () => {
    try {
      await companiesApi.remove(tenantId, org.id);
      toast.success("Empresa eliminada");
      navigate(`/${slug}/empresas`, { replace: true });
    } catch {
      // El interceptor de la API muestra el motivo (por ejemplo, que tiene sucursales).
      setConfirmDelete(false);
    }
  };

  const doUnlink = async () => {
    if (!unlinkTarget) return;
    try {
      await companiesApi.unlinkContact(tenantId, org.id, unlinkTarget.linkId);
      toast.success("Contacto desvinculado");
      setUnlinkTarget(null);
      load();
    } catch {
      setUnlinkTarget(null);
    }
  };

  return (
    <>
      <EmpresasHeader
        title={org.name}
        leading={
          <button
            type="button"
            aria-label="Volver a empresas"
            onClick={() => navigate(`/${slug}/empresas`)}
            className="rounded-lg bg-white/15 p-2 text-white transition-colors hover:bg-white/25"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        }
        subtitle={
          <span className="flex items-center gap-2">
            <TypeBadge type={org.type} />
            <StatusBadge status={org.status} />
            {parent && (
              <button type="button" onClick={() => navigate(`/${slug}/empresas/${parent.id}`)} className="hover:underline">
                Sucursal de {parent.name}
              </button>
            )}
          </span>
        }
      >
        {canWrite && (
          <button type="button" onClick={() => setEditing(true)} className={glassButton}>
            <Pencil className="h-4 w-4" /> Editar
          </button>
        )}
        {canDelete && (
          <button type="button" onClick={() => setConfirmDelete(true)} className={glassButton}>
            <Trash2 className="h-4 w-4" /> Eliminar
          </button>
        )}
      </EmpresasHeader>

      <div className="flex-1 min-h-0 overflow-y-auto pt-4 space-y-4">
        <section aria-label="Datos de la empresa" className="bg-card rounded-xl border border-border p-5 space-y-5">
          <InfoGroup title="General">
            <Info label="Razón social" value={org.legalName || "—"} />
            <Info label="Documento" value={[org.documentType, org.documentNumber].filter(Boolean).join(" ") || "—"} />
            <Info label="Sector" value={org.industry || "—"} />
            <Info label="Tamaño" value={org.size ? SIZE_LABELS[org.size] : "—"} />
            <Info label="Empleados" value={org.employeeRange ? EMPLOYEE_RANGE_LABELS[org.employeeRange] : "—"} />
          </InfoGroup>

          <InfoGroup title="Contacto">
            <div>
              <dt className="text-xs text-muted-foreground">Teléfonos</dt>
              <dd className="text-foreground">
                {org.phones?.length ? (
                  <ul className="space-y-0.5">
                    {org.phones.map((ph) => (
                      <li key={ph.number}>
                        <a href={`tel:${ph.number.replace(/[^\d+]/g, "")}`} className="hover:underline">
                          {ph.number}
                        </a>
                        {ph.label && <span className="text-xs text-muted-foreground"> · {ph.label}</span>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Correo</dt>
              <dd className="text-foreground">
                {org.email ? (
                  <a href={`mailto:${org.email}`} className="hover:underline">
                    {org.email}
                  </a>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Sitio web</dt>
              <dd className="text-foreground">
                {org.website ? (
                  <a href={org.website} target="_blank" rel="noopener noreferrer" className="break-all hover:underline">
                    {org.website}
                  </a>
                ) : (
                  "—"
                )}
              </dd>
            </div>
          </InfoGroup>

          <InfoGroup title="Ubicación">
            <Info label="Dirección" value={formatPlace(org)} />
            <Info label="Código postal" value={org.postalCode || "—"} />
            <Info label="País" value={org.countryCode || "—"} />
            <Info label="Coordenadas" value={org.lat != null && org.lng != null ? `${org.lat}, ${org.lng}` : "—"} />
            <Info label="Horario" value={org.openingHours || "—"} />
          </InfoGroup>

          {(org.tags?.length || org.notes) && (
            <InfoGroup title="Notas">
              {org.tags?.length ? (
                <div className="sm:col-span-2">
                  <dt className="mb-1 text-xs text-muted-foreground">Etiquetas</dt>
                  <dd className="flex flex-wrap gap-1.5">
                    {org.tags.map((t) => (
                      <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground">
                        {t}
                      </span>
                    ))}
                  </dd>
                </div>
              ) : null}
              {org.notes && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-muted-foreground">Notas internas</dt>
                  <dd className="whitespace-pre-wrap text-foreground">{org.notes}</dd>
                </div>
              )}
            </InfoGroup>
          )}
        </section>
        {org.lat != null && org.lng != null && (
          <section aria-label="Ubicación en el mapa" className="bg-card rounded-xl border border-border p-5">
            <h3 className="mb-3 text-sm font-semibold text-foreground">Ubicación</h3>
            <CompaniesMap
              height="220px"
              markers={[{ id: org.id, name: org.name, type: org.type, lat: org.lat, lng: org.lng, subtitle: org.city || org.address }]}
            />
          </section>
        )}

        {!isBranch && (
          <section aria-label="Sucursales" className="bg-card rounded-xl border border-border p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Sucursales ({children.length})</h3>
              {canWrite && (
                <button type="button" onClick={() => setAddingBranch(true)} className={secondaryButton}>
                  <Plus className="h-3.5 w-3.5" /> Agregar sucursal
                </button>
              )}
            </div>
            {children.length === 0 ? (
              <p className="text-xs text-muted-foreground">Esta empresa no tiene sucursales.</p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {children.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/${slug}/empresas/${c.id}`)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-foreground">{c.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{formatPlace(c)}</span>
                      </span>
                      <StatusBadge status={c.status} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section aria-label="Contactos vinculados" className="bg-card rounded-xl border border-border p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Contactos ({contacts.length})</h3>
            {canWrite && (
              <button type="button" onClick={() => setLinking(true)} className={secondaryButton}>
                <Plus className="h-3.5 w-3.5" /> Vincular contacto
              </button>
            )}
          </div>
          {contacts.length === 0 ? (
            <p className="text-xs text-muted-foreground">Aún no hay contactos vinculados a esta empresa.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {contacts.map((c) => (
                <li key={c.linkId} className="flex items-center justify-between gap-3 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => navigate(`/${slug}/clients/${c.recordId}`)}
                    className="min-w-0 text-left"
                  >
                    <span className="block truncate text-sm text-foreground">{c.name || "Sin nombre"}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[CONTACT_ROLE_LABELS[c.role], c.phone, c.email].filter(Boolean).join(" · ")}
                    </span>
                  </button>
                  {canWrite && (
                    <button
                      type="button"
                      aria-label={`Desvincular a ${c.name || "contacto"}`}
                      onClick={() => setUnlinkTarget(c)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Unlink className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {editing && (
        <CompanyFormModal
          tenantId={tenantId}
          organization={org}
          childCount={children.length}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            toast.success("Cambios guardados");
            load();
          }}
        />
      )}

      {addingBranch && (
        <CompanyFormModal
          tenantId={tenantId}
          defaultParentId={org.id}
          onClose={() => setAddingBranch(false)}
          onSaved={(created) => {
            setAddingBranch(false);
            toast.success("Sucursal creada");
            navigate(`/${slug}/empresas/${created.id}`);
          }}
        />
      )}

      {linking && (
        <LinkContactModal
          tenantId={tenantId}
          organizationId={org.id}
          onClose={() => setLinking(false)}
          onLinked={() => {
            setLinking(false);
            toast.success("Contacto vinculado");
            load();
          }}
        />
      )}

      <ConfirmModal
        open={!!unlinkTarget}
        onClose={() => setUnlinkTarget(null)}
        onConfirm={doUnlink}
        title="Desvincular contacto"
        description={`${unlinkTarget?.name || "Este contacto"} dejará de estar asociado a ${org.name} como ${unlinkTarget ? CONTACT_ROLE_LABELS[unlinkTarget.role].toLowerCase() : ""}. El contacto no se elimina.`}
        confirmLabel="Desvincular"
        variant="warning"
      />

      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={doDelete}
        title="Eliminar empresa"
        description={`Se eliminará ${org.name} y se quitarán sus vínculos con contactos. Los contactos no se eliminan. Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar empresa"
        variant="danger"
      />
    </>
  );
}

function InfoGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-foreground">{title}</h3>
      <dl className="grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">{children}</dl>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}

type Contact = GlobalSearchResult["contacts"][number];

function LinkContactModal({
  tenantId,
  organizationId,
  onClose,
  onLinked,
}: {
  tenantId: string;
  organizationId: string;
  onClose: () => void;
  onLinked: () => void;
}) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<ContactOrgRole>("employee");
  const [results, setResults] = useState<Contact[]>([]);
  const [searching, setSearching] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const current = ++requestId.current;
    setSearching(true);
    const t = setTimeout(() => {
      globalSearch(tenantId, q, 8)
        .then((res) => {
          if (current === requestId.current) setResults(res.contacts);
        })
        .catch(() => {
          if (current === requestId.current) setResults([]);
        })
        .finally(() => {
          if (current === requestId.current) setSearching(false);
        });
    }, 300);
    return () => clearTimeout(t);
  }, [query, tenantId]);

  const pick = async (contact: Contact) => {
    setLinkingId(contact.id);
    try {
      await companiesApi.linkContact(tenantId, organizationId, { recordId: contact.id, role });
      onLinked();
    } catch {
      // El interceptor de la API muestra el motivo (por ejemplo, vínculo repetido).
    } finally {
      setLinkingId(null);
    }
  };

  return (
    <ModalShell title="Vincular contacto" onClose={onClose} busy={!!linkingId}>
      <div className="space-y-3 px-5 py-4">
        <Field label="Rol en la empresa">
          <DropdownSelect
            value={role}
            onChange={(v) => setRole(v as ContactOrgRole)}
            options={(Object.keys(CONTACT_ROLE_LABELS) as ContactOrgRole[]).map((r) => ({ value: r, label: CONTACT_ROLE_LABELS[r] }))}
          />
        </Field>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar contacto por nombre, teléfono o email"
            aria-label="Buscar contacto"
            className={`${inputClass} pl-8`}
            autoFocus
          />
        </div>
        <div className="min-h-[3rem]">
          {searching ? (
            <div className="flex justify-center p-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Buscando" />
            </div>
          ) : query.trim().length >= 2 && results.length === 0 ? (
            <p className="p-3 text-center text-xs text-muted-foreground">
              No se encontraron contactos. Créalo primero en Contactos.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {results.map((c) => {
                const name = [c.firstName, c.lastName].filter(Boolean).join(" ") || "Sin nombre";
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => pick(c)}
                      disabled={!!linkingId}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-muted disabled:opacity-60"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-foreground">{name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[c.phone, c.email].filter(Boolean).join(" · ") || "—"}
                        </span>
                      </span>
                      {linkingId === c.id && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
      <div className="flex justify-end border-t border-border px-5 py-3">
        <button type="button" onClick={onClose} disabled={!!linkingId} className={primaryButton}>
          Cerrar
        </button>
      </div>
    </ModalShell>
  );
}
