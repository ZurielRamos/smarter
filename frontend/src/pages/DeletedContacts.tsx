import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, RotateCcw, Loader2, Search, Trash2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { api } from "@/services/api";
import type { ClientRecord } from "@/services/api";
import headerBg from "@/assets/header-background.jpg";

export function DeletedContacts() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const tenantRole = user?.tenantRoles.find((tr) => tr.tenant.slug === slug);
  const tenantId = tenantRole?.tenantId || "";

  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const limit = 25;

  const loadDeleted = () => {
    if (!tenantId) return;
    setLoading(true);
    api.get("/records/deleted", { params: { tenantId, page, limit, search: search.trim() || undefined } })
      .then(({ data }) => { setClients(data.data); setTotal(data.total); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadDeleted(); }, [tenantId, page]);
  useEffect(() => { setPage(1); loadDeleted(); }, [search]);

  async function handleRestore(ids: string[]) {
    await api.post("/records/bulk/restore", { ids });
    toast.success(`${ids.length} contacto${ids.length > 1 ? "s" : ""} restaurado${ids.length > 1 ? "s" : ""}`);
    setSelectedIds(new Set());
    loadDeleted();
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Hero */}
      <div className="px-8 pt-16 pb-4 shrink-0 rounded-b-2xl" style={{ backgroundImage: `url(${headerBg})`, backgroundSize: "cover", backgroundPosition: "center" }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(`/${slug}/clients`)} className="h-8 w-8 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-white">Contactos eliminados</h1>
              <p className="text-brand-300 mt-0.5 text-sm">{total.toLocaleString()} contactos archivados · Puedes restaurarlos para que vuelvan a ser visibles</p>
            </div>
          </div>
          {selectedIds.size > 0 && (
            <button
              onClick={() => handleRestore([...selectedIds])}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white/15 hover:bg-white/25 text-white text-sm font-medium transition-colors"
            >
              <RotateCcw className="h-4 w-4" />
              Restaurar ({selectedIds.size})
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden pt-4 px-0">
        {/* Search bar */}
        <div className="px-4 pb-3 shrink-0">
          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar en eliminados..."
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : total === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Trash2 className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">{search ? "Sin resultados" : "No hay contactos eliminados"}</p>
              <button onClick={() => navigate(`/${slug}/clients`)} className="text-sm text-brand-600 hover:text-brand-700 font-medium mt-2">
                Volver a contactos
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-3 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === clients.length && clients.length > 0}
                        onChange={(e) => setSelectedIds(e.target.checked ? new Set(clients.map((c) => c.id)) : new Set())}
                        className="h-3.5 w-3.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                      />
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Nombre</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Email</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Teléfono</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Estado</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Eliminado</th>
                    <th className="px-4 py-3 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((client) => {
                    const name = [client.firstName, client.lastName].filter(Boolean).join(" ") || "Sin nombre";
                    return (
                      <tr key={client.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-3 py-2.5">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(client.id)}
                            onChange={() => setSelectedIds((prev) => { const next = new Set(prev); next.has(client.id) ? next.delete(client.id) : next.add(client.id); return next; })}
                            className="h-3.5 w-3.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                          />
                        </td>
                        <td className="px-4 py-2.5 text-gray-900">{name}</td>
                        <td className="px-4 py-2.5 text-gray-600">{client.email || "—"}</td>
                        <td className="px-4 py-2.5 text-gray-600">{client.phone || "—"}</td>
                        <td className="px-4 py-2.5">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 capitalize">{client.status || "—"}</span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-400">
                          {client.deletedAt ? new Date(client.deletedAt).toLocaleString("es-CO") : "—"}
                        </td>
                        <td className="px-4 py-2.5">
                          <button
                            onClick={() => handleRestore([client.id])}
                            className="h-7 w-7 rounded flex items-center justify-center text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                            title="Restaurar"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="shrink-0 flex items-center justify-between px-4 py-3 border-t border-gray-200">
                <p className="text-sm text-gray-500">{total.toLocaleString()} eliminados · Página {page} de {totalPages}</p>
                <div className="flex gap-2">
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">Anterior</button>
                  <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">Siguiente</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
