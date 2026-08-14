import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Plus, Pencil, Trash2, Loader2, Mail, Eye, Copy, Globe } from "lucide-react";
import { api } from "@/services/api";
import { ConfirmModal } from "@/components/ConfirmModal";
import type { EmailRow } from "./email-builder";

interface EmailTemplateTranslation {
  id: string;
  templateId: string;
  language: string;
  subject: string;
  blocks: EmailRow[] | null;
  html: string;
  createdAt: string;
  updatedAt: string;
}

interface EmailTemplate {
  id: string;
  tenantId: string;
  inboxId: string | null;
  name: string;
  defaultLanguage: string;
  translations: EmailTemplateTranslation[];
  createdAt: string;
  updatedAt: string;
}

interface EmailTemplatesManagerProps {
  inboxId: string;
  tenantId: string;
}

const LANGUAGE_LABELS: Record<string, string> = {
  es: "Español",
  en: "English",
  pt: "Português",
  fr: "Français",
  de: "Deutsch",
  it: "Italiano",
};

function getLanguageLabel(code: string) {
  return LANGUAGE_LABELS[code] || code.toUpperCase();
}

export function EmailTemplatesManager({ inboxId, tenantId }: EmailTemplatesManagerProps) {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewLang, setPreviewLang] = useState<string | null>(null);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const { data } = await api.get<EmailTemplate[]>("/templates", {
        params: { tenantId, channel: "email" },
      });
      setTemplates(data);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, [inboxId, tenantId]);

  const handleCreate = () => {
    navigate(`/${slug}/email-builder/${inboxId}/new`);
  };

  const handleEdit = (template: EmailTemplate, language?: string) => {
    const lang = language || template.defaultLanguage;
    navigate(`/${slug}/email-builder/${inboxId}/${template.id}?lang=${lang}`);
  };

  const handleAddTranslation = (template: EmailTemplate) => {
    // Navigate to builder with a new language parameter
    const existingLangs = template.translations.map((t) => t.language);
    const availableLangs = Object.keys(LANGUAGE_LABELS).filter((l) => !existingLangs.includes(l));
    if (availableLangs.length === 0) return;
    // Navigate with first available language
    navigate(`/${slug}/email-builder/${inboxId}/${template.id}?lang=${availableLangs[0]}&new=1`);
  };

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleDelete = async (templateId: string) => {
    setDeleting(templateId);
    try {
      await api.delete(`/templates/${templateId}`);
      setTemplates((prev) => prev.filter((t) => t.id !== templateId));
      setConfirmDeleteId(null);
    } catch {
    } finally {
      setDeleting(null);
    }
  };

  const handleCopyHtml = (template: EmailTemplate, language?: string) => {
    const lang = language || template.defaultLanguage;
    const translation = template.translations.find((t) => t.language === lang);
    if (translation) {
      navigator.clipboard.writeText(translation.html);
    }
  };

  const togglePreview = (templateId: string, language: string) => {
    if (previewId === templateId && previewLang === language) {
      setPreviewId(null);
      setPreviewLang(null);
    } else {
      setPreviewId(templateId);
      setPreviewLang(language);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-5">
      <div className="max-w-3xl">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Plantillas de Email</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Crea plantillas HTML reutilizables con soporte multi-idioma
            </p>
          </div>
          <button
            onClick={handleCreate}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-xs font-medium"
          >
            <Plus className="h-3 w-3" /> Nueva plantilla
          </button>
        </div>

        {templates.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-200">
            <Mail className="h-8 w-8 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500 mb-1">Sin plantillas</p>
            <p className="text-xs text-gray-400 mb-4">
              Crea tu primera plantilla de email para usarla en campañas
            </p>
            <button
              onClick={handleCreate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-xs font-medium"
            >
              <Plus className="h-3 w-3" /> Crear plantilla
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {templates.map((template) => (
              <div
                key={template.id}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden"
              >
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="h-8 w-8 rounded-lg bg-orange-50 flex items-center justify-center shrink-0">
                    <Mail className="h-4 w-4 text-orange-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {template.name}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Globe className="h-3 w-3 text-gray-400" />
                      <div className="flex items-center gap-1">
                        {template.translations.map((t) => (
                          <span
                            key={t.language}
                            className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                              t.language === template.defaultLanguage
                                ? "bg-brand-50 text-brand-700"
                                : "bg-gray-100 text-gray-500"
                            }`}
                          >
                            {t.language.toUpperCase()}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() =>
                        togglePreview(template.id, template.defaultLanguage)
                      }
                      className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                      title="Vista previa"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleCopyHtml(template)}
                      className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                      title="Copiar HTML"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleAddTranslation(template)}
                      className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                      title="Agregar idioma"
                    >
                      <Globe className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleEdit(template)}
                      className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                      title="Editar"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(template.id)}
                      disabled={deleting === template.id}
                      className="p-1.5 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                      title="Eliminar"
                    >
                      {deleting === template.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Translation list */}
                {template.translations.length > 1 && (
                  <div className="border-t border-gray-100 px-4 py-2 bg-gray-50/50">
                    <div className="flex flex-wrap gap-2">
                      {template.translations.map((t) => (
                        <button
                          key={t.language}
                          onClick={() => handleEdit(template, t.language)}
                          className="text-[11px] px-2 py-1 rounded-md bg-white border border-gray-200 hover:border-brand-300 hover:bg-brand-50 text-gray-600 hover:text-brand-700 transition-colors"
                        >
                          {getLanguageLabel(t.language)} — {t.subject}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Preview */}
                {previewId === template.id && previewLang && (
                  <div className="border-t border-gray-100">
                    {template.translations.length > 1 && (
                      <div className="bg-gray-50 px-4 py-2 border-b border-gray-100 flex items-center gap-2">
                        <span className="text-[11px] text-gray-500">Idioma:</span>
                        {template.translations.map((t) => (
                          <button
                            key={t.language}
                            onClick={() => setPreviewLang(t.language)}
                            className={`text-[11px] px-2 py-0.5 rounded ${
                              previewLang === t.language
                                ? "bg-brand-700 text-white"
                                : "bg-white border border-gray-200 text-gray-600 hover:border-brand-300"
                            }`}
                          >
                            {t.language.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    )}
                    {(() => {
                      const translation = template.translations.find(
                        (t) => t.language === previewLang
                      );
                      if (!translation) return null;
                      return (
                        <>
                          <div className="bg-gray-50 px-4 py-2 border-b border-gray-100">
                            <p className="text-xs text-gray-500">
                              <strong>Asunto:</strong> {translation.subject}
                            </p>
                          </div>
                          <div
                            className="p-4 text-sm max-h-[300px] overflow-y-auto"
                            dangerouslySetInnerHTML={{ __html: translation.html }}
                          />
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmModal
        open={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={() => confirmDeleteId && handleDelete(confirmDeleteId)}
        title="Eliminar plantilla"
        description="Se eliminará esta plantilla y todas sus traducciones. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        variant="danger"
        loading={!!deleting}
      />
    </div>
  );
}
