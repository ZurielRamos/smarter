import { useState, useRef, useCallback, useEffect } from "react";
import { Phone, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

interface Variable {
  field: string;
  label: string;
}

const DEFAULT_VARIABLES: Variable[] = [
  { field: "firstName", label: "Nombre" },
  { field: "lastName", label: "Apellido" },
  { field: "fullName", label: "Nombre completo" },
  { field: "phone", label: "Teléfono" },
  { field: "email", label: "Email" },
  { field: "documentType", label: "Tipo documento" },
  { field: "documentNumber", label: "Nº documento" },
  { field: "gender", label: "Género" },
  { field: "city", label: "Ciudad" },
  { field: "region", label: "Región" },
  { field: "status", label: "Estado" },
  { field: "channelSource", label: "Canal" },
  { field: "source", label: "Fuente" },
  { field: "score", label: "Score" },
];

const VOICES = [
  { value: "Mariana", label: "Mariana" },
  { value: "Penelope", label: "Penelope" },
  { value: "Conchita", label: "Conchita" },
  { value: "Mia", label: "Mia" },
  { value: "Lucia", label: "Lucia" },
  { value: "Enrique", label: "Enrique" },
  { value: "Miguel", label: "Miguel" },
];

interface CallEditorProps {
  message: string;
  voice: string;
  retries: string;
  leaveVoicemail: boolean;
  audioCode: string;
  onMessageChange: (value: string) => void;
  onVoiceChange: (value: string) => void;
  onRetriesChange: (value: string) => void;
  onLeaveVoicemailChange: (value: boolean) => void;
  onAudioCodeChange: (value: string) => void;
  onSave: () => void;
  saving?: boolean;
  variables?: Variable[];
}

export function CallEditor({
  message,
  voice,
  retries,
  leaveVoicemail,
  audioCode,
  onMessageChange,
  onVoiceChange,
  onRetriesChange,
  onLeaveVoicemailChange,
  onAudioCodeChange,
  onSave,
  saving,
  variables,
}: CallEditorProps) {
  const AVAILABLE_VARIABLES = variables || DEFAULT_VARIABLES;
  const editorRef = useRef<HTMLDivElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [useAudio, setUseAudio] = useState(!!audioCode);

  const handleInput = useCallback(() => {
    if (!editorRef.current) return;
    syncEditorToValue();
  }, []);

  const insertAtCaret = (tag: string) => {
    const editor = editorRef.current;
    if (!editor) return;

    editor.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      editor.innerText += tag;
      onMessageChange(editor.innerText);
      return;
    }

    const range = sel.getRangeAt(0);
    range.deleteContents();

    const span = document.createElement("span");
    span.className =
      "inline-block px-1.5 py-0.5 mx-0.5 rounded bg-brand-100 text-brand-700 text-xs font-medium select-all";
    span.contentEditable = "false";
    span.dataset.variable = tag;
    span.textContent = tag.replace("{{", "").replace("}}", "");

    range.insertNode(span);
    range.setStartAfter(span);
    range.setEndAfter(span);
    sel.removeAllRanges();
    sel.addRange(range);

    syncEditorToValue();
  };

  const syncEditorToValue = () => {
    const editor = editorRef.current;
    if (!editor) return;

    let result = "";
    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        result += node.textContent || "";
      } else if (node instanceof HTMLElement && node.dataset.variable) {
        result += node.dataset.variable;
      } else {
        node.childNodes.forEach(walk);
      }
    };
    walk(editor);
    onMessageChange(result);
  };

  const handleDragStart = (e: React.DragEvent, variable: Variable) => {
    e.dataTransfer.setData("text/plain", `{{${variable.field}}}`);
    e.dataTransfer.setData("application/variable", variable.field);
    setDragging(variable.field);
  };

  const handleDragEnd = () => {
    setDragging(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const variableField = e.dataTransfer.getData("application/variable");
    if (!variableField) return;

    const editor = editorRef.current;
    if (!editor) return;

    let range: Range | null = null;
    if (document.caretRangeFromPoint) {
      range = document.caretRangeFromPoint(e.clientX, e.clientY);
    }

    if (range) {
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }

    const tag = `{{${variableField}}}`;
    insertAtCaret(tag);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);

    if (document.caretRangeFromPoint) {
      const range = document.caretRangeFromPoint(e.clientX, e.clientY);
      if (range) {
        const sel = window.getSelection();
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
    }
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleVariableClick = (variable: Variable) => {
    insertAtCaret(`{{${variable.field}}}`);
  };

  const getPreview = () => {
    let preview = message;
    const samples: Record<string, string> = {
      firstName: "Juan",
      lastName: "Pérez",
      phone: "+573001234567",
      email: "juan@email.com",
      status: "activo",
      channelSource: "whatsapp",
    };
    for (const [field, sample] of Object.entries(samples)) {
      preview = preview.replaceAll(`{{${field}}}`, sample);
    }
    return preview;
  };

  const renderContent = () => {
    if (!message) return "";
    const parts = message.split(/(\{\{[^}]+\}\})/g);
    return parts
      .map((part) => {
        const match = part.match(/^\{\{(.+)\}\}$/);
        if (match) {
          const label =
            AVAILABLE_VARIABLES.find((v) => v.field === match[1])?.label || match[1];
          return `<span class="inline-block px-1.5 py-0.5 mx-0.5 rounded bg-brand-100 text-brand-700 text-xs font-medium" contenteditable="false" data-variable="${part}">${label}</span>`;
        }
        return part.replace(/</g, "&lt;").replace(/>/g, "&gt;");
      })
      .join("");
  };

  const initializedRef = useRef(false);
  useEffect(() => {
    if (initializedRef.current || !editorRef.current) return;
    initializedRef.current = true;
    if (message) {
      editorRef.current.innerHTML = renderContent();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const canSave = useAudio ? !!audioCode.trim() : !!message.trim();

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center gap-2 mb-4">
        <Phone className="h-5 w-5 text-brand-600" />
        <h2 className="text-base font-semibold text-gray-900">Configuración de Llamada</h2>
      </div>

      {/* Mode selector: Message or Audio */}
      <div className="flex gap-3 mb-5">
        <button
          onClick={() => { setUseAudio(false); onAudioCodeChange(""); }}
          className={cn(
            "px-4 py-2 rounded-lg text-sm font-medium border-2 transition-all",
            !useAudio
              ? "border-brand-500 bg-brand-50 text-brand-800"
              : "border-gray-200 text-gray-600 hover:border-gray-300"
          )}
        >
          Mensaje de texto a voz
        </button>
        <button
          onClick={() => { setUseAudio(true); onMessageChange(""); }}
          className={cn(
            "px-4 py-2 rounded-lg text-sm font-medium border-2 transition-all",
            useAudio
              ? "border-brand-500 bg-brand-50 text-brand-800"
              : "border-gray-200 text-gray-600 hover:border-gray-300"
          )}
        >
          Audio pregrabado
        </button>
      </div>

      {!useAudio ? (
        <>
          {/* Message editor with variables */}
          <div className="flex gap-4">
            <div className="w-[170px] shrink-0">
              <p className="text-xs font-medium text-gray-500 mb-2">Variables</p>
              <div className="space-y-1.5">
                {AVAILABLE_VARIABLES.map((v) => (
                  <div
                    key={v.field}
                    draggable
                    onDragStart={(e) => handleDragStart(e, v)}
                    onDragEnd={handleDragEnd}
                    onClick={() => handleVariableClick(v)}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-medium cursor-grab active:cursor-grabbing select-none transition-colors",
                      dragging === v.field
                        ? "opacity-50 border-brand-300 bg-brand-50"
                        : "bg-white border-gray-200 hover:border-brand-400 hover:bg-brand-50 text-gray-700"
                    )}
                  >
                    <GripVertical className="h-3 w-3 text-gray-400" />
                    <span>{v.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={handleInput}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={cn(
                  "w-full min-h-[120px] px-4 py-3 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 transition-colors whitespace-pre-wrap",
                  isDragOver ? "border-brand-400 bg-brand-50/50" : "border-gray-200"
                )}
              />

              {message && (
                <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-[10px] font-medium text-gray-400 uppercase mb-1">
                    Vista previa (lo que escuchará el cliente)
                  </p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{getPreview()}</p>
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        /* Audio code input */
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1.5">
            Código de Audio (Onurix)
          </label>
          <input
            type="text"
            value={audioCode}
            onChange={(e) => onAudioCodeChange(e.target.value)}
            placeholder="Ej: abc123def456"
            className="w-full max-w-md px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
          <p className="text-xs text-gray-400 mt-1.5">
            ID único del audio cargado en la plataforma de Onurix. No se puede usar junto con mensaje de texto a voz.
          </p>
        </div>
      )}

      {/* Retries and voicemail */}
      <div className="grid grid-cols-2 gap-4 mt-5">
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1.5">
            Reintentos
          </label>
          <select
            value={retries}
            onChange={(e) => onRetriesChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
            <option value="">Por defecto (1)</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
          </select>
          <p className="text-xs text-gray-400 mt-1">Número de intentos si no contestan (máx. 3)</p>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1.5">
            Buzón de voz
          </label>
          <button
            type="button"
            onClick={() => onLeaveVoicemailChange(!leaveVoicemail)}
            className={cn(
              "relative w-10 h-5 rounded-full transition-colors",
              leaveVoicemail ? "bg-accent-500" : "bg-gray-300"
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
                leaveVoicemail && "translate-x-5"
              )}
            />
          </button>
          <p className="text-xs text-gray-400 mt-1">
            {leaveVoicemail
              ? "Dejará mensaje en buzón si no contestan"
              : "No dejará mensaje en buzón"}
          </p>
        </div>
      </div>

      {/* Save button */}
      <div className="flex justify-end mt-5">
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !canSave}
          className="px-4 py-2 rounded-md text-sm font-medium bg-brand-800 text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? "Guardando..." : "Guardar configuración"}
        </button>
      </div>
    </div>
  );
}
