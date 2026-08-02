import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, GripVertical, Trash2, Eye, Save, Copy, ExternalLink, Type, Mail, Phone, Hash, AlignLeft, List, CircleDot, CheckSquare, Calendar, FileUp, Heading, FileText } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import headerBg from "@/assets/header-background.jpg";
import axios from "axios";

const api = axios.create({ baseURL: "http://localhost:3001/api" });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

interface FormField {
  id: string;
  type: string;
  label: string;
  placeholder?: string;
  required: boolean;
  options?: string[];
  mapTo?: string;
  width?: "full" | "half";
  order: number;
}

interface FormStyle {
  primaryColor?: string;
  backgroundColor?: string;
  buttonText?: string;
  successMessage?: string;
}

interface Form {
  id: string;
  name: string;
  description: string | null;
  fields: FormField[];
  style: FormStyle | null;
  status: string;
  slug: string | null;
  submissionCount: number;
}

const FIELD_TYPES = [
  { type: "text", label: "Texto", icon: Type },
  { type: "email", label: "Email", icon: Mail },
  { type: "phone", label: "Teléfono", icon: Phone },
  { type: "number", label: "Número", icon: Hash },
  { type: "textarea", label: "Texto largo", icon: AlignLeft },
  { type: "select", label: "Desplegable", icon: List },
  { type: "radio", label: "Opción única", icon: CircleDot },
  { type: "checkbox", label: "Múltiple", icon: CheckSquare },
  { type: "date", label: "Fecha", icon: Calendar },
  { type: "file", label: "Archivo", icon: FileUp },
  { type: "heading", label: "Título", icon: Heading },
  { type: "paragraph", label: "Párrafo", icon: FileText },
];

export function FormBuilder() {
  const { slug, id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [form, setForm] = useState<Form | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeField, setActiveField] = useState<string | null>(null);
  const [showFieldPanel, setShowFieldPanel] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!id) return;
    api.get<Form>(`/forms/${id}`)
      .then(({ data }) => setForm(data))
      .catch(() => navigate(`/${slug}/inboxes`))
      .finally(() => setLoading(false));
  }, [id]);

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const { data } = await api.put<Form>(`/forms/${form.id}`, {
        name: form.name,
        description: form.description,
        fields: form.fields,
        style: form.style,
      });
      setForm(data);
    } catch {} finally { setSaving(false); }
  };

  const publish = async () => {
    if (!form) return;
    const { data } = await api.put<Form>(`/forms/${form.id}`, { status: "published" });
    setForm(data);
  };

  const addField = (type: string) => {
    if (!form) return;
    const newField: FormField = {
      id: `field-${Date.now()}`,
      type,
      label: FIELD_TYPES.find((f) => f.type === type)?.label || "Campo",
      placeholder: "",
      required: false,
      options: ["select", "radio", "checkbox"].includes(type) ? ["Opción 1", "Opción 2"] : undefined,
      width: "full",
      order: form.fields.length,
    };
    setForm({ ...form, fields: [...form.fields, newField] });
    setActiveField(newField.id);
    setShowFieldPanel(false);
  };

  const updateField = (fieldId: string, updates: Partial<FormField>) => {
    if (!form) return;
    setForm({
      ...form,
      fields: form.fields.map((f) => f.id === fieldId ? { ...f, ...updates } : f),
    });
  };

  const removeField = (fieldId: string) => {
    if (!form) return;
    setForm({ ...form, fields: form.fields.filter((f) => f.id !== fieldId) });
    if (activeField === fieldId) setActiveField(null);
  };

  const moveField = (fromIdx: number, toIdx: number) => {
    if (!form) return;
    const fields = [...form.fields];
    const [moved] = fields.splice(fromIdx, 1);
    fields.splice(toIdx, 0, moved);
    setForm({ ...form, fields: fields.map((f, i) => ({ ...f, order: i })) });
  };

  const activeFieldData = form?.fields.find((f) => f.id === activeField);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-gray-400">Cargando...</p>
      </div>
    );
  }

  if (!form) return null;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Hero */}
      <div className="px-8 pt-16 pb-4 shrink-0 rounded-b-2xl" style={{ backgroundImage: `url(${headerBg})`, backgroundSize: "cover", backgroundPosition: "center" }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(`/${slug}/inboxes`)} className="p-1.5 rounded-lg hover:bg-white/10 text-white transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="text-xl font-bold text-white bg-transparent border-none outline-none focus:ring-0 p-0 placeholder-white/50"
                placeholder="Nombre del formulario"
              />
              <p className="text-brand-300 mt-0.5 text-sm">
                {form.status === "published" ? "Publicado" : "Borrador"} · {form.submissionCount} envíos
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPreviewMode(!previewMode)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${previewMode ? "bg-white/20 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"}`}
            >
              <Eye className="h-4 w-4" />
              Vista previa
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors"
            >
              <Save className="h-4 w-4" />
              {saving ? "Guardando..." : "Guardar"}
            </button>
            {form.status !== "published" ? (
              <button
                onClick={publish}
                className="px-4 py-1.5 rounded-lg text-sm font-medium bg-white/15 hover:bg-white/25 text-white transition-colors"
              >
                Publicar
              </button>
            ) : (
              <button
                onClick={() => { if (form.slug) navigator.clipboard.writeText(`${window.location.origin}/f/${form.slug}`); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-green-500/80 hover:bg-green-500 text-white transition-colors"
              >
                <Copy className="h-3.5 w-3.5" />
                Copiar link
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Builder */}
      <div className="flex-1 flex overflow-hidden mt-4 rounded-t-xl border border-gray-200 bg-white">
        {/* Canvas */}
        <div className="flex-1 overflow-y-auto bg-gray-50 p-8">
          <div className="max-w-lg mx-auto">
            {previewMode ? (
              <FormPreview form={form} />
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                {/* Form title */}
                <div className="mb-6">
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="text-xl font-bold text-gray-900 w-full bg-transparent border-none outline-none"
                    placeholder="Título del formulario"
                  />
                  <input
                    type="text"
                    value={form.description || ""}
                    onChange={(e) => setForm({ ...form, description: e.target.value || null })}
                    className="text-sm text-gray-500 w-full bg-transparent border-none outline-none mt-1"
                    placeholder="Descripción (opcional)"
                  />
                </div>

                {/* Fields */}
                <div className="space-y-3">
                  {form.fields.map((field, idx) => (
                    <div
                      key={field.id}
                      draggable
                      onDragStart={() => setDraggedIdx(idx)}
                      onDragOver={(e) => { e.preventDefault(); if (draggedIdx !== null && draggedIdx !== idx) setDragOverIdx(idx); }}
                      onDragLeave={() => setDragOverIdx(null)}
                      onDrop={() => { if (draggedIdx !== null && draggedIdx !== idx) moveField(draggedIdx, idx); setDraggedIdx(null); setDragOverIdx(null); }}
                      onDragEnd={() => { setDraggedIdx(null); setDragOverIdx(null); }}
                      onClick={() => setActiveField(field.id)}
                      className={`group flex items-start gap-2 p-3 rounded-lg border transition-all cursor-pointer ${dragOverIdx === idx ? "border-brand-400 border-dashed bg-brand-50/50" : activeField === field.id ? "border-brand-500 bg-brand-50/30 ring-1 ring-brand-200" : "border-gray-200 hover:border-gray-300"} ${draggedIdx === idx ? "opacity-50" : ""}`}
                    >
                      <div className="pt-1 cursor-grab text-gray-300 group-hover:text-gray-400">
                        <GripVertical className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-700">{field.label}{field.required && <span className="text-red-400 ml-0.5">*</span>}</p>
                        <FieldPreviewMini field={field} />
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeField(field.id); }}
                        className="p-1 rounded text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add field */}
                <div className="mt-4">
                  <button
                    onClick={() => setShowFieldPanel(true)}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border-2 border-dashed border-gray-200 text-sm text-gray-500 hover:border-brand-300 hover:text-brand-600 transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    Agregar campo
                  </button>
                </div>

                {/* Field type picker */}
                {showFieldPanel && (
                  <div className="mt-3 p-4 rounded-lg border border-gray-200 bg-gray-50">
                    <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">Tipo de campo</p>
                    <div className="grid grid-cols-3 gap-2">
                      {FIELD_TYPES.map((ft) => {
                        const Icon = ft.icon;
                        return (
                          <button
                            key={ft.type}
                            onClick={() => addField(ft.type)}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-gray-700 bg-white border border-gray-200 hover:border-brand-300 hover:bg-brand-50 transition-colors"
                          >
                            <Icon className="h-3.5 w-3.5 text-gray-400" />
                            {ft.label}
                          </button>
                        );
                      })}
                    </div>
                    <button onClick={() => setShowFieldPanel(false)} className="mt-2 text-xs text-gray-400 hover:text-gray-600">Cancelar</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Properties panel */}
        {activeFieldData && !previewMode && (
          <div className="w-72 border-l border-gray-200 bg-white overflow-y-auto p-4 shrink-0">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Propiedades</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Etiqueta</label>
                <input
                  type="text"
                  value={activeFieldData.label}
                  onChange={(e) => updateField(activeFieldData.id, { label: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-brand-500"
                />
              </div>
              {!["heading", "paragraph"].includes(activeFieldData.type) && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Placeholder</label>
                    <input
                      type="text"
                      value={activeFieldData.placeholder || ""}
                      onChange={(e) => updateField(activeFieldData.id, { placeholder: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-brand-500"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={activeFieldData.required}
                      onChange={(e) => updateField(activeFieldData.id, { required: e.target.checked })}
                      className="rounded border-gray-300"
                      id="field-required"
                    />
                    <label htmlFor="field-required" className="text-xs text-gray-600">Obligatorio</label>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Ancho</label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => updateField(activeFieldData.id, { width: "full" })}
                        className={`flex-1 py-1.5 text-xs rounded-lg border ${activeFieldData.width === "full" ? "border-brand-500 bg-brand-50 text-brand-700" : "border-gray-200 text-gray-600"}`}
                      >
                        Completo
                      </button>
                      <button
                        onClick={() => updateField(activeFieldData.id, { width: "half" })}
                        className={`flex-1 py-1.5 text-xs rounded-lg border ${activeFieldData.width === "half" ? "border-brand-500 bg-brand-50 text-brand-700" : "border-gray-200 text-gray-600"}`}
                      >
                        Mitad
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Mapear a contacto</label>
                    <MapToSelector
                      value={activeFieldData.mapTo || ""}
                      onChange={(val) => updateField(activeFieldData.id, { mapTo: val || undefined })}
                    />
                    <p className="text-[10px] text-gray-400 mt-1">Vincula este campo a un dato del contacto</p>
                  </div>
                </>
              )}
              {activeFieldData.options && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Opciones</label>
                  <div className="space-y-1.5">
                    {activeFieldData.options.map((opt, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={opt}
                          onChange={(e) => {
                            const newOpts = [...(activeFieldData.options || [])];
                            newOpts[i] = e.target.value;
                            updateField(activeFieldData.id, { options: newOpts });
                          }}
                          className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-xs outline-none focus:border-brand-500"
                        />
                        <button
                          onClick={() => {
                            const newOpts = (activeFieldData.options || []).filter((_, idx) => idx !== i);
                            updateField(activeFieldData.id, { options: newOpts });
                          }}
                          className="p-1 text-gray-300 hover:text-red-500"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => updateField(activeFieldData.id, { options: [...(activeFieldData.options || []), `Opción ${(activeFieldData.options?.length || 0) + 1}`] })}
                      className="text-xs text-brand-600 font-medium hover:text-brand-700"
                    >
                      + Agregar opción
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FieldPreviewMini({ field }: { field: FormField }) {
  switch (field.type) {
    case "heading":
      return <p className="text-xs text-gray-400 italic">Título decorativo</p>;
    case "paragraph":
      return <p className="text-xs text-gray-400 italic">Texto descriptivo</p>;
    case "select":
      return <div className="mt-1 h-7 bg-gray-100 rounded border border-gray-200 w-full" />;
    case "textarea":
      return <div className="mt-1 h-14 bg-gray-100 rounded border border-gray-200 w-full" />;
    case "checkbox":
    case "radio":
      return (
        <div className="mt-1 space-y-1">
          {(field.options || []).slice(0, 2).map((o, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className={`h-3 w-3 border border-gray-300 ${field.type === "radio" ? "rounded-full" : "rounded-sm"}`} />
              <span className="text-[10px] text-gray-400">{o}</span>
            </div>
          ))}
        </div>
      );
    default:
      return <div className="mt-1 h-7 bg-gray-100 rounded border border-gray-200 w-full" />;
  }
}

function FormPreview({ form }: { form: Form }) {
  const style = form.style || {};
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8" style={{ backgroundColor: style.backgroundColor }}>
      <h2 className="text-xl font-bold text-gray-900 mb-1">{form.name}</h2>
      {form.description && <p className="text-sm text-gray-500 mb-6">{form.description}</p>}
      <div className="space-y-4">
        {form.fields.map((field) => (
          <div key={field.id} className={field.width === "half" ? "inline-block w-[48%] mr-[4%] align-top" : ""}>
            {field.type === "heading" ? (
              <h3 className="text-lg font-semibold text-gray-800 mt-2">{field.label}</h3>
            ) : field.type === "paragraph" ? (
              <p className="text-sm text-gray-500">{field.label}</p>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {field.label}{field.required && <span className="text-red-400 ml-0.5">*</span>}
                </label>
                {field.type === "textarea" ? (
                  <textarea className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder={field.placeholder} rows={3} />
                ) : field.type === "select" ? (
                  <select className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    <option value="">{field.placeholder || "Seleccionar..."}</option>
                    {field.options?.map((o, i) => <option key={i}>{o}</option>)}
                  </select>
                ) : field.type === "radio" ? (
                  <div className="space-y-1.5">
                    {field.options?.map((o, i) => (
                      <label key={i} className="flex items-center gap-2 text-sm text-gray-700">
                        <input type="radio" name={field.id} className="text-brand-600" /> {o}
                      </label>
                    ))}
                  </div>
                ) : field.type === "checkbox" ? (
                  <div className="space-y-1.5">
                    {field.options?.map((o, i) => (
                      <label key={i} className="flex items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" className="rounded text-brand-600" /> {o}
                      </label>
                    ))}
                  </div>
                ) : (
                  <input
                    type={field.type === "email" ? "email" : field.type === "phone" ? "tel" : field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    placeholder={field.placeholder}
                  />
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      <button
        className="mt-6 w-full py-2.5 rounded-lg text-sm font-medium text-white transition-colors"
        style={{ backgroundColor: style.primaryColor || "#4f46e5" }}
      >
        {style.buttonText || "Enviar"}
      </button>
    </div>
  );
}

const MAP_OPTIONS = [
  { value: "", label: "Sin mapeo", group: null },
  { value: "firstName", label: "Nombre", group: "Contacto" },
  { value: "lastName", label: "Apellido", group: "Contacto" },
  { value: "email", label: "Email", group: "Contacto" },
  { value: "phone", label: "Teléfono", group: "Contacto" },
  { value: "message", label: "Mensaje (conversación)", group: "Otros" },
  { value: "custom", label: "Campo personalizado", group: "Otros" },
];

function MapToSelector({ value, onChange }: { value: string; onChange: (val: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = MAP_OPTIONS.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 border border-gray-200 rounded-lg text-sm text-left hover:border-gray-300 transition-colors bg-white"
      >
        <span className={selected?.value ? "text-gray-700" : "text-gray-400"}>{selected?.label || "Sin mapeo"}</span>
        <svg className={`h-3.5 w-3.5 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 max-h-52 overflow-y-auto">
          {(() => {
            let lastGroup: string | null = null;
            return MAP_OPTIONS.map((opt) => {
              const showGroup = opt.group && opt.group !== lastGroup;
              lastGroup = opt.group;
              return (
                <div key={opt.value}>
                  {showGroup && (
                    <p className="px-3 pt-2 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{opt.group}</p>
                  )}
                  <button
                    onClick={() => { onChange(opt.value); setOpen(false); }}
                    className={`w-full flex items-center justify-between px-3 py-1.5 text-sm transition-colors ${value === opt.value ? "bg-brand-50 text-brand-700 font-medium" : "text-gray-700 hover:bg-gray-50"}`}
                  >
                    <span>{opt.label}</span>
                    {value === opt.value && <span className="text-brand-500 text-xs">✓</span>}
                  </button>
                </div>
              );
            });
          })()}
        </div>
      )}
    </div>
  );
}
