import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Bot, Save, Loader2, Cpu, MessageSquare,
  Search, Check, X, Play, Plus, Trash2, UserCircle,
  BookOpen, Shield, ChevronDown, Eye, ClipboardList,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BotChatModal } from "@/components/BotChatModal";
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
  tone: string[];
  language: string;
  rules: string[];
  businessContext: string | null;
  dataCollectionEnabled: boolean;
  dataCollectionMode: string;
  dataCollectionFields: string[];
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

const DATA_FIELDS = [
  { value: "firstName", label: "Nombre" },
  { value: "lastName", label: "Apellido" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Teléfono" },
  { value: "company", label: "Empresa" },
  { value: "city", label: "Ciudad" },
  { value: "jobTitle", label: "Cargo" },
  { value: "address", label: "Dirección" },
  { value: "birthDate", label: "Fecha de nacimiento" },
];

const ROUTING_VARIANTS = [
  { value: "", label: "Standard", icon: "⚖️", description: "Precio y velocidad" },
  { value: "nitro", label: "Nitro", icon: "⚡", description: "Máxima velocidad" },
  { value: "exacto", label: "Exacto", icon: "🎯", description: "Calidad tool-calling" },
  { value: "floor", label: "Floor", icon: "💰", description: "Precio más bajo" },
];

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

// ─── Main Component ──────────────────────────────────────────────

export function BotConfig() {
  const { botId, slug } = useParams();
  const navigate = useNavigate();
  const [bot, setBot] = useState<BotData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showPromptPreview, setShowPromptPreview] = useState(false);

  // Identity
  const [persona, setPersona] = useState("");
  const [role, setRole] = useState("");
  const [customRole, setCustomRole] = useState("");
  const [tone, setTone] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>(["es"]);

  // Rules
  const [rules, setRules] = useState<string[]>([]);
  const [newRule, setNewRule] = useState("");

  // Knowledge
  const [businessContext, setBusinessContext] = useState("");

  // Data Collection
  const [dataCollectionEnabled, setDataCollectionEnabled] = useState(false);
  const [dataCollectionIntensity, setDataCollectionIntensity] = useState(3);
  const [dataCollectionFields, setDataCollectionFields] = useState<string[]>([]);

  // Behavior
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [fallbackMessage, setFallbackMessage] = useState("");

  // Advanced
  const [systemPrompt, setSystemPrompt] = useState("");
  const [model, setModel] = useState("");
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
      setTone(data.tone || []);
      setLanguages(data.language ? data.language.split(",") : ["es"]);
      setRules(data.rules || []);
      setBusinessContext(data.businessContext || "");
      setDataCollectionEnabled(data.dataCollectionEnabled || false);
      setDataCollectionIntensity(parseInt(data.dataCollectionMode) || 3);
      setDataCollectionFields(data.dataCollectionFields || []);
      setWelcomeMessage(data.welcomeMessage || "");
      setFallbackMessage(data.fallbackMessage || "");
      setSystemPrompt(data.systemPrompt || "");
      const savedModel = data.model || "";
      const colonIdx = savedModel.lastIndexOf(":");
      if (colonIdx > 0 && !savedModel.substring(colonIdx).includes("/")) {
        setModel(savedModel.substring(0, colonIdx));
        setVariant(savedModel.substring(colonIdx + 1));
      } else {
        setModel(savedModel);
        setVariant("");
      }
      setTemperature(Number(data.temperature) || 0.7);
      setMaxTokens(data.maxTokens || 1024);
    } catch { toast.error("Error al cargar el bot"); }
    finally { setLoading(false); }
  };

  const handleSave = async () => {
    if (!botId) return;
    setSaving(true);
    try {
      const fullModel = model ? (variant ? `${model}:${variant}` : model) : null;
      const { data } = await api.put<BotData>(`/bots/${botId}`, {
        persona: persona.trim() || null,
        role: role === "custom" ? (customRole.trim() || null) : (role || null),
        tone,
        language: languages.join(","),
        rules,
        businessContext: businessContext.trim() || null,
        dataCollectionEnabled,
        dataCollectionMode: String(dataCollectionIntensity),
        dataCollectionFields,
        welcomeMessage: welcomeMessage.trim() || null,
        fallbackMessage: fallbackMessage.trim() || null,
        systemPrompt: systemPrompt.trim() || null,
        model: fullModel,
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

  const toggleDataField = (f: string) => {
    setDataCollectionFields((prev) => prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]);
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
      const fieldLabels: Record<string, string> = { firstName: "nombre", lastName: "apellido", email: "email", phone: "teléfono", company: "empresa", city: "ciudad", jobTitle: "cargo", address: "dirección", birthDate: "fecha de nacimiento" };
      const fieldNames = dataCollectionFields.map((f) => fieldLabels[f] || f).join(", ");
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

        {/* 3. Knowledge */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <BookOpen className="h-4 w-4 text-brand-600" />
            <h3 className="text-sm font-semibold text-gray-900">Conocimiento</h3>
          </div>
          <p className="text-xs text-gray-500 mb-3">Información del negocio que el bot usará para responder (productos, servicios, horarios, FAQs).</p>
          <textarea
            value={businessContext} onChange={(e) => setBusinessContext(e.target.value)}
            placeholder="Ej: Somos una tienda de ropa online. Horarios de atención: Lunes a Viernes 8am-6pm. Envíos gratis a partir de $100.000. Política de devolución: 30 días..."
            rows={6}
            className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200 resize-y"
          />
        </div>

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
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Campos a recopilar</label>
                <div className="flex flex-wrap gap-2">
                  {DATA_FIELDS.map((f) => (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => toggleDataField(f.value)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${dataCollectionFields.includes(f.value) ? "border-brand-300 bg-brand-50 text-brand-700" : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"}`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
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
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Mensaje de bienvenida</label>
              <textarea value={welcomeMessage} onChange={(e) => setWelcomeMessage(e.target.value)} placeholder="Hola 👋 ¿En qué puedo ayudarte hoy?" rows={2} className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200 resize-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Mensaje de fallback</label>
              <textarea value={fallbackMessage} onChange={(e) => setFallbackMessage(e.target.value)} placeholder="Lo siento, no pude procesar tu mensaje. ¿Puedes intentarlo de nuevo?" rows={2} className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200 resize-none" />
            </div>
          </div>
        </div>

        {/* 5. Model & Parameters */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Cpu className="h-4 w-4 text-brand-600" />
            <h3 className="text-sm font-semibold text-gray-900">Modelo y parámetros</h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Modelo (OpenRouter)</label>
              <ModelSelector value={model} onChange={setModel} />
            </div>

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
