import { useEffect, useState, type KeyboardEvent } from "react";
import { X, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FlowTriggers, InboxOption } from "./types";
import { FLOW_CHANNELS } from "./editorContext";

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  messenger: "Messenger",
  instagram: "Instagram",
  chat: "Chat web",
  evolution: "WhatsApp (Evolution)",
};

interface TriggersModalProps {
  open: boolean;
  triggers: FlowTriggers;
  inboxes: InboxOption[];
  onClose: () => void;
  onSave: (t: FlowTriggers) => void;
}

export function TriggersModal({ open, triggers, inboxes, onClose, onSave }: TriggersModalProps) {
  const [draft, setDraft] = useState<FlowTriggers>(triggers);
  const [keywordInput, setKeywordInput] = useState("");

  useEffect(() => {
    if (open) {
      setDraft(triggers);
      setKeywordInput("");
    }
  }, [open, triggers]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const eligibleInboxes = inboxes.filter((i) => FLOW_CHANNELS.has(i.channel));

  const addKeyword = () => {
    const kw = keywordInput.trim();
    if (!kw) return;
    if (!draft.keywords.some((k) => k.toLowerCase() === kw.toLowerCase())) {
      setDraft({ ...draft, keywords: [...draft.keywords, kw] });
    }
    setKeywordInput("");
  };

  const onKeywordKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addKeyword();
    }
  };

  const toggleInbox = (id: string) =>
    setDraft({
      ...draft,
      inboxIds: draft.inboxIds.includes(id) ? draft.inboxIds.filter((x) => x !== id) : [...draft.inboxIds, id],
    });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="triggers-title">
      <div className="absolute inset-0 bg-black/40 animate-in fade-in duration-150" onClick={onClose} />
      <div className="relative bg-card text-card-foreground rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-brand-600 dark:text-brand-200" />
            <h3 id="triggers-title" className="text-sm font-semibold text-foreground">
              Disparadores del flujo
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <p className="text-xs text-muted-foreground">
            Los disparadores solo funcionan con el flujo <strong>activo</strong>. Un flujo sin disparadores puede iniciarse
            desde otro flujo con el nodo <strong>Iniciar flujo</strong>.
          </p>

          {/* Palabras clave */}
          <section>
            <label htmlFor="kw-input" className="block text-xs font-medium text-foreground mb-1">
              Palabras clave
            </label>
            <div className="flex flex-wrap gap-1.5 rounded-lg border border-border bg-background p-2 focus-within:border-brand-300 focus-within:ring-1 focus-within:ring-brand-200">
              {draft.keywords.map((k) => (
                <span key={k} className="inline-flex items-center gap-1 rounded-full bg-brand-50 dark:bg-brand-700/40 px-2 py-0.5 text-xs text-brand-700 dark:text-brand-100">
                  {k}
                  <button
                    type="button"
                    aria-label={`Quitar ${k}`}
                    onClick={() => setDraft({ ...draft, keywords: draft.keywords.filter((x) => x !== k) })}
                    className="hover:text-red-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <input
                id="kw-input"
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                onKeyDown={onKeywordKey}
                onBlur={addKeyword}
                placeholder={draft.keywords.length ? "" : "menu, hola, soporte…"}
                className="flex-1 min-w-[120px] bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Pulsa Enter para agregar. Una palabra clave reinicia el flujo aunque el contacto esté en otro.
            </p>
            <div className="mt-2 flex gap-3" role="radiogroup" aria-label="Tipo de coincidencia">
              {(["exact", "contains"] as const).map((m) => (
                <label key={m} className="flex items-center gap-1.5 text-xs text-foreground cursor-pointer">
                  <input
                    type="radio"
                    name="matchType"
                    checked={draft.matchType === m}
                    onChange={() => setDraft({ ...draft, matchType: m })}
                    className="accent-brand-600"
                  />
                  {m === "exact" ? "Mensaje exacto" : "El mensaje contiene la palabra"}
                </label>
              ))}
            </div>
          </section>

          {/* Conversación nueva */}
          <section>
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.onNewConversation}
                onChange={(e) => setDraft({ ...draft, onNewConversation: e.target.checked })}
                className="mt-0.5 accent-brand-600"
              />
              <span>
                <span className="block text-xs font-medium text-foreground">Iniciar con el primer mensaje de una conversación nueva</span>
                <span className="block text-[11px] text-muted-foreground">
                  Si la bandeja de WhatsApp tiene activa la plantilla de bienvenida, en ese primer mensaje se envía la
                  plantilla en lugar de este flujo.
                </span>
              </span>
            </label>
          </section>

          {/* Bandejas */}
          <section>
            <span className="block text-xs font-medium text-foreground mb-1">Bandejas</span>
            <p className="text-[11px] text-muted-foreground mb-2">Sin selección, aplica a todas las bandejas de mensajería.</p>
            {eligibleInboxes.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No hay bandejas de mensajería configuradas.</p>
            ) : (
              <div className="space-y-1">
                {eligibleInboxes.map((i) => {
                  const checked = draft.inboxIds.includes(i.id);
                  return (
                    <label
                      key={i.id}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs cursor-pointer transition-colors",
                        checked ? "border-brand-300 bg-brand-50 dark:bg-brand-700/30 dark:border-brand-600" : "border-border hover:bg-muted",
                      )}
                    >
                      <input type="checkbox" checked={checked} onChange={() => toggleInbox(i.id)} className="accent-brand-600" />
                      <span className="flex-1 text-foreground">{i.name}</span>
                      <span className="text-[10px] text-muted-foreground">{CHANNEL_LABELS[i.channel] || i.channel}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              const kw = keywordInput.trim();
              const keywords = kw && !draft.keywords.includes(kw) ? [...draft.keywords, kw] : draft.keywords;
              onSave({ ...draft, keywords });
            }}
            className="px-4 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-xs font-medium transition-colors"
          >
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );
}
