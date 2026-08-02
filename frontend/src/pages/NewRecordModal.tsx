import { useState } from "react";
import { X, Loader2, User, Phone, Mail, Tag, Activity } from "lucide-react";
import { motion } from "framer-motion";
import { createClient, getCustomFields } from "@/services/api";
import type { CustomField } from "@/services/api";
import { useEffect } from "react";

interface Props {
  tenantId: string;
  onClose: () => void;
  onCreated: () => void;
}

export function NewRecordModal({ tenantId, onClose, onCreated }: Props) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("active");
  const [tags, setTags] = useState("");
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [customData, setCustomData] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getCustomFields(tenantId).then((fields) => {
      setCustomFields(fields.filter((f) => !f.isSystem && f.fieldType !== "computed"));
    }).catch(() => {});
  }, [tenantId]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!firstName && !lastName && !phone && !email) {
      setError("Ingresa al menos un campo para crear el registro.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const parsedCustomData: Record<string, any> = {};
      for (const [key, val] of Object.entries(customData)) {
        if (val.trim()) parsedCustomData[key] = val.trim();
      }
      await createClient({
        tenantId,
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        status,
        tags: tags.trim() ? tags.split(",").map((t) => t.trim()).filter(Boolean) : undefined,
        customData: Object.keys(parsedCustomData).length > 0 ? parsedCustomData : undefined,
      });
      onCreated();
    } catch {
      setError("Error al crear el registro. Intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  };

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
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl shadow-2xl border border-white/30 p-6 max-h-[85vh] flex flex-col overflow-hidden"
        style={{ background: 'rgba(255, 255, 255, 0.92)', backdropFilter: 'blur(20px)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5 shrink-0">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Nuevo registro</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">Completa los campos para agregar un registro</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} autoComplete="off" className="flex-1 min-h-0 overflow-y-auto space-y-4 px-1 py-1">
          <div className="grid grid-cols-2 gap-3">
            <FloatingInput icon={<User size={16} />} label="Nombre" value={firstName} onChange={setFirstName} />
            <FloatingInput icon={<User size={16} />} label="Apellido" value={lastName} onChange={setLastName} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FloatingInput icon={<Phone size={16} />} label="Teléfono" value={phone} onChange={setPhone} />
            <FloatingInput icon={<Mail size={16} />} label="Email" value={email} onChange={setEmail} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="relative">
                <span className="absolute left-3 top-4 text-gray-400 pointer-events-none">
                  <Activity size={16} />
                </span>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full pl-10 pr-3 pt-5 pb-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inset focus:ring-brand-500 focus:border-brand-500 outline-none transition-all bg-transparent appearance-none"
                >
                  <option value="active">Activo</option>
                  <option value="inactive">Inactivo</option>
                  <option value="blocked">Bloqueado</option>
                </select>
                <label className="absolute left-10 top-1.5 text-[10px] text-brand-600 pointer-events-none">
                  Estado
                </label>
                <span className="absolute right-3 top-4 text-gray-400 pointer-events-none">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </span>
              </div>
            </div>
            <FloatingInput icon={<Tag size={16} />} label="Tags (separar con comas)" value={tags} onChange={setTags} />
          </div>

          {/* Custom fields */}
          {customFields.length > 0 && (
            <div className="pt-3 border-t border-gray-100">
              <p className="text-[10px] font-semibold text-gray-400 uppercase mb-3">Campos personalizados</p>
              <div className="grid grid-cols-2 gap-3">
                {customFields.map((field) => (
                  <div key={field.id}>
                    {field.fieldType === "select" && field.options ? (
                      <div className="relative">
                        <select
                          value={customData[field.fieldKey] || ""}
                          onChange={(e) => setCustomData({ ...customData, [field.fieldKey]: e.target.value })}
                          className="w-full px-3 pt-5 pb-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inset focus:ring-brand-500 focus:border-brand-500 outline-none transition-all bg-transparent appearance-none"
                        >
                          <option value="">Seleccionar...</option>
                          {field.options.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                        <label className="absolute left-3 top-1.5 text-[10px] text-brand-600 pointer-events-none">
                          {field.fieldLabel}
                        </label>
                      </div>
                    ) : (
                      <FloatingInput
                        label={field.fieldLabel}
                        value={customData[field.fieldKey] || ""}
                        onChange={(val) => setCustomData({ ...customData, [field.fieldKey]: val })}
                        type={field.fieldType === "number" ? "number" : "text"}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}
        </form>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-gray-100 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-sm text-gray-600 hover:text-gray-800 rounded-lg hover:bg-gray-100 transition-colors font-medium"
          >
            Cancelar
          </button>
          <button
            onClick={() => handleSubmit()}
            disabled={saving}
            className="relative px-5 py-2.5 text-sm rounded-lg bg-brand-800 hover:bg-brand-700 text-white font-medium transition-all disabled:opacity-50 flex items-center gap-2 overflow-hidden shadow-lg border border-white/10"
          >
            <span className="absolute inset-0 rounded-lg bg-gradient-to-br from-white/20 via-white/5 to-transparent pointer-events-none" />
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin relative z-10" />}
            <span className="relative z-10">{saving ? "Guardando..." : "Crear registro"}</span>
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* Reusable floating label input — same style as Login */
function FloatingInput({
  icon,
  label,
  value,
  onChange,
  type = "text",
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  onChange: (val: string) => void;
  type?: string;
}) {
  const hasIcon = !!icon;
  return (
    <div className="relative">
      {hasIcon && (
        <span className="absolute left-3 top-4 text-gray-400 pointer-events-none transition-colors">
          {icon}
        </span>
      )}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder=" "
        autoComplete="new-password"
        className={`peer w-full ${hasIcon ? 'pl-10' : 'pl-3'} pr-3 pt-5 pb-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inset focus:ring-brand-500 focus:border-brand-500 outline-none transition-all bg-transparent`}
      />
      <label
        className={`absolute ${hasIcon ? 'left-10' : 'left-3'} top-1/2 -translate-y-1/2 text-sm text-gray-500 transition-all duration-200 pointer-events-none peer-focus:top-2 peer-focus:translate-y-0 peer-focus:text-[10px] peer-focus:text-brand-600 peer-[:not(:placeholder-shown)]:top-2 peer-[:not(:placeholder-shown)]:translate-y-0 peer-[:not(:placeholder-shown)]:text-[10px]`}
      >
        {label}
      </label>
    </div>
  );
}
