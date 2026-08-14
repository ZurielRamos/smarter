import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Pencil, Trash2, Globe, Loader2, Plus, Mail, Eye, Copy, MessageSquare, Phone } from "lucide-react";
import { WhatsAppIcon } from "@/components/ChannelIcons";
import { ConfirmModal } from "@/components/ConfirmModal";
import { SmsTemplateModal } from "@/components/SmsTemplateModal";
import { toast } from "sonner";
import { api } from "@/services/api";

interface TemplateTranslation {
  id: string;
  templateId: string;
  language: string;
  subject: string | null;
  html: string | null;
  blocks: any[] | null;
  body: string | null;
  voice: string | null;
  audioCode: string | null;
  whatsappComponents: any[] | null;
  createdAt: string;
  updatedAt: string;
}

interface Template {
  id: string;
  tenantId: string;
  name: string;
  channel: string;
  defaultLanguage: string;
  whatsappTemplateName: string | null;
  whatsappMetaId: string | null;
  whatsappCategory: string | null;
  translations: TemplateTranslation[];
  createdAt: string;
  updatedAt: string;
}

const LANGUAGE_LABELS: Record<string, string> = {
  es: "Español",
  en: "English",
  pt: "Português",
  fr: "Français",
  de: "Deutsch",
  it: "Italiano",
};

const ALL_LANGUAGES = Object.keys(LANGUAGE_LABELS);

const CHANNEL_CONFIG: Record<string, { icon: any; color: string; bg: string; label: string }> = {
  email: { icon: Mail, color: "text-orange-600", bg: "bg-orange-50", label: "Email" },
  sms: { icon: MessageSquare, color: "text-sky-600", bg: "bg-sky-50", label: "SMS" },
  whatsapp: { icon: WhatsAppIcon, color: "text-green-600", bg: "bg-green-50", label: "WhatsApp" },
  llamada: { icon: Phone, color: "text-purple-600", bg: "bg-purple-50", label: "Llamada" },
};

function getLanguageLabel(code: string) {
  return LANGUAGE_LABELS[code] || code.toUpperCase();
}

export function PlantillaDetail() {
  const { slug, templateId } = useParams();
  const navigate = useNavigate();

  const [template, setTemplate] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [deletingLang, setDeletingLang] = useState<string | null>(null);
  const [previewLang, setPreviewLang] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDeleteLang, setConfirmDeleteLang] = useState<string | null>(null);
  const [smsModal, setSmsModal] = useState<{ open: boolean; language: string }>({ open: false, language: "es" });
  const [smsSaving, setSmsSaving] = useState(false);

  useEffect(() => {
    if (!templateId) return;
    setLoading(true);
    api
      .get<Template>(`/templates/${templateId}`)
      .then(({ data }) => {
        setTemplate(data);
        setPreviewLang(null);
      })
      .catch(() => toast.error("No se pudo cargar la plantilla"))
      .finally(() => setLoading(false));
  }, [templateId]);

  const handleDelete = async () => {
    if (!template) return;
    setDeleting(true);
    try {
      await api.delete(`/templates/${template.id}`);
      toast.success("Plantilla eliminada");
      setConfirmDelete(false);
      navigate(`/${slug}/comunicaciones/plantillas`);
    } catch {
      toast.error("Error al eliminar");
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteTranslation = async (language: string) => {
    if (!template) return;
    setDeletingLang(language);
    try {
      await api.delete(`/templates/${template.id}/translations/${language}`);
      setTemplate((prev) =>
        prev ? { ...prev, translations: prev.translations.filter((t) => t.language !== language) } : prev
      );
      setConfirmDeleteLang(null);
      toast.success(`Traducción (${language.toUpperCase()}) eliminada`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Error al eliminar traducción");
    } finally {
      setDeletingLang(null);
    }
  };

  const handleEdit = (language: string) => {
    if (!template) return;
    if (template.channel === "email") {
      navigate(`/${slug}/email-builder/global/${template.id}?lang=${language}`);
    } else if (template.channel === "sms" || template.channel === "llamada") {
      setSmsModal({ open: true, language });
    } else {
      // For whatsapp — TODO: implement
      toast.info("Editor para este canal próximamente");
    }
  };

  const handleAddTranslation = () => {
    if (!template) return;
    const existingLangs = template.translations.map((t) => t.language);
    const available = ALL_LANGUAGES.filter((l) => !existingLangs.includes(l));
    if (available.length === 0) {
      toast.info("Ya existen traducciones para todos los idiomas disponibles");
      return;
    }
    if (template.channel === "email") {
      navigate(`/${slug}/email-builder/global/${template.id}?lang=${available[0]}&new=1`);
    } else if (template.channel === "sms" || template.channel === "llamada") {
      setSmsModal({ open: true, language: available[0] });
    } else {
      toast.info("Editor para este canal próximamente");
    }
  };

  const handleSaveSms = async (data: { language: string; body: string }) => {
    if (!template) return;
    setSmsSaving(true);
    try {
      await api.put(`/templates/${template.id}/translations/${data.language}`, {
        body: data.body,
      });
      // Update local state
      setTemplate((prev) => {
        if (!prev) return prev;
        const existingIdx = prev.translations.findIndex((t) => t.language === data.language);
        if (existingIdx >= 0) {
          const updated = [...prev.translations];
          updated[existingIdx] = { ...updated[existingIdx], body: data.body };
          return { ...prev, translations: updated };
        } else {
          return {
            ...prev,
            translations: [...prev.translations, {
              id: crypto.randomUUID(),
              templateId: prev.id,
              language: data.language,
              subject: null,
              html: null,
              blocks: null,
              body: data.body,
              voice: null,
              audioCode: null,
              whatsappComponents: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }],
          };
        }
      });
      setSmsModal({ open: false, language: "es" });
      toast.success("Mensaje SMS guardado");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Error al guardar");
    } finally {
      setSmsSaving(false);
    }
  };

  const handleCopyContent = (translation: TemplateTranslation) => {
    const content = translation.html || translation.body || "";
    navigator.clipboard.writeText(content);
    toast.success("Contenido copiado");
  };

  const getTranslationPreview = (translation: TemplateTranslation) => {
    if (!template) return null;
    switch (template.channel) {
      case "email":
        return translation.html ? (
          <div className="p-4 text-sm max-h-[350px] overflow-y-auto" dangerouslySetInnerHTML={{ __html: translation.html }} />
        ) : (
          <p className="p-4 text-sm text-gray-400 italic">Sin contenido HTML</p>
        );
      case "sms":
        return (
          <div className="p-4">
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{translation.body || "Sin contenido"}</p>
          </div>
        );
      case "llamada":
        return (
          <div className="p-4 space-y-2">
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{translation.body || "Sin mensaje"}</p>
            {translation.voice && (
              <p className="text-xs text-gray-400">Voz: {translation.voice}</p>
            )}
            {translation.audioCode && (
              <p className="text-xs text-gray-400">Audio ID: {translation.audioCode}</p>
            )}
          </div>
        );
      case "whatsapp":
        return (
          <div className="p-4">
            <pre className="text-xs text-gray-600 whitespace-pre-wrap bg-gray-50 rounded p-2">
              {JSON.stringify(translation.whatsappComponents, null, 2) || "Sin componentes"}
            </pre>
          </div>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!template) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-gray-400">Plantilla no encontrada</p>
      </div>
    );
  }

  const channelInfo = CHANNEL_CONFIG[template.channel] || CHANNEL_CONFIG.email;
  const ChannelIcon = channelInfo.icon;

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`h-9 w-9 rounded-lg ${channelInfo.bg} flex items-center justify-center`}>
            <ChannelIcon className={`h-4.5 w-4.5 ${channelInfo.color}`} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">{template.name}</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {channelInfo.label} · Idioma por defecto: {getLanguageLabel(template.defaultLanguage)} · {template.translations.length} traducción(es)
            </p>
            {template.whatsappTemplateName && (
              <p className="text-[11px] text-green-600 mt-0.5">
                Meta: {template.whatsappTemplateName} ({template.whatsappCategory || "N/A"})
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleAddTranslation}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-xs font-medium transition-colors"
          >
            <Plus className="h-3 w-3" /> Agregar idioma
          </button>
          <button
            onClick={() => setConfirmDelete(true)}
            disabled={deleting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-xs font-medium transition-colors disabled:opacity-50"
          >
            {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            Eliminar
          </button>
        </div>
      </div>

      {/* Translations list */}
      <div className="px-6 py-4 space-y-3">
        {template.translations.map((translation) => (
          <div key={translation.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                    translation.language === template.defaultLanguage
                      ? "bg-brand-100 text-brand-700"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {translation.language.toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {getLanguageLabel(translation.language)}
                  </p>
                  <p className="text-[11px] text-gray-400 truncate">
                    {template.channel === "email" && translation.subject
                      ? `Asunto: ${translation.subject}`
                      : template.channel === "sms" || template.channel === "llamada"
                      ? (translation.body || "").substring(0, 60) + ((translation.body?.length || 0) > 60 ? "..." : "")
                      : template.channel === "whatsapp"
                      ? "Componentes WhatsApp"
                      : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setPreviewLang(previewLang === translation.language ? null : translation.language)}
                  className={`p-1.5 rounded-md transition-colors ${
                    previewLang === translation.language ? "bg-brand-50 text-brand-600" : "hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                  }`}
                  title="Vista previa"
                >
                  <Eye className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => handleCopyContent(translation)}
                  className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                  title="Copiar contenido"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => handleEdit(translation.language)}
                  className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                  title="Editar"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                {translation.language !== template.defaultLanguage && (
                  <button
                    onClick={() => setConfirmDeleteLang(translation.language)}
                    disabled={deletingLang === translation.language}
                    className="p-1.5 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                    title="Eliminar traducción"
                  >
                    {deletingLang === translation.language ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Preview */}
            {previewLang === translation.language && (
              <div className="border-t border-gray-100">
                {template.channel === "email" && translation.subject && (
                  <div className="bg-gray-50 px-4 py-2 border-b border-gray-100">
                    <p className="text-xs text-gray-500">
                      <strong>Asunto:</strong> {translation.subject}
                    </p>
                  </div>
                )}
                {getTranslationPreview(translation)}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* SMS/Call Editor Modal */}
      <SmsTemplateModal
        open={smsModal.open}
        onClose={() => setSmsModal({ open: false, language: "es" })}
        onSave={handleSaveSms}
        translations={template.translations.map((t) => ({ language: t.language, body: t.body }))}
        defaultLanguage={template.defaultLanguage}
        initialLanguage={smsModal.language}
        saving={smsSaving}
        channel={template.channel as "sms" | "llamada"}
      />

      {/* Confirm delete template */}
      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title="Eliminar plantilla"
        description={`Se eliminará "${template.name}" y todas sus traducciones. Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        variant="danger"
        loading={deleting}
      />

      {/* Confirm delete translation */}
      <ConfirmModal
        open={!!confirmDeleteLang}
        onClose={() => setConfirmDeleteLang(null)}
        onConfirm={() => confirmDeleteLang && handleDeleteTranslation(confirmDeleteLang)}
        title="Eliminar traducción"
        description={`Se eliminará la traducción en ${confirmDeleteLang ? getLanguageLabel(confirmDeleteLang) : ""}. Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        variant="danger"
        loading={!!deletingLang}
      />
    </div>
  );
}
