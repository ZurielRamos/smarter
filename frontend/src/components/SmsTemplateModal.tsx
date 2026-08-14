import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, Braces, MessageSquare, Globe, ChevronDown, Plus, Phone } from "lucide-react";
import { useContactVariables } from "@/components/email-builder";
import type { Variable } from "@/components/email-builder";

interface Translation {
  language: string;
  body: string | null;
}

interface SmsTemplateModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: { language: string; body: string }) => void | Promise<void>;
  translations: Translation[];
  defaultLanguage: string;
  initialLanguage: string;
  saving?: boolean;
  channel?: "sms" | "llamada";
}

const LANGUAGE_OPTIONS = [
  { code: "es", label: "Español" },
  { code: "en", label: "English" },
  { code: "pt", label: "Português" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" },
];

function getLangLabel(code: string) {
  return LANGUAGE_OPTIONS.find((o) => o.code === code)?.label || code.toUpperCase();
}

export function SmsTemplateModal({ open, onClose, onSave, translations, defaultLanguage, initialLanguage, saving = false, channel = "sms" }: SmsTemplateModalProps) {
  const [currentLanguage, setCurrentLanguage] = useState(initialLanguage);
  const [body, setBody] = useState("");
  const [isNewTranslation, setIsNewTranslation] = useState(false);
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const variables = useContactVariables();

  // Autocomplete state
  const [autocomplete, setAutocomplete] = useState<{ open: boolean; search: string; startPos: number } | null>(null);
  const [autocompleteIndex, setAutocompleteIndex] = useState(0);

  useEffect(() => {
    if (open) {
      setCurrentLanguage(initialLanguage);
      loadLanguage(initialLanguage);
      setAutocomplete(null);
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [open, initialLanguage]);

  const loadLanguage = (lang: string) => {
    const translation = translations.find((t) => t.language === lang);
    if (translation) {
      setBody(translation.body || "");
      setIsNewTranslation(false);
    } else {
      // New: copy from default language
      const defaultT = translations.find((t) => t.language === defaultLanguage) || translations[0];
      setBody(defaultT?.body || "");
      setIsNewTranslation(true);
    }
  };

  const handleLanguageChange = (lang: string) => {
    if (lang === currentLanguage) return;
    setCurrentLanguage(lang);
    loadLanguage(lang);
    setLangDropdownOpen(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const existingLangs = translations.map((t) => t.language);
  const availableLangs = LANGUAGE_OPTIONS.filter((o) => !existingLangs.includes(o.code));

  const checkAutocomplete = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursorPos = textarea.selectionStart ?? 0;
    const textBefore = body.slice(0, cursorPos);

    const lastOpen = textBefore.lastIndexOf("{{");
    if (lastOpen === -1) { setAutocomplete(null); return; }

    const afterOpen = textBefore.slice(lastOpen);
    if (afterOpen.includes("}}")) { setAutocomplete(null); return; }

    const search = textBefore.slice(lastOpen + 2);
    setAutocomplete((prev) => {
      if (!prev || prev.search !== search) setAutocompleteIndex(0);
      return { open: true, search, startPos: lastOpen };
    });
  }, [body]);

  const getFilteredVariables = () => {
    if (!autocomplete) return [];
    const s = autocomplete.search.toLowerCase();
    return variables.filter(
      (v) => v.field.toLowerCase().includes(s) || v.label.toLowerCase().includes(s)
    );
  };

  const selectVariable = (variable: Variable) => {
    if (!autocomplete || !textareaRef.current) return;
    const cursorPos = textareaRef.current.selectionStart ?? body.length;
    const before = body.slice(0, autocomplete.startPos);
    const after = body.slice(cursorPos);
    const replacement = `{{${variable.field}}}`;
    const newValue = before + replacement + after;
    setBody(newValue);
    setAutocomplete(null);
    const newPos = before.length + replacement.length;
    setTimeout(() => {
      textareaRef.current?.setSelectionRange(newPos, newPos);
      textareaRef.current?.focus();
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!autocomplete?.open) return;
    const filtered = getFilteredVariables();
    if (filtered.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setAutocompleteIndex((i) => (i + 1) % filtered.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setAutocompleteIndex((i) => (i - 1 + filtered.length) % filtered.length); }
    else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); selectVariable(filtered[autocompleteIndex]); }
    else if (e.key === "Escape") { setAutocomplete(null); }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setBody(e.target.value);
    setTimeout(() => checkAutocomplete(), 0);
  };

  const handleSave = async () => {
    await onSave({ language: currentLanguage, body });
  };

  const rawLength = body.length;
  const smsCount = Math.ceil(rawLength / 160) || 1;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 animate-in fade-in duration-150" onClick={saving ? undefined : onClose} />

      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-visible animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className={`h-7 w-7 rounded-lg flex items-center justify-center ${channel === "llamada" ? "bg-purple-50" : "bg-sky-50"}`}>
              {channel === "llamada"
                ? <Phone className="h-3.5 w-3.5 text-purple-600" />
                : <MessageSquare className="h-3.5 w-3.5 text-sky-600" />
              }
            </div>
            <h3 className="text-sm font-semibold text-gray-900">
              {channel === "llamada" ? "Contenido Llamada" : "Contenido SMS"}
            </h3>

            {/* Language dropdown */}
            <div className="relative">
              <button
                onClick={() => setLangDropdownOpen(!langDropdownOpen)}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-gray-200 hover:border-gray-300 text-xs transition-colors"
              >
                <Globe className="h-3 w-3 text-gray-500" />
                <span className="font-medium text-gray-700">{currentLanguage.toUpperCase()}</span>
                {isNewTranslation && (
                  <span className="text-[8px] bg-amber-100 text-amber-700 px-1 rounded font-medium">nueva</span>
                )}
                <ChevronDown className="h-2.5 w-2.5 text-gray-400" />
              </button>

              {langDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setLangDropdownOpen(false)} />
                  <div className="absolute top-full left-0 mt-1 w-44 bg-white rounded-xl shadow-lg border border-gray-200 py-1 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                    {existingLangs.map((lang) => (
                      <button
                        key={lang}
                        onClick={() => handleLanguageChange(lang)}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors ${
                          lang === currentLanguage ? "bg-brand-50 text-brand-700 font-medium" : "text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        <span className="text-[10px] font-bold w-5">{lang.toUpperCase()}</span>
                        <span>{getLangLabel(lang)}</span>
                      </button>
                    ))}
                    {availableLangs.length > 0 && (
                      <>
                        <div className="border-t border-gray-100 my-1" />
                        <div className="px-3 py-1">
                          <p className="text-[9px] text-gray-400 font-medium uppercase">Agregar idioma</p>
                        </div>
                        {availableLangs.map((opt) => (
                          <button
                            key={opt.code}
                            onClick={() => handleLanguageChange(opt.code)}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left text-gray-500 hover:bg-gray-50 transition-colors"
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
          </div>

          <button
            onClick={onClose}
            disabled={saving}
            className="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          <label className="block text-[10px] font-medium text-gray-500 uppercase mb-1.5">Mensaje</label>
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={body}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onKeyUp={() => checkAutocomplete()}
              onBlur={() => setTimeout(() => setAutocomplete(null), 150)}
              placeholder={channel === "llamada" ? "Escribe el mensaje de voz... Usa {{ para insertar variables" : "Escribe el mensaje SMS... Usa {{ para insertar variables"}
              rows={5}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200 resize-none"
            />

            {/* Autocomplete dropdown */}
            {autocomplete?.open && (() => {
              const filtered = getFilteredVariables();
              if (filtered.length === 0) return null;
              const textarea = textareaRef.current;
              if (!textarea) return null;

              const getCaretCoords = () => {
                const mirror = document.createElement("div");
                const style = window.getComputedStyle(textarea);
                const props = ["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "wordSpacing", "padding", "border", "boxSizing", "width"] as const;
                props.forEach((p) => { (mirror.style as any)[p] = style.getPropertyValue(p.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)); });
                mirror.style.position = "absolute";
                mirror.style.top = "-9999px";
                mirror.style.left = "-9999px";
                mirror.style.visibility = "hidden";
                mirror.style.whiteSpace = "pre-wrap";
                mirror.style.overflowWrap = "break-word";

                const textBefore = body.slice(0, textarea.selectionStart ?? 0);
                mirror.textContent = textBefore;
                const span = document.createElement("span");
                span.textContent = "|";
                mirror.appendChild(span);
                document.body.appendChild(mirror);

                const spanRect = span.getBoundingClientRect();
                const mirrorRect = mirror.getBoundingClientRect();
                const relTop = spanRect.top - mirrorRect.top;
                const relLeft = spanRect.left - mirrorRect.left;
                document.body.removeChild(mirror);

                const textareaRect = textarea.getBoundingClientRect();
                return {
                  top: textareaRect.top + relTop - textarea.scrollTop + spanRect.height + 4,
                  left: textareaRect.left + relLeft,
                };
              };

              const pos = getCaretCoords();
              return createPortal(
                <div
                  className="fixed z-[9999] bg-white rounded-lg shadow-xl border border-gray-200 w-[220px] max-h-[180px] overflow-y-auto py-1"
                  style={{ top: pos.top, left: Math.min(pos.left, window.innerWidth - 230) }}
                >
                  {filtered.map((v, i) => (
                    <button
                      key={v.field}
                      onMouseDown={(e) => { e.preventDefault(); selectVariable(v); }}
                      className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center gap-2 ${
                        i === autocompleteIndex ? "bg-brand-50 text-brand-700" : "text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      <Braces className="h-3 w-3 text-gray-400 shrink-0" />
                      <span className="truncate flex-1">{v.label}</span>
                      <span className="text-[9px] text-gray-400">{v.field}</span>
                    </button>
                  ))}
                </div>,
                document.body
              );
            })()}
          </div>

          {/* Char counter */}
          <div className="flex items-center justify-between mt-2">
            <p className="text-[10px] text-gray-400">
              Usa <code className="bg-gray-100 px-1 rounded">{"{{variable}}"}</code> para personalizar
            </p>
            <p className={`text-[10px] font-medium ${rawLength > 160 && channel === "sms" ? "text-amber-600" : "text-gray-400"}`}>
              {rawLength} chars{channel === "sms" ? ` · ${smsCount} SMS` : ""}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !body.trim()}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
