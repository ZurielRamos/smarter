import { useState } from "react";
import {
  Plus, Trash2, GripVertical, ChevronDown, ChevronUp,
  MessageCircle, Hash, Mail, Phone, Calendar, List, ToggleLeft, Code, Sparkles, X, AlertCircle,
  Shield, Globe, Link,
} from "lucide-react";
import { ConfirmModal } from "@/components/ConfirmModal";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ─── Types ─────────────────────────────────────────────────

export interface FlowStepValidation {
  pattern?: string;
  options?: string[];
  min?: number;
  max?: number;
  errorMessage: string;
}

export interface FlowStepWebhook {
  url: string;
  method?: "GET" | "POST" | "PUT" | "PATCH";
  headers?: Record<string, string>;
}

export interface FlowConsentConfig {
  legalText: string;
  termsUrl?: string;
  acceptKeywords?: string[];
  rejectKeywords?: string[];
  rejectAction?: "handoff" | "end";
  rejectMessage?: string;
  consentType?: "data_collection" | "age_verification" | "terms" | "custom";
}

export interface FlowStep {
  id: string;
  order: number;
  field: string;
  question: string;
  type: "text" | "number" | "email" | "phone" | "date" | "select" | "regex" | "boolean" | "consent";
  validation?: FlowStepValidation;
  consent?: FlowConsentConfig;
  aiInterpretation?: boolean;
  skipIf?: string;
  retries?: number;
  required?: boolean;
  onCollected?: FlowStepWebhook;
}

export interface FlowConfig {
  completionMessage?: string;
  completionAction?: "handoff" | "resolve" | "none";
  useAiForGreeting?: boolean;
  allowSkip?: boolean;
  skipKeyword?: string;
  maxGlobalRetries?: number;
  offTopicBehavior?: "ignore" | "ai_respond" | "redirect";
  offTopicMessage?: string;
  onCompletionWebhook?: FlowStepWebhook;
}

// ─── Constants ──────────────────────────────────────────────

const STEP_TYPES: { value: FlowStep["type"]; label: string; icon: React.ReactNode; description: string }[] = [
  { value: "text", label: "Texto", icon: <MessageCircle className="h-3.5 w-3.5" />, description: "Respuesta libre" },
  { value: "number", label: "Numero", icon: <Hash className="h-3.5 w-3.5" />, description: "Solo numeros" },
  { value: "email", label: "Email", icon: <Mail className="h-3.5 w-3.5" />, description: "Correo electronico" },
  { value: "phone", label: "Telefono", icon: <Phone className="h-3.5 w-3.5" />, description: "Numero de telefono" },
  { value: "date", label: "Fecha", icon: <Calendar className="h-3.5 w-3.5" />, description: "Fecha DD/MM/AAAA" },
  { value: "select", label: "Opciones", icon: <List className="h-3.5 w-3.5" />, description: "Seleccion multiple" },
  { value: "boolean", label: "Si/No", icon: <ToggleLeft className="h-3.5 w-3.5" />, description: "Respuesta binaria" },
  { value: "regex", label: "Patron", icon: <Code className="h-3.5 w-3.5" />, description: "Expresion regular" },
  { value: "consent", label: "Consentimiento", icon: <Shield className="h-3.5 w-3.5" />, description: "Autorizacion legal" },
];

const COMPLETION_ACTIONS = [
  { value: "none", label: "Ninguna", description: "El bot queda disponible" },
  { value: "handoff", label: "Transferir a humano", description: "Pasa a un agente" },
  { value: "resolve", label: "Marcar resuelta", description: "Cierra la conversacion" },
];

// ─── Sortable Step Item ─────────────────────────────────────

function SortableStepItem({
  step,
  index,
  expanded,
  onToggleExpand,
  onUpdate,
  onDelete,
  fieldsAvailable,
}: {
  step: FlowStep;
  index: number;
  expanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (updates: Partial<FlowStep>) => void;
  onDelete: () => void;
  fieldsAvailable: { field: string; label: string }[];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const typeInfo = STEP_TYPES.find((t) => t.value === step.type);

  return (
    <div ref={setNodeRef} style={style} className={`border rounded-xl transition-all ${expanded ? "border-brand-200 bg-brand-50/30" : "border-gray-200 bg-white"} ${isDragging ? "shadow-lg" : ""}`}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3">
        <button type="button" {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-gray-100 text-gray-400">
          <GripVertical className="h-3.5 w-3.5" />
        </button>

        <div className="flex items-center justify-center h-6 w-6 rounded-full bg-brand-100 text-brand-700 text-[10px] font-bold shrink-0">
          {index + 1}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900 truncate">{step.question || "(sin pregunta)"}</span>
            {step.required === false && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">opcional</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-gray-400 flex items-center gap-1">
              {typeInfo?.icon}
              {typeInfo?.label}
            </span>
            <span className="text-[10px] text-gray-300">·</span>
            <span className="text-[10px] text-gray-400 font-mono">{step.field || "—"}</span>
            {step.aiInterpretation && (
              <>
                <span className="text-[10px] text-gray-300">·</span>
                <span className="text-[10px] text-purple-500 flex items-center gap-0.5"><Sparkles className="h-2.5 w-2.5" />IA</span>
              </>
            )}
          </div>
        </div>

        <button type="button" onClick={onToggleExpand} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600">
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
          {/* Question */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Pregunta</label>
            <textarea
              value={step.question}
              onChange={(e) => onUpdate({ question: e.target.value })}
              placeholder="Ej: ¿Cual es tu nombre completo?"
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200 resize-none"
            />
          </div>

          {/* Type + Field */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de respuesta</label>
              <select
                value={step.type}
                onChange={(e) => onUpdate({ type: e.target.value as FlowStep["type"] })}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200"
              >
                {STEP_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label} — {t.description}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Campo destino</label>
              {fieldsAvailable.length > 0 ? (
                <select
                  value={step.field}
                  onChange={(e) => onUpdate({ field: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200"
                >
                  <option value="">Seleccionar campo...</option>
                  {fieldsAvailable.map((f) => (
                    <option key={f.field} value={f.field}>{f.label} ({f.field})</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={step.field}
                  onChange={(e) => onUpdate({ field: e.target.value })}
                  placeholder="Ej: firstName, custom:cedula"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono text-gray-800 focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200"
                />
              )}
            </div>
          </div>

          {/* Select options */}
          {step.type === "select" && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Opciones (una por linea)</label>
              <textarea
                value={(step.validation?.options || []).join("\n")}
                onChange={(e) => {
                  const options = e.target.value.split("\n").filter((o) => o.trim());
                  onUpdate({ validation: { ...step.validation, options, errorMessage: step.validation?.errorMessage || "Selecciona una opcion valida." } });
                }}
                placeholder={"Opcion 1\nOpcion 2\nOpcion 3"}
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200 resize-none"
              />
            </div>
          )}

          {/* Regex pattern */}
          {step.type === "regex" && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Patron (regex)</label>
              <input
                type="text"
                value={step.validation?.pattern || ""}
                onChange={(e) => onUpdate({ validation: { ...step.validation, pattern: e.target.value, errorMessage: step.validation?.errorMessage || "El formato no es valido." } })}
                placeholder="Ej: ^[0-9]{6,10}$"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono text-gray-800 focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200"
              />
            </div>
          )}

          {/* Number min/max */}
          {step.type === "number" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Minimo</label>
                <input
                  type="number"
                  value={step.validation?.min ?? ""}
                  onChange={(e) => onUpdate({ validation: { ...step.validation, min: e.target.value ? Number(e.target.value) : undefined, errorMessage: step.validation?.errorMessage || "Numero fuera de rango." } })}
                  placeholder="Sin limite"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Maximo</label>
                <input
                  type="number"
                  value={step.validation?.max ?? ""}
                  onChange={(e) => onUpdate({ validation: { ...step.validation, max: e.target.value ? Number(e.target.value) : undefined, errorMessage: step.validation?.errorMessage || "Numero fuera de rango." } })}
                  placeholder="Sin limite"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200"
                />
              </div>
            </div>
          )}

          {/* Consent configuration */}
          {step.type === "consent" && (
            <div className="space-y-3 border border-purple-100 rounded-lg p-4 bg-purple-50/30">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="h-3.5 w-3.5 text-purple-600" />
                <span className="text-xs font-semibold text-purple-800">Configuracion de consentimiento</span>
              </div>

              {/* Consent type */}
              <div>
                <label className="block text-[10px] font-medium text-gray-600 mb-1">Tipo de consentimiento</label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { value: "data_collection", label: "Recoleccion de datos" },
                    { value: "age_verification", label: "Mayoria de edad" },
                    { value: "terms", label: "Terminos y condiciones" },
                    { value: "custom", label: "Personalizado" },
                  ].map((ct) => (
                    <button key={ct.value} type="button"
                      onClick={() => onUpdate({ consent: { ...step.consent, consentType: ct.value as any, legalText: step.consent?.legalText || "" } })}
                      className={`px-2.5 py-1 rounded-md text-[10px] font-medium border transition-colors ${(step.consent?.consentType || "custom") === ct.value ? "border-purple-300 bg-purple-100 text-purple-700" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}
                    >{ct.label}</button>
                  ))}
                </div>
              </div>

              {/* Legal text */}
              <div>
                <label className="block text-[10px] font-medium text-gray-600 mb-1">Texto legal / Autorizacion</label>
                <textarea
                  value={step.consent?.legalText || ""}
                  onChange={(e) => onUpdate({ consent: { ...step.consent, legalText: e.target.value } })}
                  placeholder="Ej: Autorizo el tratamiento de mis datos personales conforme a la politica de privacidad..."
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200 resize-none"
                />
              </div>

              {/* Terms URL */}
              <div>
                <label className="block text-[10px] font-medium text-gray-600 mb-1 flex items-center gap-1"><Link className="h-2.5 w-2.5" />Enlace a terminos y condiciones</label>
                <input
                  type="url"
                  value={step.consent?.termsUrl || ""}
                  onChange={(e) => onUpdate({ consent: { ...step.consent, legalText: step.consent?.legalText || "", termsUrl: e.target.value } })}
                  placeholder="https://tu-sitio.com/terminos"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200"
                />
              </div>

              {/* Reject action */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-medium text-gray-600 mb-1">Si rechaza</label>
                  <select
                    value={step.consent?.rejectAction || "end"}
                    onChange={(e) => onUpdate({ consent: { ...step.consent, legalText: step.consent?.legalText || "", rejectAction: e.target.value as any } })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-xs text-gray-800 focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200"
                  >
                    <option value="end">Finalizar conversacion</option>
                    <option value="handoff">Transferir a agente</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-gray-600 mb-1">Mensaje al rechazar</label>
                  <input
                    type="text"
                    value={step.consent?.rejectMessage || ""}
                    onChange={(e) => onUpdate({ consent: { ...step.consent, legalText: step.consent?.legalText || "", rejectMessage: e.target.value } })}
                    placeholder="Entendido. Sin tu autorizacion no podemos continuar."
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-xs text-gray-800 focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Validation error message (not for consent) */}
          {step.type !== "consent" && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Mensaje de error</label>
            <input
              type="text"
              value={step.validation?.errorMessage || ""}
              onChange={(e) => onUpdate({ validation: { ...step.validation, errorMessage: e.target.value } })}
              placeholder="Ej: Por favor ingresa un dato valido."
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200"
            />
          </div>
          )}

          {/* Options row */}
          <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-gray-100">
            {/* Required */}
            <label className="flex items-center gap-2 cursor-pointer">
              <button
                type="button"
                onClick={() => onUpdate({ required: step.required === false ? true : false })}
                className={`relative w-8 h-4.5 rounded-full transition-colors ${step.required !== false ? "bg-brand-600" : "bg-gray-300"}`}
              >
                <span className={`absolute top-0.5 left-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${step.required !== false ? "translate-x-3.5" : ""}`} />
              </button>
              <span className="text-xs text-gray-600">Obligatorio</span>
            </label>

            {/* AI Interpretation */}
            <label className="flex items-center gap-2 cursor-pointer">
              <button
                type="button"
                onClick={() => onUpdate({ aiInterpretation: !step.aiInterpretation })}
                className={`relative w-8 h-4.5 rounded-full transition-colors ${step.aiInterpretation ? "bg-purple-600" : "bg-gray-300"}`}
              >
                <span className={`absolute top-0.5 left-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${step.aiInterpretation ? "translate-x-3.5" : ""}`} />
              </button>
              <span className="text-xs text-gray-600 flex items-center gap-1"><Sparkles className="h-3 w-3 text-purple-500" />Interpretar con IA</span>
            </label>

            {/* Retries */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-600">Reintentos:</span>
              <input
                type="number"
                min={1}
                max={5}
                value={step.retries ?? 2}
                onChange={(e) => onUpdate({ retries: Math.max(1, Math.min(5, parseInt(e.target.value) || 2)) })}
                className="w-12 px-2 py-1 rounded border border-gray-200 text-xs text-center focus:outline-none focus:border-brand-300"
              />
            </div>

            {/* Delete */}
            <button type="button" onClick={onDelete} className="ml-auto flex items-center gap-1 px-2 py-1 rounded-md text-xs text-red-500 hover:bg-red-50 transition-colors">
              <Trash2 className="h-3 w-3" /> Eliminar
            </button>
          </div>

          {/* onCollected webhook */}
          <details className="group">
            <summary className="text-[10px] text-gray-400 cursor-pointer hover:text-gray-600 flex items-center gap-1">
              <ChevronDown className="h-2.5 w-2.5 group-open:rotate-180 transition-transform" />
              <Globe className="h-2.5 w-2.5" /> Webhook al recolectar (avanzado)
            </summary>
            <div className="mt-2 space-y-2 p-3 bg-gray-50 rounded-lg border border-gray-100">
              <p className="text-[9px] text-gray-400">Se ejecuta despues de validar el dato de este paso. Recibe el valor y datos acumulados.</p>
              <div className="flex gap-2">
                <select
                  value={step.onCollected?.method || "POST"}
                  onChange={(e) => onUpdate({ onCollected: { ...step.onCollected, url: step.onCollected?.url || "", method: e.target.value as any } })}
                  className="w-20 px-2 py-1.5 rounded border border-gray-200 text-[10px] focus:outline-none focus:border-brand-300"
                >
                  <option value="POST">POST</option>
                  <option value="GET">GET</option>
                  <option value="PUT">PUT</option>
                  <option value="PATCH">PATCH</option>
                </select>
                <input
                  type="url"
                  value={step.onCollected?.url || ""}
                  onChange={(e) => onUpdate({ onCollected: e.target.value ? { ...step.onCollected, url: e.target.value, method: step.onCollected?.method || "POST" } : undefined })}
                  placeholder="https://api.example.com/webhook"
                  className="flex-1 px-2 py-1.5 rounded border border-gray-200 text-xs font-mono focus:outline-none focus:border-brand-300"
                />
              </div>
            </div>
          </details>

          {/* Skip condition */}
          <details className="group">
            <summary className="text-[10px] text-gray-400 cursor-pointer hover:text-gray-600 flex items-center gap-1">
              <ChevronDown className="h-2.5 w-2.5 group-open:rotate-180 transition-transform" />
              Condicion para omitir (avanzado)
            </summary>
            <div className="mt-2">
              <input
                type="text"
                value={step.skipIf || ""}
                onChange={(e) => onUpdate({ skipIf: e.target.value || undefined })}
                placeholder="Ej: collectedData.phone (omitir si ya tiene telefono)"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-xs font-mono text-gray-800 focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200"
              />
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────

interface BotFlowEditorProps {
  steps: FlowStep[];
  config: FlowConfig;
  onStepsChange: (steps: FlowStep[]) => void;
  onConfigChange: (config: FlowConfig) => void;
  tenantId?: string;
}

export function BotFlowEditor({ steps, config, onStepsChange, onConfigChange, tenantId }: BotFlowEditorProps) {
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [fieldsAvailable, setFieldsAvailable] = useState<{ field: string; label: string }[]>([]);
  const [fieldsLoaded, setFieldsLoaded] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Load available fields from tenant
  const loadFields = async () => {
    if (fieldsLoaded || !tenantId) return;
    try {
      const api = (await import("axios")).default.create({ baseURL: import.meta.env.VITE_API_URL || "/api" });
      const token = localStorage.getItem("token");
      if (token) api.defaults.headers.common.Authorization = `Bearer ${token}`;
      const { data } = await api.get(`/custom-fields/${tenantId}`);
      const fields = (data || []).map((cf: any) => ({
        field: cf.isSystem ? cf.fieldKey : `custom:${cf.fieldKey}`,
        label: cf.fieldLabel,
      }));
      setFieldsAvailable(fields);
    } catch {} finally { setFieldsLoaded(true); }
  };

  // Load fields on mount
  if (!fieldsLoaded) loadFields();

  const addStep = () => {
    const newId = crypto.randomUUID();
    const newStep: FlowStep = {
      id: newId,
      order: steps.length,
      field: "",
      question: "",
      type: "text",
      validation: { errorMessage: "Por favor, proporciona una respuesta valida." },
      aiInterpretation: false,
      retries: 2,
      required: true,
    };
    onStepsChange([...steps, newStep]);
    setExpandedStep(newId);
  };

  const updateStep = (id: string, updates: Partial<FlowStep>) => {
    onStepsChange(steps.map((s) => s.id === id ? { ...s, ...updates } : s));
  };

  const deleteStep = (id: string) => {
    const updated = steps.filter((s) => s.id !== id).map((s, i) => ({ ...s, order: i }));
    onStepsChange(updated);
    setDeleteTarget(null);
    if (expandedStep === id) setExpandedStep(null);
  };

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = steps.findIndex((s) => s.id === active.id);
    const newIndex = steps.findIndex((s) => s.id === over.id);
    const reordered = arrayMove(steps, oldIndex, newIndex).map((s, i) => ({ ...s, order: i }));
    onStepsChange(reordered);
  };

  return (
    <div className="space-y-6">
      {/* Flow Steps List */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <List className="h-4 w-4 text-brand-600" />
                  <h3 className="text-sm font-semibold text-gray-900">Pasos del flujo</h3>
                </div>
                <p className="text-xs text-gray-500 mt-1">Define las preguntas que el bot hara en orden. Arrastra para reordenar.</p>
              </div>
              <button
                type="button"
                onClick={addStep}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-brand-300 text-xs font-medium text-brand-600 hover:bg-brand-50 transition-colors"
              >
                <Plus className="h-3 w-3" /> Agregar paso
              </button>
            </div>

            {steps.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-gray-200 rounded-xl">
                <List className="h-8 w-8 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500 font-medium">No hay pasos configurados</p>
                <p className="text-xs text-gray-400 mt-1">Agrega el primer paso para comenzar a construir tu flujo.</p>
                <button
                  type="button"
                  onClick={addStep}
                  className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-700 text-white text-xs font-medium hover:bg-brand-600 transition-colors"
                >
                  <Plus className="h-3 w-3" /> Agregar primer paso
                </button>
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {steps.map((step, index) => (
                      <SortableStepItem
                        key={step.id}
                        step={step}
                        index={index}
                        expanded={expandedStep === step.id}
                        onToggleExpand={() => setExpandedStep(expandedStep === step.id ? null : step.id)}
                        onUpdate={(updates) => updateStep(step.id, updates)}
                        onDelete={() => setDeleteTarget(step.id)}
                        fieldsAvailable={fieldsAvailable}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}

            {steps.length > 0 && (
              <div className="mt-3 flex items-center gap-2 text-[10px] text-gray-400">
                <AlertCircle className="h-3 w-3" />
                <span>Arrastra los pasos para cambiar el orden. El bot preguntara en la secuencia definida aqui.</span>
              </div>
            )}
          </div>

          {/* Flow Configuration */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <MessageCircle className="h-4 w-4 text-brand-600" />
              <h3 className="text-sm font-semibold text-gray-900">Configuracion del flujo</h3>
            </div>

            <div className="space-y-4">
              {/* Completion message */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Mensaje de finalizacion</label>
                <textarea
                  value={config.completionMessage || ""}
                  onChange={(e) => onConfigChange({ ...config, completionMessage: e.target.value })}
                  placeholder="Gracias, hemos recopilado toda la informacion necesaria."
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200 resize-none"
                />
              </div>

              {/* Completion action */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Accion al completar</label>
                <div className="grid grid-cols-3 gap-2">
                  {COMPLETION_ACTIONS.map((a) => (
                    <button
                      key={a.value}
                      type="button"
                      onClick={() => onConfigChange({ ...config, completionAction: a.value as any })}
                      className={`flex flex-col items-start gap-0.5 p-3 rounded-lg border text-left transition-colors ${
                        (config.completionAction || "none") === a.value
                          ? "border-brand-300 bg-brand-50 ring-1 ring-brand-200"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <span className={`text-xs font-medium ${(config.completionAction || "none") === a.value ? "text-brand-700" : "text-gray-700"}`}>{a.label}</span>
                      <span className="text-[10px] text-gray-400">{a.description}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Allow skip */}
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-xs font-medium text-gray-700">Permitir omitir pasos opcionales</p>
                  <p className="text-[10px] text-gray-400">Los usuarios pueden escribir la palabra clave para saltar preguntas no obligatorias</p>
                </div>
                <button
                  type="button"
                  onClick={() => onConfigChange({ ...config, allowSkip: !config.allowSkip })}
                  className={`relative w-9 h-5 rounded-full transition-colors ${config.allowSkip ? "bg-brand-600" : "bg-gray-300"}`}
                >
                  <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${config.allowSkip ? "translate-x-4" : ""}`} />
                </button>
              </div>

              {config.allowSkip && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Palabra clave para omitir</label>
                  <input
                    type="text"
                    value={config.skipKeyword || ""}
                    onChange={(e) => onConfigChange({ ...config, skipKeyword: e.target.value })}
                    placeholder="omitir"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200"
                  />
                </div>
              )}

              {/* Max global retries */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Maximo de errores globales antes de transferir</label>
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={config.maxGlobalRetries ?? 10}
                  onChange={(e) => onConfigChange({ ...config, maxGlobalRetries: Math.max(0, parseInt(e.target.value) || 10) })}
                  className="w-32 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200"
                />
                <p className="text-[10px] text-gray-400 mt-1">Si el usuario acumula este numero de respuestas invalidas en total, el bot transferira a un agente.</p>
              </div>

              {/* Off-topic behavior */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Mensajes fuera de tema</label>
                <p className="text-[10px] text-gray-400 mb-2">Que hacer cuando el usuario envia un mensaje que no responde a la pregunta actual (ej: hace una pregunta).</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: "ignore", label: "Ignorar", description: "Tratar como respuesta invalida" },
                    { value: "ai_respond", label: "Responder con IA", description: "Usar IA + knowledge base para responder y re-preguntar" },
                    { value: "redirect", label: "Redirigir", description: "Enviar mensaje y re-preguntar" },
                  ].map((b) => (
                    <button key={b.value} type="button"
                      onClick={() => onConfigChange({ ...config, offTopicBehavior: b.value as any })}
                      className={`flex flex-col items-start gap-0.5 p-3 rounded-lg border text-left transition-colors ${(config.offTopicBehavior || "ignore") === b.value ? "border-brand-300 bg-brand-50 ring-1 ring-brand-200" : "border-gray-200 hover:border-gray-300"}`}
                    >
                      <span className={`text-[10px] font-medium ${(config.offTopicBehavior || "ignore") === b.value ? "text-brand-700" : "text-gray-700"}`}>{b.label}</span>
                      <span className="text-[9px] text-gray-400 leading-tight">{b.description}</span>
                    </button>
                  ))}
                </div>
              </div>

              {config.offTopicBehavior === "redirect" && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Mensaje de redireccion</label>
                  <input
                    type="text"
                    value={config.offTopicMessage || ""}
                    onChange={(e) => onConfigChange({ ...config, offTopicMessage: e.target.value })}
                    placeholder="Ej: Entiendo, pero necesito que respondas la pregunta para continuar."
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200"
                  />
                </div>
              )}

              {/* Completion webhook */}
              <div className="pt-3 border-t border-gray-100">
                <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1.5">
                  <Globe className="h-3 w-3 text-gray-500" /> Webhook al completar flujo
                </label>
                <p className="text-[10px] text-gray-400 mb-2">Se ejecuta cuando todos los pasos se completan. Recibe todos los datos recopilados.</p>
                <div className="flex gap-2">
                  <select
                    value={config.onCompletionWebhook?.method || "POST"}
                    onChange={(e) => onConfigChange({ ...config, onCompletionWebhook: { ...config.onCompletionWebhook, url: config.onCompletionWebhook?.url || "", method: e.target.value as any } })}
                    className="w-20 px-2 py-1.5 rounded border border-gray-200 text-[10px] focus:outline-none focus:border-brand-300"
                  >
                    <option value="POST">POST</option>
                    <option value="GET">GET</option>
                    <option value="PUT">PUT</option>
                    <option value="PATCH">PATCH</option>
                  </select>
                  <input
                    type="url"
                    value={config.onCompletionWebhook?.url || ""}
                    onChange={(e) => onConfigChange({ ...config, onCompletionWebhook: e.target.value ? { url: e.target.value, method: config.onCompletionWebhook?.method || "POST" } : undefined })}
                    placeholder="https://api.example.com/flow-completed"
                    className="flex-1 px-2 py-1.5 rounded border border-gray-200 text-xs font-mono focus:outline-none focus:border-brand-300"
                  />
                </div>
              </div>
            </div>
          </div>

      {/* Confirm delete modal */}
      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => { if (deleteTarget) deleteStep(deleteTarget); }}
        title="Eliminar paso"
        description="Este paso sera eliminado del flujo. Los datos ya recopilados no se veran afectados."
        confirmLabel="Eliminar"
        variant="danger"
      />
    </div>
  );
}
