import { useEffect, useRef, useState } from "react";
import { Save, Loader2, CheckCircle2, Plus, Trash2, Zap, User, ImagePlus } from "lucide-react";
import { api } from "@/services/api";
import { DropdownSelect } from "./ui/dropdown-select";

// ── Tipos ──────────────────────────────────────────────────────────────
type MatchType = "exact" | "contains" | "startsWith";

interface AutomationAction {
  type: string;
  value?: any;
  message?: string;
  // Campos para "reply_template" (responder con plantilla de WhatsApp)
  templateName?: string;
  templateLanguage?: string;
  templateCategory?: string;
  templateComponents?: any[];
  // Valores configurados para las variables de la plantilla. Claves:
  //   body_1, body_2...  → variables {{n}} del cuerpo
  //   header_1...        → variables {{n}} de un header de texto
  //   button_<idx>       → parámetro dinámico de un botón (URL/copy_code)
  //   header_media       → URL de la imagen/video/documento del header
  // El valor puede ser texto fijo o un placeholder de contacto ({{firstName}}).
  templateVariables?: Record<string, string>;
}

// Campos del contacto que se pueden insertar como variables dinámicas.
// Se resuelven en el backend al momento de enviar la plantilla.
const CONTACT_FIELDS = [
  { key: "{{firstName}}", label: "Nombre" },
  { key: "{{lastName}}", label: "Apellido" },
  { key: "{{fullName}}", label: "Nombre completo" },
  { key: "{{phone}}", label: "Teléfono" },
  { key: "{{email}}", label: "Email" },
];

// Plantilla de WhatsApp devuelta por Meta (endpoint /chats/whatsapp/templates)
interface WhatsAppTemplate {
  name: string;
  language: string;
  status: string;
  category: string;
  components: any[];
}

interface AutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  matchType: MatchType;
  keywords: string[];
  actions: AutomationAction[];
}

// Estados de contacto disponibles (coincide con SYSTEM_FIELDS del backend).
const CONTACT_STATUSES = [
  "lead", "contactado", "interesado", "oportunidad",
  "cliente", "premium", "fidelizado", "inactivo", "perdido",
];

const CONVERSATION_STATUSES = ["open", "resolved", "archived"];

// Catálogo de tipos de acción con su etiqueta y qué input necesitan.
const ACTION_TYPES: Array<{
  type: string;
  label: string;
  input: "status" | "boolean" | "text" | "conversationStatus" | "message" | "agent" | "team" | "template" | "none";
  whatsappOnly?: boolean;
}> = [
  { type: "set_status", label: "Cambiar estado del contacto", input: "status" },
  { type: "set_opt_in_whatsapp", label: "Opt-in WhatsApp", input: "boolean" },
  { type: "set_opt_in_email", label: "Opt-in Email", input: "boolean" },
  { type: "add_tag", label: "Agregar etiqueta", input: "text" },
  { type: "remove_tag", label: "Quitar etiqueta", input: "text" },
  { type: "set_conversation_status", label: "Estado de la conversación", input: "conversationStatus" },
  { type: "reply", label: "Responder mensaje", input: "message" },
  { type: "reply_template", label: "Responder con plantilla", input: "template", whatsappOnly: true },
  { type: "assign_agent", label: "Asignar a agente", input: "agent" },
  { type: "assign_team", label: "Asignar a equipo", input: "team" },
];

const MATCH_LABELS: Record<MatchType, string> = {
  exact: "Coincidencia exacta",
  contains: "Contiene",
  startsWith: "Empieza con",
};

interface Member { userId: string; user?: { id: string; name: string; email: string } }
interface Team { id: string; name: string }

const uid = () => `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

// ── Helpers de plantillas ───────────────────────────────────────────────
const countVars = (text?: string): number => (text ? (text.match(/\{\{\d+\}\}/g) || []).length : 0);

interface TemplateField {
  key: string;        // clave en templateVariables (body_1, header_1, button_0, header_media)
  label: string;      // etiqueta legible
  kind: "text" | "media";
  format?: string;    // IMAGE | VIDEO | DOCUMENT (solo media)
  example?: string;   // valor de ejemplo de la plantilla
}

/**
 * Analiza la definición de una plantilla (components de Meta) y devuelve la lista
 * de campos configurables (variables de header/body/botones y media del header).
 */
function getTemplateFields(components?: any[]): TemplateField[] {
  if (!Array.isArray(components)) return [];
  const fields: TemplateField[] = [];
  for (const comp of components) {
    const type = String(comp?.type || "").toUpperCase();
    if (type === "HEADER") {
      const format = String(comp?.format || "TEXT").toUpperCase();
      if (["IMAGE", "VIDEO", "DOCUMENT"].includes(format)) {
        fields.push({
          key: "header_media",
          label: format === "IMAGE" ? "Imagen del encabezado" : format === "VIDEO" ? "Video del encabezado" : "Documento del encabezado",
          kind: "media",
          format,
          example: comp?.example?.header_handle?.[0],
        });
      } else {
        const n = countVars(comp?.text);
        const ex: string[] = comp?.example?.header_text || [];
        for (let i = 0; i < n; i++) {
          fields.push({ key: `header_${i + 1}`, label: `Encabezado · variable {{${i + 1}}}`, kind: "text", example: ex[i] });
        }
      }
    } else if (type === "BODY") {
      const n = countVars(comp?.text);
      const ex: string[] = comp?.example?.body_text?.[0] || [];
      for (let i = 0; i < n; i++) {
        fields.push({ key: `body_${i + 1}`, label: `Cuerpo · variable {{${i + 1}}}`, kind: "text", example: ex[i] });
      }
    } else if (type === "BUTTONS") {
      const buttons: any[] = Array.isArray(comp?.buttons) ? comp.buttons : [];
      buttons.forEach((btn, idx) => {
        const btnType = String(btn?.type || "").toUpperCase();
        if (btnType === "URL" && countVars(btn?.url) > 0) {
          const ex = Array.isArray(btn?.example) ? btn.example[0] : btn?.example;
          fields.push({ key: `button_${idx}`, label: `Botón "${btn?.text || idx + 1}" · URL dinámica`, kind: "text", example: ex });
        } else if (btnType === "COPY_CODE") {
          const ex = Array.isArray(btn?.example) ? btn.example[0] : btn?.example;
          fields.push({ key: `button_${idx}`, label: `Botón "${btn?.text || idx + 1}" · código`, kind: "text", example: ex });
        }
      });
    }
  }
  return fields;
}

/** Selector para insertar un campo dinámico del contacto en una variable. */
function ContactFieldPicker({ onSelect }: { onSelect: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-[30px] px-2 border border-border rounded-md text-muted-foreground hover:text-brand-600 hover:border-brand-300 transition-colors shrink-0"
        title="Insertar campo del contacto"
      >
        <User className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-44 bg-popover text-popover-foreground rounded-lg shadow-lg border border-border py-1 z-[100]">
          <p className="px-3 py-1 text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Campo del contacto</p>
          {CONTACT_FIELDS.map((field) => (
            <button
              key={field.key}
              type="button"
              onClick={() => { onSelect(field.key); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-muted transition-colors text-left"
            >
              <span className="text-muted-foreground">⊕</span>
              {field.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Editor de las variables de una plantilla dentro de una acción "reply_template".
 * Cada variable puede recibir texto fijo o un placeholder de contacto. Para el
 * header media se puede subir una imagen o pegar una URL pública.
 */
function TemplateVarsEditor({
  fields,
  values,
  onChange,
}: {
  fields: TemplateField[];
  values: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  const [uploading, setUploading] = useState<string | null>(null);
  const setVal = (key: string, val: string) => onChange({ ...values, [key]: val });

  const uploadMedia = async (key: string, file: File) => {
    setUploading(key);
    try {
      const formData = new FormData();
      formData.append("file", file);
      // Guarda el archivo y devuelve una URL pública reutilizable como header.
      const { data } = await api.post("/chats/media/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setVal(key, data.url || "");
    } catch {
      // Silencioso: el usuario puede pegar una URL manualmente.
    } finally {
      setUploading(null);
    }
  };

  return (
    <div className="mt-2 ml-1 pl-3 border-l-2 border-brand-200 space-y-2.5">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Variables de la plantilla</p>
      {fields.map((f) => (
        <div key={f.key}>
          <label className="block text-[11px] text-muted-foreground mb-1">{f.label}</label>
          {f.kind === "media" ? (
            <div className="space-y-1">
              {values[f.key] ? (
                <div className="flex items-center gap-2">
                  {f.format === "IMAGE" ? (
                    <img src={values[f.key]} alt="" className="h-10 w-10 rounded object-cover border border-border" />
                  ) : (
                    <span className="text-[11px] text-green-600">Archivo cargado ✓</span>
                  )}
                  <button type="button" onClick={() => setVal(f.key, "")} className="text-[11px] text-red-500 hover:underline ml-auto">Quitar</button>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-1.5 h-9 border border-dashed border-border rounded-md cursor-pointer hover:border-brand-300 text-[11px] text-muted-foreground hover:text-brand-600 transition-colors">
                  <input
                    type="file"
                    className="hidden"
                    accept={f.format === "IMAGE" ? "image/*" : f.format === "VIDEO" ? "video/*" : "*"}
                    onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadMedia(f.key, file); }}
                  />
                  {uploading === f.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
                  {uploading === f.key ? "Subiendo..." : "Subir archivo"}
                </label>
              )}
              <input
                type="url"
                value={values[f.key] || ""}
                onChange={(e) => setVal(f.key, e.target.value)}
                placeholder="O pega una URL pública https://..."
                className="w-full px-2 py-1.5 rounded-md border border-border text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          ) : (
            <div className="flex gap-1.5">
              <input
                type="text"
                value={values[f.key] || ""}
                onChange={(e) => setVal(f.key, e.target.value)}
                placeholder={f.example ? `Ej: ${f.example}` : "Escribe el valor..."}
                className="flex-1 px-2 py-1.5 rounded-md border border-border text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <ContactFieldPicker onSelect={(v) => setVal(f.key, v)} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Constructor de automatizaciones por palabra clave para un canal.
 * Reglas: cuando el mensaje entrante coincide con las palabras clave (según
 * matchType), ejecuta las acciones configuradas sobre el contacto/conversación.
 */
export function AutomationsSection({ inboxId, tenantId }: { inboxId: string; tenantId: string }) {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [channel, setChannel] = useState<string>("");
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [keywordInputs, setKeywordInputs] = useState<Record<string, string>>({});

  const isWhatsApp = channel === "whatsapp";

  useEffect(() => {
    setLoading(true);
    api.get(`/chats/inboxes/${inboxId}`)
      .then(({ data }) => {
        setChannel(data.channel || "");
        const existing = Array.isArray(data.metadata?.automations) ? data.metadata.automations : [];
        setRules(existing.map((r: any) => ({
          id: r.id || uid(),
          name: r.name || "Automatización",
          enabled: r.enabled !== false,
          matchType: (["exact", "contains", "startsWith"].includes(r.matchType) ? r.matchType : "exact") as MatchType,
          keywords: Array.isArray(r.keywords) ? r.keywords : [],
          actions: Array.isArray(r.actions) ? r.actions : [],
        })));
      })
      .finally(() => setLoading(false));
    // Cargar agentes y equipos para los selectores de asignación
    api.get(`/tenants/${tenantId}/members`).then(({ data }) => setMembers(data || [])).catch(() => {});
    api.get(`/teams`, { params: { tenantId } }).then(({ data }) => setTeams(data || [])).catch(() => {});
  }, [inboxId, tenantId]);

  // Cargar plantillas de WhatsApp solo cuando el canal es WhatsApp.
  useEffect(() => {
    if (channel !== "whatsapp") return;
    api.get<WhatsAppTemplate[]>(`/chats/whatsapp/templates`, { params: { inboxId } })
      .then(({ data }) => setTemplates(Array.isArray(data) ? data.filter((t) => t.status === "APPROVED") : []))
      .catch(() => {});
  }, [channel, inboxId]);

  const markDirty = () => setSaved(false);

  const updateRule = (id: string, patch: Partial<AutomationRule>) => {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    markDirty();
  };

  const addRule = () => {
    setRules((prev) => [...prev, { id: uid(), name: `Regla ${prev.length + 1}`, enabled: true, matchType: "exact", keywords: [], actions: [] }]);
    markDirty();
  };

  const removeRule = (id: string) => {
    setRules((prev) => prev.filter((r) => r.id !== id));
    markDirty();
  };

  const addKeyword = (ruleId: string) => {
    const kw = (keywordInputs[ruleId] || "").trim();
    if (!kw) return;
    setRules((prev) => prev.map((r) => {
      if (r.id !== ruleId) return r;
      if (r.keywords.some((k) => k.toLowerCase() === kw.toLowerCase())) return r;
      return { ...r, keywords: [...r.keywords, kw] };
    }));
    setKeywordInputs((prev) => ({ ...prev, [ruleId]: "" }));
    markDirty();
  };

  const removeKeyword = (ruleId: string, kw: string) => {
    setRules((prev) => prev.map((r) => (r.id === ruleId ? { ...r, keywords: r.keywords.filter((k) => k !== kw) } : r)));
    markDirty();
  };

  const addAction = (ruleId: string) => {
    setRules((prev) => prev.map((r) => (r.id === ruleId ? { ...r, actions: [...r.actions, { type: "set_status", value: "cliente" }] } : r)));
    markDirty();
  };

  const updateAction = (ruleId: string, idx: number, patch: Partial<AutomationAction>) => {
    setRules((prev) => prev.map((r) => {
      if (r.id !== ruleId) return r;
      const actions = r.actions.map((a, i) => (i === idx ? { ...a, ...patch } : a));
      return { ...r, actions };
    }));
    markDirty();
  };

  const removeAction = (ruleId: string, idx: number) => {
    setRules((prev) => prev.map((r) => (r.id === ruleId ? { ...r, actions: r.actions.filter((_, i) => i !== idx) } : r)));
    markDirty();
  };

  // Al cambiar el tipo de acción, inicializa un valor por defecto sensato.
  const changeActionType = (ruleId: string, idx: number, type: string) => {
    let patch: Partial<AutomationAction> = { type, value: undefined, message: undefined, templateName: undefined, templateLanguage: undefined, templateCategory: undefined, templateComponents: undefined };
    if (type === "set_status") patch.value = "cliente";
    else if (type === "set_opt_in_whatsapp" || type === "set_opt_in_email") patch.value = false;
    else if (type === "set_conversation_status") patch.value = "resolved";
    else if (type === "add_tag" || type === "remove_tag") patch.value = "";
    else if (type === "reply") patch.message = "";
    else if (type === "reply_template") {
      patch = { type, value: undefined, message: undefined, templateName: "", templateLanguage: "", templateCategory: "", templateComponents: undefined };
    }
    updateAction(ruleId, idx, patch);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/chats/inboxes/${inboxId}/automations`, { rules });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {} finally { setSaving(false); }
  };

  const renderActionInput = (ruleId: string, idx: number, action: AutomationAction) => {
    const def = ACTION_TYPES.find((a) => a.type === action.type);
    if (!def) return null;
    const inputCls = "px-2 py-1.5 rounded-md border border-border text-xs focus:outline-none focus:ring-2 focus:ring-brand-500";
    const ddCls = "min-w-[140px] [&>button]:py-1.5 [&>button]:text-xs";
    switch (def.input) {
      case "status":
        return (
          <DropdownSelect
            className={ddCls}
            value={action.value || ""}
            onChange={(v) => updateAction(ruleId, idx, { value: v })}
            options={CONTACT_STATUSES.map((s) => ({ value: s, label: s }))}
          />
        );
      case "conversationStatus":
        return (
          <DropdownSelect
            className={ddCls}
            value={action.value || ""}
            onChange={(v) => updateAction(ruleId, idx, { value: v })}
            options={CONVERSATION_STATUSES.map((s) => ({ value: s, label: s }))}
          />
        );
      case "boolean":
        return (
          <DropdownSelect
            className={ddCls}
            value={String(action.value)}
            onChange={(v) => updateAction(ruleId, idx, { value: v === "true" })}
            options={[{ value: "true", label: "Activar" }, { value: "false", label: "Desactivar" }]}
          />
        );
      case "text":
        return (
          <input type="text" value={action.value || ""} onChange={(e) => updateAction(ruleId, idx, { value: e.target.value })} placeholder="Etiqueta" className={`${inputCls} flex-1`} />
        );
      case "message":
        return (
          <input type="text" value={action.message || ""} onChange={(e) => updateAction(ruleId, idx, { message: e.target.value })} placeholder="Texto de respuesta" className={`${inputCls} flex-1`} />
        );
      case "template": {
        // Clave única por nombre+idioma (una plantilla puede tener varios idiomas)
        const currentValue = action.templateName ? `${action.templateName}::${action.templateLanguage || ""}` : "";
        return (
          <DropdownSelect
            className="min-w-[220px] flex-1 [&>button]:py-1.5 [&>button]:text-xs"
            value={currentValue}
            onChange={(v) => {
              const [name, lang] = v.split("::");
              const tpl = templates.find((t) => t.name === name && t.language === lang);
              // Al cambiar de plantilla se reinician las variables configuradas.
              updateAction(ruleId, idx, {
                templateName: name,
                templateLanguage: lang,
                templateCategory: tpl?.category || "",
                templateComponents: tpl?.components,
                templateVariables: {},
              });
            }}
            options={
              templates.length === 0
                ? [{ value: "", label: "No hay plantillas aprobadas" }]
                : [
                    { value: "", label: "Selecciona plantilla" },
                    ...templates.map((t) => ({ value: `${t.name}::${t.language}`, label: `${t.name} (${t.language})` })),
                  ]
            }
          />
        );
      }
      case "agent":
        return (
          <DropdownSelect
            className={ddCls}
            value={action.value || ""}
            onChange={(v) => updateAction(ruleId, idx, { value: v })}
            options={[{ value: "", label: "Selecciona agente" }, ...members.map((m) => ({ value: m.userId, label: m.user?.name || m.user?.email || m.userId }))]}
          />
        );
      case "team":
        return (
          <DropdownSelect
            className={ddCls}
            value={action.value || ""}
            onChange={(v) => updateAction(ruleId, idx, { value: v })}
            options={[{ value: "", label: "Selecciona equipo" }, ...teams.map((t) => ({ value: t.id, label: t.name }))]}
          />
        );
      default:
        return null;
    }
  };

  if (loading) return <div className="bg-card rounded-xl border border-border p-5"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="bg-card rounded-xl border border-border p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-brand-600" /> Automatizaciones
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5 max-w-md">
            Cuando un contacto envíe un mensaje que coincida con las palabras clave, se ejecutarán las acciones configuradas.
          </p>
        </div>
        <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-xs font-medium disabled:opacity-50 shrink-0">
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : saved ? <CheckCircle2 className="h-3 w-3" /> : <Save className="h-3 w-3" />}
          {saved ? "Guardado" : "Guardar"}
        </button>
      </div>

      <div className="space-y-3">
        {rules.length === 0 && (
          <p className="text-[11px] text-muted-foreground italic py-2">No hay automatizaciones. Agrega una regla para empezar.</p>
        )}

        {rules.map((rule) => (
          <div key={rule.id} className="rounded-lg border border-border p-4 bg-muted/40">
            {/* Header de la regla */}
            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={() => updateRule(rule.id, { enabled: !rule.enabled })}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${rule.enabled ? "bg-brand-600" : "bg-gray-300"}`}
                aria-label="Activar regla"
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-card transition-transform shadow-sm ${rule.enabled ? "translate-x-[18px]" : "translate-x-1"}`} />
              </button>
              <input
                type="text"
                value={rule.name}
                onChange={(e) => updateRule(rule.id, { name: e.target.value })}
                className="flex-1 px-2 py-1 rounded-md border border-border text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Nombre de la regla"
              />
              <button onClick={() => removeRule(rule.id)} className="p-1.5 rounded-md text-red-500 hover:bg-red-50" aria-label="Eliminar regla">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Trigger */}
            <div className="mb-3">
              <div className="flex items-center gap-2 mb-1.5">
                <label className="text-xs font-medium text-muted-foreground">Si el mensaje</label>
                <DropdownSelect
                  className="min-w-[150px] [&>button]:py-1 [&>button]:text-xs"
                  value={rule.matchType}
                  onChange={(v) => updateRule(rule.id, { matchType: v as MatchType })}
                  options={(Object.keys(MATCH_LABELS) as MatchType[]).map((m) => ({ value: m, label: MATCH_LABELS[m] }))}
                />
                <label className="text-xs font-medium text-muted-foreground">alguna de:</label>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {rule.keywords.map((kw) => (
                  <span key={kw} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-brand-50 border border-brand-200 text-brand-700 text-xs">
                    {kw}
                    <button onClick={() => removeKeyword(rule.id, kw)} className="text-brand-400 hover:text-brand-700 font-bold leading-none">×</button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={keywordInputs[rule.id] || ""}
                  onChange={(e) => setKeywordInputs((prev) => ({ ...prev, [rule.id]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addKeyword(rule.id); } }}
                  placeholder="Ej: acepto, baja, stop"
                  className="flex-1 px-3 py-1.5 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <button onClick={() => addKeyword(rule.id)} className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted">Agregar</button>
              </div>
            </div>

            {/* Acciones */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">Entonces:</label>
              <div className="space-y-2">
                {rule.actions.map((action, idx) => {
                  const tplFields = action.type === "reply_template" ? getTemplateFields(action.templateComponents) : [];
                  return (
                    <div key={idx}>
                      <div className="flex items-center gap-2">
                        <DropdownSelect
                          className="min-w-[200px] [&>button]:py-1.5 [&>button]:text-xs"
                          value={action.type}
                          onChange={(v) => changeActionType(rule.id, idx, v)}
                          options={ACTION_TYPES.filter((a) => !a.whatsappOnly || isWhatsApp).map((a) => ({ value: a.type, label: a.label }))}
                        />
                        {renderActionInput(rule.id, idx, action)}
                        <button onClick={() => removeAction(rule.id, idx)} className="p-1 rounded-md text-red-500 hover:bg-red-50 shrink-0" aria-label="Eliminar acción">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                      {tplFields.length > 0 && (
                        <TemplateVarsEditor
                          fields={tplFields}
                          values={action.templateVariables || {}}
                          onChange={(next) => updateAction(rule.id, idx, { templateVariables: next })}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
              <button onClick={() => addAction(rule.id)} className="mt-2 flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium">
                <Plus className="h-3 w-3" /> Agregar acción
              </button>
            </div>
          </div>
        ))}
      </div>

      <button onClick={addRule} className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-border text-xs font-medium text-muted-foreground hover:bg-muted w-full justify-center">
        <Plus className="h-3.5 w-3.5" /> Agregar automatización
      </button>
    </div>
  );
}
