import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle, Loader2 } from "lucide-react";
import axios from "axios";

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "/api" });

interface FormField {
  id: string;
  type: string;
  label: string;
  placeholder?: string;
  required: boolean;
  options?: string[];
  width?: "full" | "half";
  order: number;
}

interface FormData {
  id: string;
  name: string;
  description: string | null;
  fields: FormField[];
  style: {
    primaryColor?: string;
    backgroundColor?: string;
    buttonText?: string;
    successMessage?: string;
    logoUrl?: string;
  } | null;
}

export function PublicForm() {
  const { formSlug } = useParams();
  const [form, setForm] = useState<FormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!formSlug) return;
    api.get<FormData>(`/forms/public/${formSlug}`)
      .then(({ data }) => {
        setForm(data);
        // Initialize values
        const initial: Record<string, string> = {};
        data.fields.forEach((f) => { if (!["heading", "paragraph"].includes(f.type)) initial[f.id] = ""; });
        setValues(initial);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [formSlug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSubmitting(true);
    try {
      await api.post(`/forms/${form.id}/submit`, { values });
      setSubmitted(true);
    } catch {} finally { setSubmitting(false); }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-6 w-6 text-gray-400 animate-spin" />
      </div>
    );
  }

  if (error || !form) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-lg font-medium text-gray-700">Formulario no encontrado</p>
          <p className="text-sm text-gray-400 mt-1">Este formulario no existe o no está publicado.</p>
        </div>
      </div>
    );
  }

  const style = form.style || {};

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50" style={{ backgroundColor: style.backgroundColor }}>
        <div className="bg-white rounded-2xl shadow-lg p-10 max-w-md w-full mx-4 text-center">
          <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">¡Enviado!</h2>
          <p className="text-sm text-gray-500">{style.successMessage || "Gracias por completar el formulario. Nos pondremos en contacto contigo pronto."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-12 px-4 bg-gray-50" style={{ backgroundColor: style.backgroundColor }}>
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          {style.logoUrl && (
            <img src={style.logoUrl} alt="" className="h-10 mb-6" />
          )}
          <h1 className="text-2xl font-bold text-gray-900 mb-1">{form.name}</h1>
          {form.description && <p className="text-sm text-gray-500 mb-6">{form.description}</p>}

          <form onSubmit={handleSubmit} className="space-y-5">
            {form.fields.map((field) => {
              if (field.type === "heading") {
                return <h3 key={field.id} className="text-lg font-semibold text-gray-800 pt-2">{field.label}</h3>;
              }
              if (field.type === "paragraph") {
                return <p key={field.id} className="text-sm text-gray-500">{field.label}</p>;
              }

              return (
                <div key={field.id}>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {field.label}{field.required && <span className="text-red-400 ml-0.5">*</span>}
                  </label>
                  {field.type === "textarea" ? (
                    <textarea
                      value={values[field.id] || ""}
                      onChange={(e) => setValues({ ...values, [field.id]: e.target.value })}
                      placeholder={field.placeholder}
                      required={field.required}
                      rows={4}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none resize-none"
                    />
                  ) : field.type === "select" ? (
                    <select
                      value={values[field.id] || ""}
                      onChange={(e) => setValues({ ...values, [field.id]: e.target.value })}
                      required={field.required}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white"
                    >
                      <option value="">{field.placeholder || "Seleccionar..."}</option>
                      {field.options?.map((o, i) => <option key={i} value={o}>{o}</option>)}
                    </select>
                  ) : field.type === "radio" ? (
                    <div className="space-y-2">
                      {field.options?.map((o, i) => (
                        <label key={i} className="flex items-center gap-2.5 text-sm text-gray-700 cursor-pointer">
                          <input
                            type="radio"
                            name={field.id}
                            value={o}
                            checked={values[field.id] === o}
                            onChange={(e) => setValues({ ...values, [field.id]: e.target.value })}
                            required={field.required}
                            className="text-brand-600"
                          />
                          {o}
                        </label>
                      ))}
                    </div>
                  ) : field.type === "checkbox" ? (
                    <div className="space-y-2">
                      {field.options?.map((o, i) => (
                        <label key={i} className="flex items-center gap-2.5 text-sm text-gray-700 cursor-pointer">
                          <input
                            type="checkbox"
                            value={o}
                            checked={(values[field.id] || "").split(",").includes(o)}
                            onChange={(e) => {
                              const current = (values[field.id] || "").split(",").filter(Boolean);
                              const updated = e.target.checked ? [...current, o] : current.filter((v) => v !== o);
                              setValues({ ...values, [field.id]: updated.join(",") });
                            }}
                            className="rounded text-brand-600"
                          />
                          {o}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <input
                      type={field.type === "email" ? "email" : field.type === "phone" ? "tel" : field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                      value={values[field.id] || ""}
                      onChange={(e) => setValues({ ...values, [field.id]: e.target.value })}
                      placeholder={field.placeholder}
                      required={field.required}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                    />
                  )}
                </div>
              );
            })}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-xl text-sm font-medium text-white transition-colors disabled:opacity-60"
              style={{ backgroundColor: style.primaryColor || "#4f46e5" }}
            >
              {submitting ? "Enviando..." : style.buttonText || "Enviar"}
            </button>
          </form>
        </div>
        <p className="text-center text-[10px] text-gray-400 mt-4">Powered by Smarter</p>
      </div>
    </div>
  );
}
