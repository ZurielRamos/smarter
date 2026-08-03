// Force reload - v3
import { useEffect, useState, useRef, useMemo, useCallback, useTransition, lazy, Suspense } from "react";
import { Users, Database, Upload, Settings2, Columns, Eye, EyeOff, ListOrdered, RotateCcw, ArrowUpNarrowWide, ArrowDownNarrowWide, Filter, Plus, Loader2, ChevronDown, List } from "lucide-react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import headerBg from "@/assets/header-background.jpg";
import { Button } from "@/components/ui/button";
import { getClients, getCustomFields, getRecordLists, getRecordListRecords } from "@/services/api";
import type { ClientRecord, RecordListItem } from "@/services/api";
import { useAuth } from "@/context/AuthContext";
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
  const tableMenuRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  // Defer heavy content to allow tab animation to complete first
  const [mounted, setMounted] = useState(false);
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
  }, [tenantId, mounted]);

  // (columns saved via modal onAccept)

  useEffect(() => {
    if (mounted) loadClients();
  }, [tenantId, page, limit, sortBy, sortOrder, mounted, activeList]);

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
      // Close column menu if clicking outside
      if (colMenuOpen) {
        const target = e.target as HTMLElement;
        if (!target.closest('[data-col-menu]')) {
          setColMenuOpen(null);
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const loadClients = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      if (activeList) {
        // Load from list
        const res = await getRecordListRecords(activeList.id, page, limit);
        setClients(res.data);
        setTotal(res.total);
      } else {
        const res = await getClients(tenantId, page, limit, sortBy, sortOrder);
        setClients(res.data);
        setTotal(res.total);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [tenantId, page, limit, sortBy, sortOrder, activeList]);

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
      default:
        return "—";
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
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Light section - content */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden pt-4 px-0">
        {(!mounted || loading) ? (
          // Loader while data is being fetched
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center bg-white rounded-xl border border-gray-200 overflow-hidden">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : total === 0 ? (
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
          <div className="flex-1 min-h-0 flex flex-col bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Single table with sticky header */}
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="text-sm" style={{ minWidth: "100%", width: "max-content" }}>
                <thead className="sticky top-0 z-10">
                  <tr className="bg-gray-50 border-b border-gray-200">
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
                    <tr key={client.id} className="border-b border-gray-100 hover:bg-gray-50">
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

        {/* Pagination - always visible */}
        {totalPages > 0 && (
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
