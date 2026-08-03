import { useEffect, useState, useRef } from "react";
import { X, Search, FileText, ChevronDown, User } from "lucide-react";
import axios from "axios";

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "/api" });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

interface Template {
  name: string;
  language: string;
  status: string;
  category: string;
  components: Array<{
    type: string;
    text?: string;
    format?: string;
    example?: { body_text?: string[][] };
    buttons?: Array<{ type: string; text: string; url?: string }>;
  }>;
}

interface TemplateSelectorProps {
  inboxId: string;
  onSelect: (template: Template) => void;
  iconOnly?: boolean;
}

export function TemplateSelector({ inboxId, onSelect, iconOnly }: TemplateSelectorProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || templates.length > 0) return;
    setLoading(true);
    api.get("/chats/whatsapp/templates", { params: { inboxId } })
      .then(({ data }) => setTemplates(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, inboxId]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const filtered = templates.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  const getBodyText = (template: Template): string => {
    const body = template.components.find((c) => c.type === "BODY");
    return body?.text || "";
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={iconOnly
          ? "p-2.5 rounded-lg text-green-600 hover:bg-green-50 transition-colors"
          : "px-3 py-1.5 text-xs font-medium rounded-lg text-green-700 bg-green-50 hover:bg-green-100 transition-colors flex items-center gap-1"}
        title="Enviar plantilla"
      >
        <FileText className={iconOnly ? "h-5 w-5" : "h-3.5 w-3.5"} />
        {!iconOnly && <><span>Plantilla</span><ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} /></>}
      </button>
      {open && (
        <div className="absolute bottom-full right-0 mb-2 w-80 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden z-50">
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar plantilla..."
                className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:border-brand-500"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center text-xs text-gray-400">Cargando...</div>
            ) : filtered.length === 0 ? (
              <div className="p-4 text-center text-xs text-gray-400">Sin resultados</div>
            ) : (
              filtered.map((t) => (
                <button
                  key={`${t.name}-${t.language}`}
                  onClick={() => { onSelect(t); setOpen(false); setSearch(""); }}
                  className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0"
                >
                  <div className="h-7 w-7 rounded-md bg-green-50 flex items-center justify-center shrink-0 mt-0.5">
                    <FileText className="h-3.5 w-3.5 text-green-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-900 truncate">{t.name}</p>
                    <p className="text-[10px] text-gray-500 line-clamp-1 mt-0.5">{getBodyText(t)}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{t.language}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">{t.category}</span>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Modal for configuring and sending a selected template
interface TemplateConfigModalProps {
  template: Template;
  conversationId: string;
  senderId?: string;
  contact?: { firstName?: string | null; lastName?: string | null; phone?: string | null; email?: string | null } | null;
  onClose: () => void;
  onSent: () => void;
}

export function TemplateConfigModal({ template, conversationId, senderId, contact, onClose, onSent }: TemplateConfigModalProps) {
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [headerImageUrl, setHeaderImageUrl] = useState("");
  const [headerImagePreview, setHeaderImagePreview] = useState("");
  const [carouselImages, setCarouselImages] = useState<string[]>([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [sending, setSending] = useState(false);

  const getBodyText = (): string => {
    const body = template.components.find((c) => c.type === "BODY");
    return body?.text || "";
  };

  const getHeaderText = (): string => {
    const header = template.components.find((c) => c.type === "HEADER");
    return header?.text || "";
  };

  const getFooterText = (): string => {
    const footer = template.components.find((c) => c.type === "FOOTER");
    return footer?.text || "";
  };

  const getButtons = (): Array<{ type: string; text: string }> => {
    const btns = template.components.find((c) => c.type === "BUTTONS");
    return btns?.buttons || [];
  };

  const getVariableCount = (text: string): number => {
    const matches = text.match(/\{\{\d+\}\}/g);
    return matches ? matches.length : 0;
  };

  const replaceVariables = (text: string, prefix = ""): string => {
    return text.replace(/\{\{(\d+)\}\}/g, (_, num) => {
      const val = variables[`${prefix}${num}`];
      if (!val) return `{{${num}}}`;
      // Resolve contact field placeholders
      return resolveContactField(val);
    });
  };

  const resolveContactField = (val: string): string => {
    if (!contact) return val;
    switch (val) {
      case "{{firstName}}": return contact.firstName || val;
      case "{{lastName}}": return contact.lastName || val;
      case "{{phone}}": return contact.phone || val;
      case "{{email}}": return contact.email || val;
      case "{{fullName}}": return [contact.firstName, contact.lastName].filter(Boolean).join(" ") || val;
      default: return val;
    }
  };

  const bodyText = getBodyText();
  const headerText = getHeaderText();
  const footerText = getFooterText();
  const buttons = getButtons();
  const bodyVarCount = getVariableCount(bodyText);
  const headerVarCount = getVariableCount(headerText);
  const hasVariables = bodyVarCount > 0 || headerVarCount > 0 
    || !!template.components.find((c) => c.type === "HEADER" && (c.format === "IMAGE" || c.format === "VIDEO" || c.format === "DOCUMENT"))
    || !!template.components.find((c) => c.type === "CAROUSEL");

  const handleSend = async () => {
    setSending(true);
    const components: any[] = [];

    const headerFormat = template.components.find((c) => c.type === "HEADER")?.format;

    if (headerFormat === "IMAGE" && headerImageUrl) {
      components.push({
        type: "header",
        parameters: [{ type: "image", image: { link: headerImageUrl } }],
      });
    } else if (headerFormat === "VIDEO" && headerImageUrl) {
      components.push({
        type: "header",
        parameters: [{ type: "video", video: { link: headerImageUrl } }],
      });
    } else if (headerFormat === "DOCUMENT" && headerImageUrl) {
      components.push({
        type: "header",
        parameters: [{ type: "document", document: { link: headerImageUrl } }],
      });
    } else if (headerVarCount > 0) {
      components.push({
        type: "header",
        parameters: Array.from({ length: headerVarCount }, (_, i) => ({
          type: "text",
          text: resolveContactField(variables[`h${i + 1}`] || ""),
        })),
      });
    }

    if (bodyVarCount > 0) {
      components.push({
        type: "body",
        parameters: Array.from({ length: bodyVarCount }, (_, i) => ({
          type: "text",
          text: resolveContactField(variables[String(i + 1)] || ""),
        })),
      });
    }

    // Carousel cards
    const carousel = template.components.find((c) => c.type === "CAROUSEL");
    if (carousel?.cards && carouselImages.length > 0) {
      components.push({
        type: "carousel",
        cards: carousel.cards.map((card: any, i: number) => {
          const cardComponents: any[] = [];
          if (card.components?.find((cc: any) => cc.type === "HEADER" && cc.format === "IMAGE") && carouselImages[i]) {
            cardComponents.push({ type: "header", parameters: [{ type: "image", image: { link: carouselImages[i] } }] });
          }
          // Card buttons (index 0)
          const cardButtons = card.components?.find((cc: any) => cc.type === "BUTTONS");
          if (cardButtons?.buttons?.length > 0) {
            cardButtons.buttons.forEach((_: any, btnIdx: number) => {
              cardComponents.push({ type: "button", sub_type: "url", index: btnIdx, parameters: [] });
            });
          }
          return { card_index: i, components: cardComponents };
        }),
      });
    }

    try {
      const renderedBody = replaceVariables(bodyText);
      const renderedHeader = headerText ? replaceVariables(headerText, "h") : "";
      const renderedContent = [renderedHeader, renderedBody].filter(Boolean).join("\n");

      await api.post(`/chats/conversations/${conversationId}/send-template`, {
        templateName: template.name,
        languageCode: template.language,
        category: template.category,
        components: components.length > 0 ? components : undefined,
        senderId,
        renderedContent,
        templateComponents: template.components,
      });
      onSent();
      onClose();
    } catch {} finally { setSending(false); }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={`relative bg-white rounded-xl shadow-xl mx-4 max-h-[85vh] flex flex-col ${hasVariables ? "w-full max-w-3xl" : "w-full max-w-md"}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Enviar plantilla</h3>
            <p className="text-xs text-gray-400 mt-0.5">Revisa el mensaje antes de enviarlo al contacto</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className={`flex-1 overflow-y-auto ${hasVariables ? "flex" : ""}`}>
          {/* Preview side */}
          <div className={`p-5 ${hasVariables ? "w-[45%] border-r border-gray-100 shrink-0" : ""}`}>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Vista previa</p>
            <div className="bg-[#e5ddd5] rounded-xl p-4">
              <div className="bg-white rounded-lg p-3.5 shadow-sm">
                {headerText ? (
                  <p className="font-bold text-gray-900 text-[13px] mb-1.5">{replaceVariables(headerText, "h")}</p>
                ) : template.components.find((c) => c.type === "HEADER" && c.format === "IMAGE") ? (
                  <div className="w-full h-32 bg-gray-200 rounded-md mb-2 flex items-center justify-center">
                    <span className="text-gray-400 text-xs">📷 Imagen</span>
                  </div>
                ) : template.components.find((c) => c.type === "HEADER" && c.format === "VIDEO") ? (
                  <div className="w-full h-32 bg-gray-200 rounded-md mb-2 flex items-center justify-center">
                    <span className="text-gray-400 text-xs">🎬 Video</span>
                  </div>
                ) : template.components.find((c) => c.type === "HEADER" && c.format === "DOCUMENT") ? (
                  <div className="w-full h-12 bg-gray-200 rounded-md mb-2 flex items-center justify-center">
                    <span className="text-gray-400 text-xs">📄 Documento</span>
                  </div>
                ) : null}
                <p className="text-[13px] text-gray-700 whitespace-pre-wrap leading-relaxed">{replaceVariables(bodyText)}</p>
                {footerText && (
                  <p className="text-[11px] text-gray-400 mt-2.5">{footerText}</p>
                )}
                {buttons.length > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-gray-200 space-y-1">
                    {buttons.map((btn, i) => (
                      <div key={i} className="text-center text-[12px] text-blue-500 font-medium py-1">{btn.text}</div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="mt-3 flex items-center gap-1.5 flex-wrap">
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 truncate max-w-[120px]">{template.name}</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">{template.language}</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600">{template.category}</span>
            </div>
          </div>

          {/* Variables side */}
          {hasVariables && (
            <div className="flex-1 p-5 overflow-y-auto">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Personalizar mensaje</p>
              <p className="text-xs text-gray-500 mb-4">Completa los campos para personalizar el mensaje. Los valores se reflejarán en la vista previa en tiempo real.</p>
              <div className="space-y-3">
                {template.components.find((c) => c.type === "HEADER" && (c.format === "IMAGE" || c.format === "VIDEO" || c.format === "DOCUMENT")) && (
                  <>
                    <p className="text-[11px] font-medium text-gray-600">
                      {template.components.find((c) => c.type === "HEADER")?.format === "IMAGE" ? "📷 Imagen del encabezado" :
                       template.components.find((c) => c.type === "HEADER")?.format === "VIDEO" ? "🎬 Video del encabezado" : "📄 Documento del encabezado"}
                    </p>
                    {headerImageUrl ? (
                      <div className="relative">
                        {template.components.find((c) => c.type === "HEADER")?.format === "IMAGE" && headerImagePreview ? (
                          <img src={headerImagePreview} alt="Header" className="w-full h-24 object-cover rounded-lg border border-gray-200" />
                        ) : (
                          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50">
                            <span className="text-xs text-gray-600 truncate flex-1">Archivo cargado ✓</span>
                          </div>
                        )}
                        <button
                          onClick={() => { setHeaderImageUrl(""); setHeaderImagePreview(""); }}
                          className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs"
                        >×</button>
                      </div>
                    ) : (
                      <div>
                        <label className="flex flex-col items-center justify-center h-20 border-2 border-dashed border-gray-200 rounded-lg cursor-pointer hover:border-brand-300 hover:bg-brand-50/30 transition-colors">
                          <input
                            type="file"
                            className="hidden"
                            accept={template.components.find((c) => c.type === "HEADER")?.format === "IMAGE" ? "image/*" : template.components.find((c) => c.type === "HEADER")?.format === "VIDEO" ? "video/*" : "*"}
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              setUploadingMedia(true);
                              try {
                                const formData = new FormData();
                                formData.append("file", file);
                                formData.append("conversationId", conversationId);
                                formData.append("senderId", senderId || "");
                                const { data } = await api.post("/chats/media/upload", formData, { headers: { "Content-Type": "multipart/form-data" } });
                                setHeaderImageUrl(data.url);
                                if (file.type.startsWith("image/")) setHeaderImagePreview(URL.createObjectURL(file));
                              } catch {
                                // Fallback: try URL input
                              } finally { setUploadingMedia(false); }
                            }}
                          />
                          {uploadingMedia ? (
                            <span className="text-xs text-gray-400">Subiendo...</span>
                          ) : (
                            <>
                              <span className="text-lg mb-1">{template.components.find((c) => c.type === "HEADER")?.format === "IMAGE" ? "📷" : template.components.find((c) => c.type === "HEADER")?.format === "VIDEO" ? "🎬" : "📄"}</span>
                              <span className="text-[11px] text-gray-500">Clic para subir archivo</span>
                            </>
                          )}
                        </label>
                        <p className="text-[10px] text-gray-400 mt-1.5 text-center">O pega una URL pública:</p>
                        <input
                          type="url"
                          value={headerImageUrl}
                          onChange={(e) => setHeaderImageUrl(e.target.value)}
                          placeholder="https://..."
                          className="w-full mt-1 px-3 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:border-brand-500"
                        />
                      </div>
                    )}
                  </>
                )}
                {headerVarCount > 0 && (
                  <>
                    <p className="text-[11px] font-medium text-gray-600">Encabezado</p>
                    {Array.from({ length: headerVarCount }, (_, i) => (
                      <div key={`h${i}`}>
                        <label className="block text-[11px] text-gray-400 mb-1">{`Variable {{${i + 1}}}`}</label>
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            value={variables[`h${i + 1}`] || ""}
                            onChange={(e) => setVariables({ ...variables, [`h${i + 1}`]: e.target.value })}
                            placeholder="Escribe el valor..."
                            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-200"
                          />
                          <ContactFieldPicker onSelect={(val) => setVariables({ ...variables, [`h${i + 1}`]: val })} />
                        </div>
                      </div>
                    ))}
                  </>
                )}
                {bodyVarCount > 0 && (
                  <>
                    <p className="text-[11px] font-medium text-gray-600 mt-2">Cuerpo del mensaje</p>
                    {Array.from({ length: bodyVarCount }, (_, i) => (
                      <div key={i}>
                        <label className="block text-[11px] text-gray-400 mb-1">{`Variable {{${i + 1}}}`}</label>
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            value={variables[String(i + 1)] || ""}
                            onChange={(e) => setVariables({ ...variables, [String(i + 1)]: e.target.value })}
                            placeholder="Escribe el valor..."
                            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-200"
                          />
                          <ContactFieldPicker onSelect={(val) => setVariables({ ...variables, [String(i + 1)]: val })} />
                        </div>
                      </div>
                    ))}
                  </>
                )}
                {/* Carousel card images */}
                {template.components.find((c) => c.type === "CAROUSEL") && (() => {
                  const carousel = template.components.find((c) => c.type === "CAROUSEL") as any;
                  const cards = carousel?.cards || [];
                  return (
                    <>
                      <p className="text-[11px] font-medium text-gray-600 mt-3">🎠 Imágenes del carousel ({cards.length} cards)</p>
                      <p className="text-[10px] text-gray-400 mb-2">Sube una imagen para cada tarjeta del carousel</p>
                      <div className="space-y-2">
                        {cards.map((card: any, i: number) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className="text-[10px] text-gray-400 w-14 shrink-0">Card {i + 1}</span>
                            {carouselImages[i] ? (
                              <div className="flex items-center gap-2 flex-1">
                                <img src={carouselImages[i]} alt="" className="h-10 w-10 rounded object-cover border" />
                                <span className="text-[10px] text-green-600">✓ Subida</span>
                                <button onClick={() => { const imgs = [...carouselImages]; imgs[i] = ""; setCarouselImages(imgs); }} className="text-[10px] text-red-500 ml-auto">Quitar</button>
                              </div>
                            ) : (
                              <label className="flex-1 flex items-center justify-center h-10 border border-dashed border-gray-200 rounded-lg cursor-pointer hover:border-brand-300 text-[10px] text-gray-400 hover:text-brand-600 transition-colors">
                                <input type="file" className="hidden" accept="image/*" onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  const formData = new FormData();
                                  formData.append("file", file);
                                  formData.append("conversationId", conversationId);
                                  try {
                                    const { data } = await api.post("/chats/media/upload", formData, { headers: { "Content-Type": "multipart/form-data" } });
                                    const imgs = [...carouselImages];
                                    imgs[i] = data.url;
                                    setCarouselImages(imgs);
                                  } catch {}
                                }} />
                                📷 Subir imagen
                              </label>
                            )}
                          </div>
                        ))}
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
          <p className="text-[11px] text-gray-400">
            {hasVariables ? "Completa todos los campos requeridos" : "Esta plantilla no requiere personalización"}
          </p>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100 font-medium transition-colors">
              Cancelar
            </button>
            <button
              onClick={handleSend}
              disabled={sending}
              className="px-5 py-2 text-sm rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium disabled:opacity-50 transition-colors"
            >
              {sending ? "Enviando..." : "Enviar plantilla"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const CONTACT_FIELDS = [
  { key: "{{firstName}}", label: "Nombre" },
  { key: "{{lastName}}", label: "Apellido" },
  { key: "{{phone}}", label: "Teléfono" },
  { key: "{{email}}", label: "Email" },
  { key: "{{fullName}}", label: "Nombre completo" },
];

function ContactFieldPicker({ onSelect }: { onSelect: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-[38px] px-2.5 border border-gray-200 rounded-lg text-gray-400 hover:text-brand-600 hover:border-brand-300 transition-colors"
        title="Insertar campo del contacto"
      >
        <User className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-[100]">
          <p className="px-3 py-1 text-[9px] font-semibold text-gray-400 uppercase tracking-wider">Campo del contacto</p>
          {CONTACT_FIELDS.map((field) => (
            <button
              key={field.key}
              onClick={() => { onSelect(field.key); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 transition-colors text-left"
            >
              <span className="text-gray-400">⊕</span>
              {field.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
