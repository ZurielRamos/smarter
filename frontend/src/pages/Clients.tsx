// Force reload - v3
import { useEffect, useState, useRef, useMemo, useCallback, useTransition, lazy, Suspense } from "react";
import { Users, Database, Upload, Settings2, Columns, Eye, EyeOff, ListOrdered, RotateCcw, ArrowUpNarrowWide, ArrowDownNarrowWide, Filter, Plus, Loader2, ChevronDown, List, Edit3, Copy, UserX, Trash2, X, Save, LayoutGrid, TableProperties, StickyNote, UserPlus } from "lucide-react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import headerBg from "@/assets/header-background.jpg";
import { Button } from "@/components/ui/button";
import { getClients, getCustomFields, getRecordLists, getRecordListRecords } from "@/services/api";
import type { ClientRecord, RecordListItem, CustomField } from "@/services/api";
import { useAuth } from "@/context/AuthContext";
import { KanbanView } from "./KanbanView";
import { FilterPanel } from "./FilterPanel";
import type { FilterCondition } from "./FilterPanel";
import { AddNoteModal } from "./AddNoteModal";
import { DeleteConfirmModal } from "./DeleteConfirmModal";
import { BulkActionBar } from "./BulkActionBar";
import axios from "axios";

// Lazy load the column config modal (pulls in Reorder/drag-and-drop only when needed)
const ColumnConfigModal = lazy(() => import("./ColumnConfigModal").then((m) => ({ default: m.ColumnConfigModal })));
const NewRecordModal = lazy(() => import("./NewRecordModal").then((m) => ({ default: m.NewRecordModal })));
const NewListModal = lazy(() => import("./NewListModal").then((m) => ({ default: m.NewListModal })));

const tenantApi = axios.create({ baseURL: import.meta.env.VITE_API_URL || "/api" });
tenantApi.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

interface ColumnDef {
  key: string;
  label: string;
  visible: boolean;
}

const SYSTEM_COLUMNS: ColumnDef[] = [
  { key: "id", label: "ID", visible: false },
  { key: "name", label: "Nombre", visible: true },
  { key: "email", label: "Email", visible: true },
  { key: "phone", label: "Teléfono", visible: true },
  { key: "status", label: "Estado", visible: true },
  { key: "channelSource", label: "Canal", visible: true },
  { key: "lastContactAt", label: "Último contacto", visible: true },
  { key: "tags", label: "Tags", visible: true },
  { key: "firstName", label: "Nombre", visible: false },
  { key: "lastName", label: "Apellido", visible: false },
  { key: "fullName", label: "Nombre completo", visible: false },
  { key: "documentType", label: "Tipo documento", visible: false },
  { key: "documentNumber", label: "Número documento", visible: false },
  { key: "countryCode", label: "Código país", visible: false },
  { key: "gender", label: "Género", visible: false },
  { key: "birthDate", label: "Fecha de nacimiento", visible: false },
  { key: "city", label: "Ciudad", visible: false },
  { key: "region", label: "Región/Departamento", visible: false },
  { key: "source", label: "Fuente", visible: false },
  { key: "score", label: "Score", visible: false },
  { key: "optInWhatsapp", label: "Opt-in WhatsApp", visible: false },
  { key: "optInEmail", label: "Opt-in Email", visible: false },
  { key: "assignedTo", label: "Asignado a", visible: false },
  { key: "lastActivityAt", label: "Última actividad", visible: false },
  { key: "createdAt", label: "Fecha de creación", visible: false },
];


export function Clients() {
  const navigate = useNavigate();
  const { slug } = useParams();
  const { user } = useAuth();
  const tenantRole = user?.tenantRoles.find((tr) => tr.tenant.slug === slug);
  const tenantId = tenantRole?.tenantId || "";

  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get("page")) || 1;
  const limit = Number(searchParams.get("limit")) || 25;
  const sortBy = searchParams.get("sortBy") || "";
  const sortOrder = searchParams.get("sortOrder") as "ASC" | "DESC" | "" || "";
  const [loading, setLoading] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [allColumns, setAllColumns] = useState<ColumnDef[]>(SYSTEM_COLUMNS);
  const [columns, setColumns] = useState<ColumnDef[]>(() => {
    // Load from localStorage as fast cache
    try {
      const saved = localStorage.getItem(`columns_${slug}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const valid = parsed.filter((c: any) => c != null && c.key && c.label);
          if (valid.length > 0) return valid;
        }
      }
    } catch {}
    // Clear bad data
    localStorage.removeItem(`columns_${slug}`);
    return SYSTEM_COLUMNS.filter((c) => c.visible);
  });
  const [showColumnConfig, setShowColumnConfig] = useState(false);
  const [showNewRecord, setShowNewRecord] = useState(false);
  const [showNewList, setShowNewList] = useState(false);
  const [editingList, setEditingList] = useState<RecordListItem | null>(null);
  const [inboxMap, setInboxMap] = useState<Record<string, string>>({});
  const [listsDropdownOpen, setListsDropdownOpen] = useState(false);
  const [recordLists, setRecordLists] = useState<RecordListItem[]>([]);
  const [activeList, setActiveList] = useState<RecordListItem | null>(null);
  const listsDropdownRef = useRef<HTMLDivElement>(null);
  const [tableMenuOpen, setTableMenuOpen] = useState(false);
  const [colMenuOpen, setColMenuOpen] = useState<string | null>(null);
  const [hoveredCol, setHoveredCol] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; client: ClientRecord } | null>(null);
  const [editingClient, setEditingClient] = useState<ClientRecord | null>(null);
  const [noteClient, setNoteClient] = useState<ClientRecord | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkSelectAll, setBulkSelectAll] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false); // true = all matching filter are selected
  const tableMenuRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  // Defer heavy content to allow tab animation to complete first
  const [mounted, setMounted] = useState(false);
  // View mode: list or kanban
  const [viewMode, setViewMode] = useState<"list" | "kanban">(() => {
    return (localStorage.getItem(`viewMode_${slug}`) as "list" | "kanban") || "list";
  });
  const [kanbanField, setKanbanField] = useState<string>(() => {
    return localStorage.getItem(`kanbanField_${slug}`) || "status";
  });
  const [kanbanFieldOpen, setKanbanFieldOpen] = useState(false);
  const [kanbanVisibleColumns, setKanbanVisibleColumns] = useState<Record<string, string[]>>(() => {
    try {
      const saved = localStorage.getItem(`kanbanCols_${slug}`);
      if (saved) return JSON.parse(saved);
    } catch {}
    return {};
  });
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [agents, setAgents] = useState<Array<{ userId: string; user: { id: string; name: string; email: string } }>>([]);
  const [teams, setTeams] = useState<Array<{ id: string; name: string; description: string | null }>>([]);
  const [assignMenuOpen, setAssignMenuOpen] = useState(false);
  const [ownerFilter, setOwnerFilter] = useState<"all" | "mine" | "myTeam">(() => {
    return (localStorage.getItem(`ownerFilter_${slug}`) as any) || "all";
  });
  const [advancedFilters, setAdvancedFilters] = useState<FilterCondition[]>([]);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [, startTransition] = useTransition();

  const visibleColumns = useMemo(
    () => (columns || []).filter((c): c is ColumnDef => c != null && !!c.key && c.visible),
    [columns]
  );

  // Defer mount: let the shell paint first, then load heavy content
  useEffect(() => {
    requestAnimationFrame(() => {
      startTransition(() => setMounted(true));
    });
  }, []);

  // Load custom fields + table config from API (only after mounted)
  useEffect(() => {
    if (!tenantId || !mounted) return;
    // Load custom fields
    getCustomFields(tenantId).then((fields) => {
      setCustomFields(fields);
      const customCols: ColumnDef[] = fields
        .filter((f) => !f.isSystem)
        .map((f) => ({ key: `custom_${f.fieldKey}`, label: f.fieldLabel, visible: true }));
      setAllColumns([...SYSTEM_COLUMNS, ...customCols]);
    }).catch(() => {});
    // Load table config from tenant (DB is source of truth)
    tenantApi.get(`/tenants/${tenantId}`).then(({ data }) => {
      if (data.tableConfig) {
        if (data.tableConfig.columns && Array.isArray(data.tableConfig.columns)) {
          const valid = data.tableConfig.columns.filter((c: any) => c && c.key && c.label);
          if (valid.length > 0) {
            setColumns(valid);
            localStorage.setItem(`columns_${slug}`, JSON.stringify(valid));
          }
        }
        if (data.tableConfig.columnWidths && typeof data.tableConfig.columnWidths === 'object') {
          setColumnWidths(data.tableConfig.columnWidths);
        }
      }
    }).catch(() => {});
    // Load record lists
    getRecordLists(tenantId).then(setRecordLists).catch(() => {});
    // Load inboxes for channel name resolution
    tenantApi.get("/chats/inboxes", { params: { tenantId } }).then(({ data }) => {
      const map: Record<string, string> = {};
      data.forEach((i: any) => { map[i.id] = i.name; });
      setInboxMap(map);
    }).catch(() => {});
    // Load agents for assignment
    tenantApi.get(`/tenants/${tenantId}/members`).then(({ data }) => setAgents(data)).catch(() => {});
    // Load teams for assignment
    tenantApi.get(`/teams`, { params: { tenantId } }).then(({ data }) => setTeams(data)).catch(() => {});
  }, [tenantId, mounted]);

  // (columns saved via modal onAccept)

  useEffect(() => {
    if (mounted) loadClients();
  }, [tenantId, page, limit, sortBy, sortOrder, mounted, activeList, ownerFilter, advancedFilters]);

  useEffect(() => { setSelectedIds(new Set()); setBulkSelectAll(false); }, [page, ownerFilter, advancedFilters, activeList]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
      if (tableMenuRef.current && !tableMenuRef.current.contains(e.target as Node)) {
        setTableMenuOpen(false);
      }
      if (listsDropdownRef.current && !listsDropdownRef.current.contains(e.target as Node)) {
        setListsDropdownOpen(false);
      }
      if (colMenuOpen) {
        const target = e.target as HTMLElement;
        if (!target.closest('[data-col-menu]')) {
          setColMenuOpen(null);
        }
      }
      if (contextMenu) {
        setContextMenu(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close context menu on click outside or scroll
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    document.addEventListener("click", close);
    document.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("scroll", close, true);
    };
  }, [contextMenu]);

  // Get user's team ID (first team the user belongs to)
  const getUserTeamId = (): string | undefined => {
    // We'll match user id against team members - for now use first team
    // In production you'd load team memberships, but teams are small enough
    return teams.length > 0 ? teams[0].id : undefined;
  };

  const loadClients = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      // In kanban mode, columns load their own data independently
      // But we still load list data so switching views works instantly
      if (activeList) {
        const res = await getRecordListRecords(activeList.id, page, limit);
        setClients(res.data);
        setTotal(res.total);
      } else {
        const assignedTo = ownerFilter === "mine" ? user?.id : undefined;
        const assignedTeamId = ownerFilter === "myTeam" ? getUserTeamId() : undefined;
        const filterParams = advancedFilters.length > 0 ? advancedFilters.map(({ field, operator, value }) => ({ field, operator, value })) : undefined;
        const res = await getClients(tenantId, page, limit, sortBy, sortOrder, assignedTo, assignedTeamId, filterParams);
        setClients(res.data);
        setTotal(res.total);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [tenantId, page, limit, sortBy, sortOrder, activeList, ownerFilter, advancedFilters]);

  const totalPages = Math.ceil(total / limit);

  // Column resize
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const resizingRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);
  const columnsRef = useRef(columns);
  columnsRef.current = columns;

  const handleResizeStart = (e: React.MouseEvent, key: string, currentWidth: number) => {
    e.preventDefault();
    resizingRef.current = { key, startX: e.clientX, startWidth: currentWidth };
    const handleMouseMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const { key, startX, startWidth } = resizingRef.current;
      const diff = ev.clientX - startX;
      const newWidth = Math.max(60, startWidth + diff);
      setColumnWidths((prev) => ({ ...prev, [key]: newWidth }));
    };
    const handleMouseUp = () => {
      resizingRef.current = null;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      // Save widths to DB
      if (tenantId) {
        setColumnWidths((current) => {
          const validCols = (columnsRef.current || []).filter((c: any) => c != null && c.key);
          tenantApi.put(`/tenants/${tenantId}`, { tableConfig: { columns: validCols, columnWidths: current } }).catch(() => {});
          return current;
        });
      }
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  // Helper: get available select fields for kanban grouping
  const getSelectFields = () => {
    const systemSelects = [
      { key: "status", label: "Estado" },
      { key: "channelSource", label: "Canal de origen" },
    ];
    // Add system fields that have options defined in customFields (like gender, documentType)
    const systemWithOptions = customFields
      .filter((f) => f.isSystem && f.fieldType === "select" && f.options && f.options.length > 0 && !["status", "channelSource"].includes(f.fieldKey))
      .map((f) => ({ key: f.fieldKey, label: f.fieldLabel }));
    // Add custom (non-system) select fields
    const customSelects = customFields
      .filter((f) => !f.isSystem && f.fieldType === "select" && f.options && f.options.length > 0)
      .map((f) => ({ key: `custom_${f.fieldKey}`, label: f.fieldLabel }));
    return [...systemSelects, ...systemWithOptions, ...customSelects];
  };

  // Helper: get label for current kanban field
  const getKanbanFieldLabel = () => {
    const fields = getSelectFields();
    return fields.find((f) => f.key === kanbanField)?.label || kanbanField;
  };

  // Helper: get options for current kanban field
  const getKanbanFieldOptions = (): string[] => {
    if (kanbanField === "status") {
      const statusField = customFields.find((f) => f.fieldKey === "status");
      return statusField?.options || ["lead", "contactado", "interesado", "oportunidad", "cliente", "premium", "fidelizado", "inactivo", "perdido"];
    }
    if (kanbanField === "channelSource") {
      const channelField = customFields.find((f) => f.fieldKey === "channelSource");
      return channelField?.options || ["whatsapp", "messenger", "instagram", "sms", "llamada", "email", "web", "formulario", "landing", "referido", "campaña", "import", "manual", "api"];
    }
    // System field with options (gender, documentType, etc.)
    const systemField = customFields.find((f) => f.fieldKey === kanbanField && f.isSystem);
    if (systemField?.options) return systemField.options;
    // Custom field
    const fieldKey = kanbanField.replace("custom_", "");
    const field = customFields.find((f) => f.fieldKey === fieldKey);
    return field?.options || [];
  };

  // Handler: move a client in kanban (update the field value)
  const handleKanbanMove = async (clientId: string, newValue: string) => {
    const fieldKey = kanbanField.startsWith("custom_") ? kanbanField.replace("custom_", "") : kanbanField;
    const isCustom = kanbanField.startsWith("custom_");

    // Optimistic update
    setClients((prev) =>
      prev.map((c) => {
        if (c.id !== clientId) return c;
        if (isCustom) {
          return { ...c, customData: { ...(c.customData || {}), [fieldKey]: newValue } };
        }
        return { ...c, [fieldKey]: newValue };
      })
    );

    try {
      if (isCustom) {
        const client = clients.find((c) => c.id === clientId);
        await tenantApi.put(`/records/${clientId}`, { customData: { ...(client?.customData || {}), [fieldKey]: newValue } });
      } else {
        await tenantApi.put(`/records/${clientId}`, { [fieldKey]: newValue });
      }
      toast.success(`Contacto movido a "${newValue}"`);
    } catch {
      loadClients(); // Revert on error
    }
  };

  const getCellValue = (client: ClientRecord, key: string) => {
    if (!key) return "—";
    // Custom fields
    if (key.startsWith("custom_")) {
      const fieldKey = key.replace("custom_", "");
      const val = client.customData?.[fieldKey];
      if (val === null || val === undefined) return "—";
      return String(val);
    }
    switch (key) {
      case "id":
        return <span className="font-mono text-xs text-gray-500">{client.id?.slice(0, 8)}...</span>;
      case "name":
        return [client.firstName, client.lastName].filter(Boolean).join(' ') || "—";
      case "email":
        return client.email || "—";
      case "phone":
        return client.phone || "—";
      case "status":
        return <StatusBadge status={client.status} />;
      case "channelSource":
        return inboxMap[client.channelSource] || client.channelSource || "—";
      case "lastContactAt":
        return client.lastContactAt ? new Date(client.lastContactAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : "—";
      case "tags":
        return client.tags && client.tags.length > 0
          ? client.tags.map((tag) => (
              <span key={tag} className="inline-block mr-1 px-2 py-0.5 rounded-full text-xs bg-brand-100 text-brand-700">{tag}</span>
            ))
          : "—";
      default: {
        const val = (client as any)[key];
        if (val === null || val === undefined || val === "") return "—";
        if (typeof val === "boolean") return val ? "Sí" : "No";
        if (val instanceof Date || (typeof val === "string" && /^\d{4}-\d{2}-\d{2}/.test(val) && key.toLowerCase().includes("date"))) {
          return new Date(val).toLocaleDateString([], { dateStyle: "short" });
        }
        return String(val);
      }
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Dark section - title */}
      <div
        className="px-8 pt-16 pb-4 shrink-0 rounded-b-2xl"
        style={{
          backgroundImage: `url(${headerBg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Contactos</h1>
            <p className="text-brand-300 mt-0.5 text-sm">
              {activeList ? `Lista: ${activeList.name}` : "Explora y segmenta tu base de contactos"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* View mode toggle */}
            <div className="flex items-center rounded-lg bg-white/10 p-0.5">
              <button
                onClick={() => { setViewMode("list"); localStorage.setItem(`viewMode_${slug}`, "list"); }}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === "list" ? "bg-white/20 text-white" : "text-white/60 hover:text-white/80"}`}
              >
                <TableProperties className="h-4 w-4" />
              </button>
              <button
                onClick={() => { setViewMode("kanban"); localStorage.setItem(`viewMode_${slug}`, "kanban"); }}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === "kanban" ? "bg-white/20 text-white" : "text-white/60 hover:text-white/80"}`}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>

            {/* Owner filter */}
            <div className="flex items-center rounded-lg bg-white/10 p-0.5">
              <button
                onClick={() => { setOwnerFilter("all"); localStorage.setItem(`ownerFilter_${slug}`, "all"); }}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${ownerFilter === "all" ? "bg-white/20 text-white" : "text-white/60 hover:text-white/80"}`}
              >
                Todos
              </button>
              <button
                onClick={() => { setOwnerFilter("mine"); localStorage.setItem(`ownerFilter_${slug}`, "mine"); }}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${ownerFilter === "mine" ? "bg-white/20 text-white" : "text-white/60 hover:text-white/80"}`}
              >
                Míos
              </button>
              {teams.length > 0 && (
                <button
                  onClick={() => { setOwnerFilter("myTeam"); localStorage.setItem(`ownerFilter_${slug}`, "myTeam"); }}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${ownerFilter === "myTeam" ? "bg-white/20 text-white" : "text-white/60 hover:text-white/80"}`}
                >
                  Mi equipo
                </button>
              )}
            </div>

            {/* Kanban field selector with column visibility */}
            {viewMode === "kanban" && (
              <div className="relative">
                <button
                  onClick={() => setKanbanFieldOpen((v) => !v)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-sm font-medium transition-colors"
                >
                  <span className="capitalize">{getKanbanFieldLabel()}</span>
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </button>
                {kanbanFieldOpen && (
                  <KanbanFieldMenu
                    fields={getSelectFields()}
                    activeField={kanbanField}
                    allOptions={getKanbanFieldOptions}
                    visibleColumns={kanbanVisibleColumns}
                    onSelectField={(key) => { setKanbanField(key); localStorage.setItem(`kanbanField_${slug}`, key); }}
                    onToggleColumn={(fieldKey, option, visible) => {
                      const allOptions = getKanbanFieldOptions();
                      const current = kanbanVisibleColumns[fieldKey] || allOptions;
                      const updated = visible ? [...current, option] : current.filter((o) => o !== option);
                      if (updated.length === 0) return;
                      const newVisibleCols = { ...kanbanVisibleColumns, [fieldKey]: updated };
                      setKanbanVisibleColumns(newVisibleCols);
                      localStorage.setItem(`kanbanCols_${slug}`, JSON.stringify(newVisibleCols));
                    }}
                    onClose={() => setKanbanFieldOpen(false)}
                  />
                )}
              </div>
            )}

            {/* Filter button */}
            <button
              onClick={() => setFilterPanelOpen((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                advancedFilters.length > 0 ? "bg-brand-500/20 text-white" : "bg-white/15 hover:bg-white/25 text-white"
              }`}
            >
              <Filter className="h-4 w-4" />
              {advancedFilters.length > 0 && <span className="text-xs">{advancedFilters.length}</span>}
            </button>

            {/* Lists button */}
            <div className="relative" ref={listsDropdownRef}>
              <button
                onClick={() => setListsDropdownOpen((v) => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-sm font-medium transition-colors"
              >
                <List className="h-4 w-4" />
                <span>{activeList ? activeList.name : "Listas"}</span>
                <ChevronDown className="h-3 w-3 opacity-60" />
              </button>
              {listsDropdownOpen && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                  {activeList && (
                    <>
                      <button
                        onClick={() => { setActiveList(null); setListsDropdownOpen(false); }}
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-brand-600 hover:bg-gray-50 transition-colors font-medium"
                      >
                        Ver todos los contactos
                      </button>
                      <div className="border-t border-gray-100 my-1" />
                    </>
                  )}
                  {recordLists.length > 0 ? (
                    <>
                      <p className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase">Mis listas</p>
                      {recordLists.map((list) => (
                        <div
                          key={list.id}
                          className={`flex items-center justify-between w-full px-3 py-2 transition-colors group ${activeList?.id === list.id ? "bg-brand-50" : "hover:bg-gray-50"}`}
                        >
                          <button
                            onClick={() => { setActiveList(list); setListsDropdownOpen(false); }}
                            className={`flex-1 text-left text-sm ${activeList?.id === list.id ? "text-brand-700" : "text-gray-700"}`}
                          >
                            {list.name}
                          </button>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-gray-400">{list.type === "dynamic" ? "Dinámica" : "Estática"}</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); setListsDropdownOpen(false); setEditingList(list); }}
                              className="p-1 rounded text-gray-300 hover:text-gray-600 hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-all"
                              title="Configurar lista"
                            >
                              <Settings2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                      <div className="border-t border-gray-100 my-1" />
                    </>
                  ) : (
                    <p className="px-3 py-2 text-xs text-gray-400">Sin listas creadas</p>
                  )}
                  <button
                    onClick={() => { setListsDropdownOpen(false); setShowNewList(true); }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5 text-gray-400" />
                    Nueva lista
                  </button>
                </div>
              )}
            </div>

            {/* New record split button */}
            <div className="relative flex" ref={dropdownRef}>
              <button
                onClick={() => setShowNewRecord(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-l-lg bg-white/15 hover:bg-white/25 text-white text-sm font-medium transition-colors"
              >
                <Plus className="h-4 w-4" />
                <span>Nuevo contacto</span>
              </button>
              <button
                onClick={() => setDropdownOpen((v) => !v)}
                className="flex items-center justify-center px-1.5 py-1.5 rounded-r-lg bg-white/15 hover:bg-white/25 text-white border-l border-white/20 transition-colors"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              {dropdownOpen && (
                <div
                  className="absolute right-0 top-full mt-2 w-52 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 animate-in fade-in slide-in-from-top-1 duration-150"
                >
                  <button
                    onClick={() => {
                      setDropdownOpen(false);
                      navigate(`/${slug}/clients/import`);
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <Upload className="h-4 w-4 text-gray-500" />
                    Importar Datos
                  </button>
                  <div className="border-t border-gray-100 my-1" />
                  <p className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase">Sincronizar</p>
                  <button
                    onClick={() => { setDropdownOpen(false); }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <svg className="h-4 w-4 text-[#1877F2]" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                    Facebook Ads Sync
                  </button>
                  <button
                    onClick={() => { setDropdownOpen(false); }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                    Google Ads Sync
                  </button>
                  <button
                    onClick={() => { setDropdownOpen(false); }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <svg className="h-4 w-4 text-[#0A66C2]" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                    LinkedIn Ads Sync
                  </button>
                  <button
                    onClick={() => { setDropdownOpen(false); }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.88 2.89 2.89 0 01-2.88-2.88 2.89 2.89 0 012.88-2.88c.28 0 .56.04.82.11v-3.5a6.37 6.37 0 00-.82-.05A6.34 6.34 0 003.15 15.7a6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V9.42a8.16 8.16 0 004.76 1.52v-3.4a4.85 4.85 0 01-1-.85z"/></svg>
                    TikTok Ads Sync
                  </button>
                  <div className="border-t border-gray-100 my-1" />
                  <button
                    onClick={() => {
                      setDropdownOpen(false);
                      navigate(`/${slug}/clients/schema`);
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <Database className="h-4 w-4 text-gray-500" />
                    Personalizar Esquema
                  </button>
                  <button
                    onClick={() => {
                      setDropdownOpen(false);
                      navigate(`/${slug}/clients/deleted`);
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <Trash2 className="h-4 w-4 text-gray-500" />
                    Eliminados
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Light section - content */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden pt-4 px-0">
        {/* Advanced Filters Panel */}
        <FilterPanel
          open={filterPanelOpen}
          onClose={() => setFilterPanelOpen(false)}
          filters={advancedFilters}
          onChange={setAdvancedFilters}
          fields={customFields}
        />

        {(!mounted || (loading && viewMode === "list")) ? (
          // Loader while data is being fetched
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center bg-white rounded-xl border border-gray-200 overflow-hidden">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : (viewMode === "list" && total === 0) ? (
          <div className="flex-1 flex items-center justify-center bg-gray-100 px-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-md w-full">
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                  <Users className="h-8 w-8 text-gray-400" />
                </div>
                <h2 className="text-xl font-semibold text-gray-700">
                  Sin contactos importados
                </h2>
                <p className="text-gray-500 mt-2 text-sm">
                  Importa un archivo CSV o Excel para empezar a segmentar
                </p>
                <Button
                  onClick={() => navigate(`/${slug}/clients/import`)}
                  size="sm"
                  className="mt-4 bg-accent-500 hover:bg-accent-600 text-white"
                >
                  Importar datos
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <>
          {viewMode === "kanban" ? (
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <KanbanView
                tenantId={tenantId}
                groupByField={kanbanField}
                fieldOptions={kanbanVisibleColumns[kanbanField] || getKanbanFieldOptions()}
                fieldLabel={getKanbanFieldLabel()}
                assignedTo={ownerFilter === "mine" ? user?.id : undefined}
                assignedTeamId={ownerFilter === "myTeam" ? getUserTeamId() : undefined}
                onMoveClient={handleKanbanMove}
                onClientClick={(client) => navigate(`/${slug}/clients/${client.id}`)}
                onContextMenu={(e, client) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, client }); }}
              />
            </div>
          ) : (
          <div className="flex-1 min-h-0 flex flex-col bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Single table with sticky header */}
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="text-sm" style={{ minWidth: "100%", width: "max-content" }}>
                <thead className="sticky top-0 z-10">
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-3 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={selectedIds.size > 0 && selectedIds.size === clients.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedIds(new Set(clients.map((c) => c.id)));
                          } else {
                            setSelectedIds(new Set());
                          }
                        }}
                        className="h-3.5 w-3.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                      />
                    </th>
                    {visibleColumns.map((col, colIndex) => col ? (
                      <th
                        key={col.key}
                        className="relative px-4 py-3 text-left font-semibold text-gray-700 whitespace-nowrap"
                        style={{ width: columnWidths[col.key] || undefined, minWidth: 60 }}
                        onMouseEnter={() => setHoveredCol(col.key)}
                        onMouseLeave={() => { if (colMenuOpen !== col.key) setHoveredCol(null); }}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span>{col.label}</span>
                          {/* Column menu button */}
                          <div className="relative">
                            <button
                              onClick={() => setColMenuOpen(colMenuOpen === col.key ? null : col.key)}
                              className={`p-0.5 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-all ${hoveredCol === col.key || colMenuOpen === col.key ? 'opacity-100' : 'opacity-0'}`}
                            >
                              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="3" width="10" height="1.5" rx="0.5"/><rect x="3" y="7" width="10" height="1.5" rx="0.5"/><rect x="3" y="11" width="10" height="1.5" rx="0.5"/></svg>
                            </button>
                            {/* Column dropdown menu - first column opens right, rest open left */}
                            {colMenuOpen === col.key && (
                              <div data-col-menu className={`absolute top-full mt-1 w-44 bg-white rounded-lg shadow-lg border border-gray-200 py-1.5 z-50 ${colIndex === 0 ? 'left-0' : 'right-0'}`}>
                            <button
                              onClick={() => { setColMenuOpen(null); setSearchParams({ page: "1", limit: String(limit), sortBy: col.key, sortOrder: "ASC" }); }}
                              className={`flex items-center gap-2.5 w-full px-3 py-2 text-sm transition-colors ${sortBy === col.key && sortOrder === "ASC" ? 'bg-brand-50 text-brand-700' : 'text-gray-700 hover:bg-gray-50'}`}
                            >
                              <ArrowUpNarrowWide className="h-4 w-4 text-gray-400" />
                              Asc
                            </button>
                            <button
                              onClick={() => { setColMenuOpen(null); setSearchParams({ page: "1", limit: String(limit), sortBy: col.key, sortOrder: "DESC" }); }}
                              className={`flex items-center gap-2.5 w-full px-3 py-2 text-sm transition-colors ${sortBy === col.key && sortOrder === "DESC" ? 'bg-brand-50 text-brand-700' : 'text-gray-700 hover:bg-gray-50'}`}
                            >
                              <ArrowDownNarrowWide className="h-4 w-4 text-gray-400" />
                              Desc
                            </button>
                            <button
                              onClick={() => { setColMenuOpen(null); }}
                              className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                            >
                              <Filter className="h-4 w-4 text-gray-400" />
                              Filtrar por
                            </button>
                            <div className="border-t border-gray-100 my-1" />
                            <button
                              onClick={() => {
                                setColMenuOpen(null);
                                const updated = columns.filter((c) => c.key !== col.key);
                                setColumns(updated);
                                if (tenantId) {
                                  tenantApi.put(`/tenants/${tenantId}`, { tableConfig: { columns: updated, columnWidths } }).catch(() => {});
                                }
                              }}
                              className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
                            >
                              <EyeOff className="h-4 w-4 text-gray-400" />
                              Ocultar columna
                            </button>
                          </div>
                        )}
                          </div>
                        </div>
                        {/* Resize handle */}
                        <div
                          onMouseDown={(e) => {
                            const th = e.currentTarget.parentElement;
                            handleResizeStart(e, col.key, th?.offsetWidth || 120);
                          }}
                          className={`absolute right-0 top-0 bottom-0 w-1 cursor-col-resize transition-colors ${hoveredCol === col.key ? 'bg-gray-300' : 'bg-transparent'}`}
                        />
                      </th>
                    ) : null)}
                    <th className="px-2 py-3 text-right w-10 sticky right-0 bg-gray-50">
                      <div className="relative" ref={tableMenuRef}>
                        <button onClick={() => setTableMenuOpen((v) => !v)} className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors">
                          <Settings2 className="h-4 w-4" />
                        </button>
                        {tableMenuOpen && (
                            <div
                              className="absolute right-0 top-full mt-1 w-60 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50 animate-in fade-in slide-in-from-top-1 duration-150"
                            >
                              <button
                                onClick={() => { setTableMenuOpen(false); setShowColumnConfig(true); }}
                                className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                              >
                                <Columns className="h-4 w-4 text-gray-400" />
                                Gestionar columnas
                              </button>
                              <button
                                onClick={() => { setTableMenuOpen(false); setColumnWidths({}); if (tenantId) tenantApi.put(`/tenants/${tenantId}`, { tableConfig: { columns, columnWidths: {} } }).catch(() => {}); }}
                                className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                              >
                                <RotateCcw className="h-4 w-4 text-gray-400" />
                                Restablecer tamaño
                              </button>
                              <div className="border-t border-gray-100 my-1" />
                              <div className="relative group/limit">
                                <button className="flex items-center justify-between w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                                  <div className="flex items-center gap-2.5">
                                    <ListOrdered className="h-4 w-4 text-gray-400" />
                                    <span>Contactos por página</span>
                                  </div>
                                  <span className="text-xs font-medium text-brand-600">{limit} ›</span>
                                </button>
                                <div className="hidden group-hover/limit:block absolute right-full top-0 w-36 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                                  {[10, 25, 50, 100, 200].map((n) => (
                                    <button
                                      key={n}
                                      onClick={() => { setTableMenuOpen(false); setSearchParams({ page: "1", limit: String(n), ...(sortBy && { sortBy }), ...(sortOrder && { sortOrder }) }); }}
                                      className={`w-full px-3 py-1.5 text-sm text-left transition-colors ${limit === n ? 'bg-brand-50 text-brand-700 font-medium' : 'text-gray-700 hover:bg-gray-50'}`}
                                    >
                                      {n} contactos
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <div className="flex items-center justify-between px-4 py-2.5">
                                <div className="flex items-center gap-2.5">
                                  <Eye className="h-4 w-4 text-gray-400" />
                                  <span className="text-sm text-gray-700">Modo de vista</span>
                                </div>
                                <span className="text-xs font-medium text-gray-500">Ajustar texto</span>
                              </div>
                            </div>
                          )}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((client) => (
                    <tr
                      key={client.id}
                      className="border-b border-gray-100 hover:bg-gray-50"
                      onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, client }); }}
                    >
                      <td className="px-3 py-2.5 w-10" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(client.id)}
                          onChange={() => {
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(client.id)) next.delete(client.id);
                              else next.add(client.id);
                              return next;
                            });
                          }}
                          className="h-3.5 w-3.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                        />
                      </td>
                      {visibleColumns.map((col) => col ? (
                        <td
                          key={col.key}
                          className="px-4 py-2.5 text-gray-700 whitespace-nowrap"
                          style={{ width: columnWidths[col.key] || undefined, minWidth: 60 }}
                        >
                          {getCellValue(client, col.key)}
                        </td>
                      ) : null)}
                      <td className="px-2 py-2.5 w-10 sticky right-0" />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          )}
          </>
        )}

        {/* Pagination - only in list view */}
        {viewMode === "list" && totalPages > 0 && (
          <div className="shrink-0 flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-white rounded-b-xl">
            <p className="text-sm text-gray-500">
              {total.toLocaleString()} contactos · Página {page} de {totalPages} · {limit} por página
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSearchParams({ page: String(Math.max(1, page - 1)), limit: String(limit), ...(sortBy && { sortBy }), ...(sortOrder && { sortOrder }) })}
                disabled={page === 1}
                className="hover:bg-gray-100 hover:border-gray-300 transition-colors"
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSearchParams({ page: String(Math.min(totalPages, page + 1)), limit: String(limit), ...(sortBy && { sortBy }), ...(sortOrder && { sortOrder }) })}
                disabled={page === totalPages}
                className="hover:bg-gray-100 hover:border-gray-300 transition-colors"
              >
                Siguiente
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Column Config Modal - lazy loaded */}
      {showColumnConfig && (
        <Suspense fallback={null}>
          <ColumnConfigModal
            columns={visibleColumns}
            allColumns={allColumns}
            onAccept={(newCols) => {
              setColumns(newCols);
              setShowColumnConfig(false);
              // Save to DB
              if (tenantId) {
                localStorage.setItem(`columns_${slug}`, JSON.stringify(newCols));
                tenantApi.put(`/tenants/${tenantId}`, { tableConfig: { columns: newCols, columnWidths } }).catch(() => {});
              }
            }}
            onCancel={() => setShowColumnConfig(false)}
          />
        </Suspense>
      )}

      {/* New Record Modal - lazy loaded */}
      {showNewRecord && (
        <Suspense fallback={null}>
          <NewRecordModal
            tenantId={tenantId}
            onClose={() => setShowNewRecord(false)}
            onCreated={() => {
              setShowNewRecord(false);
              loadClients();
            }}
          />
        </Suspense>
      )}

      {/* New List Modal - lazy loaded */}
      {showNewList && (
        <Suspense fallback={null}>
          <NewListModal
            tenantId={tenantId}
            onClose={() => setShowNewList(false)}
            onCreated={() => {
              setShowNewList(false);
              getRecordLists(tenantId).then(setRecordLists).catch(() => {});
            }}
          />
        </Suspense>
      )}

      {/* Edit List Modal */}
      {editingList && (
        <Suspense fallback={null}>
          <NewListModal
            tenantId={tenantId}
            onClose={() => setEditingList(null)}
            onCreated={() => {
              setEditingList(null);
              getRecordLists(tenantId).then(setRecordLists).catch(() => {});
            }}
            editData={{
              id: editingList.id,
              name: editingList.name,
              type: editingList.type as "static" | "dynamic",
              filters: editingList.filters,
            }}
          />
        </Suspense>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[180px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button onClick={() => { navigate(`/${slug}/clients/${contextMenu.client.id}`); setContextMenu(null); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
            <Eye className="h-3.5 w-3.5 text-gray-500" /> Ver detalles
          </button>
          <button onClick={() => { setEditingClient(contextMenu.client); setContextMenu(null); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
            <Edit3 className="h-3.5 w-3.5 text-gray-500" /> Editar contacto
          </button>
          <button onClick={() => { navigator.clipboard.writeText(contextMenu.client.phone || ""); setContextMenu(null); toast.success("Teléfono copiado"); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
            <Copy className="h-3.5 w-3.5 text-gray-500" /> Copiar teléfono
          </button>
          <button onClick={() => { navigator.clipboard.writeText(contextMenu.client.email || ""); setContextMenu(null); toast.success("Email copiado"); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
            <Copy className="h-3.5 w-3.5 text-gray-500" /> Copiar email
          </button>
          <button onClick={() => { setNoteClient(contextMenu.client); setContextMenu(null); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
            <StickyNote className="h-3.5 w-3.5 text-gray-500" /> Agregar nota
          </button>
          <div
            className="relative"
            onMouseEnter={() => setAssignMenuOpen(true)}
            onMouseLeave={() => setAssignMenuOpen(false)}
          >
            <button className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
              <span className="flex items-center gap-2"><UserPlus className="h-3.5 w-3.5 text-gray-500" /> Asignar agente</span>
              <ChevronDown className="h-3 w-3 text-gray-400 -rotate-90" />
            </button>
            {assignMenuOpen && (
              <AssignAgentSubmenu
                agents={agents}
                teams={teams}
                currentAssignee={contextMenu.client.assignedTo}
                currentTeam={contextMenu.client.assignedTeamId}
                onAssign={async (agentUserId) => {
                  await tenantApi.put(`/records/${contextMenu.client.id}`, { assignedTo: agentUserId });
                  setClients((prev) => prev.map((c) => c.id === contextMenu.client.id ? { ...c, assignedTo: agentUserId } : c));
                  setContextMenu(null);
                  setAssignMenuOpen(false);
                  toast.success(agentUserId ? "Agente asignado" : "Asignación removida");
                }}
                onAssignTeam={async (teamId) => {
                  await tenantApi.put(`/records/${contextMenu.client.id}`, { assignedTeamId: teamId });
                  setClients((prev) => prev.map((c) => c.id === contextMenu.client.id ? { ...c, assignedTeamId: teamId } : c));
                  setContextMenu(null);
                  setAssignMenuOpen(false);
                  toast.success(teamId ? "Equipo asignado" : "Equipo removido");
                }}
              />
            )}
          </div>
          <div className="border-t border-gray-100 my-1" />
          <button onClick={async () => { if (confirm("¿Eliminar este contacto?")) { await tenantApi.delete(`/records/${contextMenu.client.id}`); setContextMenu(null); loadClients(); toast.success("Contacto eliminado"); } }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50">
            <Trash2 className="h-3.5 w-3.5" /> Eliminar
          </button>
        </div>
      )}

      {/* Edit Contact Modal */}
      {editingClient && (
        <EditContactModal
          client={editingClient}
          onClose={() => setEditingClient(null)}
          onSaved={() => { setEditingClient(null); loadClients(); }}
        />
      )}

      {/* Add Note Modal */}
      {noteClient && (
        <AddNoteModal
          client={noteClient}
          onClose={() => setNoteClient(null)}
          onSaved={() => { setNoteClient(null); toast.success("Nota guardada"); }}
        />
      )}

      {/* Bulk Action Bar */}
      {(selectedIds.size > 0 || bulkSelectAll) && (
        <BulkActionBar
          count={bulkSelectAll ? total : selectedIds.size}
          allSelected={bulkSelectAll}
          total={total}
          fields={customFields}
          onClear={() => { setSelectedIds(new Set()); setBulkSelectAll(false); }}
          onSelectAll={() => setBulkSelectAll(true)}
          onBulkUpdate={async (updates) => {
            const payload = bulkSelectAll
              ? { tenantId, filters: advancedFilters.length > 0 ? advancedFilters.map(({ field, operator, value }) => ({ field, operator, value })) : undefined, assignedTo: ownerFilter === "mine" ? user?.id : undefined, assignedTeamId: ownerFilter === "myTeam" ? getUserTeamId() : undefined, updates, actorId: user?.id, actorName: user?.name || user?.email }
              : { ids: [...selectedIds], updates, actorId: user?.id, actorName: user?.name || user?.email };
            await tenantApi.put("/records/bulk", payload);
            const fieldName = Object.keys(updates)[0] || "campo";
            toast.success(`${fieldName} actualizado para ${bulkSelectAll ? total : selectedIds.size} contactos`);
            setSelectedIds(new Set()); setBulkSelectAll(false);
            loadClients();
          }}
          onAddTag={async (tag) => {
            // Tags need special handling: append to existing tags
            if (bulkSelectAll) {
              // For filter-based, we can't easily append — just set the tag
              const payload = { tenantId, filters: advancedFilters.length > 0 ? advancedFilters.map(({ field, operator, value }) => ({ field, operator, value })) : undefined, assignedTo: ownerFilter === "mine" ? user?.id : undefined, assignedTeamId: ownerFilter === "myTeam" ? getUserTeamId() : undefined, updates: { tags: [tag] } };
              await tenantApi.put("/records/bulk", payload);
            } else {
              // For ID-based, append tag to each contact's existing tags
              const promises = [...selectedIds].map((id) => {
                const client = clients.find((c) => c.id === id);
                const currentTags = client?.tags || [];
                if (currentTags.includes(tag)) return Promise.resolve();
                return tenantApi.put(`/records/${id}`, { tags: [...currentTags, tag] });
              });
              await Promise.all(promises);
            }
            toast.success(`Tag "${tag}" agregado a ${bulkSelectAll ? total : selectedIds.size} contactos`);
            setSelectedIds(new Set()); setBulkSelectAll(false);
            loadClients();
          }}
          onDelete={() => setDeleteModalOpen(true)}
        />
      )}

      {/* Delete Confirm Modal */}
      <DeleteConfirmModal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        payload={bulkSelectAll
          ? { tenantId, filters: advancedFilters.length > 0 ? advancedFilters.map(({ field, operator, value }) => ({ field, operator, value })) : undefined, assignedTo: ownerFilter === "mine" ? user?.id : undefined, assignedTeamId: ownerFilter === "myTeam" ? getUserTeamId() : undefined }
          : { ids: [...selectedIds] }
        }
        onConfirm={async () => {
          const payload = bulkSelectAll
            ? { tenantId, filters: advancedFilters.length > 0 ? advancedFilters.map(({ field, operator, value }) => ({ field, operator, value })) : undefined, assignedTo: ownerFilter === "mine" ? user?.id : undefined, assignedTeamId: ownerFilter === "myTeam" ? getUserTeamId() : undefined }
            : { ids: [...selectedIds] };
          await tenantApi.delete("/records/bulk", { data: payload });
          toast.success("Contactos eliminados");
          setSelectedIds(new Set()); setBulkSelectAll(false);
          setDeleteModalOpen(false);
          loadClients();
        }}
      />
    </div>
  );
}

// === Assign Agent Submenu ===
function AssignAgentSubmenu({ agents, teams, currentAssignee, currentTeam, onAssign, onAssignTeam }: {
  agents: Array<{ userId: string; user: { id: string; name: string; email: string } }>;
  teams: Array<{ id: string; name: string; description: string | null }>;
  currentAssignee: string | null;
  currentTeam: string | null;
  onAssign: (userId: string | null) => void;
  onAssignTeam: (teamId: string | null) => void;
}) {
  const [search, setSearch] = useState("");
  const filteredAgents = agents.filter((a) =>
    !search.trim() ||
    a.user.name.toLowerCase().includes(search.toLowerCase()) ||
    a.user.email.toLowerCase().includes(search.toLowerCase())
  );
  const filteredTeams = teams.filter((t) =>
    !search.trim() || t.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="absolute left-full top-0 ml-1 w-60 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
      <div className="px-2.5 pb-1.5 pt-1">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar agente o equipo..."
          className="w-full px-2.5 py-1.5 rounded-md border border-gray-200 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500"
          autoFocus
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      <div className="max-h-64 overflow-auto">
        {/* Remove assignments */}
        {(currentAssignee || currentTeam) && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); onAssign(null); onAssignTeam(null); }}
              className="w-full px-3 py-2 text-xs text-left text-red-500 hover:bg-red-50 transition-colors"
            >
              Quitar asignación
            </button>
            <div className="border-t border-gray-100 my-1" />
          </>
        )}

        {/* Teams */}
        {filteredTeams.length > 0 && (
          <>
            <p className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase">Equipos</p>
            {filteredTeams.map((team) => (
              <button
                key={team.id}
                onClick={(e) => { e.stopPropagation(); onAssignTeam(team.id); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${currentTeam === team.id ? "bg-brand-50" : "hover:bg-gray-50"}`}
              >
                <div className="h-6 w-6 rounded-md bg-indigo-100 flex items-center justify-center text-[10px] font-semibold text-indigo-600 shrink-0">
                  {team.name[0]?.toUpperCase() || "E"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs truncate ${currentTeam === team.id ? "font-medium text-brand-700" : "text-gray-700"}`}>{team.name}</p>
                  {team.description && <p className="text-[10px] text-gray-400 truncate">{team.description}</p>}
                </div>
                {currentTeam === team.id && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-brand-100 text-brand-700 font-medium shrink-0">Actual</span>
                )}
              </button>
            ))}
            <div className="border-t border-gray-100 my-1" />
          </>
        )}

        {/* Agents */}
        <p className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase">Agentes</p>
        {filteredAgents.length === 0 ? (
          <p className="px-3 py-2 text-xs text-gray-400">Sin resultados</p>
        ) : (
          filteredAgents.map((agent) => (
            <button
              key={agent.userId}
              onClick={(e) => { e.stopPropagation(); onAssign(agent.userId); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${currentAssignee === agent.userId ? "bg-brand-50" : "hover:bg-gray-50"}`}
            >
              <div className="h-6 w-6 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-semibold text-gray-600 shrink-0">
                {agent.user.name?.[0]?.toUpperCase() || "?"}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-xs truncate ${currentAssignee === agent.userId ? "font-medium text-brand-700" : "text-gray-700"}`}>{agent.user.name}</p>
                <p className="text-[10px] text-gray-400 truncate">{agent.user.email}</p>
              </div>
              {currentAssignee === agent.userId && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-brand-100 text-brand-700 font-medium shrink-0">Actual</span>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// === Kanban Field Menu with Submenu ===
function KanbanFieldMenu({
  fields, activeField, allOptions, visibleColumns, onSelectField, onToggleColumn, onClose,
}: {
  fields: { key: string; label: string }[];
  activeField: string;
  allOptions: () => string[];
  visibleColumns: Record<string, string[]>;
  onSelectField: (key: string) => void;
  onToggleColumn: (fieldKey: string, option: string, visible: boolean) => void;
  onClose: () => void;
}) {
  const [hoveredField, setHoveredField] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [onClose]);

  // Get options for a specific field
  function getOptionsForField(fieldKey: string): string[] {
    // Temporarily set the field to get options — we reuse the parent's allOptions fn only for activeField
    // For non-active fields we need to derive options from the fields data
    if (fieldKey === activeField) return allOptions();
    // For other fields, we don't have options loaded — show nothing
    return [];
  }

  return (
    <div ref={menuRef} className="absolute right-0 top-full mt-2 w-52 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
      {fields.map((f) => (
        <div
          key={f.key}
          className="relative"
          onMouseEnter={() => setHoveredField(f.key)}
          onMouseLeave={() => setHoveredField(null)}
        >
          <button
            onClick={() => onSelectField(f.key)}
            className={`w-full px-3 py-2 text-sm text-left transition-colors flex items-center justify-between ${
              activeField === f.key ? "bg-emerald-50 text-emerald-700 font-medium" : "text-gray-700 hover:bg-gray-50"
            }`}
          >
            <span>{f.label}</span>
            {activeField === f.key && <ChevronDown className="h-3 w-3 -rotate-90" />}
          </button>

          {/* Submenu with toggles - only for active field */}
          {hoveredField === f.key && activeField === f.key && (
            <div className="absolute left-full top-0 ml-1 w-52 bg-white rounded-lg shadow-lg border border-gray-200 py-1 max-h-64 overflow-auto">
              <p className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase">Columnas</p>
              {allOptions().map((option) => {
                const currentVisible = visibleColumns[activeField];
                const isVisible = !currentVisible || currentVisible.includes(option);
                return (
                  <label key={option} className="flex items-center justify-between px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                    <span className="text-sm text-gray-700 capitalize">{option}</span>
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); onToggleColumn(activeField, option, !isVisible); }}
                      className={`relative w-8 h-[18px] rounded-full transition-colors ${isVisible ? "bg-emerald-500" : "bg-gray-300"}`}
                    >
                      <span className={`absolute top-[2px] left-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-transform ${isVisible ? "translate-x-[14px]" : ""}`} />
                    </button>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function EditContactModal({ client, onClose, onSaved }: { client: ClientRecord; onClose: () => void; onSaved: () => void }) {
  const { slug } = useParams();
  const { user } = useAuth();
  const tenantRole = user?.tenantRoles.find((tr) => tr.tenant.slug === slug);
  const tenantId = tenantRole?.tenantId || "";

  const [fields, setFields] = useState<any[]>([]);
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loadingFields, setLoadingFields] = useState(true);

  useEffect(() => {
    const EXCLUDED_FIELDS = ["lastContactAt", "lastActivityAt", "fullName"];
    getCustomFields(tenantId).then((allFields) => {
      const editableFields = allFields.filter((f) => !EXCLUDED_FIELDS.includes(f.fieldKey) && f.fieldType !== "computed");
      setFields(editableFields.sort((a, b) => a.sortOrder - b.sortOrder));
      const initial: Record<string, any> = {};
      allFields.forEach((f) => {
        if (f.isSystem) {
          const val = (client as any)[f.fieldKey];
          if (f.fieldType === "date" && val) initial[f.fieldKey] = String(val).split("T")[0];
          else if (f.fieldType === "boolean") initial[f.fieldKey] = val ? "true" : "false";
          else initial[f.fieldKey] = val ?? "";
        } else {
          initial[f.fieldKey] = client.customData?.[f.fieldKey] ?? "";
        }
      });
      initial._tags = (client.tags || []).join(", ");
      setForm(initial);
    }).catch(() => {}).finally(() => setLoadingFields(false));
  }, [tenantId]);

  const set = (key: string, value: any) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true); setError("");
    try {
      const systemFields: Record<string, any> = {};
      const customData: Record<string, any> = { ...(client.customData || {}) };
      fields.forEach((f) => {
        const val = form[f.fieldKey];
        if (f.isSystem) {
          if (f.fieldType === "boolean") systemFields[f.fieldKey] = val === "true";
          else if (f.fieldType === "number") systemFields[f.fieldKey] = val ? Number(val) : 0;
          else systemFields[f.fieldKey] = val || null;
        } else {
          customData[f.fieldKey] = val || null;
        }
      });
      const tags = form._tags ? form._tags.split(",").map((t: string) => t.trim()).filter(Boolean) : null;
      const token = localStorage.getItem("token");
      await axios.put(`${import.meta.env.VITE_API_URL || "/api"}/records/${client.id}`, { ...systemFields, tags, customData }, { headers: { Authorization: `Bearer ${token}` } });
      onSaved();
    } catch (err: any) { setError(err.response?.data?.message || "Error al guardar"); } finally { setSaving(false); }
  };

  const groups = useMemo(() => {
    const map: Record<string, any[]> = {};
    fields.forEach((f) => { const g = f.fieldGroup || "general"; if (!map[g]) map[g] = []; map[g].push(f); });
    return map;
  }, [fields]);

  const KNOWN_ORDER = ["identificacion", "contacto", "demografia", "ubicacion", "segmentacion", "consentimiento", "actividad"];
  const groupKeys = [...KNOWN_ORDER, ...Object.keys(groups).filter((g) => !KNOWN_ORDER.includes(g))].filter((g) => groups[g]?.length);

  const fullName = [client.firstName, client.lastName].filter(Boolean).join(" ") || "Sin nombre";

  if (loadingFields) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl p-8"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-2xl shadow-2xl border border-white/30 flex flex-col max-h-[85vh] overflow-hidden"
        style={{ background: "rgba(255, 255, 255, 0.94)", backdropFilter: "blur(24px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Editar contacto</h3>
            <p className="text-xs text-gray-400 mt-0.5">{fullName} · {client.phone || client.email || ""}</p>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-5">
          {groupKeys.map((groupKey) => {
            const groupFields = groups[groupKey] || [];
            return (
              <div key={groupKey}>
                <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3 capitalize">{groupKey}</h4>
                <div className="grid grid-cols-2 gap-3">
                  {groupFields.map((f: any) => (
                    <EditFieldInput key={f.id} field={f} value={form[f.fieldKey] ?? ""} onChange={(val) => set(f.fieldKey, val)} />
                  ))}
                </div>
              </div>
            );
          })}

          {/* Tags */}
          <div>
            <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Etiquetas</h4>
            <input
              type="text"
              value={form._tags || ""}
              onChange={(e) => set("_tags", e.target.value)}
              placeholder="vip, nuevo, referido (separados por coma)"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
            />
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 rounded-lg hover:bg-gray-100 transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-50 shadow-sm flex items-center gap-2"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditFieldInput({ field, value, onChange }: { field: any; value: any; onChange: (val: string) => void }) {
  const [selectOpen, setSelectOpen] = useState(false);
  const selectRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selectOpen) return;
    const close = (e: MouseEvent) => { if (selectRef.current && !selectRef.current.contains(e.target as Node)) setSelectOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [selectOpen]);

  if (field.fieldType === "boolean") {
    return (
      <div className="flex items-center justify-between py-2">
        <label className="text-sm text-gray-700">{field.fieldLabel}</label>
        <button
          type="button"
          onClick={() => onChange(value === "true" ? "false" : "true")}
          className={`relative w-9 h-5 rounded-full transition-colors ${value === "true" ? "bg-brand-600" : "bg-gray-300"}`}
        >
          <span className={`absolute top-[2px] left-[2px] w-4 h-4 rounded-full bg-white shadow transition-transform ${value === "true" ? "translate-x-4" : ""}`} />
        </button>
      </div>
    );
  }

  if (field.fieldType === "select" && field.options?.length) {
    return (
      <div>
        <label className="block text-xs text-gray-500 mb-1">{field.fieldLabel}</label>
        <div className="relative" ref={selectRef}>
          <button
            type="button"
            onClick={() => setSelectOpen((v) => !v)}
            className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-left flex items-center justify-between transition-all ${selectOpen ? "ring-2 ring-brand-500 border-transparent" : "hover:border-gray-400"}`}
          >
            <span className={value ? "text-gray-900 capitalize" : "text-gray-400"}>{value || "Seleccionar..."}</span>
            <svg className={`h-4 w-4 text-gray-400 transition-transform ${selectOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>
          {selectOpen && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-lg border border-gray-200 shadow-lg py-1 z-50 max-h-48 overflow-auto">
              <button type="button" onClick={() => { onChange(""); setSelectOpen(false); }} className="w-full px-3 py-2 text-sm text-left text-gray-400 hover:bg-gray-50 italic">Ninguno</button>
              {field.options.map((opt: string) => (
                <button key={opt} type="button" onClick={() => { onChange(opt); setSelectOpen(false); }} className={`w-full px-3 py-2 text-sm text-left transition-colors capitalize ${value === opt ? "bg-brand-50 text-brand-700 font-medium" : "text-gray-700 hover:bg-gray-50"}`}>{opt}</button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{field.fieldLabel}</label>
      <input
        type={field.fieldType === "date" ? "date" : field.fieldType === "number" ? "number" : field.fieldKey === "email" ? "email" : "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.validations?.placeholder || ""}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
      />
    </div>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-gray-400">—</span>;

  const colors: Record<string, string> = {
    active: "bg-green-100 text-green-700",
    inactive: "bg-gray-100 text-gray-600",
    blocked: "bg-red-100 text-red-700",
  };

  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || "bg-gray-100 text-gray-600"}`}>
      {status}
    </span>
  );
}
