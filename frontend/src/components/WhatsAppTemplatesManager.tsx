import { useState, useEffect, useMemo, useRef } from "react";
import { Plus, Search, Trash2, Loader2, X, AlertTriangle, CheckCircle2, Clock, Pause, XCircle, ChevronRight, Bold, Italic, Strikethrough, Code, Smile, Megaphone, Wrench, ShieldCheck, FileText, ChevronDown, Globe, HelpCircle, Type, ImageIcon, PlayCircle, Send, ExternalLink, Phone, PhoneCall, Copy, UserPlus, Upload } from "lucide-react";
import { api } from "@/services/api";

interface TemplateComponent {
  type: string;
  format?: string;
  text?: string;
  buttons?: Array<{ type: string; text: string; url?: string; phone_number?: string }>;
  example?: any;
}

interface Template {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string;
  components: TemplateComponent[];
  quality_score?: { score: string };
  rejected_reason?: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  APPROVED: { label: "Activa", color: "bg-green-50 text-green-700 border-green-200", icon: CheckCircle2 },
  PENDING: { label: "En revisión", color: "bg-yellow-50 text-yellow-700 border-yellow-200", icon: Clock },
  REJECTED: { label: "Rechazada", color: "bg-red-50 text-red-700 border-red-200", icon: XCircle },
  PAUSED: { label: "Pausada", color: "bg-orange-50 text-orange-700 border-orange-200", icon: Pause },
  DISABLED: { label: "Desactivada", color: "bg-gray-50 text-gray-700 border-gray-200", icon: XCircle },
};

const CATEGORY_COLORS: Record<string, string> = {
  MARKETING: "bg-purple-100 text-purple-700",
  UTILITY: "bg-blue-100 text-blue-700",
  AUTHENTICATION: "bg-amber-100 text-amber-700",
};

const LANGUAGES: Array<{ code: string; label: string }> = [
  { code: "es", label: "Español" },
  { code: "es_AR", label: "Español (Argentina)" },
  { code: "es_ES", label: "Español (España)" },
  { code: "es_MX", label: "Español (México)" },
  { code: "en_US", label: "English (US)" },
  { code: "en", label: "English" },
  { code: "pt_BR", label: "Português (Brasil)" },
  { code: "fr", label: "Français" },
];

// === CUSTOM SELECT (no native selects) ===
function CustomSelect({ value, onChange, options, placeholder, compact }: {
  value: string; onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string; compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className={`flex items-center justify-between gap-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 transition-colors ${compact ? "px-3 py-1.5 min-w-[120px]" : "w-full px-3 py-2.5"}`}>
        <span className={selected && selected.value !== "all" ? "text-gray-900" : "text-gray-500"}>{selected?.label || placeholder}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full min-w-[160px] bg-white border border-gray-200 rounded-lg shadow-lg py-1 max-h-[200px] overflow-y-auto">
          {options.map((opt) => (
            <button key={opt.value} onClick={() => { onChange(opt.value); setOpen(false); }} className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors ${value === opt.value ? "text-brand-700 font-medium bg-brand-50/50" : "text-gray-700"}`}>
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// === TOOLTIP ===
function Tooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-flex">
      <button type="button" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)} onClick={() => setShow(!show)} className="p-0.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
      {show && (
        <span className="absolute z-30 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 px-3 py-2 rounded-lg bg-gray-900 text-white text-[11px] leading-relaxed shadow-lg pointer-events-none">
          {text}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
        </span>
      )}
    </span>
  );
}

// === ADD BUTTON DROPDOWN ===
function AddButtonDropdown({ onAdd }: { onAdd: (type: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const options = [
    { type: "QUICK_REPLY", label: "Respuesta preconfigurada", desc: "El cliente envía un texto predefinido al tocar", icon: Send },
    { type: "URL", label: "Ir al sitio web", desc: "Abre un enlace en el navegador del cliente", icon: ExternalLink },
    { type: "PHONE_NUMBER", label: "Llamar a número de teléfono", desc: "Inicia una llamada telefónica al número indicado", icon: Phone },
    { type: "COPY_CODE", label: "Copiar código de oferta", desc: "El cliente copia un código de descuento al portapapeles", icon: Copy },
  ];

  return (
    <div ref={ref} className="relative mt-3">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 font-medium transition-colors">
        <Plus className="h-3.5 w-3.5" /> Agregar botón <ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute z-20 bottom-full left-0 mb-1 w-72 bg-white border border-gray-200 rounded-xl shadow-lg py-1 overflow-hidden">
          {options.map(({ type, label, desc, icon: Icon }) => (
            <button key={type} onClick={() => { onAdd(type); setOpen(false); }} className="w-full flex items-start gap-3 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors">
              <Icon className="h-4 w-4 text-gray-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm text-gray-900 font-medium">{label}</p>
                <p className="text-[11px] text-gray-500">{desc}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TemplatePreview({ headerType, headerText, bodyText, footerText, buttons, bodyExamples, headerExample, headerMediaPreview }: {
  headerType: string; headerText: string; bodyText: string; footerText: string;
  buttons: Array<{ type: string; text: string; url?: string; phone_number?: string }>;
  bodyExamples?: string[]; headerExample?: string; headerMediaPreview?: string;
}) {
  // Replace variables with example values in preview
  const replaceVars = (text: string, examples: string[]) => {
    return text.replace(/\{\{(\d+)\}\}/g, (_, n) => {
      const idx = parseInt(n) - 1;
      return examples[idx] || `{{${n}}}`;
    });
  };
  const previewBody = bodyExamples?.length ? replaceVars(bodyText, bodyExamples) : bodyText;
  const previewHeader = headerExample ? replaceVars(headerText, [headerExample]) : headerText;

  return (
    <div className="rounded-xl bg-[#e5ddd5] p-4 flex items-center justify-center min-h-[300px]">
      <div className="w-[260px]">
        <div className="bg-white rounded-lg shadow-sm p-3 space-y-1.5">
          {headerType === "text" && previewHeader && <p className="text-sm font-semibold text-gray-900">{previewHeader}</p>}
          {headerType === "image" && (headerMediaPreview ? <img src={headerMediaPreview} alt="Header" className="w-full h-28 object-cover rounded" /> : <div className="h-28 bg-gray-200 rounded flex items-center justify-center text-xs text-gray-500">[Imagen]</div>)}
          {headerType === "video" && <div className="h-28 bg-gray-200 rounded flex items-center justify-center text-xs text-gray-500">[Video]</div>}
          {headerType === "document" && <div className="h-12 bg-gray-100 rounded flex items-center justify-center text-xs text-gray-500">[Documento]</div>}
          {previewBody ? <p className="text-[13px] text-gray-800 whitespace-pre-wrap">{previewBody}</p> : <p className="text-[13px] text-gray-300 italic">Cuerpo del mensaje...</p>}
          {footerText && <p className="text-[11px] text-gray-400">{footerText}</p>}
          <p className="text-[10px] text-gray-300 text-right">11:59</p>
        </div>
        {buttons.length > 0 && (
          <div className="mt-1 space-y-0.5">
            {buttons.map((btn, i) => (
              <div key={i} className="bg-white rounded-lg shadow-sm px-3 py-2 text-center text-[13px] text-blue-600 font-medium">{btn.text || "Botón"}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// === CREATE TEMPLATE STEPPER ===
function CreateTemplateModal({ inboxId, onClose, onCreated }: { inboxId: string; onClose: () => void; onCreated: () => void }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("MARKETING");
  const [language, setLanguage] = useState("es");
  const [headerType, setHeaderType] = useState<string>("none");
  const [headerText, setHeaderText] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [footerText, setFooterText] = useState("");
  const [buttons, setButtons] = useState<Array<{ type: string; text: string; url?: string; phone_number?: string }>>([]);
  const [bodyExamples, setBodyExamples] = useState<string[]>([]);
  const [headerExample, setHeaderExample] = useState("");
  const [headerMediaHandle, setHeaderMediaHandle] = useState("");
  const [headerMediaPreview, setHeaderMediaPreview] = useState("");
  const [headerMediaUploading, setHeaderMediaUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleAddButton = (type: string) => {
    if (buttons.length >= 10) return;
    if (type === "URL") setButtons([...buttons, { type: "URL", text: "", url: "" }]);
    else if (type === "PHONE_NUMBER") setButtons([...buttons, { type: "PHONE_NUMBER", text: "", phone_number: "" }]);
    else if (type === "COPY_CODE") setButtons([...buttons, { type: "COPY_CODE", text: "" }]);
    else setButtons([...buttons, { type: "QUICK_REPLY", text: "" }]);
  };
  const handleRemoveButton = (i: number) => setButtons(buttons.filter((_, idx) => idx !== i));
  const handleUpdateButton = (i: number, field: string, value: string) => {
    const updated = [...buttons]; (updated[i] as any)[field] = value; setButtons(updated);
  };
  const insertVariable = () => {
    const vars = bodyText.match(/\{\{\d+\}\}/g) || [];
    const next = vars.length + 1;
    setBodyText(bodyText + `{{${next}}}`);
    setBodyExamples([...bodyExamples, ""]);
  };
  const canGoStep2 = name.trim().length > 0;
  const canGoStep3 = bodyText.trim().length > 0;

  const handleCreate = async () => {
    setError(""); setSaving(true);
    try {
      const components: any[] = [];
      if (headerType === "text" && headerText.trim()) {
        const headerComp: any = { type: "HEADER", format: "TEXT", text: headerText.trim() };
        if (headerText.match(/\{\{\d+\}\}/g) && headerExample) {
          headerComp.example = { header_text: [headerExample] };
        }
        components.push(headerComp);
      } else if (headerType !== "none") {
        const headerComp: any = { type: "HEADER", format: headerType.toUpperCase() };
        if (headerMediaHandle) {
          headerComp.example = { header_handle: [headerMediaHandle] };
        }
        components.push(headerComp);
      }

      const bodyComp: any = { type: "BODY", text: bodyText.trim() };
      const bodyVars = bodyText.match(/\{\{\d+\}\}/g);
      if (bodyVars && bodyVars.length > 0) {
        const examples = bodyVars.map((_, i) => bodyExamples[i] || `ejemplo_${i + 1}`);
        bodyComp.example = { body_text: [examples] };
      }
      components.push(bodyComp);

      if (footerText.trim()) components.push({ type: "FOOTER", text: footerText.trim() });
      if (buttons.length > 0) {
        components.push({ type: "BUTTONS", buttons: buttons.map((b) => {
          if (b.type === "URL") return { type: "URL", text: b.text, url: b.url };
          if (b.type === "PHONE_NUMBER") return { type: "PHONE_NUMBER", text: b.text, phone_number: b.phone_number };
          if (b.type === "COPY_CODE") return { type: "COPY_CODE", example: b.text };
          return { type: "QUICK_REPLY", text: b.text };
        }) });
      }
      await api.post("/chats/whatsapp/templates", { inboxId, name: name.trim(), category, language, components });
      onCreated();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || "Error al crear la plantilla");
    } finally { setSaving(false); }
  };

  const STEPS = [
    { n: 1, label: "Configurar plantilla" },
    { n: 2, label: "Editar plantilla" },
    { n: 3, label: "Enviar para revisión" },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* Header with stepper */}
      <div className="border-b border-gray-200 px-6 py-3 flex items-center justify-between shrink-0">
        <h2 className="text-sm font-semibold text-gray-900">Crear plantilla</h2>
        <div className="flex items-center gap-0">
          {STEPS.map(({ n, label }, idx) => (
            <div key={n} className="flex items-center">
              {idx > 0 && <div className="w-4 h-px bg-gray-300 mx-1" />}
              <button onClick={() => { if (n < step) setStep(n); }} className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors ${step === n ? "" : "hover:bg-gray-50"}`}>
                <span className={`h-5 w-5 rounded-full flex items-center justify-center text-[11px] font-semibold ${step === n ? "bg-gray-900 text-white" : step > n ? "bg-green-600 text-white" : "bg-gray-200 text-gray-500"}`}>
                  {step > n ? <CheckCircle2 className="h-3 w-3" /> : n}
                </span>
                <span className={`text-xs font-medium hidden md:inline ${step === n ? "text-gray-900" : "text-gray-500"}`}>{label}</span>
              </button>
            </div>
          ))}
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="h-4 w-4 text-gray-500" /></button>
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto">
            {/* Step 1 */}
            {step === 1 && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">Configura tu plantilla</h3>
                  <p className="text-sm text-gray-500">Elige la categoría y el nombre para tu plantilla de mensaje.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">Categoría</label>
                  <div className="grid grid-cols-3 gap-3">
                    {([
                      { id: "MARKETING", label: "Marketing", icon: Megaphone, desc: "Contenido promocional y ofertas para captar clientes.", color: "text-purple-600" },
                      { id: "UTILITY", label: "Utilidad", icon: Wrench, desc: "Actualizaciones de transacciones, pedidos o alertas.", color: "text-blue-600" },
                      { id: "AUTHENTICATION", label: "Autenticación", icon: ShieldCheck, desc: "Códigos de verificación de identidad.", color: "text-amber-600" },
                    ]).map((cat) => {
                      const Icon = cat.icon;
                      return (
                        <button key={cat.id} onClick={() => setCategory(cat.id)} className={`p-4 rounded-xl border-2 text-left transition-all ${category === cat.id ? "border-brand-500 bg-brand-50/50 ring-1 ring-brand-200" : "border-gray-200 hover:border-gray-300"}`}>
                          <Icon className={`h-5 w-5 ${cat.color}`} />
                          <p className="text-sm font-semibold text-gray-900 mt-2">{cat.label}</p>
                          <p className="text-[11px] text-gray-500 mt-1">{cat.desc}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de la plantilla</label>
                    <input type="text" value={name} onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))} placeholder="mi_plantilla" className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                    <p className="text-[11px] text-gray-400 mt-1">Minúsculas, números y guiones bajos.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Idioma</label>
                    <CustomSelect value={language} onChange={setLanguage} options={LANGUAGES.map(l => ({ value: l.code, label: l.label }))} placeholder="Selecciona idioma" />
                  </div>
                </div>
              </div>
            )}

            {/* Step 2 */}
            {step === 2 && (
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-green-100 flex items-center justify-center"><FileText className="h-4 w-4 text-green-600" /></div>
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">{name}</h3>
                    <p className="text-[11px] text-gray-400">{category} · {LANGUAGES.find(l => l.code === language)?.label}</p>
                  </div>
                </div>

                {/* Header section */}
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <label className="text-sm font-medium text-gray-700">Encabezado</label>
                    <span className="text-xs text-gray-400 font-normal">· Opcional</span>
                    <Tooltip text="El encabezado aparece en la parte superior del mensaje. Puede ser texto corto o contenido multimedia que capture la atención." />
                  </div>
                  <p className="text-[11px] text-gray-500 mb-3">Agrega un título o contenido multimedia que se muestra encima del cuerpo del mensaje.</p>
                  <div className="flex gap-2 mb-3 flex-wrap">
                    {([
                      { key: "none", label: "Ninguno", icon: XCircle },
                      { key: "text", label: "Texto", icon: Type },
                      { key: "image", label: "Imagen", icon: ImageIcon },
                      { key: "video", label: "Video", icon: PlayCircle },
                      { key: "document", label: "Documento", icon: FileText },
                    ] as const).map(({ key, label, icon: Icon }) => (
                      <button key={key} onClick={() => setHeaderType(key)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${headerType === key ? "border-brand-500 bg-brand-50 text-brand-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                        <Icon className="h-3.5 w-3.5" />
                        {label}
                      </button>
                    ))}
                  </div>
                  {headerType === "text" && (
                    <div>
                      <input type="text" value={headerText} onChange={(e) => setHeaderText(e.target.value)} placeholder="Ej: ¡Hola! Tenemos una oferta para ti" maxLength={60} className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                      <div className="flex justify-between mt-1">
                        <p className="text-[10px] text-gray-400">Texto breve y llamativo. Máximo 60 caracteres.</p>
                        <span className="text-[10px] text-gray-400">{headerText.length}/60</span>
                      </div>
                      {headerText.match(/\{\{\d+\}\}/g) && (
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-[11px] text-gray-500 font-mono shrink-0">{"{{1}}"}</span>
                          <input type="text" value={headerExample} onChange={(e) => setHeaderExample(e.target.value)} placeholder="Ejemplo para la variable del encabezado" className="flex-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                        </div>
                      )}
                    </div>
                  )}
                  {["image", "video", "document"].includes(headerType) && (
                    <div className="space-y-2">
                      <p className="text-[11px] text-gray-500">Sube un archivo de ejemplo. Meta lo revisará como parte de la aprobación de la plantilla.</p>
                      {headerMediaPreview && headerType === "image" ? (
                        <div className="relative w-fit">
                          <img src={headerMediaPreview} alt="Preview" className="h-24 rounded-lg border border-gray-200 object-cover" />
                          <button onClick={() => { setHeaderMediaHandle(""); setHeaderMediaPreview(""); }} className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center"><X className="h-3 w-3" /></button>
                        </div>
                      ) : headerMediaHandle ? (
                        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-green-50 border border-green-200">
                          <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                          <p className="text-xs text-green-700">Archivo subido correctamente</p>
                          <button onClick={() => { setHeaderMediaHandle(""); setHeaderMediaPreview(""); }} className="ml-auto p-1 rounded hover:bg-green-100 text-green-600"><X className="h-3 w-3" /></button>
                        </div>
                      ) : (
                        <label className="flex flex-col items-center justify-center p-4 rounded-lg border-2 border-dashed border-gray-300 hover:border-brand-400 hover:bg-brand-50/20 cursor-pointer transition-colors">
                          {headerMediaUploading ? (
                            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                          ) : (
                            <>
                              <Upload className="h-5 w-5 text-gray-400 mb-1" />
                              <p className="text-xs text-gray-600 font-medium">
                                {headerType === "image" ? "Subir imagen (JPG, PNG)" : headerType === "video" ? "Subir video (MP4)" : "Subir documento (PDF)"}
                              </p>
                              <p className="text-[10px] text-gray-400 mt-0.5">Arrastra o haz clic para seleccionar</p>
                            </>
                          )}
                          <input type="file" className="hidden" accept={headerType === "image" ? "image/jpeg,image/png" : headerType === "video" ? "video/mp4" : "application/pdf"} onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            setHeaderMediaUploading(true);
                            try {
                              if (headerType === "image") setHeaderMediaPreview(URL.createObjectURL(file));
                              const formData = new FormData();
                              formData.append("file", file);
                              formData.append("inboxId", inboxId);
                              const { data } = await api.post("/chats/whatsapp/templates/upload-media", formData);
                              setHeaderMediaHandle(data.handle);
                            } catch (err: any) {
                              setError(err.response?.data?.message || "Error al subir archivo");
                              setHeaderMediaPreview("");
                            } finally { setHeaderMediaUploading(false); }
                          }} />
                        </label>
                      )}
                    </div>
                  )}
                </div>

                {/* Body section */}
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <label className="text-sm font-medium text-gray-700">Cuerpo</label>
                    <span className="text-xs text-red-500">*</span>
                    <Tooltip text="El cuerpo es el contenido principal que verá tu cliente. Usa variables como {{1}} para personalizar cada mensaje con datos del contacto (nombre, número de pedido, etc)." />
                  </div>
                  <p className="text-[11px] text-gray-500 mb-3">Escribe el contenido principal de tu mensaje. Usa variables para personalizar con datos de cada contacto.</p>
                  <div className="relative">
                    <textarea value={bodyText} onChange={(e) => setBodyText(e.target.value)} placeholder="Ej: Hola {{1}}, tu pedido #{{2}} está listo para recoger en nuestra tienda. ¡Te esperamos!" rows={6} maxLength={1024} className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
                    <span className="absolute bottom-2 right-2 text-[10px] text-gray-400">{bodyText.length}/1024</span>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-1">
                      <button className="p-1.5 rounded hover:bg-gray-100 text-gray-400" title="Negrita: *texto*"><Bold className="h-3.5 w-3.5" /></button>
                      <button className="p-1.5 rounded hover:bg-gray-100 text-gray-400" title="Cursiva: _texto_"><Italic className="h-3.5 w-3.5" /></button>
                      <button className="p-1.5 rounded hover:bg-gray-100 text-gray-400" title="Tachado: ~texto~"><Strikethrough className="h-3.5 w-3.5" /></button>
                      <button className="p-1.5 rounded hover:bg-gray-100 text-gray-400" title="Código: ```texto```"><Code className="h-3.5 w-3.5" /></button>
                      <button className="p-1.5 rounded hover:bg-gray-100 text-gray-400" title="Insertar emoji"><Smile className="h-3.5 w-3.5" /></button>
                    </div>
                    <button onClick={insertVariable} className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1">
                      <Plus className="h-3 w-3" /> Agregar variable
                    </button>
                  </div>
                  {bodyText.match(/\{\{\d+\}\}/g) && (
                    <div className="mt-3 p-3 rounded-lg bg-blue-50 border border-blue-100 space-y-2">
                      <p className="text-[11px] text-blue-800 font-medium">Valores de ejemplo para las variables</p>
                      <p className="text-[10px] text-blue-600 mb-2">Meta requiere ejemplos para aprobar la plantilla. Escribe un valor representativo para cada variable.</p>
                      <div className="space-y-1.5">
                        {(bodyText.match(/\{\{\d+\}\}/g) || []).map((v, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className="text-[11px] text-blue-700 font-mono w-10 shrink-0">{v}</span>
                            <input
                              type="text"
                              value={bodyExamples[i] || ""}
                              onChange={(e) => { const u = [...bodyExamples]; u[i] = e.target.value; setBodyExamples(u); }}
                              placeholder={i === 0 ? "Ej: Juan" : i === 1 ? "Ej: 12345" : `Ejemplo para ${v}`}
                              className="flex-1 px-2.5 py-1.5 rounded-lg border border-blue-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer section */}
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <label className="text-sm font-medium text-gray-700">Pie de página</label>
                    <span className="text-xs text-gray-400 font-normal">· Opcional</span>
                    <Tooltip text="El pie de página aparece debajo del cuerpo en texto gris pequeño. Útil para disclaimers o información legal." />
                  </div>
                  <p className="text-[11px] text-gray-500 mb-3">Texto breve que aparece al final del mensaje en gris. Ideal para notas o avisos legales.</p>
                  <input type="text" value={footerText} onChange={(e) => setFooterText(e.target.value)} placeholder="Ej: No responder a este mensaje" maxLength={60} className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  <div className="text-right text-[10px] text-gray-400 mt-1">{footerText.length}/60</div>
                </div>

                {/* Buttons section */}
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <label className="text-sm font-medium text-gray-700">Botones</label>
                    <span className="text-xs text-gray-400 font-normal">· Opcional</span>
                    <Tooltip text="Los botones permiten al cliente realizar acciones con un solo toque: responder, visitar un sitio web, llamar, copiar un código de oferta." />
                  </div>
                  <p className="text-[11px] text-gray-500 mb-3">Crea botones para que los clientes puedan responder tu mensaje o realizar una acción. Si agregas más de 3, aparecerán en forma de lista.</p>
                  <div className="space-y-3">
                    {buttons.map((btn, i) => (
                      <div key={i} className="p-3 rounded-lg border border-gray-200 bg-gray-50/30">
                        {/* URL Button */}
                        {btn.type === "URL" && (
                          <div>
                            <p className="text-[11px] text-gray-500 font-medium mb-2">Ir al sitio web</p>
                            <div className="flex items-start gap-2">
                              <div className="flex-1 space-y-2">
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-[10px] text-gray-500 mb-0.5 block">Texto del botón</label>
                                    <div className="relative">
                                      <input type="text" value={btn.text} onChange={(e) => handleUpdateButton(i, "text", e.target.value)} placeholder="Visit website" maxLength={25} className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-gray-400">{btn.text.length}/25</span>
                                    </div>
                                  </div>
                                  <div>
                                    <label className="text-[10px] text-gray-500 mb-0.5 block">Tipo de URL</label>
                                    <CustomSelect value={btn.phone_number || "dynamic"} onChange={(v) => handleUpdateButton(i, "phone_number", v)} options={[{ value: "static", label: "Estática" }, { value: "dynamic", label: "Dinámica" }]} compact />
                                  </div>
                                </div>
                                <div>
                                  <label className="text-[10px] text-gray-500 mb-0.5 block">URL del sitio web</label>
                                  <input type="text" value={btn.url || ""} onChange={(e) => handleUpdateButton(i, "url", e.target.value)} placeholder="https://www.ejemplo.com/{{1}}" className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                                </div>
                              </div>
                              <button onClick={() => handleRemoveButton(i)} className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 mt-4"><X className="h-4 w-4" /></button>
                            </div>
                          </div>
                        )}
                        {/* Phone Number Button */}
                        {btn.type === "PHONE_NUMBER" && (
                          <div>
                            <p className="text-[11px] text-gray-500 font-medium mb-2">Llamar a número de teléfono</p>
                            <div className="flex items-start gap-2">
                              <div className="flex-1">
                                <div className="grid grid-cols-[1fr_1fr_1fr] gap-2">
                                  <div>
                                    <label className="text-[10px] text-gray-500 mb-0.5 block">Texto del botón</label>
                                    <div className="relative">
                                      <input type="text" value={btn.text} onChange={(e) => handleUpdateButton(i, "text", e.target.value)} placeholder="Llamar" maxLength={25} className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-gray-400">{btn.text.length}/25</span>
                                    </div>
                                  </div>
                                  <div>
                                    <label className="text-[10px] text-gray-500 mb-0.5 block">País</label>
                                    <CustomSelect value="CO" onChange={() => {}} options={[{ value: "CO", label: "CO +57" }, { value: "US", label: "US +1" }, { value: "MX", label: "MX +52" }, { value: "ES", label: "ES +34" }]} compact />
                                  </div>
                                  <div>
                                    <label className="text-[10px] text-gray-500 mb-0.5 block">Número de teléfono</label>
                                    <div className="relative">
                                      <input type="text" value={btn.phone_number || ""} onChange={(e) => handleUpdateButton(i, "phone_number", e.target.value)} placeholder="3001234567" maxLength={20} className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-gray-400">{(btn.phone_number || "").length}/20</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <button onClick={() => handleRemoveButton(i)} className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 mt-4"><X className="h-4 w-4" /></button>
                            </div>
                          </div>
                        )}
                        {/* Copy Code Button */}
                        {btn.type === "COPY_CODE" && (
                          <div>
                            <p className="text-[11px] text-gray-500 font-medium mb-2">Copiar código de oferta</p>
                            <div className="flex items-start gap-2">
                              <div className="flex-1">
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-[10px] text-gray-500 mb-0.5 block">Texto del botón</label>
                                    <input type="text" value="Copy offer code" disabled className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm bg-gray-50 text-gray-500" />
                                  </div>
                                  <div>
                                    <label className="text-[10px] text-gray-500 mb-0.5 block">Código de oferta</label>
                                    <div className="relative">
                                      <input type="text" value={btn.text} onChange={(e) => handleUpdateButton(i, "text", e.target.value)} placeholder="Ingresa una muestra" maxLength={20} className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-gray-400">{btn.text.length}/20</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <button onClick={() => handleRemoveButton(i)} className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 mt-4"><X className="h-4 w-4" /></button>
                            </div>
                          </div>
                        )}
                        {/* Quick Reply Button */}
                        {btn.type === "QUICK_REPLY" && (
                          <div>
                            <p className="text-[11px] text-gray-500 font-medium mb-2">Respuesta preconfigurada</p>
                            <div className="flex items-center gap-2">
                              <div className="flex-1">
                                <label className="text-[10px] text-gray-500 mb-0.5 block">Texto del botón</label>
                                <div className="relative">
                                  <input type="text" value={btn.text} onChange={(e) => handleUpdateButton(i, "text", e.target.value)} placeholder="Texto de respuesta" maxLength={25} className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-gray-400">{btn.text.length}/25</span>
                                </div>
                              </div>
                              <button onClick={() => handleRemoveButton(i)} className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 mt-4"><X className="h-4 w-4" /></button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {buttons.length < 10 && <AddButtonDropdown onAdd={handleAddButton} />}
                </div>
              </div>
            )}

            {/* Step 3 */}
            {step === 3 && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">Enviar para revisión</h3>
                  <p className="text-sm text-gray-500">Revisa tu plantilla. Meta la revisará y te notificará cuando esté aprobada.</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
                  <h4 className="text-sm font-semibold text-gray-900">Resumen</h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div><span className="text-gray-500">Nombre:</span> <span className="font-medium">{name}</span></div>
                    <div><span className="text-gray-500">Categoría:</span> <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${CATEGORY_COLORS[category]}`}>{category}</span></div>
                    <div><span className="text-gray-500">Idioma:</span> <span className="font-medium">{LANGUAGES.find(l => l.code === language)?.label}</span></div>
                    <div><span className="text-gray-500">Botones:</span> <span className="font-medium">{buttons.length}</span></div>
                  </div>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="text-xs text-amber-800"><strong>Nota:</strong> La revisión generalmente tarda unos minutos, pero puede tomar hasta 24 horas.</p>
                </div>
                {error && <div className="bg-red-50 border border-red-200 rounded-xl p-4"><p className="text-xs text-red-700">{error}</p></div>}
              </div>
            )}
          </div>
        </div>
        {/* Right panel: Preview */}
        {step >= 2 && (
          <div className="w-[320px] border-l border-gray-200 bg-gray-50 p-5 shrink-0 hidden lg:flex flex-col">
            <h4 className="text-xs font-semibold text-gray-500 uppercase mb-3">Vista previa</h4>
            <TemplatePreview headerType={headerType} headerText={headerText} bodyText={bodyText} footerText={footerText} buttons={buttons} bodyExamples={bodyExamples} headerExample={headerExample} headerMediaPreview={headerMediaPreview} />
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200 px-6 py-3 flex items-center justify-between shrink-0">
        <button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 font-medium">Descartar</button>
        <div className="flex items-center gap-2">
          {step > 1 && <button onClick={() => setStep(step - 1)} className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 font-medium">Anterior</button>}
          {step < 3 ? (
            <button onClick={() => setStep(step + 1)} disabled={step === 1 ? !canGoStep2 : !canGoStep3} className="px-5 py-2 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-600 disabled:opacity-50">Siguiente</button>
          ) : (
            <button onClick={handleCreate} disabled={saving} className="px-5 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex items-center gap-1.5">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Enviar para revisión
            </button>
          )}
        </div>
      </div>
    </div>
  );
}


// === DELETE CONFIRM MODAL ===
function DeleteTemplateModal({ template, inboxId, onClose, onDeleted }: { template: Template; inboxId: string; onClose: () => void; onDeleted: () => void }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const handleDelete = async () => {
    setDeleting(true); setError("");
    try {
      await api.delete(`/chats/whatsapp/templates/${encodeURIComponent(template.name)}`, { params: { inboxId } });
      onDeleted();
    } catch (err: any) { setError(err.response?.data?.message || "Error al eliminar"); } finally { setDeleting(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 mx-4">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="h-5 w-5 text-red-500" />
          <h3 className="text-base font-semibold text-gray-900">Eliminar plantilla</h3>
        </div>
        <p className="text-sm text-gray-600 mb-4">¿Eliminar <strong>{template.name}</strong> ({template.language})? Se eliminarán todas las versiones en todos los idiomas.</p>
        {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg mb-3">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
          <button onClick={handleDelete} disabled={deleting} className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 flex items-center gap-1.5">
            {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />} Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}


// === TEMPLATE DETAIL PANEL ===
function TemplateDetail({ template, onClose }: { template: Template; onClose: () => void }) {
  const body = template.components.find((c) => c.type === "BODY");
  const header = template.components.find((c) => c.type === "HEADER");
  const footer = template.components.find((c) => c.type === "FOOTER");
  const btns = template.components.find((c) => c.type === "BUTTONS");
  const statusCfg = STATUS_CONFIG[template.status] || STATUS_CONFIG.APPROVED;
  const StatusIcon = statusCfg.icon;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col mx-4">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-base font-semibold text-gray-900">{template.name}</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${CATEGORY_COLORS[template.category] || "bg-gray-100 text-gray-600"}`}>{template.category}</span>
              <span className="text-[10px] text-gray-400">{template.language}</span>
              <span className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border font-medium ${statusCfg.color}`}><StatusIcon className="h-2.5 w-2.5" /> {statusCfg.label}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100"><X className="h-4 w-4 text-gray-500" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <TemplatePreview headerType={header?.format?.toLowerCase() || (header?.text ? "text" : "none")} headerText={header?.text || ""} bodyText={body?.text || ""} footerText={footer?.text || ""} buttons={btns?.buttons || []} />
          <div className="mt-4 space-y-2">
            {template.quality_score?.score && <div className="flex justify-between text-xs"><span className="text-gray-500">Calidad</span><span className="font-medium">{template.quality_score.score}</span></div>}
            {template.rejected_reason && <div className="p-2.5 rounded-lg bg-red-50 border border-red-200"><p className="text-xs text-red-700"><strong>Rechazo:</strong> {template.rejected_reason}</p></div>}
            <div className="flex justify-between text-xs"><span className="text-gray-500">ID</span><span className="font-mono text-gray-700">{template.id}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}


// === MAIN COMPONENT ===
export function WhatsAppTemplatesManager({ inboxId }: { inboxId: string }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);
  const [detailTarget, setDetailTarget] = useState<Template | null>(null);

  const fetchTemplates = () => {
    setLoading(true);
    api.get<Template[]>("/chats/whatsapp/templates", { params: { inboxId } })
      .then(({ data }) => setTemplates(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(() => { fetchTemplates(); }, [inboxId]);

  const filtered = useMemo(() => {
    return templates.filter((t) => {
      if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterCategory !== "all" && t.category !== filterCategory) return false;
      if (filterStatus !== "all" && t.status !== filterStatus) return false;
      return true;
    });
  }, [templates, search, filterCategory, filterStatus]);

  const uniqueStatuses = [...new Set(templates.map((t) => t.status))];

  if (loading) return <div className="flex-1 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3 shrink-0 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..." className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <CustomSelect value={filterCategory} onChange={setFilterCategory} options={[{ value: "all", label: "Categoría" }, { value: "MARKETING", label: "Marketing" }, { value: "UTILITY", label: "Utilidad" }, { value: "AUTHENTICATION", label: "Autenticación" }]} placeholder="Categoría" compact />
        <CustomSelect value={filterStatus} onChange={setFilterStatus} options={[{ value: "all", label: "Estado" }, ...uniqueStatuses.map(s => ({ value: s, label: STATUS_CONFIG[s]?.label || s }))]} placeholder="Estado" compact />
        <div className="ml-auto">
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-700 text-white text-sm font-medium hover:bg-brand-600">
            <Plus className="h-3.5 w-3.5" /> Crear plantilla
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <svg className="h-8 w-8 text-gray-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" /></svg>
            <p className="text-sm text-gray-500">{search || filterCategory !== "all" || filterStatus !== "all" ? "Sin resultados" : "No hay plantillas"}</p>
          </div>
        ) : (
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
              <tr>
                <th className="px-5 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Nombre</th>
                <th className="px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Categoría</th>
                <th className="px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Idioma</th>
                <th className="px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Estado</th>
                <th className="px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Calidad</th>
                <th className="px-3 py-2.5 w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((tpl) => {
                const body = tpl.components.find((c) => c.type === "BODY");
                const statusCfg = STATUS_CONFIG[tpl.status] || STATUS_CONFIG.APPROVED;
                const StatusIcon = statusCfg.icon;
                const qs = tpl.quality_score?.score;
                const qColor = qs === "GREEN" ? "text-green-600" : qs === "YELLOW" ? "text-yellow-600" : qs === "RED" ? "text-red-600" : "text-gray-400";
                return (
                  <tr key={tpl.id} className="hover:bg-gray-50/50 cursor-pointer" onClick={() => setDetailTarget(tpl)}>
                    <td className="px-5 py-3">
                      <p className="text-sm font-medium text-gray-900">{tpl.name}</p>
                      {body?.text && <p className="text-[11px] text-gray-400 mt-0.5 truncate max-w-[280px]">{body.text.substring(0, 60)}{body.text.length > 60 ? "..." : ""}</p>}
                    </td>
                    <td className="px-3 py-3"><span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${CATEGORY_COLORS[tpl.category] || "bg-gray-100 text-gray-600"}`}>{tpl.category}</span></td>
                    <td className="px-3 py-3 text-xs text-gray-600">{tpl.language}</td>
                    <td className="px-3 py-3"><span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border font-medium ${statusCfg.color}`}><StatusIcon className="h-2.5 w-2.5" /> {statusCfg.label}</span></td>
                    <td className="px-3 py-3"><span className={`text-xs font-medium ${qColor}`}>{qs ? "●" : "—"}</span></td>
                    <td className="px-3 py-3"><button onClick={(e) => { e.stopPropagation(); setDeleteTarget(tpl); }} className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-2 border-t border-gray-100 shrink-0">
        <p className="text-[11px] text-gray-400">Se muestran {filtered.length} plantillas (Total: {templates.length} de 250)</p>
      </div>

      {/* Modals */}
      {showCreate && <CreateTemplateModal inboxId={inboxId} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); fetchTemplates(); }} />}
      {deleteTarget && <DeleteTemplateModal template={deleteTarget} inboxId={inboxId} onClose={() => setDeleteTarget(null)} onDeleted={() => { setDeleteTarget(null); fetchTemplates(); }} />}
      {detailTarget && <TemplateDetail template={detailTarget} onClose={() => setDetailTarget(null)} />}
    </div>
  );
}
