import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, ChevronDown, Check, MessageSquare } from "lucide-react";
import { api } from "@/services/api";
import { cn } from "@/lib/utils";

interface AvailableField {
  field: string;
  label: string;
}

interface WhatsAppTemplate {
  name: string;
  language: string;
  status: string;
  category: string;
  components: Array<{
    type: string;
    text?: string;
    format?: string;
    example?: { body_text?: string[][] };
  }>;
}

interface Props {
  selectedTemplate: string | null;
  selectedLanguage: string | null;
  variableMapping: Record<string, string>;
  onTemplateChange: (name: string, language: string) => void;
  onMappingChange: (mapping: Record<string, string>) => void;
  onSave: () => void;
  saving: boolean;
  tenantId?: string;
  inboxId?: string | null;
}

export function WhatsAppTemplateSelector({
  selectedTemplate,
  selectedLanguage,
  variableMapping,
  onTemplateChange,
  onMappingChange,
  onSave,
  saving,
  tenantId,
  inboxId,
}: Props) {
  const [fields, setFields] = useState<AvailableField[]>([]);
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load available fields
  useEffect(() => {
    const params = tenantId ? { tenantId } : {};
    api.get<AvailableField[]>("/campaigns/whatsapp/available-fields", { params })
      .then(({ data }) => setFields(data))
      .catch(() => {});
  }, [tenantId]);

  // Load templates from the inbox
  useEffect(() => {
    if (!inboxId) return;
    setLoadingTemplates(true);
    api.get<WhatsAppTemplate[]>("/campaigns/whatsapp/templates", { params: { inboxId } })
      .then(({ data }) => setTemplates(data))
      .catch(() => {})
      .finally(() => setLoadingTemplates(false));
  }, [inboxId]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showDropdown) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setShowDropdown(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showDropdown]);

  const currentTemplate = templates.find(
    (t) => t.name === selectedTemplate
  );

  const bodyComponent = currentTemplate?.components.find((c) => c.type === "BODY");
  const headerComponent = currentTemplate?.components.find((c) => c.type === "HEADER");
  const footerComponent = currentTemplate?.components.find((c) => c.type === "FOOTER");

  // Extract variable count from body text
  const bodyText = bodyComponent?.text || "";
  const variableMatches = bodyText.match(/\{\{\d+\}\}/g) || [];
  const variableCount = variableMatches.length;

  const handleSelectTemplate = (template: WhatsAppTemplate) => {
    onTemplateChange(template.name, template.language);
    // Reset variable mapping for new template
    const newBodyText = template.components.find((c) => c.type === "BODY")?.text || "";
    const matches = newBodyText.match(/\{\{\d+\}\}/g) || [];
    const newMapping: Record<string, string> = {};
    matches.forEach((m) => {
      const num = m.replace(/[{}]/g, "");
      newMapping[num] = "";
    });
    onMappingChange(newMapping);
    setShowDropdown(false);
  };

  const addVariable = () => {
    const keys = Object.keys(variableMapping).map(Number);
    const newNum = keys.length > 0 ? Math.max(...keys) + 1 : 1;
    onMappingChange({ ...variableMapping, [String(newNum)]: "" });
  };

  const removeVariable = (num: string) => {
    const updated = { ...variableMapping };
    delete updated[num];
    onMappingChange(updated);
  };

  const variableKeys = Object.keys(variableMapping || {}).sort((a, b) => Number(a) - Number(b));

  // Build preview text
  const getPreviewText = () => {
    if (!bodyText) return "";
    let preview = bodyText;
    variableKeys.forEach((key) => {
      const mapped = variableMapping[key];
      const label = fields.find((f) => f.field === mapped)?.label || mapped || `{{${key}}}`;
      preview = preview.replace(`{{${key}}}`, `[${label}]`);
    });
    return preview;
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-base font-semibold text-gray-900 mb-1">
        Plantilla de WhatsApp
      </h2>
      <p className="text-xs text-gray-400 mb-5">
        Selecciona una plantilla aprobada y configura las variables
      </p>

      {/* Template selector */}
      <div className="mb-5" ref={dropdownRef}>
        <label className="text-sm font-medium text-gray-700 block mb-1.5">
          Plantilla
        </label>
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowDropdown(!showDropdown)}
            className="w-full flex items-center justify-between px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white hover:border-gray-400 transition-colors text-left"
          >
            {loadingTemplates ? (
              <span className="text-gray-400">Cargando plantillas...</span>
            ) : currentTemplate ? (
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-green-500 shrink-0" />
                <div>
                  <span className="text-gray-900 font-medium">{currentTemplate.name}</span>
                  <span className="text-gray-400 ml-2 text-xs">({currentTemplate.language})</span>
                </div>
              </div>
            ) : (
              <span className="text-gray-400">Seleccionar plantilla...</span>
            )}
            <ChevronDown className={cn("h-4 w-4 text-gray-400 shrink-0 transition-transform", showDropdown && "rotate-180")} />
          </button>

          {showDropdown && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-lg border border-gray-200 shadow-lg py-1 z-50 max-h-60 overflow-y-auto">
              {templates.length === 0 ? (
                <p className="px-3 py-4 text-xs text-gray-400 text-center">
                  {loadingTemplates ? "Cargando..." : "No hay plantillas aprobadas disponibles"}
                </p>
              ) : (
                templates.map((t) => {
                  const isSelected = t.name === selectedTemplate;
                  const tBody = t.components.find((c) => c.type === "BODY")?.text || "";
                  return (
                    <button
                      key={`${t.name}-${t.language}`}
                      type="button"
                      onClick={() => handleSelectTemplate(t)}
                      className={cn(
                        "w-full px-3 py-2.5 text-left transition-colors hover:bg-gray-50",
                        isSelected && "bg-green-50"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-gray-900 truncate">{t.name}</p>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 shrink-0">
                              {t.language}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 shrink-0">
                              {t.category}
                            </span>
                          </div>
                          {tBody && (
                            <p className="text-[11px] text-gray-400 mt-0.5 truncate">{tBody.substring(0, 80)}...</p>
                          )}
                        </div>
                        {isSelected && <Check className="h-4 w-4 text-green-600 shrink-0 ml-2" />}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* Configuration and Preview - only show when template is selected */}
      {currentTemplate && (
        <>
          {/* Variables */}
          {variableCount > 0 && (
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">
                  Variables ({variableCount})
                </label>
                <button
                  type="button"
                  onClick={addVariable}
                  className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-800 font-medium transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  Agregar variable
                </button>
              </div>

              <div className="space-y-2">
                {variableKeys.map((varNum) => (
                  <div key={varNum} className="flex items-center gap-2 p-2.5 rounded-lg bg-gray-50 border border-gray-100">
                    <span className="text-xs font-mono text-gray-500 w-12 shrink-0">
                      {`{{${varNum}}}`}
                    </span>
                    <span className="text-xs text-gray-400">→</span>
                    <FieldDropdown
                      value={variableMapping[varNum] || ""}
                      options={fields}
                      onChange={(val) => onMappingChange({ ...variableMapping, [varNum]: val })}
                    />
                    <button
                      onClick={() => removeVariable(varNum)}
                      className="p-1 text-gray-400 hover:text-red-500 transition-colors rounded hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Preview */}
          <div className="mb-5 rounded-xl border border-green-200 bg-green-50/50 overflow-hidden">
            <div className="px-4 py-2 bg-green-100/60 border-b border-green-200">
              <p className="text-[11px] font-semibold text-green-800 uppercase tracking-wide">Vista previa</p>
            </div>
            <div className="p-4 space-y-2">
              {headerComponent?.text && (
                <p className="text-sm font-semibold text-gray-900">{headerComponent.text}</p>
              )}
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                {getPreviewText() || bodyText}
              </p>
              {footerComponent?.text && (
                <p className="text-xs text-gray-400 mt-2">{footerComponent.text}</p>
              )}
            </div>
          </div>

          {/* Save button */}
          <div className="flex justify-end pt-3 border-t border-gray-100">
            <Button
              onClick={onSave}
              disabled={saving || !selectedTemplate}
              className="bg-brand-800 hover:bg-brand-700 text-white"
              size="sm"
            >
              {saving ? "Guardando..." : "Guardar plantilla"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}


/* Custom dropdown for field selection */
function FieldDropdown({
  value,
  options,
  onChange,
}: {
  value: string;
  options: AvailableField[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.field === value);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative flex-1" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs bg-white hover:border-gray-300 transition-colors text-left"
      >
        <span className={selected ? "text-gray-700" : "text-gray-400"}>
          {selected?.label || "Sin asignar"}
        </span>
        <ChevronDown className={`h-3 w-3 text-gray-400 shrink-0 ml-1 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-lg border border-gray-200 shadow-lg py-1 z-50 max-h-48 overflow-y-auto">
          <button
            type="button"
            onClick={() => { onChange(""); setOpen(false); }}
            className={`w-full px-3 py-1.5 text-xs text-left transition-colors ${!value ? "bg-brand-50 text-brand-700 font-medium" : "text-gray-500 hover:bg-gray-50"}`}
          >
            Sin asignar
          </button>
          {options.map((opt) => (
            <button
              key={opt.field}
              type="button"
              onClick={() => { onChange(opt.field); setOpen(false); }}
              className={`w-full px-3 py-1.5 text-xs text-left transition-colors ${opt.field === value ? "bg-brand-50 text-brand-700 font-medium" : "text-gray-700 hover:bg-gray-50"}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
