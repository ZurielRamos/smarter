import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, Loader2, Plus, Search, UserCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { globalSearch, type GlobalSearchResult } from "@/services/api";
import { reclutamientoApi, type ProfileStatus, type SurveyorListItem } from "@/services/reclutamiento";
import {
  ModalShell,
  ProfileStatusBadge,
  Spinner,
  inputClass,
  primaryButton,
  secondaryButton,
} from "./shared";
import { formatMoney } from "./format";

const STATUS_FILTERS: { value: "" | ProfileStatus; label: string }[] = [
  { value: "", label: "Todos" },
  { value: "candidate", label: "Candidatos" },
  { value: "active", label: "Activos" },
  { value: "suspended", label: "Suspendidos" },
  { value: "ended", label: "Terminados" },
];

const PAGE_SIZE = 25;

export function Reclutamiento() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const tenantId = user?.tenantRoles.find((tr) => tr.tenant.slug === slug)?.tenantId ?? "";

  const [items, setItems] = useState<SurveyorListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<"" | ProfileStatus>("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [status, debouncedSearch]);

  const load = useCallback(() => {
    if (!tenantId) return;
    setLoading(true);
    reclutamientoApi
      .list(tenantId, { status: status || undefined, search: debouncedSearch || undefined, page, limit: PAGE_SIZE })
      .then((res) => {
        setItems(res.data);
        setTotal(res.total);
      })
      .catch(() => toast.error("No se pudieron cargar los encuestadores"))
      .finally(() => setLoading(false));
  }, [tenantId, status, debouncedSearch, page]);

  useEffect(load, [load]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Encuestadores</h2>
          <p className="text-xs text-muted-foreground">{total} en total</p>
        </div>

        <div className="relative ml-auto w-56">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, teléfono o email"
            aria-label="Buscar encuestadores"
            className={`${inputClass} pl-8`}
          />
        </div>

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as "" | ProfileStatus)}
          aria-label="Filtrar por estado"
          className={`${inputClass} w-auto`}
        >
          {STATUS_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>

        <button type="button" onClick={() => setShowAdd(true)} className={primaryButton}>
          <Plus className="h-3.5 w-3.5" /> Agregar encuestador
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <Spinner />
        ) : items.length === 0 ? (
          <div className="mx-auto mt-16 max-w-sm text-center">
            <UserCheck className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium text-foreground">
              {status || debouncedSearch ? "Sin resultados" : "Aún no tienes encuestadores"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {status || debouncedSearch
                ? "Prueba con otro filtro o búsqueda."
                : "Habilita a un contacto como encuestador, carga su contrato y verifica su método de pago para activarlo."}
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-card text-[11px] uppercase text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-4 py-2 font-medium">Encuestador</th>
                <th className="px-4 py-2 font-medium">Estado</th>
                <th className="px-4 py-2 font-medium">Contrato vigente</th>
                <th className="px-4 py-2 font-medium">Pago verificado</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => navigate(`/${slug}/reclutamiento/${p.id}`)}
                  className="cursor-pointer border-b border-border transition-colors hover:bg-muted/50"
                >
                  <td className="px-4 py-2.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/${slug}/reclutamiento/${p.id}`);
                      }}
                      className="text-left"
                    >
                      <span className="block font-medium text-foreground">{p.contact?.name || "Sin nombre"}</span>
                      <span className="block text-xs text-muted-foreground">
                        {[p.contact?.phone, p.contact?.email].filter(Boolean).join(" · ") || "—"}
                      </span>
                    </button>
                  </td>
                  <td className="px-4 py-2.5">
                    <ProfileStatusBadge status={p.status} />
                  </td>
                  <td className="px-4 py-2.5 text-xs text-foreground">
                    {p.activeContract
                      ? `${formatMoney(p.activeContract.defaultRate, p.activeContract.currency)} · ${p.activeContract.countryCode}`
                      : <span className="text-muted-foreground">Sin contrato</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    {p.paymentVerified ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green-700 dark:text-green-300">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Verificado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <XCircle className="h-3.5 w-3.5" /> Pendiente
                      </span>
                    )}
                  </td>
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
            <button type="button" className={secondaryButton} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Anterior
            </button>
            <button type="button" className={secondaryButton} disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              Siguiente
            </button>
          </div>
        </div>
      )}

      {showAdd && tenantId && (
        <AddSurveyorModal
          tenantId={tenantId}
          onClose={() => setShowAdd(false)}
          onCreated={(profileId) => {
            setShowAdd(false);
            toast.success("Encuestador agregado como candidato");
            navigate(`/${slug}/reclutamiento/${profileId}`);
          }}
          onExisting={(profileId) => {
            setShowAdd(false);
            navigate(`/${slug}/reclutamiento/${profileId}`);
          }}
        />
      )}
    </div>
  );
}

type Contact = GlobalSearchResult["contacts"][number];

function AddSurveyorModal({
  tenantId,
  onClose,
  onCreated,
  onExisting,
}: {
  tenantId: string;
  onClose: () => void;
  onCreated: (profileId: string) => void;
  onExisting: (profileId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Contact[]>([]);
  const [searching, setSearching] = useState(false);
  const [creatingId, setCreatingId] = useState<string | null>(null);
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
    setCreatingId(contact.id);
    try {
      const profile = await reclutamientoApi.create(tenantId, contact.id);
      onCreated(profile.id);
    } catch (err) {
      // 409: el contacto ya es encuestador. Se lleva a su ficha.
      const data = (err as { response?: { status?: number; data?: { code?: string; profileId?: string } } })?.response;
      if (data?.status === 409 && data.data?.code === "PROFILE_EXISTS" && data.data.profileId) {
        onExisting(data.data.profileId);
      }
    } finally {
      setCreatingId(null);
    }
  };

  return (
    <ModalShell title="Agregar encuestador" onClose={onClose} busy={!!creatingId}>
      <div className="space-y-3 px-5 py-4">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Elige un contacto de tu CRM. Quedará como candidato hasta que tenga un contrato vigente y un método de pago verificado.
        </p>
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
                      disabled={!!creatingId}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-muted disabled:opacity-60"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-foreground">{name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[c.phone, c.email].filter(Boolean).join(" · ") || "—"}
                        </span>
                      </span>
                      {creatingId === c.id && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
      <div className="flex justify-end border-t border-border px-5 py-3">
        <button type="button" onClick={onClose} disabled={!!creatingId} className={secondaryButton}>
          Cerrar
        </button>
      </div>
    </ModalShell>
  );
}
