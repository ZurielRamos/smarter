import { useState, useRef, useCallback, useEffect } from "react";
import { Mail, GripVertical, Eye, Code } from "lucide-react";
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

interface EmailEditorProps {
  subject: string;
  body: string;
  onSubjectChange: (value: string) => void;
  onBodyChange: (value: string) => void;
  onSave: () => void;
  saving?: boolean;
  variables?: Variable[];
  inboxId?: string | null;
}

export function EmailEditor({
  subject,
  body,
  onSubjectChange,
  onBodyChange,
  onSave,
  saving,
  variables,
  inboxId,
}: EmailEditorProps) {
  const AVAILABLE_VARIABLES = variables || DEFAULT_VARIABLES;
  const [viewMode, setViewMode] = useState<"edit" | "preview">("edit");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; subject: string; html?: string; body?: string }>>([]);
  const [showTemplates, setShowTemplates] = useState(false);

  // Load templates from inbox metadata
  useEffect(() => {
    if (!inboxId) return;
    import("@/services/api").then(({ api }) => {
      api.get(`/chats/inboxes/${inboxId}`).then(({ data }) => {
        setTemplates(data.metadata?.emailTemplates || []);
      }).catch(() => {});
    });
  }, [inboxId]);

  const insertVariable = (field: string) => {
    const tag = `{{${field}}}`;
    const textarea = textareaRef.current;
    if (!textarea) {
      onBodyChange(body + tag);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newValue = body.substring(0, start) + tag + body.substring(end);
    onBodyChange(newValue);

    // Restore cursor position after the inserted tag
    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + tag.length;
    }, 0);
  };

  const getPreview = (text: string) => {
    let preview = text;
    const samples: Record<string, string> = {
      firstName: "Juan",
      lastName: "Pérez",
      fullName: "Juan Pérez",
      phone: "+573001234567",
      email: "juan@email.com",
      documentNumber: "1234567890",
      city: "Bogotá",
      region: "Cundinamarca",
      status: "activo",
      channelSource: "whatsapp",
      score: "85",
    };
    for (const [field, sample] of Object.entries(samples)) {
      preview = preview.replaceAll(`{{${field}}}`, sample);
    }
    return preview;
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-orange-600" />
          <h2 className="text-base font-semibold text-gray-900">Contenido del Email</h2>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode("edit")}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
              viewMode === "edit" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            )}
          >
            <Code className="h-3 w-3" /> Editar
          </button>
          <button
            onClick={() => setViewMode("preview")}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
              viewMode === "preview" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            )}
          >
            <Eye className="h-3 w-3" /> Vista previa
          </button>
        </div>
      </div>

      {/* Template selector */}
      {templates.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-medium text-gray-600">Usar plantilla</label>
            <button
              onClick={() => setShowTemplates(!showTemplates)}
              className="text-[10px] text-brand-600 hover:text-brand-700 font-medium"
            >
              {showTemplates ? "Ocultar" : `Ver plantillas (${templates.length})`}
            </button>
          </div>
          {showTemplates && (
            <div className="grid grid-cols-2 gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
              {templates.map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => {
                    onSubjectChange(tpl.subject);
                    onBodyChange(tpl.html || tpl.body || "");
                    setShowTemplates(false);
                  }}
                  className="text-left px-3 py-2 rounded-lg border border-gray-200 bg-white hover:border-orange-300 hover:bg-orange-50/50 transition-colors"
                >
                  <p className="text-xs font-medium text-gray-800 truncate">{tpl.name}</p>
                  <p className="text-[10px] text-gray-400 truncate mt-0.5">{tpl.subject}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Subject */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-gray-600 mb-1">Asunto</label>
        <input
          type="text"
          value={subject}
          onChange={(e) => onSubjectChange(e.target.value)}
          placeholder="Ej: Hola {{firstName}}, tenemos una oferta para ti"
          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
        <p className="text-[10px] text-gray-400 mt-1">Puedes usar variables como {"{{firstName}}"} en el asunto</p>
      </div>

      <div className="flex gap-4">
        {/* Variables panel */}
        <div className="w-[160px] shrink-0">
          <p className="text-xs font-medium text-gray-500 mb-2">Variables</p>
          <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
            {AVAILABLE_VARIABLES.map((v) => (
              <button
                key={v.field}
                onClick={() => insertVariable(v.field)}
                className="w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border bg-white border-gray-200 hover:border-orange-400 hover:bg-orange-50 text-xs font-medium text-gray-700 transition-colors text-left"
              >
                <GripVertical className="h-3 w-3 text-gray-400 shrink-0" />
                <span className="truncate">{v.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Editor / Preview */}
        <div className="flex-1 min-w-0">
          {viewMode === "edit" ? (
            <textarea
              ref={textareaRef}
              value={body}
              onChange={(e) => onBodyChange(e.target.value)}
              placeholder={"<h1>Hola {{firstName}}</h1>\n<p>Te invitamos a descubrir nuestras novedades...</p>"}
              className="w-full min-h-[250px] px-4 py-3 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-400 resize-y"
            />
          ) : (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                <p className="text-xs text-gray-500">
                  <strong>Asunto:</strong> {getPreview(subject) || "(sin asunto)"}
                </p>
              </div>
              <div
                className="p-4 min-h-[220px] text-sm"
                dangerouslySetInnerHTML={{ __html: getPreview(body) || '<p class="text-gray-400">Sin contenido</p>' }}
              />
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-gray-400">
              Soporta HTML · Las variables se reemplazan al enviar
            </span>
            <button
              type="button"
              onClick={onSave}
              disabled={saving || !subject.trim() || !body.trim()}
              className="px-3 py-1.5 rounded-md text-xs font-medium bg-brand-800 text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? "Guardando..." : "Guardar email"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
