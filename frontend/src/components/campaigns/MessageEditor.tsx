import { useState, useRef, useCallback, useEffect } from "react";
import { MessageSquare, GripVertical } from "lucide-react";
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

interface MessageEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  saving?: boolean;
  variables?: Variable[];
}

export function MessageEditor({ value, onChange, onSave, saving, variables }: MessageEditorProps) {
  const AVAILABLE_VARIABLES = variables || DEFAULT_VARIABLES;
  const editorRef = useRef<HTMLDivElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);

  // Sync contenteditable -> value
  const handleInput = useCallback(() => {
    if (!editorRef.current) return;
    syncEditorToValue();
  }, []);

  // Insert variable at a specific position using Range
  const insertAtCaret = (tag: string) => {
    const editor = editorRef.current;
    if (!editor) return;

    editor.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      // No selection, append at end
      editor.innerText += tag;
      onChange(editor.innerText);
      return;
    }

    const range = sel.getRangeAt(0);
    range.deleteContents();

    const span = document.createElement("span");
    span.className = "inline-block px-1.5 py-0.5 mx-0.5 rounded bg-brand-100 text-brand-700 text-xs font-medium select-all";
    span.contentEditable = "false";
    span.dataset.variable = tag;
    span.textContent = tag.replace("{{", "").replace("}}", "");
    
    range.insertNode(span);

    // Move cursor after the inserted node
    range.setStartAfter(span);
    range.setEndAfter(span);
    sel.removeAllRanges();
    sel.addRange(range);

    syncEditorToValue();
  };

  // Read the contenteditable and extract text with variable tags
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
    onChange(result);
  };

  // Handle native drag start from variable chips
  const handleDragStart = (e: React.DragEvent, variable: Variable) => {
    e.dataTransfer.setData("text/plain", `{{${variable.field}}}`);
    e.dataTransfer.setData("application/variable", variable.field);
    setDragging(variable.field);
  };

  const handleDragEnd = () => {
    setDragging(null);
  };

  // Handle drop on the editor
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const variableField = e.dataTransfer.getData("application/variable");
    if (!variableField) return;

    const editor = editorRef.current;
    if (!editor) return;

    // Get caret position from drop coordinates
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

    // Move caret to mouse position for visual feedback
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

  // Click on variable chip to insert
  const handleVariableClick = (variable: Variable) => {
    insertAtCaret(`{{${variable.field}}}`);
  };

  // Preview
  const getPreview = () => {
    let preview = value;
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

  const charCount = value.length;
  const smsCount = Math.ceil(charCount / 160) || 1;

  // Render value as HTML with variable chips
  const renderContent = () => {
    if (!value) return "";
    const parts = value.split(/(\{\{[^}]+\}\})/g);
    return parts
      .map((part) => {
        const match = part.match(/^\{\{(.+)\}\}$/);
        if (match) {
          const label = AVAILABLE_VARIABLES.find((v) => v.field === match[1])?.label || match[1];
          return `<span class="inline-block px-1.5 py-0.5 mx-0.5 rounded bg-brand-100 text-brand-700 text-xs font-medium" contenteditable="false" data-variable="${part}">${label}</span>`;
        }
        return part.replace(/</g, "&lt;").replace(/>/g, "&gt;");
      })
      .join("");
  };

  // Set initial content only once on mount
  const initializedRef = useRef(false);
  useEffect(() => {
    if (initializedRef.current || !editorRef.current) return;
    initializedRef.current = true;
    if (value) {
      editorRef.current.innerHTML = renderContent();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare className="h-5 w-5 text-brand-600" />
        <h2 className="text-base font-semibold text-gray-900">Mensaje SMS</h2>
      </div>

      <div className="flex gap-4">
        {/* Variables panel */}
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

        {/* Editor */}
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
              "w-full min-h-[140px] px-4 py-3 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 transition-colors whitespace-pre-wrap",
              isDragOver ? "border-brand-400 bg-brand-50/50" : "border-gray-200"
            )}
          />

          {/* Stats */}
          <div className="flex items-center justify-between mt-3 text-xs text-gray-400">
            <span>{charCount} caracteres · {smsCount} SMS</span>
            <button
              type="button"
              onClick={onSave}
              disabled={saving || !value.trim()}
              className="px-3 py-1.5 rounded-md text-xs font-medium bg-brand-800 text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? "Guardando..." : "Guardar mensaje"}
            </button>
          </div>

          {/* Preview */}
          {value && (
            <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-[10px] font-medium text-gray-400 uppercase mb-1">Vista previa</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{getPreview()}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
