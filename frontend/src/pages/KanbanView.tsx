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
        <div className={`relative h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold text-gray-600 shrink-0 ${client.hasAdTracking ? "ring-2 ring-blue-500 ring-offset-1 bg-gradient-to-br from-blue-50 to-indigo-100" : "bg-gray-100"}`}>
          {(client.firstName?.[0] || client.email?.[0] || "?").toUpperCase()}
          {client.hasAdTracking && client.adLastPlatform && (
            <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-white border border-gray-200 flex items-center justify-center shadow-sm">
              {client.adLastPlatform === 'meta' && <svg className="h-2 w-2" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>}
              {client.adLastPlatform === 'google' && <svg className="h-2 w-2" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>}
              {client.adLastPlatform === 'tiktok' && <svg className="h-2 w-2" viewBox="0 0 24 24" fill="#000"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.88 2.89 2.89 0 01-2.88-2.88 2.89 2.89 0 012.88-2.88c.28 0 .56.04.82.11v-3.5a6.37 6.37 0 00-.82-.05A6.34 6.34 0 003.15 15.7a6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V9.4a8.16 8.16 0 004.76 1.52v-3.4a4.85 4.85 0 01-1-.83z"/></svg>}
              {client.adLastPlatform === 'linkedin' && <svg className="h-2 w-2" viewBox="0 0 24 24" fill="#0A66C2"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>}
              {client.adLastPlatform === 'organic' && <svg className="h-2 w-2" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>}
            </span>
          )}
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
