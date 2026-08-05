import { useState, useEffect, useRef } from "react";
import { X, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { createClient, getCustomFields } from "@/services/api";
import type { CustomField } from "@/services/api";

interface Props {
  tenantId: string;
  onClose: () => void;
  onCreated: () => void;
}

const KNOWN_GROUP_ORDER = ["identificacion", "contacto", "demografia", "ubicacion", "segmentacion", "consentimiento", "actividad"];

// System fields that map to top-level createClient payload keys
const SYSTEM_PAYLOAD_KEYS: Record<string, string> = {
  firstName: "firstName",
  lastName: "lastName",
  phone: "phone",
  email: "email",
  status: "status",
  channelSource: "channelSource",
  tags: "tags",
  countryCode: "countryCode",
  documentType: "documentType",
  documentNumber: "documentNumber",
  gender: "gender",
  birthDate: "birthDate",
  city: "city",
  region: "region",
  source: "source",
  score: "score",
};

// Fields to skip in the form (auto-managed)
const SKIP_FIELDS = new Set(["fullName", "lastContactAt", "lastActivityAt", "optInWhatsapp", "optInEmail", "assignedTo"]);

export function NewRecordModal({ tenantId, onClose, onCreated }: Props) {
  const [allFields, setAllFields] = useState<CustomField[]>([]);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCustomFields(tenantId).then((fields) => {
      setAllFields(fields.filter((f) => f.fieldType !== "computed" && !SKIP_FIELDS.has(f.fieldKey)));
      // Set default values
      const defaults: Record<string, string> = {};
      for (const f of fields) {
        if (f.defaultValue) defaults[f.fieldKey] = f.defaultValue;
      }
      if (!defaults.status) defaults.status = "lead";
      setFormData(defaults);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [tenantId]);

  function setValue(key: string, value: string) {
    setFormData((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const hasData = Object.values(formData).some((v) => v.trim());
    if (!hasData) {
      setError("Ingresa al menos un campo para crear el registro.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload: any = { tenantId };
      const customData: Record<string, any> = {};

      for (const [key, val] of Object.entries(formData)) {
        if (!val.trim()) continue;
        if (SYSTEM_PAYLOAD_KEYS[key]) {
          if (key === "tags") {
            payload.tags = val.split(",").map((t) => t.trim()).filter(Boolean);
          } else if (key === "score") {
            payload.score = Number(val);
          } else {
            payload[SYSTEM_PAYLOAD_KEYS[key]] = val.trim();
          }
        } else {
          customData[key] = val.trim();
        }
      }

      if (Object.keys(customData).length > 0) payload.customData = customData;
      await createClient(payload);
      onCreated();
    } catch {
      setError("Error al crear el registro. Intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  // Group fields
  const grouped: Record<string, CustomField[]> = {};
  for (const f of allFields) {
    const g = f.fieldGroup || "general";
    if (!grouped[g]) grouped[g] = [];
    grouped[g].push(f);
  }
  const groupKeys = Object.keys(grouped).sort((a, b) => {
    const ia = KNOWN_GROUP_ORDER.indexOf(a);
    const ib = KNOWN_GROUP_ORDER.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    if (a === "general") return 1;
    if (b === "general") return -1;
    return a.localeCompare(b);
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-2xl shadow-2xl border border-white/30 flex flex-col max-h-[85vh] overflow-hidden"
        style={{ background: "rgba(255, 255, 255, 0.94)", backdropFilter: "blur(24px)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Nuevo contacto</h3>
            <p className="text-xs text-gray-400 mt-0.5">Completa la información del contacto</p>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} autoComplete="off" className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          ) : (
            groupKeys.map((group) => (
              <div key={group}>
                <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3 capitalize">{group}</h4>
                <div className="grid grid-cols-2 gap-3">
                  {grouped[group].map((field) => (
                    <FieldInput
                      key={field.id}
                      field={field}
                      value={formData[field.fieldKey] || ""}
                      onChange={(val) => setValue(field.fieldKey, val)}
                    />
                  ))}
                </div>
              </div>
            ))
          )}

          {error && (
            <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 shrink-0">
          <p className="text-[11px] text-gray-400">Los campos marcados con * son requeridos</p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 rounded-lg hover:bg-gray-100 transition-colors">
              Cancelar
            </button>
            <button
              onClick={() => handleSubmit()}
              disabled={saving}
              className="px-5 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-50 shadow-sm flex items-center gap-2"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {saving ? "Guardando..." : "Crear contacto"}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function FieldInput({ field, value, onChange }: { field: CustomField; value: string; onChange: (val: string) => void }) {
  const isSelect = field.fieldType === "select" && field.options && field.options.length > 0;
  const isBoolean = field.fieldType === "boolean";
  const isDate = field.fieldType === "date";
  const isNumber = field.fieldType === "number";

  if (isSelect) {
    return (
      <div>
        <label className="block text-xs text-gray-500 mb-1">
          {field.fieldLabel}{field.isRequired && <span className="text-red-400 ml-0.5">*</span>}
        </label>
        <SelectInput value={value} onChange={onChange} options={field.options!} placeholder="Seleccionar..." />
      </div>
    );
  }

  if (isBoolean) {
    return (
      <div className="flex items-center justify-between py-2">
        <label className="text-sm text-gray-700">
          {field.fieldLabel}{field.isRequired && <span className="text-red-400 ml-0.5">*</span>}
        </label>
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

  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">
        {field.fieldLabel}{field.isRequired && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <input
        type={isDate ? "date" : isNumber ? "number" : "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.validations?.placeholder || ""}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
      />
    </div>
  );
}

function SelectInput({ value, onChange, options, placeholder }: { value: string; onChange: (val: string) => void; options: string[]; placeholder: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-left flex items-center justify-between transition-all ${open ? "ring-2 ring-brand-500 border-transparent" : "hover:border-gray-400"}`}
      >
        <span className={value ? "text-gray-900" : "text-gray-400"}>{value || placeholder}</span>
        <svg className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-lg border border-gray-200 shadow-lg py-1 z-50 max-h-48 overflow-auto">
          <button
            type="button"
            onClick={() => { onChange(""); setOpen(false); }}
            className={`w-full px-3 py-2 text-sm text-left transition-colors ${!value ? "bg-gray-50 text-gray-400 italic" : "text-gray-400 hover:bg-gray-50"}`}
          >
            {placeholder}
          </button>
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => { onChange(opt); setOpen(false); }}
              className={`w-full px-3 py-2 text-sm text-left transition-colors capitalize ${value === opt ? "bg-brand-50 text-brand-700 font-medium" : "text-gray-700 hover:bg-gray-50"}`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
