import { useState, useEffect, useRef, useCallback } from "react";
import { Phone, Mail, Tag, GripVertical, Search, SlidersHorizontal, X, Loader2 } from "lucide-react";
import { getKanbanInitial, getKanbanColumn } from "@/services/api";
import type { ClientRecord } from "@/services/api";

interface KanbanViewProps {
  tenantId: string;
  groupByField: string;
  fieldOptions: string[];
  fieldLabel: string;
  assignedTo?: string;
  assignedTeamId?: string;
  onMoveClient: (clientId: string, newValue: string) => void;
  onClientClick: (client: ClientRecord) => void;
  onContextMenu: (e: React.MouseEvent, client: ClientRecord) => void;
}

const COLUMN_COLORS: Record<string, string> = {
  lead: "#3b82f6",
  contactado: "#0ea5e9",
  interesado: "#6366f1",
  oportunidad: "#f59e0b",
  cliente: "#10b981",
  premium: "#8b5cf6",
  fidelizado: "#059669",
  inactivo: "#9ca3af",
  perdido: "#ef4444",
};

type SortOption = "name" | "score" | "lastContactAt" | "createdAt";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "createdAt", label: "Más reciente" },
  { value: "name", label: "Nombre A-Z" },
  { value: "score", label: "Mayor score" },
  { value: "lastContactAt", label: "Último contacto" },
];

const PAGE_SIZE = 20;

interface ColumnState {
  clients: ClientRecord[];
  total: number;
  page: number;
  loading: boolean;
  loadingMore: boolean;
  search: string;
  sortBy: SortOption;
  isFiltered: boolean; // true when search/sort differs from initial load
}

export function KanbanView({ tenantId, groupByField, fieldOptions, fieldLabel, assignedTo, assignedTeamId, onMoveClient, onClientClick, onContextMenu }: KanbanViewProps) {
  const [columnsState, setColumnsState] = useState<Record<string, ColumnState>>({});
  const [initialLoading, setInitialLoading] = useState(true);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [draggingClient, setDraggingClient] = useState<string | null>(null);
  const [columnKeys, setColumnKeys] = useState<string[]>(fieldOptions);

  // Single initial request to load all columns
  useEffect(() => {
    if (!tenantId) return;
    setInitialLoading(true);

    getKanbanInitial(tenantId, groupByField, PAGE_SIZE, assignedTo, assignedTeamId).then((res) => {
      const newState: Record<string, ColumnState> = {};
      const keys = [...fieldOptions];

      for (const option of fieldOptions) {
        const colData = res.columns[option];
        newState[option] = {
          clients: colData?.data || [],
          total: colData?.total || res.counts[option] || 0,
          page: 1,
          loading: false,
          loadingMore: false,
          search: "",
          sortBy: "createdAt",
          isFiltered: false,
        };
      }

      // Add __unassigned__ if it has data
      if (res.counts["__unassigned__"] || res.columns["__unassigned__"]) {
        const colData = res.columns["__unassigned__"];
        newState["__unassigned__"] = {
          clients: colData?.data || [],
          total: colData?.total || res.counts["__unassigned__"] || 0,
          page: 1,
          loading: false,
          loadingMore: false,
          search: "",
          sortBy: "createdAt",
          isFiltered: false,
        };
        keys.push("__unassigned__");
      }

      // Also check for columns with data not in fieldOptions
      for (const key of Object.keys(res.counts)) {
        if (!newState[key] && key !== "__unassigned__") {
          const colData = res.columns[key];
          newState[key] = {
            clients: colData?.data || [],
            total: colData?.total || res.counts[key] || 0,
            page: 1,
            loading: false,
            loadingMore: false,
            search: "",
            sortBy: "createdAt",
            isFiltered: false,
          };
          keys.push(key);
        }
      }

      setColumnsState(newState);
      setColumnKeys(keys);
    }).catch(() => {}).finally(() => setInitialLoading(false));
  }, [tenantId, groupByField, fieldOptions, assignedTo, assignedTeamId]);

  // Load more for a specific column
  const loadMore = useCallback(async (colKey: string) => {
    const col = columnsState[colKey];
    if (!col) return;
    const nextPage = col.page + 1;

    setColumnsState((prev) => ({ ...prev, [colKey]: { ...prev[colKey], loadingMore: true } }));

    try {
      const res = await getKanbanColumn({
        tenantId, groupBy: groupByField, columnValue: colKey,
        search: col.search || undefined,
        sortBy: col.sortBy, sortOrder: col.sortBy === "name" ? "ASC" : "DESC",
        page: nextPage, limit: PAGE_SIZE,
        assignedTo, assignedTeamId,
      });
      setColumnsState((prev) => ({
        ...prev,
        [colKey]: { ...prev[colKey], clients: [...prev[colKey].clients, ...res.data], page: nextPage, loadingMore: false },
      }));
    } catch {
      setColumnsState((prev) => ({ ...prev, [colKey]: { ...prev[colKey], loadingMore: false } }));
    }
  }, [tenantId, groupByField, columnsState, assignedTo, assignedTeamId]);

  // Reload a column with new search/sort (makes a server request)
  const reloadColumn = useCallback(async (colKey: string, search: string, sortBy: SortOption) => {
    setColumnsState((prev) => ({ ...prev, [colKey]: { ...prev[colKey], loading: true, search, sortBy, isFiltered: search !== "" || sortBy !== "createdAt" } }));

    try {
      const res = await getKanbanColumn({
        tenantId, groupBy: groupByField, columnValue: colKey,
        search: search || undefined,
        sortBy, sortOrder: sortBy === "name" ? "ASC" : "DESC",
        page: 1, limit: PAGE_SIZE,
        assignedTo, assignedTeamId,
      });
      setColumnsState((prev) => ({
        ...prev,
        [colKey]: { ...prev[colKey], clients: res.data, total: res.total, page: 1, loading: false },
      }));
    } catch {
      setColumnsState((prev) => ({ ...prev, [colKey]: { ...prev[colKey], loading: false } }));
    }
  }, [tenantId, groupByField, assignedTo, assignedTeamId]);

  // Drag handlers
  function handleDragStart(e: React.DragEvent, clientId: string) {
    e.dataTransfer.setData("clientId", clientId);
    e.dataTransfer.effectAllowed = "move";
    setDraggingClient(clientId);
  }
  function handleDragEnd() { setDraggingClient(null); setDragOverColumn(null); }
  function handleDragOver(e: React.DragEvent, colKey: string) { e.preventDefault(); setDragOverColumn(colKey); }
  function handleDragLeave() { setDragOverColumn(null); }
  function handleDrop(e: React.DragEvent, colKey: string) {
    e.preventDefault();
    const clientId = e.dataTransfer.getData("clientId");
    if (clientId && colKey !== "__unassigned__") {
      // Find source column and remove client optimistically
      setColumnsState((prev) => {
        const updated = { ...prev };
        for (const key of Object.keys(updated)) {
          const idx = updated[key].clients.findIndex((c) => c.id === clientId);
          if (idx !== -1) {
            const client = updated[key].clients[idx];
            updated[key] = { ...updated[key], clients: updated[key].clients.filter((_, i) => i !== idx), total: updated[key].total - 1 };
            updated[colKey] = { ...updated[colKey], clients: [client, ...updated[colKey].clients], total: updated[colKey].total + 1 };
            break;
          }
        }
        return updated;
      });
      onMoveClient(clientId, colKey);
    }
    setDragOverColumn(null);
    setDraggingClient(null);
  }

  const totalContacts = Object.values(columnsState).reduce((sum, col) => sum + col.total, 0);

  if (initialLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex gap-3 h-full p-4 min-w-max">
          {columnKeys.map((colKey) => {
            const col = columnsState[colKey];
            if (!col) return null;
            return (
              <KanbanColumn
                key={colKey}
                colKey={colKey}
                label={colKey === "__unassigned__" ? "Sin valor" : colKey}
                state={col}
                isDragOver={dragOverColumn === colKey}
                draggingClient={draggingClient}
                onReload={(search, sortBy) => reloadColumn(colKey, search, sortBy)}
                onLoadMore={() => loadMore(colKey)}
                onDragOver={(e) => handleDragOver(e, colKey)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, colKey)}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onClientClick={onClientClick}
                onContextMenu={onContextMenu}
              />
            );
          })}
        </div>
      </div>
      <div className="shrink-0 px-4 py-2 text-xs text-gray-400 border-t border-gray-100 bg-white">
        {totalContacts.toLocaleString()} contactos · Agrupados por {fieldLabel}
      </div>
    </div>
  );
}

// === Column ===
function KanbanColumn({
  colKey, label, state, isDragOver, draggingClient,
  onReload, onLoadMore,
  onDragOver, onDragLeave, onDrop, onDragStart, onDragEnd, onClientClick, onContextMenu,
}: {
  colKey: string;
  label: string;
  state: ColumnState;
  isDragOver: boolean;
  draggingClient: string | null;
  onReload: (search: string, sortBy: SortOption) => void;
  onLoadMore: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  onClientClick: (client: ClientRecord) => void;
  onContextMenu: (e: React.MouseEvent, client: ClientRecord) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [localSearch, setLocalSearch] = useState(state.search);
  const [localSort, setLocalSort] = useState(state.sortBy);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  // Debounced search: reload column after 400ms of no typing
  function handleSearchChange(value: string) {
    setLocalSearch(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => onReload(value, localSort), 400);
  }

  function handleSortChange(sortBy: SortOption) {
    setLocalSort(sortBy);
    onReload(localSearch, sortBy);
  }

  function handleClear() {
    setLocalSearch("");
    setLocalSort("createdAt");
    onReload("", "createdAt");
  }

  const hasActiveFilter = localSearch.trim() !== "" || localSort !== "createdAt";
  const hasMore = state.clients.length < state.total;

  return (
    <div
      className={`flex flex-col w-[280px] shrink-0 rounded-xl border transition-colors ${isDragOver ? "border-emerald-300 bg-emerald-50/50" : "border-gray-200 bg-gray-50/80"}`}
      onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-200/60 shrink-0">
        <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: COLUMN_COLORS[colKey] || "#9ca3af" }} />
        <span className="text-sm font-medium text-gray-800 capitalize truncate">{label}</span>
        <span className="text-xs text-gray-400 font-medium bg-gray-200/60 px-1.5 py-0.5 rounded-full">{state.total}</span>

        <div className="ml-auto relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className={`h-6 w-6 rounded flex items-center justify-center transition-colors ${hasActiveFilter ? "bg-emerald-100 text-emerald-600" : "text-gray-400 hover:bg-gray-200 hover:text-gray-600"}`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
              <div className="px-2.5 pb-2">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
                  <input
                    type="text" value={localSearch} onChange={(e) => handleSearchChange(e.target.value)}
                    placeholder="Buscar en columna..."
                    className="w-full pl-7 pr-7 py-1.5 rounded-md border border-gray-200 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    autoFocus
                  />
                  {localSearch && (
                    <button onClick={() => handleSearchChange("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
              <div className="border-t border-gray-100 my-1" />
              <p className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase">Ordenar por</p>
              {SORT_OPTIONS.map((opt) => (
                <button key={opt.value} onClick={() => handleSortChange(opt.value)}
                  className={`w-full px-3 py-1.5 text-xs text-left transition-colors ${localSort === opt.value ? "bg-emerald-50 text-emerald-700 font-medium" : "text-gray-600 hover:bg-gray-50"}`}
                >{opt.label}</button>
              ))}
              {hasActiveFilter && (
                <>
                  <div className="border-t border-gray-100 my-1" />
                  <button onClick={handleClear} className="w-full px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 text-left">Limpiar filtros</button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {state.loading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-gray-400" /></div>
        ) : (
          <>
            {state.clients.map((client) => (
              <KanbanCard key={client.id} client={client} isDragging={draggingClient === client.id} onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={() => onClientClick(client)} onContextMenu={(e) => onContextMenu(e, client)} />
            ))}
            {state.clients.length === 0 && (
              <div className="flex items-center justify-center py-8 text-xs text-gray-400">{localSearch ? "Sin resultados" : "Sin contactos"}</div>
            )}
            {hasMore && (
              <button onClick={onLoadMore} disabled={state.loadingMore} className="w-full py-2 text-xs text-emerald-600 hover:text-emerald-700 font-medium hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-50">
                {state.loadingMore ? <Loader2 className="h-3 w-3 animate-spin mx-auto" /> : `Ver más (${state.total - state.clients.length} restantes)`}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// === Card ===
function KanbanCard({ client, isDragging, onDragStart, onDragEnd, onClick, onContextMenu }: {
  client: ClientRecord; isDragging: boolean;
  onDragStart: (e: React.DragEvent, id: string) => void; onDragEnd: () => void; onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const name = [client.firstName, client.lastName].filter(Boolean).join(" ") || "Sin nombre";
  return (
    <div draggable onDragStart={(e) => onDragStart(e, client.id)} onDragEnd={onDragEnd} onClick={onClick}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e); }}
      className={`group bg-white rounded-lg border border-gray-200 p-3 cursor-pointer hover:border-gray-300 hover:shadow-sm transition-all ${isDragging ? "opacity-50 scale-95" : ""}`}
    >
      <div className="flex items-start gap-2.5">
        <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-semibold text-gray-600 shrink-0">
          {(client.firstName?.[0] || client.email?.[0] || "?").toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{name}</p>
          {client.email && <p className="text-xs text-gray-500 truncate mt-0.5 flex items-center gap-1"><Mail className="h-3 w-3 shrink-0" /><span className="truncate">{client.email}</span></p>}
          {client.phone && <p className="text-xs text-gray-500 truncate mt-0.5 flex items-center gap-1"><Phone className="h-3 w-3 shrink-0" />{client.phone}</p>}
        </div>
        <GripVertical className="h-3.5 w-3.5 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
      </div>
      {client.tags && client.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {client.tags.slice(0, 3).map((tag) => (<span key={tag} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-gray-100 text-gray-600"><Tag className="h-2.5 w-2.5" />{tag}</span>))}
          {client.tags.length > 3 && <span className="text-[10px] text-gray-400">+{client.tags.length - 3}</span>}
        </div>
      )}
      {client.score > 0 && (
        <div className="mt-2 flex items-center gap-1.5">
          <div className="flex-1 h-1 rounded-full bg-gray-100 overflow-hidden"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(client.score, 100)}%` }} /></div>
          <span className="text-[10px] text-gray-400 font-medium">{client.score}</span>
        </div>
      )}
    </div>
  );
}
