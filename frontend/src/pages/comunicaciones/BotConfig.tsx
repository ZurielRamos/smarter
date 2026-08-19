import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Bot, Save, Loader2, Cpu, MessageSquare,
  Search, Check, X, Play, Plus, Trash2, UserCircle,
  BookOpen, Shield, ChevronDown, Eye, ClipboardList, RefreshCw, Wrench, Globe, FileText, Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BotChatModal } from "@/components/BotChatModal";
import { BotKnowledgePanel } from "@/components/BotKnowledgePanel";
import { BotToolLogsPanel } from "@/components/BotToolLogsPanel";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import axios from "axios";

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "/api" });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

interface BotData {
  id: string;
  name: string;
  description: string | null;
  status: string;
  persona: string | null;
  role: string | null;
  objective: string | null;
  tone: string[];
  language: string;
  rules: string[];
  businessContext: string | null;
  dataCollectionEnabled: boolean;
  dataCollectionMode: string;
  dataCollectionFields: { field: string; label: string; instructions: string; priority: number }[];
  replyDelay: number;
  contextMessages: number;
  maxBotMessages: number;
  handoffKeywords: string[];
  handoffMessage: string | null;
  onResolvedActions: { changeStatus?: string; addTags?: string[]; assignTeamId?: string } | null;
  schedule: { enabled: boolean; timezone: string; days: Record<string, { active: boolean; start: string; end: string }>; offMessage: string } | null;
  rateLimit: { maxMessages: number; windowMinutes: number; limitMessage: string } | null;
  welcomeMessage: string | null;
  fallbackMessage: string | null;
  systemPrompt: string | null;
  model: string | null;
  temperature: number;
  maxTokens: number;
  createdAt: string;
  updatedAt: string;
}

interface ModelOption {
  id: string;
  name: string;
  pricing: { prompt: string; completion: string } | null;
  context_length: number;
}

const ROLES = [
  { value: "soporte", label: "Soporte" },
  { value: "ventas", label: "Ventas" },
  { value: "recepcionista", label: "Recepcionista" },
  { value: "agendamiento", label: "Agendamiento" },
  { value: "informacion", label: "Información" },
  { value: "custom", label: "Personalizado" },
];

const TONES = [
  { value: "formal", label: "Formal" },
  { value: "amigable", label: "Amigable" },
  { value: "profesional", label: "Profesional" },
  { value: "casual", label: "Casual" },
  { value: "tecnico", label: "Técnico" },
  { value: "empatico", label: "Empático" },
  { value: "conciso", label: "Conciso" },
];

const LANGUAGES = [
  { value: "es", label: "Español" },
  { value: "en", label: "Inglés" },
  { value: "pt", label: "Portugués" },
  { value: "fr", label: "Francés" },
];

const ROUTING_VARIANTS = [
  { value: "", label: "Standard", icon: "⚖️", description: "Precio y velocidad" },
  { value: "nitro", label: "Nitro", icon: "⚡", description: "Máxima velocidad" },
  { value: "exacto", label: "Exacto", icon: "🎯", description: "Calidad tool-calling" },
  { value: "floor", label: "Floor", icon: "💰", description: "Precio más bajo" },
];

function AddFieldDropdown({ existingFields, onAdd, tenantId }: { existingFields: string[]; onAdd: (field: string, label: string) => void; tenantId?: string }) {
  const [open, setOpen] = useState(false);
  const [allFields, setAllFields] = useState<{ field: string; label: string }[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (open && !loaded && tenantId) {
      api.get(`/custom-fields/${tenantId}`).then(({ data }) => {
        const fields = (data || []).map((cf: any) => ({
          field: cf.isSystem ? cf.fieldKey : `custom:${cf.fieldKey}`,
          label: cf.fieldLabel,
        }));
        setAllFields(fields);
        setLoaded(true);
      }).catch(() => {});
    }
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open, tenantId]);

  const available = allFields
    .filter((f) => !existingFields.includes(f.field))
    .filter((f) => !search || f.label.toLowerCase().includes(search.toLowerCase()) || f.field.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-gray-300 text-xs text-gray-500 hover:border-gray-400 hover:text-gray-600 transition-colors">
        <Plus className="h-3 w-3" /> Agregar campo
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 w-72 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="px-3 py-2 border-b border-gray-100">
            <input ref={inputRef} type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar campo..." className="w-full px-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400" />
          </div>
          <div className="max-h-52 overflow-y-auto">
            {available.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-gray-400">No hay campos disponibles</div>
            ) : (
              available.map((f) => (
                <button key={f.field} type="button" onClick={() => { onAdd(f.field, f.label); setOpen(false); setSearch(""); }}
                  className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-between"
                >
                  <span>{f.label}</span>
                  <span className="text-[10px] text-gray-400 font-mono">{f.field}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Model Selector ──────────────────────────────────────────────

function ModelSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<ModelOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedName, setSelectedName] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (open && results.length === 0) fetchModels("");
  }, [open]);

  useEffect(() => {
    if (value && !selectedName) {
      fetchModels(value.split("/").pop() || "").then((models) => {
        const match = models.find((m) => m.id === value);
        if (match) setSelectedName(match.name);
      });
    }
  }, [value]);

  const fetchModels = useCallback(async (q: string): Promise<ModelOption[]> => {
    setLoading(true);
    try {
      const { data } = await api.get<ModelOption[]>("/bots/models/search", { params: { q } });
      setResults(data);
      return data;
    } catch { return []; }
    finally { setLoading(false); }
  }, []);

  const handleSearch = (val: string) => {
    setSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchModels(val), 300);
  };

  const handleSelect = (model: ModelOption) => {
    onChange(model.id);
    setSelectedName(model.name);
    setSearch("");
    setOpen(false);
  };

  const formatPrice = (price: string) => {
    const num = parseFloat(price) * 1_000_000;
    if (num === 0) return "gratis";
    if (num < 1) return `$${num.toFixed(2)}/M`;
    return `$${num.toFixed(1)}/M`;
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-800 hover:border-gray-300 focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200 bg-white transition-colors"
      >
        <span className="truncate">
          {value ? (
            <><span className="font-medium">{selectedName || value}</span><span className="text-gray-400 ml-1.5 text-xs">{value}</span></>
          ) : (
            <span className="text-gray-400">Busca y selecciona un modelo...</span>
          )}
        </span>
        {value ? (
          <X className="h-3.5 w-3.5 text-gray-400 hover:text-gray-600 shrink-0" onClick={(e) => { e.stopPropagation(); onChange(""); setSelectedName(""); }} />
        ) : (
          <Search className="h-3.5 w-3.5 text-gray-400 shrink-0" />
        )}
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="px-3 py-2 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input ref={inputRef} type="text" value={search} onChange={(e) => handleSearch(e.target.value)} placeholder="Buscar modelo..." className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400" />
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-gray-400" /></div>
            ) : results.length === 0 ? (
              <div className="py-6 text-center text-xs text-gray-400">No se encontraron modelos</div>
            ) : (
              results.map((m) => (
                <button key={m.id} type="button" onClick={() => handleSelect(m)} className={`w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors border-b border-gray-50 last:border-0 ${m.id === value ? "bg-brand-50" : "hover:bg-gray-50"}`}>
                  <Check className={`h-3.5 w-3.5 shrink-0 ${m.id === value ? "text-brand-600" : "text-transparent"}`} />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-gray-900 truncate block">{m.name}</span>
                    <span className="text-[10px] text-gray-400 font-mono">{m.id}{m.context_length ? ` · ${Math.round(m.context_length / 1000)}k ctx` : ""}</span>
                  </div>
                  {m.pricing && (
                    <div className="text-right shrink-0">
                      <p className="text-[10px] text-gray-500">{formatPrice(m.pricing.prompt)} in</p>
                      <p className="text-[10px] text-gray-500">{formatPrice(m.pricing.completion)} out</p>
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Mini Select ──────────────────────────────────────────────────

function MiniSelect({ value, onChange, options, labels }: { value: string; onChange: (v: string) => void; options: string[]; labels?: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const display = labels?.[value] || value;

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded border border-gray-200 text-xs text-gray-800 hover:border-gray-300 focus:outline-none focus:border-brand-300 bg-white transition-colors"
      >
        <span className="font-medium">{display}</span>
        <ChevronDown className={`h-3 w-3 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-0.5 animate-in fade-in slide-in-from-top-1 duration-100">
          {options.map((opt) => (
            <button key={opt} type="button" onClick={() => { onChange(opt); setOpen(false); }}
              className={`w-full text-left px-2.5 py-1.5 text-xs transition-colors ${opt === value ? "bg-brand-50 text-brand-700 font-medium" : "text-gray-700 hover:bg-gray-50"}`}
            >{labels?.[opt] || opt}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── KV List ──────────────────────────────────────────────────────

function KvList({ items, setItems, valuePlaceholder = "", tenantId }: { items: { key: string; value: string; source?: string; description?: string; transform?: string }[]; setItems: (v: any[]) => void; valuePlaceholder?: string; tenantId?: string }) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <KvRow key={i} item={item} index={i} items={items} setItems={setItems} valuePlaceholder={valuePlaceholder} tenantId={tenantId} />
      ))}
      <button type="button" onClick={() => setItems([...items, { key: "", value: "", source: "fixed" }])} className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-700">
        <Plus className="h-2.5 w-2.5" /> Agregar
      </button>
    </div>
  );
}

function KvRow({ item, index, items, setItems, valuePlaceholder, tenantId }: { item: any; index: number; items: any[]; setItems: (v: any[]) => void; valuePlaceholder?: string; tenantId?: string }) {
  const [showSourceMenu, setShowSourceMenu] = useState(false);
  const [fields, setFields] = useState<{ field: string; label: string }[]>([]);
  const [loadedFields, setLoadedFields] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const source = item.source || "fixed";

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowSourceMenu(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const loadFields = () => {
    if (loadedFields || !tenantId) return;
    api.get(`/custom-fields/${tenantId}`).then(({ data }) => {
      setFields((data || []).map((cf: any) => ({ field: cf.fieldKey, label: cf.fieldLabel })));
      setLoadedFields(true);
    }).catch(() => {});
  };

  const update = (updates: Partial<typeof item>) => {
    const next = [...items];
    next[index] = { ...next[index], ...updates };
    setItems(next);
  };

  const sourceColors: Record<string, string> = {
    fixed: "bg-gray-100 text-gray-600",
    contact: "bg-blue-100 text-blue-700",
    ai: "bg-purple-100 text-purple-700",
  };
  const sourceLabels: Record<string, string> = { fixed: "Fijo", contact: "Contacto", ai: "IA" };

  return (
    <div className="border border-gray-200 rounded-lg p-2 space-y-1.5">
      <div className="flex gap-1.5 items-center">
        <input type="text" value={item.key} onChange={(e) => update({ key: e.target.value })} placeholder="Name" className="w-1/3 px-2 py-1.5 rounded border border-gray-200 text-xs font-mono focus:outline-none focus:border-brand-300" />

        {/* Source selector */}
        <div className="relative" ref={menuRef}>
          <button type="button" onClick={() => { setShowSourceMenu(!showSourceMenu); loadFields(); }}
            className={`px-2 py-1.5 rounded text-[10px] font-medium whitespace-nowrap ${sourceColors[source]}`}
          >{sourceLabels[source]} ▾</button>
          {showSourceMenu && (
            <div className="absolute z-50 top-full left-0 mt-1 w-36 bg-white rounded-lg shadow-lg border border-gray-200 py-0.5 animate-in fade-in duration-100">
              <button type="button" onClick={() => { update({ source: "fixed", value: "", description: "" }); setShowSourceMenu(false); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50">Valor fijo</button>
              <button type="button" onClick={() => { update({ source: "contact", value: "", description: "" }); setShowSourceMenu(false); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50">Campo del contacto</button>
              <button type="button" onClick={() => { update({ source: "ai", value: "", description: "" }); setShowSourceMenu(false); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50">IA (de la conversación)</button>
            </div>
          )}
        </div>

        {/* Value input depends on source */}
        {source === "fixed" && (
          <input type="text" value={item.value} onChange={(e) => update({ value: e.target.value })} placeholder={valuePlaceholder || "Valor"} className="flex-1 px-2 py-1.5 rounded border border-gray-200 text-xs focus:outline-none focus:border-brand-300" />
        )}
        {source === "contact" && (
          <ContactFieldSelect value={item.value} onChange={(v) => update({ value: v })} fields={fields} />
        )}
        {source === "ai" && (
          <span className="flex-1 text-[10px] text-purple-600 italic">El modelo lo extrae</span>
        )}

        <button type="button" onClick={() => setItems(items.filter((_, idx) => idx !== index))} className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"><Trash2 className="h-3 w-3" /></button>
      </div>

      {/* AI description */}
      {source === "ai" && (
        <input type="text" value={item.description || ""} onChange={(e) => update({ description: e.target.value })} placeholder="Describe cómo debe obtener este dato (ej: el producto que busca el usuario)" className="w-full px-2 py-1.5 rounded border border-gray-200 text-[10px] text-gray-700 focus:outline-none focus:border-brand-300" />
      )}
    </div>
  );
}

function ContactFieldSelect({ value, onChange, fields }: { value: string; onChange: (v: string) => void; fields: { field: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const selected = fields.find((f) => f.field === value);

  return (
    <div className="relative flex-1" ref={ref}>
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-2 py-1.5 rounded border border-gray-200 text-xs text-gray-700 hover:border-gray-300 bg-white">
        <span className="truncate">{selected?.label || value || "Seleccionar campo..."}</span>
        <ChevronDown className="h-3 w-3 text-gray-400" />
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 max-h-40 overflow-y-auto py-0.5 animate-in fade-in duration-100">
          {fields.map((f) => (
            <button key={f.field} type="button" onClick={() => { onChange(f.field); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${f.field === value ? "bg-brand-50 text-brand-700" : "hover:bg-gray-50"}`}
            >{f.label} <span className="text-gray-400 ml-1">{f.field}</span></button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tool Form Modal ─────────────────────────────────────────────

function ToolFormModal({ tool, botId, tenantId, onClose, onSaved }: { tool: any | null; botId: string; tenantId?: string; onClose: () => void; onSaved: (t: any) => void }) {
  // Parse stored items back to editable format
  const parseStoredItems = (items: any[] | null | undefined): { key: string; value: string; source?: string; description?: string }[] => {
    if (!items || items.length === 0) return [];
    return items.map((item: any) => {
      // If it has a source field already, use it (but fix the value)
      if (item.source === "ai") return { key: item.key, value: "", source: "ai", description: item.description || "" };
      if (item.source === "contact") {
        // Extract field name from {{contact.fieldName}}
        const match = item.value?.match(/^\{\{contact\.(\w+)\}\}$/);
        return { key: item.key, value: match ? match[1] : item.value, source: "contact", description: "" };
      }
      if (item.source === "fixed" || !item.source) {
        // Check if value looks like a contact placeholder (from old saves)
        const contactMatch = item.value?.match(/^\{\{contact\.(\w+)\}\}$/);
        if (contactMatch) return { key: item.key, value: contactMatch[1], source: "contact", description: "" };
        const aiMatch = item.value?.match(/^\{\{(\w+)\}\}$/);
        if (aiMatch && aiMatch[1] === item.key) return { key: item.key, value: "", source: "ai", description: item.description || "" };
        return { key: item.key, value: item.value || "", source: "fixed", description: "" };
      }
      return { key: item.key, value: item.value || "", source: item.source || "fixed", description: item.description || "" };
    });
  };
  const [name, setName] = useState(tool?.name || "");
  const [description, setDescription] = useState(tool?.description || "");
  const [executionType, setExecutionType] = useState(tool?.executionType || "webhook");
  const [staticResponse, setStaticResponse] = useState(tool?.staticResponse || "");
  const [saving, setSaving] = useState(false);
  const [method, setMethod] = useState(tool?.webhookMethod || "GET");
  const [url, setUrl] = useState(tool?.webhookUrl || "");
  const [authType, setAuthType] = useState(tool?.webhookAuthType || "none");
  const [authValue, setAuthValue] = useState(tool?.webhookAuthValue || "");
  const [sendQueryParams, setSendQueryParams] = useState((tool?.webhookQueryParams?.length || 0) > 0);
  const [queryParams, setQueryParams] = useState<{ key: string; value: string; source?: string; description?: string }[]>(() => parseStoredItems(tool?.webhookQueryParams));
  const [sendHeaders, setSendHeaders] = useState((tool?.webhookHeaders?.length || 0) > 0);
  const [headers, setHeaders] = useState<{ key: string; value: string; source?: string; description?: string }[]>(() => parseStoredItems(tool?.webhookHeaders));
  const [sendBody, setSendBody] = useState((tool?.webhookBodyFields?.length || 0) > 0 || !!tool?.webhookRawBody || !!tool?.webhookBodyType);
  const [bodyType, setBodyType] = useState(tool?.webhookBodyType || "json");
  const [bodyFields, setBodyFields] = useState<{ key: string; value: string; source?: string; description?: string }[]>(() => parseStoredItems(tool?.webhookBodyFields));
  const [rawBody, setRawBody] = useState(tool?.webhookRawBody || "");
  const [responseMapping, setResponseMapping] = useState<{ path: string; label: string }[]>(tool?.responseMapping || []);

  const handleSave = async () => {
    if (!name.trim() || !description.trim()) return;
    setSaving(true);
    try {
      // Build parameters from AI-sourced fields
      const aiFields = new Set<string>();
      const allItems = [...(sendQueryParams ? queryParams : []), ...(sendHeaders ? headers : []), ...(sendBody && bodyType !== "raw" ? bodyFields : [])];
      for (const item of allItems) {
        if (item.source === "ai" && item.key) aiFields.add(item.key);
      }
      // Also extract {{param}} from rawBody and URL
      if (sendBody && bodyType === "raw" && rawBody) {
        const matches = rawBody.match(/\{\{(\w+)\}\}/g) || [];
        matches.forEach((m: string) => { const p = m.replace(/\{\{|\}\}/g, ""); if (!p.startsWith("contact.")) aiFields.add(p); });
      }
      const urlMatches = url.match(/\{\{(\w+)\}\}/g) || [];
      urlMatches.forEach((m: string) => { const p = m.replace(/\{\{|\}\}/g, ""); if (!p.startsWith("contact.")) aiFields.add(p); });

      const properties: Record<string, any> = {};
      for (const item of allItems) {
        if (item.source === "ai" && item.key) {
          properties[item.key] = { type: "string", description: item.description || item.key };
        }
      }
      // Add URL/rawBody extracted params that aren't already covered
      for (const p of aiFields) {
        if (!properties[p]) properties[p] = { type: "string", description: p };
      }
      const parsedParams = { type: "object", properties };

      // Convert items to storage format
      const toStorageItems = (items: any[]) => items.filter((i) => i.key).map((i) => ({
        key: i.key,
        value: i.source === "ai" ? `{{${i.key}}}` : i.source === "contact" ? `{{contact.${i.value}}}` : i.value,
        source: i.source || "fixed",
        description: i.description || "",
      }));

      const payload: any = {
        name: name.trim().replace(/\s+/g, '_').toLowerCase(),
        description: description.trim(),
        parameters: parsedParams,
        executionType,
        webhookUrl: executionType === "webhook" ? url.trim() : null,
        webhookMethod: executionType === "webhook" ? method : null,
        webhookHeaders: executionType === "webhook" && sendHeaders ? toStorageItems(headers) : null,
        webhookQueryParams: executionType === "webhook" && sendQueryParams ? toStorageItems(queryParams) : null,
        webhookBodyType: executionType === "webhook" && sendBody ? bodyType : null,
        webhookBodyFields: executionType === "webhook" && sendBody && bodyType !== "raw" ? toStorageItems(bodyFields) : null,
        webhookRawBody: executionType === "webhook" && sendBody && bodyType === "raw" ? rawBody : null,
        responseMapping: executionType === "webhook" && responseMapping.filter((r) => r.path && r.label).length > 0 ? responseMapping.filter((r) => r.path && r.label) : null,
        webhookAuthType: executionType === "webhook" ? authType : null,
        webhookAuthValue: executionType === "webhook" && authType !== "none" ? authValue : null,
        staticResponse: executionType === "static" ? staticResponse : null,
        isEnabled: true,
      };

      if (tool?.id) {
        const { data } = await api.put(`/bots/tools/${tool.id}`, payload);
        onSaved(data);
      } else {
        const { data } = await api.post(`/bots/${botId}/tools`, payload);
        onSaved(data);
      }
    } catch {} finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 animate-in fade-in duration-150" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h3 className="text-sm font-semibold text-gray-900">{tool ? "Editar herramienta" : "Nueva herramienta"}</h3>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nombre de la función</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value.replace(/\s+/g, '_').toLowerCase())} placeholder="buscar_producto" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono text-gray-800 focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200" />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Descripción</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="El modelo usa esta descripción para decidir cuándo ejecutar la herramienta" rows={2} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200 resize-none" />
          </div>

          {/* Execution type */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setExecutionType("webhook")}
                className={`px-3 py-2 rounded-lg border text-left transition-colors ${executionType === "webhook" ? "border-brand-300 bg-brand-50 ring-1 ring-brand-200" : "border-gray-200 hover:border-gray-300"}`}
              >
                <span className={`text-xs font-medium ${executionType === "webhook" ? "text-brand-700" : "text-gray-700"}`}>HTTP Request</span>
                <p className="text-[10px] text-gray-400">Llama una URL externa</p>
              </button>
              <button type="button" onClick={() => setExecutionType("static")}
                className={`px-3 py-2 rounded-lg border text-left transition-colors ${executionType === "static" ? "border-brand-300 bg-brand-50 ring-1 ring-brand-200" : "border-gray-200 hover:border-gray-300"}`}
              >
                <span className={`text-xs font-medium ${executionType === "static" ? "text-brand-700" : "text-gray-700"}`}>Respuesta estática</span>
                <p className="text-[10px] text-gray-400">Devuelve un texto fijo</p>
              </button>
            </div>
          </div>

          {/* Webhook config */}
          {executionType === "webhook" && (
            <div className="space-y-3 border border-gray-200 rounded-lg p-4">
              {/* Method + URL */}
              <div className="flex gap-2">
                <div className="w-28 shrink-0">
                  <label className="block text-[10px] text-gray-500 mb-1">Método</label>
                  <MiniSelect value={method} onChange={setMethod} options={["GET", "POST", "PUT", "PATCH", "DELETE"]} />
                </div>
                <div className="flex-1">
                  <label className="block text-[10px] text-gray-500 mb-1">URL</label>
                  <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.example.com/endpoint" className="w-full px-2 py-1.5 rounded border border-gray-200 text-xs font-mono text-gray-800 focus:outline-none focus:border-brand-300" />
                  <p className="text-[9px] text-gray-400 mt-0.5">Usa {"{{param}}"} para insertar valores de los parámetros</p>
                </div>
              </div>

              {/* Authentication */}
              <div>
                <label className="block text-[10px] text-gray-500 mb-1">Autenticación</label>
                <MiniSelect value={authType} onChange={setAuthType} options={["none", "bearer", "basic", "api_key"]} labels={{ none: "Ninguna", bearer: "Bearer Token", basic: "Basic Auth", api_key: "API Key" }} />
                {authType !== "none" && (
                  <input type="text" value={authValue} onChange={(e) => setAuthValue(e.target.value)}
                    placeholder={authType === "bearer" ? "Token..." : authType === "basic" ? "usuario:contraseña" : "X-Api-Key:valor"}
                    className="w-full px-2 py-1.5 rounded border border-gray-200 text-xs font-mono focus:outline-none focus:border-brand-300"
                  />
                )}
              </div>

              {/* Query Params */}
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-xs font-medium text-gray-700">Query Parameters</p>
                  <p className="text-[10px] text-gray-400">Parámetros enviados en la URL (?key=value)</p>
                </div>
                <button type="button" onClick={() => setSendQueryParams(!sendQueryParams)} className={`relative w-9 h-5 rounded-full transition-colors ${sendQueryParams ? "bg-brand-600" : "bg-gray-300"}`}>
                  <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${sendQueryParams ? "translate-x-4" : ""}`} />
                </button>
              </div>
              {sendQueryParams && <div className="mb-3"><KvList items={queryParams} setItems={setQueryParams} valuePlaceholder="valor fijo" tenantId={tenantId} /></div>}

              {/* Headers */}
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-xs font-medium text-gray-700">Headers</p>
                  <p className="text-[10px] text-gray-400">Cabeceras HTTP adicionales</p>
                </div>
                <button type="button" onClick={() => setSendHeaders(!sendHeaders)} className={`relative w-9 h-5 rounded-full transition-colors ${sendHeaders ? "bg-brand-600" : "bg-gray-300"}`}>
                  <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${sendHeaders ? "translate-x-4" : ""}`} />
                </button>
              </div>
              {sendHeaders && <div className="mb-3"><KvList items={headers} setItems={setHeaders} valuePlaceholder="valor" tenantId={tenantId} /></div>}

              {/* Body */}
              {method !== "GET" && (
                <div>
                  <div className="flex items-center justify-between py-2">
                    <div>
                      <p className="text-xs font-medium text-gray-700">Body</p>
                      <p className="text-[10px] text-gray-400">Cuerpo de la petición</p>
                    </div>
                    <button type="button" onClick={() => setSendBody(!sendBody)} className={`relative w-9 h-5 rounded-full transition-colors ${sendBody ? "bg-brand-600" : "bg-gray-300"}`}>
                      <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${sendBody ? "translate-x-4" : ""}`} />
                    </button>
                  </div>
                  {sendBody && (
                    <div className="mt-2">
                      <div className="flex gap-1 mb-2">
                        {[{ v: "json", l: "JSON" }, { v: "form", l: "FORM" }, { v: "raw", l: "RAW" }].map((t) => (
                          <button key={t.v} type="button" onClick={() => setBodyType(t.v)}
                            className={`px-2 py-1 rounded text-[10px] font-medium border transition-colors ${bodyType === t.v ? "border-brand-300 bg-brand-50 text-brand-700" : "border-gray-200 text-gray-500"}`}
                          >{t.l}</button>
                        ))}
                      </div>
                      {bodyType === "raw" ? (
                        <div>
                          <textarea value={rawBody} onChange={(e) => setRawBody(e.target.value)} placeholder={'{\n  "user": {\n    "name": "{{nombre}}",\n    "email": "{{contact.email}}"\n  },\n  "query": "{{busqueda}}"\n}'} rows={6} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-xs font-mono text-gray-800 focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200 resize-y" />
                          <p className="text-[9px] text-gray-400 mt-1">JSON libre. Usa {"{{param}}"} para valores de la IA o {"{{contact.campo}}"} para datos del contacto.</p>
                        </div>
                      ) : (
                        <KvList items={bodyFields} setItems={setBodyFields} valuePlaceholder="valor fijo" tenantId={tenantId} />
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Response mapping (webhook only) */}
          {executionType === "webhook" && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div>
                  <label className="text-xs font-medium text-gray-600">Mapeo de respuesta</label>
                  <p className="text-[10px] text-gray-400">Define qué datos de la respuesta del endpoint se le pasan al modelo.</p>
                </div>
              </div>
              <div className="space-y-1.5 mt-2">
                {responseMapping.map((item, i) => (
                  <div key={i} className="flex gap-1.5 items-center">
                    <input type="text" value={item.path} onChange={(e) => { const next = [...responseMapping]; next[i] = { ...next[i], path: e.target.value }; setResponseMapping(next); }} placeholder="data.products" className="w-2/5 px-2 py-1.5 rounded border border-gray-200 text-xs font-mono focus:outline-none focus:border-brand-300" />
                    <span className="text-gray-400 text-xs">→</span>
                    <input type="text" value={item.label} onChange={(e) => { const next = [...responseMapping]; next[i] = { ...next[i], label: e.target.value }; setResponseMapping(next); }} placeholder="Productos encontrados" className="flex-1 px-2 py-1.5 rounded border border-gray-200 text-xs focus:outline-none focus:border-brand-300" />
                    <button type="button" onClick={() => setResponseMapping(responseMapping.filter((_, idx) => idx !== i))} className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"><Trash2 className="h-3 w-3" /></button>
                  </div>
                ))}
                <button type="button" onClick={() => setResponseMapping([...responseMapping, { path: "", label: "" }])} className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-700">
                  <Plus className="h-2.5 w-2.5" /> Agregar campo
                </button>
              </div>
              <p className="text-[9px] text-gray-400 mt-1.5">Usa dot notation para acceder a campos anidados: data.items, result.price. Si no configuras ninguno, se pasa la respuesta completa.</p>
            </div>
          )}

          {/* Static response */}
          {executionType === "static" && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Respuesta</label>
              <textarea value={staticResponse} onChange={(e) => setStaticResponse(e.target.value)} placeholder='{"horario": "Lunes a Viernes 8am-6pm"}' rows={3} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono text-gray-800 focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200 resize-y" />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2 sticky bottom-0 bg-white">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50">Cancelar</button>
          <button onClick={handleSave} disabled={saving || !name.trim() || !description.trim()} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-xs font-medium disabled:opacity-50">
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            {tool ? "Guardar" : "Crear"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────

export function BotConfig() {
  const { botId, slug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const currentTenant = user?.tenantRoles.find((tr) => tr.tenant.slug === slug);
  const tenantId = currentTenant?.tenantId;

  const [bot, setBot] = useState<BotData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showPromptPreview, setShowPromptPreview] = useState(false);

  // Identity
  const [persona, setPersona] = useState("");
  const [role, setRole] = useState("");
  const [customRole, setCustomRole] = useState("");
  const [objective, setObjective] = useState("");
  const [tone, setTone] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>(["es"]);

  // Rules
  const [rules, setRules] = useState<string[]>([]);
  const [newRule, setNewRule] = useState("");

  // Knowledge (legacy businessContext kept for compatibility)
  const [businessContext] = useState("");

  // Data Collection
  const [dataCollectionEnabled, setDataCollectionEnabled] = useState(false);
  const [dataCollectionIntensity, setDataCollectionIntensity] = useState(3);
  const [dataCollectionFields, setDataCollectionFields] = useState<{ field: string; label: string; instructions: string; priority: number }[]>([]);

  // Behavior
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [fallbackMessage, setFallbackMessage] = useState("");
  const [replyDelay, setReplyDelay] = useState(4);
  const [contextMessages, setContextMessages] = useState(20);
  const [maxBotMessages, setMaxBotMessages] = useState(0);
  const [handoffKeywords, setHandoffKeywords] = useState<string[]>([]);
  const [handoffMessage, setHandoffMessage] = useState("");
  const [newKeyword, setNewKeyword] = useState("");
  const [onResolvedStatus, setOnResolvedStatus] = useState("");
  const [onResolvedLabelIds, setOnResolvedLabelIds] = useState<string[]>([]);
  const [availableLabels, setAvailableLabels] = useState<{ id: string; label: string; color: string }[]>([]);

  // Schedule
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleOffMessage, setScheduleOffMessage] = useState("");
  const [scheduleDays, setScheduleDays] = useState<Record<string, { active: boolean; start: string; end: string }>>({
    lunes: { active: true, start: "08:00", end: "18:00" },
    martes: { active: true, start: "08:00", end: "18:00" },
    miercoles: { active: true, start: "08:00", end: "18:00" },
    jueves: { active: true, start: "08:00", end: "18:00" },
    viernes: { active: true, start: "08:00", end: "18:00" },
    sabado: { active: false, start: "09:00", end: "13:00" },
    domingo: { active: false, start: "00:00", end: "00:00" },
  });

  // Rate limit
  const [rateLimitMax, setRateLimitMax] = useState(0);
  const [rateLimitWindow, setRateLimitWindow] = useState(60);
  const [rateLimitMessage, setRateLimitMessage] = useState("");

  // Tools
  interface BotToolItem { id: string; name: string; description: string; parameters: any; executionType: string; webhookUrl: string | null; webhookMethod: string | null; webhookHeaders: Record<string, string> | null; staticResponse: string | null; isEnabled: boolean }
  const [tools, setTools] = useState<BotToolItem[]>([]);
  const [showToolForm, setShowToolForm] = useState(false);
  const [editingTool, setEditingTool] = useState<BotToolItem | null>(null);

  // Advanced
  const [systemPrompt, setSystemPrompt] = useState("");
  const [variant, setVariant] = useState("");
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1024);

  useEffect(() => { if (botId) loadBot(); }, [botId]);

  const loadBot = async () => {
    setLoading(true);
    try {
      const { data } = await api.get<BotData>(`/bots/${botId}`);
      setBot(data);
      setPersona(data.persona || "");
      setRole(data.role || "");
      setCustomRole(ROLES.some((r) => r.value === data.role) || !data.role ? "" : data.role);
      if (data.role && !ROLES.some((r) => r.value === data.role)) setRole("custom");
      setObjective(data.objective || "");
      setTone(data.tone || []);
      setLanguages(data.language ? data.language.split(",") : ["es"]);
      setRules(data.rules || []);
      setDataCollectionEnabled(data.dataCollectionEnabled || false);
      setDataCollectionIntensity(parseInt(data.dataCollectionMode) || 3);
      setDataCollectionFields(data.dataCollectionFields || []);
      setReplyDelay(data.replyDelay ?? 4);
      setContextMessages(data.contextMessages ?? 20);
      setMaxBotMessages(data.maxBotMessages ?? 0);
      setHandoffKeywords(data.handoffKeywords || []);
      setHandoffMessage(data.handoffMessage || "");
      setOnResolvedStatus(data.onResolvedActions?.changeStatus || "");
      setOnResolvedLabelIds(data.onResolvedActions?.addTags || []);
      setScheduleEnabled(data.schedule?.enabled || false);
      setScheduleOffMessage(data.schedule?.offMessage || "");
      if (data.schedule?.days) setScheduleDays(data.schedule.days);
      setRateLimitMax(data.rateLimit?.maxMessages || 0);
      setRateLimitWindow(data.rateLimit?.windowMinutes || 60);
      setRateLimitMessage(data.rateLimit?.limitMessage || "");
      // Load labels
      if (tenantId) {
        api.get(`/chats/labels?tenantId=${tenantId}`).then(({ data: labels }) => {
          setAvailableLabels(labels || []);
        }).catch(() => {});
      }
      setWelcomeMessage(data.welcomeMessage || "");
      // Load tools
      api.get(`/bots/${botId}/tools`).then(({ data: t }) => setTools(t || [])).catch(() => {});
      setFallbackMessage(data.fallbackMessage || "");
      setSystemPrompt(data.systemPrompt || "");
      setVariant(data.model || "");
      setTemperature(Number(data.temperature) || 0.7);
      setMaxTokens(data.maxTokens || 1024);
    } catch { toast.error("Error al cargar el bot"); }
    finally { setLoading(false); }
  };

  const handleSave = async () => {
    if (!botId) return;
    setSaving(true);
    try {
      const { data } = await api.put<BotData>(`/bots/${botId}`, {
        persona: persona.trim() || null,
        role: role === "custom" ? (customRole.trim() || null) : (role || null),
        objective: objective.trim() || null,
        tone,
        language: languages.join(","),
        rules,
        businessContext: businessContext.trim() || null,
        dataCollectionEnabled,
        dataCollectionMode: String(dataCollectionIntensity),
        dataCollectionFields,
        replyDelay,
        contextMessages,
        maxBotMessages,
        handoffKeywords,
        handoffMessage: handoffMessage.trim() || null,
        onResolvedActions: (onResolvedStatus || onResolvedLabelIds.length > 0) ? {
          changeStatus: onResolvedStatus || undefined,
          addTags: onResolvedLabelIds.length > 0 ? onResolvedLabelIds : undefined,
        } : null,
        schedule: scheduleEnabled ? {
          enabled: true,
          timezone: 'America/Bogota',
          days: scheduleDays,
          offMessage: scheduleOffMessage || 'Estamos fuera de horario. Te responderemos pronto.',
        } : null,
        rateLimit: rateLimitMax > 0 ? { maxMessages: rateLimitMax, windowMinutes: rateLimitWindow, limitMessage: rateLimitMessage || '' } : null,
        welcomeMessage: welcomeMessage.trim() || null,
        fallbackMessage: fallbackMessage.trim() || null,
        systemPrompt: systemPrompt.trim() || null,
        model: variant || null,
        temperature,
        maxTokens,
      });
      setBot(data);
      toast.success("Configuración guardada");
    } catch { toast.error("Error al guardar"); }
    finally { setSaving(false); }
  };

  const addRule = () => {
    if (!newRule.trim()) return;
    setRules((prev) => [...prev, newRule.trim()]);
    setNewRule("");
  };

  const removeRule = (idx: number) => {
    setRules((prev) => prev.filter((_, i) => i !== idx));
  };

  const toggleTone = (t: string) => {
    setTone((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);
  };

  const toggleLanguage = (l: string) => {
    setLanguages((prev) => prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l]);
  };

  const addDataField = (field: string, label: string) => {
    if (dataCollectionFields.some((f) => f.field === field)) return;
    setDataCollectionFields((prev) => [...prev, { field, label, instructions: "", priority: 2 }]);
  };

  const removeDataField = (field: string) => {
    setDataCollectionFields((prev) => prev.filter((f) => f.field !== field));
  };

  const updateDataField = (field: string, updates: Partial<{ instructions: string; priority: number }>) => {
    setDataCollectionFields((prev) => prev.map((f) => f.field === field ? { ...f, ...updates } : f));
  };

  // Compile prompt preview (mirrors backend logic)
  const compiledPrompt = (() => {
    if (systemPrompt.trim()) return systemPrompt;
    const parts: string[] = [];
    const effectiveRole = role === "custom" ? customRole : role;
    if (persona || effectiveRole) {
      let identity = "Eres";
      if (persona) identity += ` ${persona},`;
      if (effectiveRole) identity += ` un asistente de ${effectiveRole}`;
      identity += ".";
      parts.push(identity);
    }
    if (objective) parts.push(`Objetivo: ${objective}`);
    if (tone.length > 0) parts.push(`Tu tono de comunicación es: ${tone.join(", ")}.`);
    if (languages.length > 0) {
      const langMap: Record<string, string> = { es: "español", en: "inglés", pt: "portugués", fr: "francés" };
      const langNames = languages.map((l) => langMap[l] || l);
      if (langNames.length === 1) {
        parts.push(`Responde siempre en ${langNames[0]}.`);
      } else {
        parts.push(`Puedes responder en: ${langNames.join(", ")}. Responde en el idioma en que te escriban.`);
      }
    }
    parts.push("\nFORMATO DE RESPUESTA:");
    parts.push("- Responde en texto plano, sin markdown, sin tablas, sin asteriscos, sin formato especial.");
    parts.push("- Usa saltos de línea para separar ideas.");
    parts.push("- Si necesitas listar información, usa guiones simples (-).");
    if (rules.length > 0) {
      parts.push("\nREGLAS:");
      rules.forEach((r) => parts.push(`- ${r}`));
    }
    if (businessContext.trim()) {
      parts.push(`\nCONTEXTO DEL NEGOCIO:\n${businessContext}`);
    }
    if (dataCollectionEnabled && dataCollectionFields.length > 0) {
      const fieldNames = dataCollectionFields.map((f) => `${f.label}${f.instructions ? ` (${f.instructions})` : ""}`).join(", ");
      const intensityLabel = ["", "muy pasivo", "pasivo", "balanceado", "activo", "muy activo"][dataCollectionIntensity] || "balanceado";
      parts.push(`\nEXTRACCIÓN DE DATOS (intensidad: ${intensityLabel}):`);
      parts.push(`Campos: ${fieldNames}`);
    }
    return parts.join("\n");
  })();

  if (loading) {
    return <div className="flex-1 flex items-center justify-center bg-gray-50"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" /></div>;
  }

  if (!bot) {
    return <div className="flex-1 flex items-center justify-center bg-gray-50"><p className="text-gray-500 text-sm">Bot no encontrado</p></div>;
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(`/${slug}/comunicaciones/bots/${botId}`)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="h-10 w-10 rounded-lg bg-brand-50 flex items-center justify-center">
              <Bot className="h-5 w-5 text-brand-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Configurar Bot</h2>
              <p className="text-sm text-gray-500">{bot.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowPromptPreview(!showPromptPreview)}>
              <Eye className="h-3.5 w-3.5" />
              Ver prompt
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowChat(true)}>
              <Play className="h-3.5 w-3.5" />
              Probar
            </Button>
            <Button size="sm" className="gap-1.5" disabled={saving} onClick={handleSave}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Guardar
            </Button>
          </div>
        </div>
      </div>

      {/* Prompt preview */}
      {showPromptPreview && (
        <div className="mx-6 mt-4 p-4 bg-gray-900 rounded-xl border border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-400">Prompt compilado (lo que recibe el modelo)</span>
            <button onClick={() => setShowPromptPreview(false)} className="text-gray-500 hover:text-gray-300"><X className="h-3.5 w-3.5" /></button>
          </div>
          <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
            {compiledPrompt || "(vacío — configura la identidad del bot)"}
          </pre>
        </div>
      )}

      {/* Content */}
      <div className="p-6 max-w-3xl space-y-6">

        {/* 1. Identity */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <UserCircle className="h-4 w-4 text-brand-600" />
            <h3 className="text-sm font-semibold text-gray-900">Identidad</h3>
          </div>
          <p className="text-xs text-gray-500 mb-4">Define quién es el bot y cómo se comunica.</p>

          <div className="space-y-4">
            {/* Persona */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Nombre / Persona</label>
              <input
                type="text" value={persona} onChange={(e) => setPersona(e.target.value)}
                placeholder="Ej: Laura, Carlos, Asistente Virtual..."
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200"
              />
            </div>

            {/* Role */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Rol</label>
              <div className="flex flex-wrap gap-2">
                {ROLES.map((r) => (
                  <button key={r.value} type="button" onClick={() => setRole(role === r.value ? "" : r.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${role === r.value ? "border-brand-300 bg-brand-50 text-brand-700" : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"}`}
                  >{r.label}</button>
                ))}
              </div>
              {role === "custom" && (
                <input
                  type="text" value={customRole} onChange={(e) => setCustomRole(e.target.value)}
                  placeholder="Escribe el rol personalizado..."
                  className="mt-2 w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200"
                />
              )}
            </div>

            {/* Objective */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Objetivo</label>
              <textarea
                value={objective} onChange={(e) => setObjective(e.target.value)}
                placeholder="Ej: Resolver dudas sobre productos y recopilar datos para agendar una demostración..."
                rows={2}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200 resize-none"
              />
              <p className="text-[10px] text-gray-400 mt-1">Cuando el bot cumpla este objetivo, podrá marcar la conversación como resuelta.</p>
            </div>

            {/* Tone */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Tono de comunicación</label>
              <div className="flex flex-wrap gap-2">
                {TONES.map((t) => (
                  <button key={t.value} type="button" onClick={() => toggleTone(t.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${tone.includes(t.value) ? "border-brand-300 bg-brand-50 text-brand-700" : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"}`}
                  >{t.label}</button>
                ))}
              </div>
            </div>

            {/* Language */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Idiomas de respuesta</label>
              <div className="flex flex-wrap gap-2">
                {LANGUAGES.map((l) => (
                  <button key={l.value} type="button" onClick={() => toggleLanguage(l.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${languages.includes(l.value) ? "border-brand-300 bg-brand-50 text-brand-700" : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"}`}
                  >{l.label}</button>
                ))}
              </div>
              {languages.length > 1 && (
                <p className="text-[10px] text-gray-400 mt-1.5">El bot responderá en el idioma en que le escriban.</p>
              )}
            </div>
          </div>
        </div>

        {/* 2. Rules */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="h-4 w-4 text-brand-600" />
            <h3 className="text-sm font-semibold text-gray-900">Reglas e instrucciones</h3>
          </div>
          <p className="text-xs text-gray-500 mb-4">Define lo que el bot debe hacer y lo que nunca debe hacer.</p>

          {/* Rules list */}
          <div className="space-y-2 mb-3">
            {rules.map((rule, idx) => (
              <div key={idx} className="flex items-start gap-2 group">
                <span className="text-xs text-gray-400 mt-1.5 shrink-0">{idx + 1}.</span>
                <p className="flex-1 text-sm text-gray-700 py-1">{rule}</p>
                <button onClick={() => removeRule(idx)} className="p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-red-50 text-gray-400 hover:text-red-500 transition-all">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>

          {/* Add rule */}
          <div className="flex gap-2">
            <input
              type="text" value={newRule} onChange={(e) => setNewRule(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addRule(); } }}
              placeholder="Ej: Nunca inventar información, Siempre saludar por nombre, No hablar de la competencia..."
              className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200"
            />
            <button onClick={addRule} disabled={!newRule.trim()} className="px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* 3. Knowledge Base */}
        <BotKnowledgePanel botId={botId!} />

        {/* 4. Data Collection */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-brand-600" />
              <h3 className="text-sm font-semibold text-gray-900">Recopilación de datos</h3>
            </div>
            <button
              type="button"
              onClick={() => setDataCollectionEnabled(!dataCollectionEnabled)}
              className={`relative w-9 h-5 rounded-full transition-colors ${dataCollectionEnabled ? "bg-brand-600" : "bg-gray-300"}`}
            >
              <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${dataCollectionEnabled ? "translate-x-4" : ""}`} />
            </button>
          </div>

          {dataCollectionEnabled && (
            <div className="space-y-4">
              <p className="text-xs text-gray-500">El bot extraerá datos del contacto durante la conversación y los guardará automáticamente en el CRM.</p>

              {/* Intensity */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-gray-600">Intensidad de recopilación</label>
                  <span className="text-xs font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                    {dataCollectionIntensity === 1 ? "Muy pasivo" : dataCollectionIntensity === 2 ? "Pasivo" : dataCollectionIntensity === 3 ? "Balanceado" : dataCollectionIntensity === 4 ? "Activo" : "Muy activo"}
                  </span>
                </div>
                <input
                  type="range" min="1" max="5" step="1"
                  value={dataCollectionIntensity}
                  onChange={(e) => setDataCollectionIntensity(parseInt(e.target.value))}
                  className="w-full accent-brand-600"
                />
                <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                  <span>Solo si lo menciona</span>
                  <span>Pregunta siempre</span>
                </div>
              </div>

              {/* Fields */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Campos a recopilar</label>

                {/* Existing fields */}
                <div className="space-y-2 mb-3">
                  {dataCollectionFields.map((f) => (
                    <div key={f.field} className="border border-gray-200 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${f.priority === 1 ? "bg-red-100 text-red-700" : f.priority === 2 ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-600"}`}>
                            {f.priority === 1 ? "Alta" : f.priority === 2 ? "Media" : "Baja"}
                          </span>
                          <span className="text-sm font-medium text-gray-900">{f.label}</span>
                          <span className="text-[10px] text-gray-400 font-mono">{f.field}</span>
                        </div>
                        <button onClick={() => removeDataField(f.field)} className="p-1 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={f.instructions}
                          onChange={(e) => updateDataField(f.field, { instructions: e.target.value })}
                          placeholder="Instrucciones específicas (opcional)..."
                          className="flex-1 px-2 py-1 rounded border border-gray-200 text-xs text-gray-700 focus:outline-none focus:border-brand-300"
                        />
                        <div className="flex gap-0.5 shrink-0">
                          {[1, 2, 3].map((p) => (
                            <button key={p} type="button" onClick={() => updateDataField(f.field, { priority: p })}
                              className={`w-5 h-5 rounded text-[9px] font-bold transition-colors ${f.priority === p ? (p === 1 ? "bg-red-100 text-red-700" : p === 2 ? "bg-yellow-100 text-yellow-700" : "bg-gray-200 text-gray-600") : "bg-gray-50 text-gray-400 hover:bg-gray-100"}`}
                            >{p}</button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add field dropdown */}
                <AddFieldDropdown
                  existingFields={dataCollectionFields.map((f) => f.field)}
                  onAdd={addDataField}
                  tenantId={tenantId}
                />
              </div>
            </div>
          )}
        </div>

        {/* 5. Behavior */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare className="h-4 w-4 text-brand-600" />
            <h3 className="text-sm font-semibold text-gray-900">Mensajes automáticos</h3>
          </div>
          <div className="space-y-4">
            {/* Reply delay */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-gray-600">Tiempo de espera antes de responder</label>
                <span className="text-xs font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                  {replyDelay === 0 ? "Inmediato" : `${replyDelay}s`}
                </span>
              </div>
              <input
                type="range" min="0" max="15" step="1"
                value={replyDelay}
                onChange={(e) => setReplyDelay(parseInt(e.target.value))}
                className="w-full accent-brand-600"
              />
              <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                <span>Inmediato</span>
                <span>15 segundos</span>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">Espera a que el usuario termine de escribir antes de responder. Útil cuando envían varios mensajes seguidos.</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Mensaje de bienvenida</label>
              <textarea value={welcomeMessage} onChange={(e) => setWelcomeMessage(e.target.value)} placeholder="Hola 👋 ¿En qué puedo ayudarte hoy?" rows={2} className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200 resize-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Mensaje de fallback</label>
              <textarea value={fallbackMessage} onChange={(e) => setFallbackMessage(e.target.value)} placeholder="Lo siento, no pude procesar tu mensaje. ¿Puedes intentarlo de nuevo?" rows={2} className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200 resize-none" />
            </div>

            {/* Schedule */}
            <div className="border-t border-gray-100 pt-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-xs font-medium text-gray-700">Horario de atención</p>
                  <p className="text-[10px] text-gray-400">Fuera de horario el bot no responde y envía un mensaje automático</p>
                </div>
                <button type="button" onClick={() => setScheduleEnabled(!scheduleEnabled)} className={`relative w-9 h-5 rounded-full transition-colors ${scheduleEnabled ? "bg-brand-600" : "bg-gray-300"}`}>
                  <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${scheduleEnabled ? "translate-x-4" : ""}`} />
                </button>
              </div>
              {scheduleEnabled && (
                <div className="mt-3 space-y-3">
                  <label className="block text-[10px] text-gray-500 mb-1">Mensaje fuera de horario</label>
                  <input type="text" value={scheduleOffMessage} onChange={(e) => setScheduleOffMessage(e.target.value)} placeholder="Estamos fuera de horario. Te responderemos pronto." className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-800 focus:outline-none focus:border-brand-300" />

                  <div className="space-y-1.5">
                    {Object.entries(scheduleDays).map(([day, config]) => (
                      <div key={day} className="flex items-center gap-2">
                        <button type="button" onClick={() => setScheduleDays((prev) => ({ ...prev, [day]: { ...prev[day], active: !prev[day].active } }))}
                          className={`relative w-7 h-4 rounded-full transition-colors shrink-0 ${config.active ? "bg-brand-600" : "bg-gray-300"}`}
                        >
                          <span className={`absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${config.active ? "translate-x-3" : ""}`} />
                        </button>
                        <span className="text-xs text-gray-700 w-20 capitalize">{day}</span>
                        {config.active && (
                          <>
                            <input type="time" value={config.start} onChange={(e) => setScheduleDays((prev) => ({ ...prev, [day]: { ...prev[day], start: e.target.value } }))} className="px-1.5 py-1 rounded border border-gray-200 text-[10px] focus:outline-none focus:border-brand-300" />
                            <span className="text-[10px] text-gray-400">a</span>
                            <input type="time" value={config.end} onChange={(e) => setScheduleDays((prev) => ({ ...prev, [day]: { ...prev[day], end: e.target.value } }))} className="px-1.5 py-1 rounded border border-gray-200 text-[10px] focus:outline-none focus:border-brand-300" />
                          </>
                        )}
                        {!config.active && <span className="text-[10px] text-gray-400">Inactivo</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Rate Limit */}
            <div className="border-t border-gray-100 pt-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-xs font-medium text-gray-700">Límite de mensajes por contacto</p>
                  <p className="text-[10px] text-gray-400">Evita consumo excesivo de créditos por un solo contacto</p>
                </div>
              </div>
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <label className="block text-[10px] text-gray-500 mb-1">Máximo mensajes</label>
                  <input type="number" min={0} max={200} value={rateLimitMax} onChange={(e) => setRateLimitMax(parseInt(e.target.value) || 0)} placeholder="0 = sin límite" className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:border-brand-300" />
                </div>
                <div className="flex-1">
                  <label className="block text-[10px] text-gray-500 mb-1">En ventana de (min)</label>
                  <input type="number" min={1} max={1440} value={rateLimitWindow} onChange={(e) => setRateLimitWindow(parseInt(e.target.value) || 60)} className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:border-brand-300" />
                </div>
              </div>
              {rateLimitMax > 0 && (
                <div className="mt-2">
                  <label className="block text-[10px] text-gray-500 mb-1">Mensaje cuando se excede el límite</label>
                  <input type="text" value={rateLimitMessage} onChange={(e) => setRateLimitMessage(e.target.value)} placeholder="Has alcanzado el límite de mensajes. Intenta más tarde." className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-800 focus:outline-none focus:border-brand-300" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 5. Conversation Control */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <RefreshCw className="h-4 w-4 text-brand-600" />
            <h3 className="text-sm font-semibold text-gray-900">Control de conversación</h3>
          </div>
          <p className="text-xs text-gray-500 mb-4">Configura cuándo el bot deja de responder y transfiere a un agente humano.</p>

          <div className="space-y-4">
            {/* Max messages */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-gray-600">Máximo de mensajes del bot</label>
                <span className="text-xs font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                  {maxBotMessages === 0 ? "Sin límite" : maxBotMessages}
                </span>
              </div>
              <input type="range" min="0" max="50" step="1" value={maxBotMessages} onChange={(e) => setMaxBotMessages(parseInt(e.target.value))} className="w-full accent-brand-600" />
              <div className="flex justify-between text-[10px] text-gray-400 mt-0.5"><span>Sin límite</span><span>50 mensajes</span></div>
              <p className="text-[10px] text-gray-400 mt-1">Después de este número de respuestas, el bot se pausa y espera intervención humana.</p>
            </div>

            {/* Handoff keywords */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Palabras clave de transferencia</label>
              <p className="text-[10px] text-gray-400 mb-2">Si el contacto escribe alguna de estas palabras, el bot se desactiva y transfiere a un humano.</p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {handoffKeywords.map((kw, i) => (
                  <span key={i} className="flex items-center gap-1 px-2 py-1 rounded-md bg-gray-100 text-xs text-gray-700">
                    {kw}
                    <button onClick={() => setHandoffKeywords((prev) => prev.filter((_, idx) => idx !== i))} className="text-gray-400 hover:text-red-500">
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input type="text" value={newKeyword} onChange={(e) => setNewKeyword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && newKeyword.trim()) { e.preventDefault(); setHandoffKeywords((prev) => [...prev, newKeyword.trim()]); setNewKeyword(""); } }}
                  placeholder="Ej: agente, humano, persona..."
                  className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200"
                />
                <button onClick={() => { if (newKeyword.trim()) { setHandoffKeywords((prev) => [...prev, newKeyword.trim()]); setNewKeyword(""); } }} disabled={!newKeyword.trim()} className="px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors disabled:opacity-40">
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Handoff message */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Mensaje al transferir</label>
              <textarea value={handoffMessage} onChange={(e) => setHandoffMessage(e.target.value)} placeholder="Te conecto con un agente humano. Un momento por favor..." rows={2} className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200 resize-none" />
            </div>

            {/* On resolved actions */}
            <div className="border-t border-gray-100 pt-4 mt-4">
              <label className="block text-xs font-medium text-gray-600 mb-2">Al cumplir el objetivo</label>
              <p className="text-[10px] text-gray-400 mb-3">Acciones automáticas cuando el bot marca la conversación como resuelta.</p>
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] text-gray-500 mb-1">Cambiar estado del contacto a:</label>
                  <MiniSelect value={onResolvedStatus} onChange={setOnResolvedStatus} options={["", "lead", "contactado", "interesado", "oportunidad", "cliente", "premium", "fidelizado", "inactivo", "perdido"]} labels={{ "": "Sin cambio", lead: "Lead", contactado: "Contactado", interesado: "Interesado", oportunidad: "Oportunidad", cliente: "Cliente", premium: "Premium", fidelizado: "Fidelizado", inactivo: "Inactivo", perdido: "Perdido" }} />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 mb-1">Agregar etiquetas a la conversación:</label>
                  <div className="flex flex-wrap gap-1.5">
                    {availableLabels.map((lbl) => (
                      <button key={lbl.id} type="button" onClick={() => setOnResolvedLabelIds((prev) => prev.includes(lbl.id) ? prev.filter((id) => id !== lbl.id) : [...prev, lbl.id])}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${onResolvedLabelIds.includes(lbl.id) ? "border-brand-300 bg-brand-50 text-brand-700" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}
                      >
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: lbl.color || '#9ca3af' }} />
                        {lbl.label}
                      </button>
                    ))}
                    {availableLabels.length === 0 && <p className="text-[10px] text-gray-400">No hay etiquetas creadas</p>}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 6. Tools */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Wrench className="h-4 w-4 text-brand-600" />
              <h3 className="text-sm font-semibold text-gray-900">Herramientas</h3>
            </div>
            <button type="button" onClick={() => { setEditingTool(null); setShowToolForm(true); }} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-dashed border-gray-300 text-xs text-gray-500 hover:border-gray-400 hover:text-gray-600 transition-colors">
              <Plus className="h-3 w-3" /> Agregar
            </button>
          </div>
          <p className="text-xs text-gray-500 mb-4">Las herramientas permiten al bot ejecutar acciones durante la conversación (consultar APIs, buscar datos, etc.).</p>

          {tools.length === 0 ? (
            <div className="text-center py-6 border border-dashed border-gray-200 rounded-lg">
              <Wrench className="h-6 w-6 text-gray-300 mx-auto mb-2" />
              <p className="text-xs text-gray-400">No hay herramientas configuradas</p>
            </div>
          ) : (
            <div className="space-y-2">
              {tools.map((tool) => (
                <div key={tool.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg group">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${tool.executionType === "webhook" ? "bg-blue-50" : "bg-amber-50"}`}>
                      {tool.executionType === "webhook" ? <Globe className="h-3.5 w-3.5 text-blue-600" /> : <FileText className="h-3.5 w-3.5 text-amber-600" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 truncate">{tool.name}</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${tool.isEnabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                          {tool.isEnabled ? "activa" : "inactiva"}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 truncate">{tool.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={async () => { try { const { data } = await api.post(`/bots/tools/${tool.id}/test`, { args: {}, contactData: {} }); toast.success(`✓ ${data.duration}ms${data.success ? '' : ' (error)'}`); } catch { toast.error('Error al probar'); } }} className="p-1.5 rounded-md hover:bg-green-50 text-gray-400 hover:text-green-600" title="Probar"><Play className="h-3 w-3" /></button>
                    <button onClick={() => { setEditingTool(tool); setShowToolForm(true); }} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600"><Pencil className="h-3 w-3" /></button>
                    <button onClick={async () => { await api.delete(`/bots/tools/${tool.id}`); setTools((prev) => prev.filter((t) => t.id !== tool.id)); }} className="p-1.5 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500"><Trash2 className="h-3 w-3" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tool Form Modal */}
        {showToolForm && (
          <ToolFormModal
            tool={editingTool}
            botId={botId!}
            tenantId={tenantId}
            onClose={() => setShowToolForm(false)}
            onSaved={(saved) => {
              if (editingTool) {
                setTools((prev) => prev.map((t) => t.id === saved.id ? saved : t));
              } else {
                setTools((prev) => [...prev, saved]);
              }
              setShowToolForm(false);
            }}
          />
        )}

        {/* Tool Logs */}
        <BotToolLogsPanel botId={botId!} />

        {/* 7. Model & Parameters */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Cpu className="h-4 w-4 text-brand-600" />
            <h3 className="text-sm font-semibold text-gray-900">Modelo y parámetros</h3>
          </div>

          <div className="space-y-4">
            {/* Routing variant */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Modo de enrutamiento</label>
              <div className="grid grid-cols-4 gap-2">
                {ROUTING_VARIANTS.map((v) => (
                  <button key={v.value} type="button" onClick={() => setVariant(v.value)}
                    className={`flex flex-col items-center gap-1 px-3 py-2.5 rounded-lg border text-center transition-colors ${variant === v.value ? "border-brand-300 bg-brand-50 ring-1 ring-brand-200" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"}`}
                  >
                    <span className="text-sm">{v.icon}</span>
                    <span className={`text-xs font-medium ${variant === v.value ? "text-brand-700" : "text-gray-700"}`}>{v.label}</span>
                    <span className="text-[10px] text-gray-400 leading-tight">{v.description}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-gray-600">Temperatura</label>
                <span className="text-xs font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{temperature.toFixed(2)}</span>
              </div>
              <input type="range" min="0" max="2" step="0.05" value={temperature} onChange={(e) => setTemperature(parseFloat(e.target.value))} className="w-full accent-brand-600" />
              <div className="flex justify-between text-[10px] text-gray-400 mt-0.5"><span>Preciso (0)</span><span>Creativo (2)</span></div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Máximo de tokens por respuesta</label>
              <input type="number" min={1} max={16384} value={maxTokens} onChange={(e) => setMaxTokens(Math.max(1, Math.min(16384, parseInt(e.target.value) || 1024)))} className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-gray-600">Mensajes de contexto</label>
                <span className="text-xs font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{contextMessages}</span>
              </div>
              <input type="range" min="1" max="50" step="1" value={contextMessages} onChange={(e) => setContextMessages(parseInt(e.target.value))} className="w-full accent-brand-600" />
              <div className="flex justify-between text-[10px] text-gray-400 mt-0.5"><span>1 mensaje</span><span>50 mensajes</span></div>
              <p className="text-[10px] text-gray-400 mt-1">Cantidad de mensajes recientes del historial que el bot recibe como contexto. Más contexto = mejor memoria, más tokens consumidos.</p>
            </div>
          </div>
        </div>

        {/* 6. Advanced */}
        <details className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <summary className="px-6 py-4 cursor-pointer flex items-center gap-2 hover:bg-gray-50 transition-colors">
            <ChevronDown className="h-4 w-4 text-gray-400" />
            <span className="text-sm font-semibold text-gray-900">Avanzado</span>
            <span className="text-xs text-gray-400 ml-2">System prompt manual (sobreescribe la configuración guiada)</span>
          </summary>
          <div className="px-6 pb-6 pt-2">
            <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg mb-3">
              ⚠️ Si escribes un prompt aquí, se usará directamente en lugar de la configuración de arriba (identidad, reglas, conocimiento).
            </p>
            <textarea
              value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Deja vacío para usar la configuración guiada..."
              rows={6}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200 resize-y font-mono"
            />
          </div>
        </details>
      </div>

      {/* Chat modal */}
      <BotChatModal open={showChat} onClose={() => setShowChat(false)} botId={botId!} botName={bot.name} />
    </div>
  );
}
