import { useEffect, useState } from "react";
import { Save, Loader2, CheckCircle2, Plus, Trash2, Zap } from "lucide-react";
import { api } from "@/services/api";

// ── Tipos ──────────────────────────────────────────────────────────────
type MatchType = "exact" | "contains" | "startsWith";

interface AutomationAction {
  type: string;
  value?: any;
  message?: string;
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
  input: "status" | "boolean" | "text" | "conversationStatus" | "message" | "agent" | "team" | "none";
}> = [
  { type: "set_status", label: "Cambiar estado del contacto", input: "status" },
  { type: "set_opt_in_whatsapp", label: "Opt-in WhatsApp", input: "boolean" },
  { type: "set_opt_in_email", label: "Opt-in Email", input: "boolean" },
  { type: "add_tag", label: "Agregar etiqueta", input: "text" },
  { type: "remove_tag", label: "Quitar etiqueta", input: "text" },
  { type: "set_conversation_status", label: "Estado de la conversación", input: "conversationStatus" },
  { type: "reply", label: "Responder mensaje", input: "message" },
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

/**
 * Constructor de automatizaciones por palabra clave para un canal.
 * Reglas: cuando el mensaje entrante coincide con las palabras clave (según
 * matchType), ejecuta las acciones configuradas sobre el contacto/conversación.
 */
export function AutomationsSection({ inboxId, tenantId }: { inboxId: string; tenantId: string }) {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [keywordInputs, setKeywordInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    setLoading(true);
    api.get(`/chats/inboxes/${inboxId}`)
      .then(({ data }) => {
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
    let patch: Partial<AutomationAction> = { type, value: undefined, message: undefined };
    if (type === "set_status") patch.value = "cliente";
    else if (type === "set_opt_in_whatsapp" || type === "set_opt_in_email") patch.value = false;
    else if (type === "set_conversation_status") patch.value = "resolved";
    else if (type === "add_tag" || type === "remove_tag") patch.value = "";
    else if (type === "reply") patch.message = "";
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
    const inputCls = "px-2 py-1.5 rounded-md border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500";
    switch (def.input) {
      case "status":
        return (
          <select value={action.value || ""} onChange={(e) => updateAction(ruleId, idx, { value: e.target.value })} className={inputCls}>
            {CONTACT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        );
      case "conversationStatus":
        return (
          <select value={action.value || ""} onChange={(e) => updateAction(ruleId, idx, { value: e.target.value })} className={inputCls}>
            {CONVERSATION_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        );
      case "boolean":
        return (
          <select value={String(action.value)} onChange={(e) => updateAction(ruleId, idx, { value: e.target.value === "true" })} className={inputCls}>
            <option value="true">Activar</option>
            <option value="false">Desactivar</option>
          </select>
        );
      case "text":
        return (
          <input type="text" value={action.value || ""} onChange={(e) => updateAction(ruleId, idx, { value: e.target.value })} placeholder="Etiqueta" className={`${inputCls} flex-1`} />
        );
      case "message":
        return (
          <input type="text" value={action.message || ""} onChange={(e) => updateAction(ruleId, idx, { message: e.target.value })} placeholder="Texto de respuesta" className={`${inputCls} flex-1`} />
        );
      case "agent":
        return (
          <select value={action.value || ""} onChange={(e) => updateAction(ruleId, idx, { value: e.target.value })} className={inputCls}>
            <option value="">Selecciona agente</option>
            {members.map((m) => <option key={m.userId} value={m.userId}>{m.user?.name || m.user?.email || m.userId}</option>)}
          </select>
        );
      case "team":
        return (
          <select value={action.value || ""} onChange={(e) => updateAction(ruleId, idx, { value: e.target.value })} className={inputCls}>
            <option value="">Selecciona equipo</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        );
      default:
        return null;
    }
  };

  if (loading) return <div className="bg-white rounded-xl border border-gray-200 p-5"><Loader2 className="h-4 w-4 animate-spin text-gray-400" /></div>;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-brand-600" /> Automatizaciones
          </h2>
          <p className="text-[11px] text-gray-500 mt-0.5 max-w-md">
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
          <p className="text-[11px] text-gray-400 italic py-2">No hay automatizaciones. Agrega una regla para empezar.</p>
        )}

        {rules.map((rule) => (
          <div key={rule.id} className="rounded-lg border border-gray-200 p-4 bg-gray-50/40">
            {/* Header de la regla */}
            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={() => updateRule(rule.id, { enabled: !rule.enabled })}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${rule.enabled ? "bg-brand-600" : "bg-gray-300"}`}
                aria-label="Activar regla"
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow-sm ${rule.enabled ? "translate-x-[18px]" : "translate-x-1"}`} />
              </button>
              <input
                type="text"
                value={rule.name}
                onChange={(e) => updateRule(rule.id, { name: e.target.value })}
                className="flex-1 px-2 py-1 rounded-md border border-gray-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Nombre de la regla"
              />
              <button onClick={() => removeRule(rule.id)} className="p-1.5 rounded-md text-red-500 hover:bg-red-50" aria-label="Eliminar regla">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Trigger */}
            <div className="mb-3">
              <div className="flex items-center gap-2 mb-1.5">
                <label className="text-xs font-medium text-gray-600">Si el mensaje</label>
                <select
                  value={rule.matchType}
                  onChange={(e) => updateRule(rule.id, { matchType: e.target.value as MatchType })}
                  className="px-2 py-1 rounded-md border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {(Object.keys(MATCH_LABELS) as MatchType[]).map((m) => <option key={m} value={m}>{MATCH_LABELS[m]}</option>)}
                </select>
                <label className="text-xs font-medium text-gray-600">alguna de:</label>
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
                  className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <button onClick={() => addKeyword(rule.id)} className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50">Agregar</button>
              </div>
            </div>

            {/* Acciones */}
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1.5">Entonces:</label>
              <div className="space-y-2">
                {rule.actions.map((action, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <select
                      value={action.type}
                      onChange={(e) => changeActionType(rule.id, idx, e.target.value)}
                      className="px-2 py-1.5 rounded-md border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      {ACTION_TYPES.map((a) => <option key={a.type} value={a.type}>{a.label}</option>)}
                    </select>
                    {renderActionInput(rule.id, idx, action)}
                    <button onClick={() => removeAction(rule.id, idx)} className="p-1 rounded-md text-red-500 hover:bg-red-50 shrink-0" aria-label="Eliminar acción">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
              <button onClick={() => addAction(rule.id)} className="mt-2 flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium">
                <Plus className="h-3 w-3" /> Agregar acción
              </button>
            </div>
          </div>
        ))}
      </div>

      <button onClick={addRule} className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-gray-300 text-xs font-medium text-gray-600 hover:bg-gray-50 w-full justify-center">
        <Plus className="h-3.5 w-3.5" /> Agregar automatización
      </button>
    </div>
  );
}
