import { useState, useEffect } from "react";
import { Phone, FileText, Loader2, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/services/api";
import { useParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

interface Variable {
  field: string;
  label: string;
}

const DEFAULT_VARIABLES: Variable[] = [
  { field: "firstName", label: "Nombre" },
  { field: "lastName", label: "Apellido" },
  { field: "fullName", label: "Nombre completo" },
  { field: "phone", label: "Teléfono" },
  { field: "email", label: "Email" },
  { field: "documentType", label: "Tipo documento" },
  { field: "documentNumber", label: "Nº documento" },
  { field: "gender", label: "Género" },
  { field: "city", label: "Ciudad" },
  { field: "region", label: "Región" },
  { field: "status", label: "Estado" },
  { field: "channelSource", label: "Canal" },
  { field: "source", label: "Fuente" },
  { field: "score", label: "Score" },
];

const VOICES = [
  { value: "Mariana", label: "Mariana" },
  { value: "Penelope", label: "Penelope" },
  { value: "Conchita", label: "Conchita" },
  { value: "Mia", label: "Mia" },
  { value: "Lucia", label: "Lucia" },
  { value: "Enrique", label: "Enrique" },
  { value: "Miguel", label: "Miguel" },
];

interface CallTemplate {
  id: string;
  name: string;
  defaultLanguage: string;
  translations: { language: string; body: string | null }[];
}

interface CallEditorProps {
  message: string;
  voice: string;
  retries: string;
  leaveVoicemail: boolean;
  audioCode: string;
  templateId?: string | null;
  variableMapping?: Record<string, string>;
  channel?: "llamada" | "sms";
  onMessageChange: (value: string) => void;
  onVoiceChange: (value: string) => void;
  onRetriesChange: (value: string) => void;
  onLeaveVoicemailChange: (value: boolean) => void;
  onAudioCodeChange: (value: string) => void;
  onTemplateIdChange?: (value: string | null) => void;
  onVariableMappingChange?: (mapping: Record<string, string>) => void;
  onSave: () => void;
  saving?: boolean;
  variables?: Variable[];
}

export function CallEditor({
  message,
  voice,
  retries,
  leaveVoicemail,
  audioCode,
  templateId,
  variableMapping,
  channel = "llamada",
  onMessageChange,
  onVoiceChange,
  onRetriesChange,
  onLeaveVoicemailChange,
  onAudioCodeChange,
  onTemplateIdChange,
  onVariableMappingChange,
  onSave,
  saving,
  variables,
}: CallEditorProps) {
  const AVAILABLE_VARIABLES = variables || DEFAULT_VARIABLES;
  const [useAudio, setUseAudio] = useState(!!audioCode);
  const [templates, setTemplates] = useState<CallTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const { slug } = useParams();
  const { user } = useAuth();
  const tenantRole = user?.tenantRoles.find((tr: any) => tr.tenant.slug === slug);
  const tenantId = tenantRole?.tenantId || "";

  useEffect(() => {
    if (!tenantId) return;
    setLoadingTemplates(true);
    api.get<CallTemplate[]>("/templates", { params: { tenantId, channel } })
      .then(({ data }) => setTemplates(data))
      .catch(() => {})
      .finally(() => setLoadingTemplates(false));
  }, [tenantId]);

  const selectedTemplate = templates.find((t) => t.id === templateId);
  const selectedBody = selectedTemplate?.translations.find((t) => t.language === selectedTemplate.defaultLanguage)?.body || "";

  const getPreview = () => {
    let preview = selectedBody || message;
    const samples: Record<string, string> = {
      firstName: "Juan",
      lastName: "Pérez",
      fullName: "Juan Pérez",
      phone: "+573001234567",
      email: "juan@email.com",
      status: "activo",
      channelSource: "whatsapp",
    };
    for (const [field, sample] of Object.entries(samples)) {
      preview = preview.replaceAll(`{{${field}}}`, sample);
    }
    return preview;
  };

  const canSave = useAudio ? !!audioCode.trim() : !!templateId;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center gap-2 mb-4">
        <Phone className="h-5 w-5 text-brand-600" />
        <h2 className="text-base font-semibold text-gray-900">
          {channel === "sms" ? "Configuración de SMS" : "Configuración de Llamada"}
        </h2>
      </div>

      {/* Mode selector: Message or Audio (only for llamada) */}
      {channel === "llamada" && (
      <div className="flex gap-3 mb-5">
        <button
          onClick={() => { setUseAudio(false); onAudioCodeChange(""); }}
          className={cn(
            "px-4 py-2 rounded-lg text-sm font-medium border-2 transition-all",
            !useAudio
              ? "border-brand-500 bg-brand-50 text-brand-800"
              : "border-gray-200 text-gray-600 hover:border-gray-300"
          )}
        >
          Mensaje de texto a voz
        </button>
        <button
          onClick={() => { setUseAudio(true); onMessageChange(""); }}
          className={cn(
            "px-4 py-2 rounded-lg text-sm font-medium border-2 transition-all",
            useAudio
              ? "border-brand-500 bg-brand-50 text-brand-800"
              : "border-gray-200 text-gray-600 hover:border-gray-300"
          )}
        >
          Audio pregrabado
        </button>
      </div>
      )}

      {!useAudio ? (
        <>
          {/* Template selector */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">
              {channel === "sms" ? "Plantilla de SMS" : "Plantilla de llamada"}
            </label>
            {loadingTemplates ? (
              <div className="flex items-center gap-2 py-3">
                <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                <span className="text-xs text-gray-400">Cargando plantillas...</span>
              </div>
            ) : templates.length === 0 ? (
              <div className="p-4 rounded-lg border border-dashed border-gray-200 bg-gray-50 text-center">
                <FileText className="h-5 w-5 text-gray-300 mx-auto mb-1" />
                <p className="text-xs text-gray-400">
                  {channel === "sms" ? "No hay plantillas de SMS" : "No hay plantillas de llamada"}
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">Crea una desde la sección Plantillas</p>
              </div>
            ) : (
              <TemplateDropdown
                templates={templates}
                selectedId={templateId || null}
                onSelect={(id) => onTemplateIdChange?.(id)}
              />
            )}

            {/* Preview of selected template */}
            {selectedTemplate && selectedBody && (
              <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-[10px] font-medium text-gray-400 uppercase mb-1">Mensaje de la plantilla</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedBody}</p>

                {/* Variable mapping */}
                {(() => {
                  const vars = selectedBody.match(/\{\{(\w+)\}\}/g)?.map((v) => v.replace(/[{}]/g, "")) || [];
                  const uniqueVars = [...new Set(vars)];
                  if (uniqueVars.length === 0) return null;

                  // Build effective mapping: use provided mapping or auto-match
                  const effectiveMapping: Record<string, string> = {};
                  for (const varName of uniqueVars) {
                    if (variableMapping?.[varName]) {
                      effectiveMapping[varName] = variableMapping[varName];
                    } else {
                      // Auto-match by field name
                      const match = AVAILABLE_VARIABLES.find((f) => f.field === varName);
                      effectiveMapping[varName] = match ? varName : "";
                    }
                  }

                  return (
                    <div className="mt-3">
                      <p className="text-[10px] font-medium text-gray-400 uppercase mb-2">Mapeo de variables</p>
                      <div className="space-y-2">
                        {uniqueVars.map((varName) => (
                          <div key={varName} className="flex items-center gap-2">
                            <code className="text-[11px] font-mono text-brand-700 bg-brand-50 px-1.5 py-1 rounded shrink-0 w-[130px] truncate">{`{{${varName}}}`}</code>
                            <span className="text-gray-300 shrink-0">→</span>
                            <FieldDropdown
                              fields={AVAILABLE_VARIABLES}
                              value={effectiveMapping[varName] || ""}
                              onChange={(field) => {
                                const newMapping = { ...variableMapping, ...effectiveMapping, [varName]: field };
                                onVariableMappingChange?.(newMapping);
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                <div className="mt-3 p-3 bg-white rounded-lg border border-gray-100">
                  <p className="text-[10px] font-medium text-gray-400 uppercase mb-1">Vista previa (lo que escuchará el cliente)</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{getPreview()}</p>
                </div>
                {selectedTemplate.translations.length > 1 && (
                  <p className="text-[10px] text-brand-600 mt-2">
                    {selectedTemplate.translations.length} idiomas disponibles — se enviará según el idioma del contacto
                  </p>
                )}
              </div>
            )}
          </div>
        </>
      ) : (
        /* Audio code input */
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1.5">
            Código de Audio (Onurix)
          </label>
          <input
            type="text"
            value={audioCode}
            onChange={(e) => onAudioCodeChange(e.target.value)}
            placeholder="Ej: abc123def456"
            className="w-full max-w-md px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
          <p className="text-xs text-gray-400 mt-1.5">
            ID único del audio cargado en la plataforma de Onurix. No se puede usar junto con mensaje de texto a voz.
          </p>
        </div>
      )}

      {/* Retries and voicemail (only for llamada) */}
      {channel === "llamada" && (
      <div className="grid grid-cols-2 gap-4 mt-5">
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1.5">
            Reintentos
          </label>
          <select
            value={retries}
            onChange={(e) => onRetriesChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
            <option value="">Por defecto (1)</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
          </select>
          <p className="text-xs text-gray-400 mt-1">Número de intentos si no contestan (máx. 3)</p>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1.5">
            Buzón de voz
          </label>
          <button
            type="button"
            onClick={() => onLeaveVoicemailChange(!leaveVoicemail)}
            className={cn(
              "relative w-10 h-5 rounded-full transition-colors",
              leaveVoicemail ? "bg-accent-500" : "bg-gray-300"
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
                leaveVoicemail && "translate-x-5"
              )}
            />
          </button>
          <p className="text-xs text-gray-400 mt-1">
            {leaveVoicemail
              ? "Dejará mensaje en buzón si no contestan"
              : "No dejará mensaje en buzón"}
          </p>
        </div>
      </div>
      )}

      {/* Save button */}
      <div className="flex justify-end mt-5">
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !canSave}
          className="px-4 py-2 rounded-md text-sm font-medium bg-brand-800 text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? "Guardando..." : "Guardar configuración"}
        </button>
      </div>
    </div>
  );
}


// === Custom Template Dropdown ===

function TemplateDropdown({
  templates,
  selectedId,
  onSelect,
}: {
  templates: CallTemplate[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = templates.find((t) => t.id === selectedId);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-gray-200 hover:border-gray-300 bg-white text-left transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
      >
        <span className={cn("text-sm", selected ? "text-gray-900" : "text-gray-400")}>
          {selected ? selected.name : "Seleccionar plantilla..."}
        </span>
        <ChevronDown className={cn("h-4 w-4 text-gray-400 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-lg border border-gray-200 py-1 z-50 max-h-[200px] overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-150">
            {/* Clear option */}
            <button
              onClick={() => { onSelect(null); setOpen(false); }}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors",
                !selectedId ? "bg-gray-50 text-gray-500" : "text-gray-400 hover:bg-gray-50"
              )}
            >
              <span className="text-gray-400">Sin plantilla</span>
            </button>
            {templates.map((t) => {
              const isActive = t.id === selectedId;
              const body = t.translations.find((tr) => tr.language === t.defaultLanguage)?.body;
              return (
                <button
                  key={t.id}
                  onClick={() => { onSelect(t.id); setOpen(false); }}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors",
                    isActive ? "bg-brand-50 text-brand-700" : "text-gray-700 hover:bg-gray-50"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{t.name}</p>
                    {body && <p className="text-[11px] text-gray-400 truncate mt-0.5">{body.substring(0, 50)}{body.length > 50 ? "..." : ""}</p>}
                  </div>
                  {isActive && <Check className="h-4 w-4 text-brand-600 shrink-0" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}


// === Field Dropdown (for variable mapping) ===

function FieldDropdown({
  fields,
  value,
  onChange,
}: {
  fields: Variable[];
  value: string;
  onChange: (field: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manualValue, setManualValue] = useState("");
  const selected = fields.find((f) => f.field === value);
  const isManual = !!value && !selected;

  const handleManualConfirm = () => {
    if (manualValue.trim()) {
      onChange(manualValue.trim());
    }
    setManualMode(false);
    setOpen(false);
  };

  return (
    <div className="relative flex-1">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-left text-xs transition-colors",
          selected ? "border-gray-200 bg-white text-gray-800"
            : isManual ? "border-blue-200 bg-blue-50 text-blue-700"
            : "border-amber-200 bg-amber-50 text-amber-600"
        )}
      >
        <span className="truncate">
          {selected ? selected.label : isManual ? `"${value}"` : "Seleccionar campo..."}
        </span>
        <ChevronDown className="h-3 w-3 text-gray-400 shrink-0" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setManualMode(false); }} />
          <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 max-h-[220px] overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-150">
            {/* Manual input option */}
            {!manualMode ? (
              <button
                onClick={() => { setManualMode(true); setManualValue(isManual ? value : ""); }}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors border-b border-gray-100",
                  isManual ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-500 hover:bg-gray-50"
                )}
              >
                <span className="text-[10px]">✏️</span>
                <span>Texto manual{isManual ? `: "${value}"` : ""}</span>
              </button>
            ) : (
              <div className="px-2 py-2 border-b border-gray-100">
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={manualValue}
                    onChange={(e) => setManualValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleManualConfirm(); }}
                    placeholder="Texto fijo..."
                    className="flex-1 px-2 py-1.5 rounded-md border border-gray-200 text-xs focus:outline-none focus:ring-1 focus:ring-brand-300"
                    autoFocus
                  />
                  <button
                    onClick={handleManualConfirm}
                    disabled={!manualValue.trim()}
                    className="px-2 py-1.5 rounded-md bg-brand-700 text-white text-[10px] font-medium disabled:opacity-50"
                  >
                    OK
                  </button>
                </div>
              </div>
            )}

            {/* Field options */}
            {fields.map((f) => (
              <button
                key={f.field}
                onClick={() => { onChange(f.field); setOpen(false); setManualMode(false); }}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors",
                  f.field === value ? "bg-brand-50 text-brand-700 font-medium" : "text-gray-700 hover:bg-gray-50"
                )}
              >
                {f.field === value && <Check className="h-3 w-3 text-brand-600 shrink-0" />}
                <span className="truncate">{f.label}</span>
                <span className="text-[9px] text-gray-400 ml-auto">{f.field}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
