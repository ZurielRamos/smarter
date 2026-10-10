import { useEffect, useRef, useState } from "react";
import { Save, Loader2, CheckCircle2, MessageSquarePlus, User, ImagePlus } from "lucide-react";
import { api } from "@/services/api";
import { DropdownSelect } from "./ui/dropdown-select";

// Plantilla de WhatsApp devuelta por Meta (endpoint /chats/whatsapp/templates)
interface WhatsAppTemplate {
  name: string;
  language: string;
  status: string;
  category: string;
  components: any[];
}

// Configuración persistida en inbox.metadata.firstMessageTemplate.
interface FirstMessageConfig {
  enabled: boolean;
  templateName: string;
  templateLanguage: string;
  templateCategory: string;
  templateComponents: any[];
  templateVariables: Record<string, string>;
}

// Campos del contacto que se pueden insertar como variables dinámicas.
// Se resuelven en el backend al momento de enviar la plantilla.
const CONTACT_FIELDS = [
  { key: "{{firstName}}", label: "Nombre" },
  { key: "{{lastName}}", label: "Apellido" },
  { key: "{{fullName}}", label: "Nombre completo" },
  { key: "{{phone}}", label: "Teléfono" },
  { key: "{{email}}", label: "Email" },
];

const countVars = (text?: string): number => (text ? (text.match(/\{\{\d+\}\}/g) || []).length : 0);

interface TemplateField {
  key: string; // body_1, header_1, button_0, header_media
  label: string;
  kind: "text" | "media";
  format?: string; // IMAGE | VIDEO | DOCUMENT
  example?: string;
}

/**
 * Analiza la definición de una plantilla (components de Meta) y devuelve la
 * lista de campos configurables (variables de header/body/botones y media).
 */
function getTemplateFields(components?: any[]): TemplateField[] {
  if (!Array.isArray(components)) return [];
  const fields: TemplateField[] = [];
  for (const comp of components) {
    const type = String(comp?.type || "").toUpperCase();
    if (type === "HEADER") {
      const format = String(comp?.format || "TEXT").toUpperCase();
      if (["IMAGE", "VIDEO", "DOCUMENT"].includes(format)) {
        fields.push({
          key: "header_media",
          label: format === "IMAGE" ? "Imagen del encabezado" : format === "VIDEO" ? "Video del encabezado" : "Documento del encabezado",
          kind: "media",
          format,
          example: comp?.example?.header_handle?.[0],
        });
      } else {
        const n = countVars(comp?.text);
        const ex: string[] = comp?.example?.header_text || [];
        for (let i = 0; i < n; i++) {
          fields.push({ key: `header_${i + 1}`, label: `Encabezado · variable {{${i + 1}}}`, kind: "text", example: ex[i] });
        }
      }
    } else if (type === "BODY") {
      const n = countVars(comp?.text);
      const ex: string[] = comp?.example?.body_text?.[0] || [];
      for (let i = 0; i < n; i++) {
        fields.push({ key: `body_${i + 1}`, label: `Cuerpo · variable {{${i + 1}}}`, kind: "text", example: ex[i] });
      }
    } else if (type === "BUTTONS") {
      const buttons: any[] = Array.isArray(comp?.buttons) ? comp.buttons : [];
      buttons.forEach((btn, idx) => {
        const btnType = String(btn?.type || "").toUpperCase();
        if (btnType === "URL" && countVars(btn?.url) > 0) {
          const ex = Array.isArray(btn?.example) ? btn.example[0] : btn?.example;
          fields.push({ key: `button_${idx}`, label: `Botón "${btn?.text || idx + 1}" · URL dinámica`, kind: "text", example: ex });
        } else if (btnType === "COPY_CODE") {
          const ex = Array.isArray(btn?.example) ? btn.example[0] : btn?.example;
          fields.push({ key: `button_${idx}`, label: `Botón "${btn?.text || idx + 1}" · código`, kind: "text", example: ex });
        }
      });
    }
  }
  return fields;
}

/** Selector para insertar un campo dinámico del contacto en una variable. */
function ContactFieldPicker({ onSelect }: { onSelect: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-[30px] px-2 border border-border rounded-md text-muted-foreground hover:text-brand-600 dark:hover:text-brand-300 hover:border-brand-300 transition-colors shrink-0"
        title="Insertar campo del contacto"
      >
        <User className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-44 bg-popover text-popover-foreground rounded-lg shadow-lg border border-border py-1 z-[100]">
          <p className="px-3 py-1 text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Campo del contacto</p>
          {CONTACT_FIELDS.map((field) => (
            <button
              key={field.key}
              type="button"
              onClick={() => { onSelect(field.key); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-muted transition-colors text-left"
            >
              <span className="text-muted-foreground">⊕</span>
              {field.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Editor de las variables de la plantilla de bienvenida. */
function TemplateVarsEditor({
  fields,
  values,
  onChange,
}: {
  fields: TemplateField[];
  values: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  const [uploading, setUploading] = useState<string | null>(null);
  const setVal = (key: string, val: string) => onChange({ ...values, [key]: val });

  const uploadMedia = async (key: string, file: File) => {
    setUploading(key);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const { data } = await api.post("/chats/media/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setVal(key, data.url || "");
    } catch {
      // Silencioso: el usuario puede pegar una URL manualmente.
    } finally {
      setUploading(null);
    }
  };

  if (fields.length === 0) return null;

  return (
    <div className="mt-3 ml-1 pl-3 border-l-2 border-brand-200 space-y-2.5">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Variables de la plantilla</p>
      {fields.map((f) => (
        <div key={f.key}>
          <label className="block text-[11px] text-muted-foreground mb-1">{f.label}</label>
          {f.kind === "media" ? (
            <div className="space-y-1">
              {values[f.key] ? (
                <div className="flex items-center gap-2">
                  {f.format === "IMAGE" ? (
                    <img src={values[f.key]} alt="" className="h-10 w-10 rounded object-cover border border-border" />
                  ) : (
                    <span className="text-[11px] text-green-600">Archivo cargado ✓</span>
                  )}
                  <button type="button" onClick={() => setVal(f.key, "")} className="text-[11px] text-red-500 hover:underline ml-auto">Quitar</button>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-1.5 h-9 border border-dashed border-border rounded-md cursor-pointer hover:border-brand-300 text-[11px] text-muted-foreground hover:text-brand-600 dark:hover:text-brand-300 transition-colors">
                  <input
                    type="file"
                    className="hidden"
                    accept={f.format === "IMAGE" ? "image/*" : f.format === "VIDEO" ? "video/*" : "*"}
                    onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadMedia(f.key, file); }}
                  />
                  {uploading === f.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
                  {uploading === f.key ? "Subiendo..." : "Subir archivo"}
                </label>
              )}
              <input
                type="url"
                value={values[f.key] || ""}
                onChange={(e) => setVal(f.key, e.target.value)}
                placeholder="O pega una URL pública https://..."
                className="w-full px-2 py-1.5 rounded-md border border-border text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          ) : (
            <div className="flex gap-1.5">
              <input
                type="text"
                value={values[f.key] || ""}
                onChange={(e) => setVal(f.key, e.target.value)}
                placeholder={f.example ? `Ej: ${f.example}` : "Escribe el valor..."}
                className="flex-1 px-2 py-1.5 rounded-md border border-border text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <ContactFieldPicker onSelect={(v) => setVal(f.key, v)} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Configura la plantilla de WhatsApp que se envía automáticamente cuando un
 * contacto escribe por PRIMERA vez al canal (conversación nueva). Mientras esté
 * activa, el bot NO responde en ese primer turno (responde del 2º mensaje en
 * adelante). La bienvenida ignora el opt-in del contacto.
 *
 * Solo se renderiza para canales de WhatsApp.
 */
export function FirstMessageTemplateSection({ inboxId }: { inboxId: string }) {
  const [cfg, setCfg] = useState<FirstMessageConfig>({
    enabled: false,
    templateName: "",
    templateLanguage: "",
    templateCategory: "",
    templateComponents: [],
    templateVariables: {},
  });
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    api.get(`/chats/inboxes/${inboxId}`)
      .then(({ data }) => {
        const fmt = data.metadata?.firstMessageTemplate;
        if (fmt) {
          setCfg({
            enabled: fmt.enabled === true,
            templateName: fmt.templateName || "",
            templateLanguage: fmt.templateLanguage || "",
            templateCategory: fmt.templateCategory || "",
            templateComponents: Array.isArray(fmt.templateComponents) ? fmt.templateComponents : [],
            templateVariables: fmt.templateVariables && typeof fmt.templateVariables === "object" ? fmt.templateVariables : {},
          });
        }
      })
      .finally(() => setLoading(false));
    api.get<WhatsAppTemplate[]>(`/chats/whatsapp/templates`, { params: { inboxId } })
      .then(({ data }) => setTemplates(Array.isArray(data) ? data.filter((t) => t.status === "APPROVED") : []))
      .catch(() => {});
  }, [inboxId]);

  const markDirty = () => { setSaved(false); setError(""); };

  const currentValue = cfg.templateName ? `${cfg.templateName}::${cfg.templateLanguage || ""}` : "";
  const tplFields = getTemplateFields(cfg.templateComponents);

  const handleSave = async () => {
    if (cfg.enabled && !cfg.templateName) {
      setError("Selecciona una plantilla para activar la bienvenida.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.put(`/chats/inboxes/${inboxId}/first-message-template`, {
        enabled: cfg.enabled,
        templateName: cfg.templateName,
        templateLanguage: cfg.templateLanguage,
        templateCategory: cfg.templateCategory,
        templateComponents: cfg.templateComponents,
        templateVariables: cfg.templateVariables,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setError(err?.response?.data?.message || "No se pudo guardar la configuración.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="bg-card rounded-xl border border-border p-5"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="bg-card rounded-xl border border-border p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <MessageSquarePlus className="h-3.5 w-3.5 text-brand-600 dark:text-brand-300" /> Plantilla de bienvenida
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5 max-w-md">
            Al primer mensaje de un contacto nuevo se envía automáticamente esta plantilla de WhatsApp. Mientras esté activa, el bot no responde en ese primer turno.
          </p>
        </div>
        <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-xs font-medium disabled:opacity-50 shrink-0">
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : saved ? <CheckCircle2 className="h-3 w-3" /> : <Save className="h-3 w-3" />}
          {saved ? "Guardado" : "Guardar"}
        </button>
      </div>

      {/* Toggle activar */}
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => { setCfg((c) => ({ ...c, enabled: !c.enabled })); markDirty(); }}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${cfg.enabled ? "bg-brand-600" : "bg-gray-300 dark:bg-gray-600"}`}
          aria-label="Activar bienvenida"
        >
          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-card transition-transform shadow-sm ${cfg.enabled ? "translate-x-[18px]" : "translate-x-1"}`} />
        </button>
        <span className="text-xs font-medium text-foreground">{cfg.enabled ? "Bienvenida activa" : "Bienvenida desactivada"}</span>
      </div>

      {/* Selector de plantilla */}
      <div className={cfg.enabled ? "" : "opacity-50 pointer-events-none"}>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Plantilla a enviar</label>
        <DropdownSelect
          className="w-full [&>button]:py-1.5 [&>button]:text-xs"
          value={currentValue}
          onChange={(v) => {
            const [name, lang] = v.split("::");
            const tpl = templates.find((t) => t.name === name && t.language === lang);
            setCfg((c) => ({
              ...c,
              templateName: name || "",
              templateLanguage: lang || "",
              templateCategory: tpl?.category || "",
              templateComponents: tpl?.components || [],
              templateVariables: {}, // reiniciar variables al cambiar de plantilla
            }));
            markDirty();
          }}
          options={
            templates.length === 0
              ? [{ value: "", label: "No hay plantillas aprobadas" }]
              : [
                  { value: "", label: "Selecciona plantilla" },
                  ...templates.map((t) => ({ value: `${t.name}::${t.language}`, label: `${t.name} (${t.language})` })),
                ]
          }
        />

        <TemplateVarsEditor
          fields={tplFields}
          values={cfg.templateVariables}
          onChange={(next) => { setCfg((c) => ({ ...c, templateVariables: next })); markDirty(); }}
        />
      </div>

      {error && <p className="text-[11px] text-red-500 mt-2">{error}</p>}
    </div>
  );
}
