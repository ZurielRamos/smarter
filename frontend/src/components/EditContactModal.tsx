import { useEffect, useState, useRef, useMemo } from "react";
import { Loader2, X } from "lucide-react";
import { useParams } from "react-router-dom";
import { getCustomFields } from "@/services/api";
import type { ClientRecord } from "@/services/api";
import { useAuth } from "@/context/AuthContext";
import axios from "axios";

/**
 * Modal de edición de contacto. Carga los campos personalizados del tenant,
 * agrupa e inicializa el formulario con los valores del `client` y guarda vía
 * PUT /records/:id. Reutilizable desde la vista de Contactos y el chat.
 */
export function EditContactModal({ client, onClose, onSaved }: { client: ClientRecord; onClose: () => void; onSaved: () => void }) {
  const { slug } = useParams();
  const { user } = useAuth();
  const tenantRole = user?.tenantRoles.find((tr) => tr.tenant.slug === slug);
  const tenantId = tenantRole?.tenantId || "";

  const [fields, setFields] = useState<any[]>([]);
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loadingFields, setLoadingFields] = useState(true);

  useEffect(() => {
    const EXCLUDED_FIELDS = ["createdAt", "lastContactAt", "lastActivityAt", "fullName"];
    getCustomFields(tenantId).then((allFields) => {
      const editableFields = allFields.filter((f) => !EXCLUDED_FIELDS.includes(f.fieldKey) && f.fieldType !== "computed");
      setFields(editableFields.sort((a, b) => a.sortOrder - b.sortOrder));
      const initial: Record<string, any> = {};
      allFields.forEach((f) => {
        if (f.isSystem) {
          const val = (client as any)[f.fieldKey];
          if (f.fieldType === "date" && val) initial[f.fieldKey] = String(val).split("T")[0];
          else if (f.fieldType === "boolean") initial[f.fieldKey] = val ? "true" : "false";
          else initial[f.fieldKey] = val ?? "";
        } else {
          initial[f.fieldKey] = client.customData?.[f.fieldKey] ?? "";
        }
      });
      initial._tags = (client.tags || []).join(", ");
      setForm(initial);
    }).catch(() => {}).finally(() => setLoadingFields(false));
  }, [tenantId]);

  const set = (key: string, value: any) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true); setError("");
    try {
      const systemFields: Record<string, any> = {};
      const customData: Record<string, any> = { ...(client.customData || {}) };
      fields.forEach((f) => {
        const val = form[f.fieldKey];
        if (f.isSystem) {
          if (f.fieldType === "boolean") systemFields[f.fieldKey] = val === "true";
          else if (f.fieldType === "number") systemFields[f.fieldKey] = val ? Number(val) : 0;
          else systemFields[f.fieldKey] = val || null;
        } else {
          customData[f.fieldKey] = val || null;
        }
      });
      const tags = form._tags ? form._tags.split(",").map((t: string) => t.trim()).filter(Boolean) : null;
      const token = localStorage.getItem("token");
      await axios.put(`${import.meta.env.VITE_API_URL || "/api"}/records/${client.id}`, { ...systemFields, tags, customData }, { headers: { Authorization: `Bearer ${token}` } });
      onSaved();
    } catch (err: any) { setError(err.response?.data?.message || "Error al guardar"); } finally { setSaving(false); }
  };

  const groups = useMemo(() => {
    const map: Record<string, any[]> = {};
    fields.forEach((f) => { const g = f.fieldGroup || "general"; if (!map[g]) map[g] = []; map[g].push(f); });
    return map;
  }, [fields]);

  const KNOWN_ORDER = ["identificacion", "contacto", "demografia", "ubicacion", "segmentacion", "consentimiento", "actividad"];
  const groupKeys = [...KNOWN_ORDER, ...Object.keys(groups).filter((g) => !KNOWN_ORDER.includes(g))].filter((g) => groups[g]?.length);

  const fullName = [client.firstName, client.lastName].filter(Boolean).join(" ") || "Sin nombre";

  if (loadingFields) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl p-8"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-2xl shadow-2xl border border-white/30 flex flex-col max-h-[85vh] overflow-hidden"
        style={{ background: "rgba(255, 255, 255, 0.94)", backdropFilter: "blur(24px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Editar contacto</h3>
            <p className="text-xs text-gray-400 mt-0.5">{fullName} · {client.phone || client.email || ""}</p>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-5">
          {groupKeys.map((groupKey) => {
            const groupFields = groups[groupKey] || [];
            return (
              <div key={groupKey}>
                <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3 capitalize">{groupKey}</h4>
                <div className="grid grid-cols-2 gap-3">
                  {groupFields.map((f: any) => (
                    <EditFieldInput key={f.id} field={f} value={form[f.fieldKey] ?? ""} onChange={(val) => set(f.fieldKey, val)} />
                  ))}
                </div>
              </div>
            );
          })}

          {/* Tags */}
          <div>
            <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Etiquetas</h4>
            <input
              type="text"
              value={form._tags || ""}
              onChange={(e) => set("_tags", e.target.value)}
              placeholder="vip, nuevo, referido (separados por coma)"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
            />
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 rounded-lg hover:bg-gray-100 transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-50 shadow-sm flex items-center gap-2"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditFieldInput({ field, value, onChange }: { field: any; value: any; onChange: (val: string) => void }) {
  const [selectOpen, setSelectOpen] = useState(false);
  const selectRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selectOpen) return;
    const close = (e: MouseEvent) => { if (selectRef.current && !selectRef.current.contains(e.target as Node)) setSelectOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [selectOpen]);

  if (field.fieldType === "boolean") {
    return (
      <div className="flex items-center justify-between py-2">
        <label className="text-sm text-gray-700">{field.fieldLabel}</label>
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

  if (field.fieldType === "select" && field.options?.length) {
    return (
      <div>
        <label className="block text-xs text-gray-500 mb-1">{field.fieldLabel}</label>
        <div className="relative" ref={selectRef}>
          <button
            type="button"
            onClick={() => setSelectOpen((v) => !v)}
            className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-left flex items-center justify-between transition-all ${selectOpen ? "ring-2 ring-brand-500 border-transparent" : "hover:border-gray-400"}`}
          >
            <span className={value ? "text-gray-900 capitalize" : "text-gray-400"}>{value || "Seleccionar..."}</span>
            <svg className={`h-4 w-4 text-gray-400 transition-transform ${selectOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>
          {selectOpen && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-lg border border-gray-200 shadow-lg py-1 z-50 max-h-48 overflow-auto">
              <button type="button" onClick={() => { onChange(""); setSelectOpen(false); }} className="w-full px-3 py-2 text-sm text-left text-gray-400 hover:bg-gray-50 italic">Ninguno</button>
              {field.options.map((opt: string) => (
                <button key={opt} type="button" onClick={() => { onChange(opt); setSelectOpen(false); }} className={`w-full px-3 py-2 text-sm text-left transition-colors capitalize ${value === opt ? "bg-brand-50 text-brand-700 font-medium" : "text-gray-700 hover:bg-gray-50"}`}>{opt}</button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{field.fieldLabel}</label>
      <input
        type={field.fieldType === "date" ? "date" : field.fieldType === "number" ? "number" : field.fieldKey === "email" ? "email" : "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.validations?.placeholder || ""}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
      />
    </div>
  );
}
