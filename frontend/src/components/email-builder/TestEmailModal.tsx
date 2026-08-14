import { useState } from "react";
import { X, Send, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useParams } from "react-router-dom";
import { api } from "@/services/api";
import { useContactVariables } from "./properties/RichTextEditor";

interface Props {
  open: boolean;
  onClose: () => void;
  subject: string;
  html: string;
}

export function TestEmailModal({ open, onClose, subject, html }: Props) {
  const { inboxId } = useParams();
  const variables = useContactVariables();
  const [to, setTo] = useState("");
  const [fromName, setFromName] = useState("");
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; error?: string } | null>(null);

  if (!open) return null;

  const handleSend = async () => {
    if (!to.trim() || !inboxId) return;
    setSending(true);
    setResult(null);
    try {
      const { data } = await api.post(`/chats/inboxes/${inboxId}/email/test`, {
        to: to.trim(),
        subject,
        html,
        variables: variableValues,
        fromName: fromName.trim() || undefined,
      });
      setResult(data);
    } catch (err: any) {
      setResult({ success: false, error: err?.response?.data?.message || "Error al enviar" });
    } finally {
      setSending(false);
    }
  };

  // Get variables used in the template
  const usedVariables = variables.filter((v) => {
    const pattern = `{{${v.field}}}`;
    return subject.includes(pattern) || html.includes(pattern);
  });

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-200 w-[440px] max-h-[80vh] overflow-hidden flex flex-col" style={{ animation: "slideIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)" }}>
        <style>{`@keyframes slideIn { from { opacity: 0; transform: scale(0.95) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }`}</style>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Enviar prueba</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">Envia un email de prueba con esta plantilla</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-5 py-4 space-y-4">
          {/* Email to */}
          <div>
            <label className="block text-[10px] font-medium text-gray-500 uppercase mb-1">Correo destinatario</label>
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="ejemplo@correo.com"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              autoFocus
            />
          </div>

          {/* From name */}
          <div>
            <label className="block text-[10px] font-medium text-gray-500 uppercase mb-1">Nombre del remitente</label>
            <input
              type="text"
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              placeholder="Nombre que vera el destinatario (opcional)"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {/* Variables */}
          {usedVariables.length > 0 && (
            <div>
              <label className="block text-[10px] font-medium text-gray-500 uppercase mb-2">Variables de prueba</label>
              <div className="space-y-2">
                {usedVariables.map((v) => (
                  <div key={v.field} className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-500 w-24 shrink-0 truncate">{v.label}</span>
                    <input
                      type="text"
                      value={variableValues[v.field] || ""}
                      onChange={(e) => setVariableValues({ ...variableValues, [v.field]: e.target.value })}
                      placeholder={`Valor de ${v.label}...`}
                      className="flex-1 px-2.5 py-1.5 rounded-md border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className={`flex items-center gap-2 px-3 py-2.5 rounded-lg ${result.success ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
              {result.success ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
              <span className="text-xs font-medium">
                {result.success ? "Email de prueba enviado correctamente" : (result.error || "Error al enviar")}
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
            Cerrar
          </button>
          <button
            onClick={handleSend}
            disabled={!to.trim() || sending}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-sm font-medium disabled:opacity-50 transition-colors"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? "Enviando..." : "Enviar prueba"}
          </button>
        </div>
      </div>
    </div>
  );
}
