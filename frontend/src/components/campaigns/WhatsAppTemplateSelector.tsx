import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Info, ChevronDown } from "lucide-react";
import axios from "axios";

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "/api" });

interface AvailableField {
  field: string;
  label: string;
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
}: Props) {
  const [fields, setFields] = useState<AvailableField[]>([]);
  const [templateName, setTemplateName] = useState(selectedTemplate || "");
  const [language, setLanguage] = useState(selectedLanguage || "es");
  const [variableCount, setVariableCount] = useState(() => {
    const keys = Object.keys(variableMapping || {});
    return keys.length > 0 ? Math.max(...keys.map(Number)) : 0;
  });

  useEffect(() => {
    const params = tenantId ? { tenantId } : {};
    api.get<AvailableField[]>("/campaigns/whatsapp/available-fields", { params })
      .then(({ data }) => setFields(data))
      .catch(() => {});
  }, [tenantId]);

  useEffect(() => {
    setTemplateName(selectedTemplate || "");
    setLanguage(selectedLanguage || "es");
  }, [selectedTemplate, selectedLanguage]);

  const handleTemplateNameChange = (name: string) => {
    setTemplateName(name);
    onTemplateChange(name, language);
  };

  const handleLanguageChange = (lang: string) => {
    setLanguage(lang);
    onTemplateChange(templateName, lang);
  };

  const addVariable = () => {
    const newNum = variableCount + 1;
    setVariableCount(newNum);
    onMappingChange({ ...variableMapping, [String(newNum)]: "" });
  };

  const removeVariable = (num: string) => {
    const updated = { ...variableMapping };
    delete updated[num];
    onMappingChange(updated);
    // Recalculate variable count
    const keys = Object.keys(updated);
    setVariableCount(keys.length > 0 ? Math.max(...keys.map(Number)) : 0);
  };

  const variableKeys = Object.keys(variableMapping || {}).sort((a, b) => Number(a) - Number(b));

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-base font-semibold text-gray-900 mb-1">
        Plantilla de WhatsApp
      </h2>
      <p className="text-xs text-gray-400 mb-5">
        Configura el nombre de la plantilla aprobada en Meta y asigna las variables
      </p>

      {/* Template name */}
      <div className="mb-4">
        <label className="text-sm font-medium text-gray-700 block mb-1.5">
          Nombre de la plantilla
        </label>
        <input
          type="text"
          value={templateName}
          onChange={(e) => handleTemplateNameChange(e.target.value)}
          placeholder="Ej: bienvenida_cliente, promo_semanal..."
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all"
        />
        <p className="text-[11px] text-gray-400 mt-1.5 flex items-start gap-1">
          <Info className="h-3 w-3 mt-0.5 shrink-0" />
          Usa el nombre exacto de la plantilla aprobada en Meta/Onurix (sin espacios, con guiones bajos)
        </p>
      </div>

      {/* Language */}
      <div className="mb-5">
        <label className="text-sm font-medium text-gray-700 block mb-1.5">
          Código de idioma
        </label>
        <input
          type="text"
          value={language}
          onChange={(e) => handleLanguageChange(e.target.value)}
          placeholder="es"
          className="w-32 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all"
        />
      </div>

      {/* Variables */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-700">
            Variables del body
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

        {variableKeys.length === 0 ? (
          <p className="text-xs text-gray-400 py-3 text-center bg-gray-50 rounded-lg">
            Sin variables. Si la plantilla usa {"{{1}}"}, {"{{2}}"}, etc., agrégalas aquí.
          </p>
        ) : (
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
        )}
      </div>

      {/* Preview */}
      {templateName && variableKeys.length > 0 && (
        <div className="mb-5 p-3 rounded-lg bg-green-50 border border-green-200">
          <p className="text-[10px] font-semibold text-green-700 uppercase mb-1">Vista previa del envío</p>
          <p className="text-xs text-green-800 font-mono">
            Template: <strong>{templateName}</strong> ({language})
          </p>
          <p className="text-xs text-green-700 mt-1">
            Variables: {variableKeys.map((k) => {
              const mapped = variableMapping[k];
              const label = fields.find((f) => f.field === mapped)?.label || mapped || "sin asignar";
              return `{{${k}}} = ${label}`;
            }).join(", ")}
          </p>
        </div>
      )}

      {/* Save button */}
      <div className="flex justify-end pt-3 border-t border-gray-100">
        <Button
          onClick={onSave}
          disabled={saving || !templateName.trim()}
          className="bg-brand-800 hover:bg-brand-700 text-white"
          size="sm"
        >
          {saving ? "Guardando..." : "Guardar plantilla"}
        </Button>
      </div>
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
