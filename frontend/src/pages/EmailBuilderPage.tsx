import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, Globe, ChevronDown, Plus } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/services/api";
import { useAuth } from "@/context/AuthContext";
import { EmailBuilder } from "@/components/email-builder";
import type { EmailRow } from "@/components/email-builder";

interface EmailTemplateTranslation {
  id: string;
  templateId: string;
  language: string;
  subject: string;
  blocks: EmailRow[] | null;
  html: string;
}

interface EmailTemplate {
  id: string;
  tenantId: string;
  inboxId: string | null;
  name: string;
  defaultLanguage: string;
  translations: EmailTemplateTranslation[];
  createdAt: string;
}

const LANGUAGE_OPTIONS = [
  { code: "es", label: "Español" },
  { code: "en", label: "English" },
  { code: "pt", label: "Português" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" },
];

export function EmailBuilderPage() {
  const { slug, inboxId, templateId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const tenantRole = user?.tenantRoles.find((tr: any) => tr.tenant.slug === slug);
  const tenantId = tenantRole?.tenantId || "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateSubject, setTemplateSubject] = useState("");
  const [initialBlocks, setInitialBlocks] = useState<EmailRow[]>([]);
  const [currentLanguage, setCurrentLanguage] = useState(searchParams.get("lang") || "es");
  const [defaultLanguage, setDefaultLanguage] = useState("es");
  const [existingTemplate, setExistingTemplate] = useState<EmailTemplate | null>(null);
  const [isNewTranslation, setIsNewTranslation] = useState(searchParams.get("new") === "1");

  useEffect(() => {
    if (!inboxId) return;

    if (templateId && templateId !== "new") {
      // Load existing template from new API
      api
        .get<EmailTemplate>(`/templates/${templateId}`)
        .then(({ data }) => {
          setExistingTemplate(data);
          setTemplateName(data.name);
          setDefaultLanguage(data.defaultLanguage);

          const lang = searchParams.get("lang") || data.defaultLanguage;
          setCurrentLanguage(lang);

          const translation = data.translations.find((t) => t.language === lang);
          if (translation) {
            setTemplateSubject(translation.subject || "");
            setInitialBlocks(translation.blocks || []);
            setIsNewTranslation(false);
          } else {
            // New translation: replicate content from the default language
            const defaultTranslation = data.translations.find(
              (t) => t.language === data.defaultLanguage
            ) || data.translations[0];
            setTemplateSubject(defaultTranslation?.subject || "");
            setInitialBlocks(defaultTranslation?.blocks || []);
            setIsNewTranslation(true);
          }
        })
        .catch(() => {
          toast.error("No se pudo cargar la plantilla");
        })
        .finally(() => setLoading(false));
    } else {
      // New template
      setLoading(false);
    }
  }, [inboxId, templateId]);

  const handleSave = async (data: { blocks: EmailRow[]; html: string }) => {
    if (!inboxId || !tenantId) return;
    setSaving(true);
    try {
      // Upload blob images to Firebase before saving
      const blocks = await uploadBlobImages(data.blocks);
      let html = data.html;

      // Replace blob URLs in HTML with Firebase URLs
      const blobPattern = /blob:[^"'\s)]+/g;
      const blobsInHtml = html.match(blobPattern) || [];
      if (blobsInHtml.length > 0) {
        const collectReplacements = (original: any, replaced: any, map: Map<string, string>) => {
          if (!original || !replaced) return;
          if (typeof original === "string" && original.startsWith("blob:") && typeof replaced === "string" && !replaced.startsWith("blob:")) {
            map.set(original, replaced);
          } else if (Array.isArray(original)) {
            original.forEach((item, i) => collectReplacements(item, replaced[i], map));
          } else if (typeof original === "object") {
            for (const key of Object.keys(original)) {
              collectReplacements(original[key], replaced[key], map);
            }
          }
        };
        const urlMap = new Map<string, string>();
        collectReplacements(data.blocks, blocks, urlMap);
        for (const [blobUrl, firebaseUrl] of urlMap) {
          html = html.replaceAll(blobUrl, firebaseUrl);
        }
      }

      if (templateId && templateId !== "new") {
        // Update existing template — upsert translation for current language
        await api.put(`/templates/${templateId}/translations/${currentLanguage}`, {
          subject: templateSubject.trim(),
          blocks,
          html,
        });

        // Also update template name if changed
        if (existingTemplate && templateName.trim() !== existingTemplate.name) {
          await api.put(`/templates/${templateId}`, {
            name: templateName.trim(),
          });
        }
      } else {
        // Create new template
        await api.post("/templates", {
          tenantId,
          name: templateName.trim(),
          channel: "email",
          defaultLanguage: currentLanguage,
          translations: [
            {
              language: currentLanguage,
              subject: templateSubject.trim(),
              blocks,
              html,
            },
          ],
        });
      }

      toast.success(
        isNewTranslation
          ? `Traducción (${currentLanguage.toUpperCase()}) guardada`
          : "Plantilla guardada correctamente"
      );
      navigateBack();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || "Error al guardar la plantilla");
    } finally {
      setSaving(false);
    }
  };

  /** Upload all blob:// URLs in rows to Firebase and replace with permanent URLs */
  async function uploadBlobImages(rows: EmailRow[]): Promise<EmailRow[]> {
    const blobUrlMap = new Map<string, string>();

    const collectBlobs = (obj: any) => {
      if (!obj) return;
      if (typeof obj === "string" && obj.startsWith("blob:")) {
        blobUrlMap.set(obj, obj);
      } else if (Array.isArray(obj)) {
        obj.forEach(collectBlobs);
      } else if (typeof obj === "object") {
        Object.values(obj).forEach(collectBlobs);
      }
    };
    collectBlobs(rows);

    if (blobUrlMap.size === 0) return rows;

    const results = await Promise.all(
      Array.from(blobUrlMap.keys()).map(async (blobUrl) => {
        const response = await fetch(blobUrl);
        const blob = await response.blob();
        const file = new File([blob], `image-${Date.now()}.${blob.type.split("/")[1] || "png"}`, { type: blob.type });
        const formData = new FormData();
        formData.append("file", file);
        const { data } = await api.post<{ url: string }>("/chats/media/upload", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        if (!data.url) throw new Error("Error al subir imagen");
        return { blobUrl, firebaseUrl: data.url };
      })
    );

    for (const { blobUrl, firebaseUrl } of results) {
      blobUrlMap.set(blobUrl, firebaseUrl);
    }

    const replaceBlobs = (obj: any): any => {
      if (!obj) return obj;
      if (typeof obj === "string" && obj.startsWith("blob:")) {
        return blobUrlMap.get(obj) || obj;
      }
      if (Array.isArray(obj)) return obj.map(replaceBlobs);
      if (typeof obj === "object") {
        const result: any = {};
        for (const [key, val] of Object.entries(obj)) {
          result[key] = replaceBlobs(val);
        }
        return result;
      }
      return obj;
    };

    return replaceBlobs(rows);
  }

  const handleClose = () => {
    navigateBack();
  };

  const navigateBack = () => {
    if (inboxId && inboxId !== "global") {
      navigate(`/${slug}/comunicaciones/canales/${inboxId}`);
    } else if (templateId && templateId !== "new") {
      navigate(`/${slug}/comunicaciones/plantillas/${templateId}`);
    } else {
      navigate(`/${slug}/comunicaciones/plantillas`);
    }
  };

  const handleLanguageChange = (lang: string) => {
    if (lang === currentLanguage) return;
    if (existingTemplate) {
      const translation = existingTemplate.translations.find((t) => t.language === lang);
      setCurrentLanguage(lang);
      if (translation) {
        setTemplateSubject(translation.subject || "");
        setInitialBlocks(translation.blocks || []);
        setIsNewTranslation(false);
      } else {
        // New translation: replicate content from the default language
        const defaultTranslation = existingTemplate.translations.find(
          (t) => t.language === existingTemplate.defaultLanguage
        ) || existingTemplate.translations[0];
        setTemplateSubject(defaultTranslation?.subject || "");
        setInitialBlocks(defaultTranslation?.blocks || []);
        setIsNewTranslation(true);
      }
      // Update URL for bookmarkability without triggering re-renders
      window.history.replaceState(null, "", `/${slug}/email-builder/${inboxId}/${templateId}?lang=${lang}${!translation ? "&new=1" : ""}`);
    } else {
      setCurrentLanguage(lang);
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Email Builder */}
      <div className="flex-1">
        <EmailBuilder
          key={`${templateId}-${currentLanguage}`}
          initialBlocks={initialBlocks}
          onSave={handleSave}
          saving={saving}
          templateName={templateName}
          templateSubject={templateSubject}
          onNameChange={setTemplateName}
          onSubjectChange={setTemplateSubject}
          onClose={handleClose}
          languageSlot={
            <LanguageDropdown
              currentLanguage={currentLanguage}
              existingTemplate={existingTemplate}
              isNewTranslation={isNewTranslation}
              onLanguageChange={handleLanguageChange}
            />
          }
        />
      </div>
    </div>
  );
}

// === Language Dropdown ===

function LanguageDropdown({
  currentLanguage,
  existingTemplate,
  isNewTranslation,
  onLanguageChange,
}: {
  currentLanguage: string;
  existingTemplate: EmailTemplate | null;
  isNewTranslation: boolean;
  onLanguageChange: (lang: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const currentLabel = LANGUAGE_OPTIONS.find((o) => o.code === currentLanguage)?.label || currentLanguage.toUpperCase();
  const existingLangs = existingTemplate?.translations.map((t) => t.language) || [currentLanguage];
  const availableLangs = LANGUAGE_OPTIONS.filter((o) => !existingLangs.includes(o.code));

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 text-sm transition-colors"
      >
        <Globe className="h-3.5 w-3.5 text-gray-500" />
        <span className="font-medium text-gray-700">{currentLanguage.toUpperCase()}</span>
        {isNewTranslation && (
          <span className="text-[9px] bg-amber-100 text-amber-700 px-1 py-0 rounded font-medium">nueva</span>
        )}
        <ChevronDown className="h-3 w-3 text-gray-400" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 w-48 bg-white rounded-xl shadow-lg border border-gray-200 py-1 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
            {/* Existing translations */}
            {existingLangs.map((lang) => {
              const opt = LANGUAGE_OPTIONS.find((o) => o.code === lang);
              return (
                <button
                  key={lang}
                  onClick={() => { onLanguageChange(lang); setOpen(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                    lang === currentLanguage
                      ? "bg-brand-50 text-brand-700 font-medium"
                      : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <span className="text-[10px] font-bold w-5">{lang.toUpperCase()}</span>
                  <span>{opt?.label || lang}</span>
                </button>
              );
            })}

            {/* Add new language */}
            {availableLangs.length > 0 && (
              <>
                <div className="border-t border-gray-100 my-1" />
                <div className="px-3 py-1">
                  <p className="text-[10px] text-gray-400 font-medium uppercase">Agregar idioma</p>
                </div>
                {availableLangs.map((opt) => (
                  <button
                    key={opt.code}
                    onClick={() => { onLanguageChange(opt.code); setOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-gray-500 hover:bg-gray-50 transition-colors"
                  >
                    <Plus className="h-3 w-3 text-gray-400" />
                    <span>{opt.label}</span>
                  </button>
                ))}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
