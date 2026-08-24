import { useState, useEffect, useRef } from "react";
import { X, Loader2, Bot, MessageCircle, List, Shuffle } from "lucide-react";

interface CreateBotModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: { name: string; description: string; type: string }) => void | Promise<void>;
  saving?: boolean;
}

const BOT_TYPES = [
  {
    value: "freeform",
    label: "Conversación libre",
    icon: <MessageCircle className="h-5 w-5" />,
    description: "IA responde naturalmente, recopila datos de forma oportunista. Ideal para soporte, ventas y atención general.",
  },
  {
    value: "sequential",
    label: "Flujo secuencial",
    icon: <List className="h-5 w-5" />,
    description: "Sigue un script paso a paso con validación. Ideal para formularios, encuestas y captación de leads.",
  },
  {
    value: "hybrid",
    label: "Híbrido",
    icon: <Shuffle className="h-5 w-5" />,
    description: "IA conversa libre con checkpoints obligatorios. Próximamente.",
    disabled: true,
  },
];

export function CreateBotModal({ open, onClose, onSave, saving = false }: CreateBotModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("freeform");
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
      setType("freeform");
      setTimeout(() => nameRef.current?.focus(), 100);
    }
  }, [open]);

  const handleSave = async () => {
    if (!name.trim() || saving) return;
    await onSave({ name: name.trim(), description: description.trim(), type });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && name.trim()) {
      e.preventDefault();
      handleSave();
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 animate-in fade-in duration-150"
        onClick={saving ? undefined : onClose}
      />

      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="h-7 w-7 rounded-lg bg-brand-50 flex items-center justify-center">
              <Bot className="h-3.5 w-3.5 text-brand-600" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900">Nuevo Bot</h3>
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
        <div className="px-5 py-4 space-y-4">
          {/* Bot Type */}
          <div>
            <label className="block text-[10px] font-medium text-gray-500 uppercase mb-2">
              Tipo de bot <span className="text-red-400">*</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {BOT_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => !t.disabled && setType(t.value)}
                  disabled={t.disabled || saving}
                  className={`flex flex-col items-center gap-2 p-3.5 rounded-xl border text-center transition-all ${
                    type === t.value
                      ? "border-brand-300 bg-brand-50 ring-1 ring-brand-200 shadow-sm"
                      : t.disabled
                      ? "border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed"
                      : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <div className={`${type === t.value ? "text-brand-600" : "text-gray-400"}`}>
                    {t.icon}
                  </div>
                  <span className={`text-[11px] font-semibold leading-tight ${type === t.value ? "text-brand-700" : "text-gray-700"}`}>
                    {t.label}
                  </span>
                  <span className="text-[9px] text-gray-400 leading-tight">{t.description}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-[10px] font-medium text-gray-500 uppercase mb-1.5">
              Nombre <span className="text-red-400">*</span>
            </label>
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ej: Bot de soporte, Bot ventas..."
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200"
              disabled={saving}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-[10px] font-medium text-gray-500 uppercase mb-1.5">
              Descripción
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe brevemente qué hará este bot..."
              rows={2}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200 resize-none"
              disabled={saving}
            />
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
            disabled={saving || !name.trim()}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            Crear bot
          </button>
        </div>
      </div>
    </div>
  );
}
