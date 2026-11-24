import { useEffect, useMemo, useState } from "react";
import { Loader2, Workflow, X } from "lucide-react";
import { toast } from "sonner";
import { chatApi } from "./api";

interface FlowOption {
  id: string;
  name: string;
  status: "draft" | "active" | "inactive";
  description?: string | null;
}

/** Plantilla aprobada de WhatsApp (GET /campaigns/whatsapp/templates). */
interface WaTemplate {
  name: string;
  language: string;
  components: { type: string; text?: string }[];
}

interface Props {
  open: boolean;
  tenantId: string;
  conversationId: string;
  inboxId: string;
  channel?: string;
  isWindowClosed: boolean;
  onClose: () => void;
  onStarted: () => void;
}

const inputClass =
  "w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200";

/** Número de variables {{n}} del cuerpo de una plantilla. */
function bodyParamCount(t: WaTemplate | undefined): number {
  const text = t?.components.find((c) => c.type === "BODY")?.text ?? "";
  const nums = [...text.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  return nums.length ? Math.max(...nums) : 0;
}

/**
 * Inicia un flujo conversacional en la conversación abierta. Con la ventana de
 * 24 h cerrada (WhatsApp) pide una plantilla: se envía y el flujo empieza
 * cuando el contacto responda.
 */
export function StartFlowModal({ open, tenantId, conversationId, inboxId, channel, isWindowClosed, onClose, onStarted }: Props) {
  const [flows, setFlows] = useState<FlowOption[] | null>(null);
  const [flowId, setFlowId] = useState("");
  const [query, setQuery] = useState("");
  const [templates, setTemplates] = useState<WaTemplate[] | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [params, setParams] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const needsTemplate = isWindowClosed && channel === "whatsapp";
  const blocked = isWindowClosed && channel !== "whatsapp";

  useEffect(() => {
    if (!open) return;
    setFlowId("");
    setQuery("");
    setTemplateName("");
    setParams([]);
    chatApi
      .get<FlowOption[]>("/conversation-flows", { params: { tenantId } })
      .then(({ data }) => setFlows(data.filter((f) => f.status === "active")))
      .catch(() => setFlows([]));
  }, [open, tenantId]);

  useEffect(() => {
    if (!open || !needsTemplate) return;
    chatApi
      .get<WaTemplate[]>("/campaigns/whatsapp/templates", { params: { inboxId } })
      .then(({ data }) => setTemplates(data))
      .catch(() => setTemplates([]));
  }, [open, needsTemplate, inboxId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !submitting && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, submitting, onClose]);

  const template = templates?.find((t) => t.name === templateName);
  const paramCount = bodyParamCount(template);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (flows ?? []).filter((f) => !q || f.name.toLowerCase().includes(q));
  }, [flows, query]);

  if (!open) return null;

  const canSubmit =
    !!flowId && !blocked && !submitting && (!needsTemplate || (!!template && params.slice(0, paramCount).every((p) => p.trim())));

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const { data } = await chatApi.post<{ status: "started" | "template_sent" }>(
        `/chats/conversations/${conversationId}/start-flow`,
        {
          flowId,
          template: needsTemplate && template ? { name: template.name, language: template.language, params: params.slice(0, paramCount) } : null,
        },
      );
      toast.success(
        data.status === "template_sent"
          ? "Plantilla enviada: el flujo empezará cuando el contacto responda"
          : "Flujo iniciado",
      );
      onStarted();
      onClose();
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg[0] : msg || "No se pudo iniciar el flujo");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="start-flow-title">
      <div className="absolute inset-0 bg-black/40" onClick={() => !submitting && onClose()} />
      <div className="relative bg-card text-card-foreground rounded-2xl shadow-xl w-full max-w-md mx-4 max-h-[85vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Workflow className="h-4 w-4 text-brand-600 dark:text-brand-200" />
            <h3 id="start-flow-title" className="text-sm font-semibold text-foreground">
              Iniciar flujo
            </h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="p-1 rounded-md hover:bg-muted text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {blocked ? (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              La ventana de 24 horas está cerrada y este canal no admite plantillas. Podrás iniciar un flujo cuando el
              contacto vuelva a escribir.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              El flujo empieza ahora en esta conversación, sin revisar sus disparadores ni reglas. Si el contacto está en otro
              flujo, se interrumpe.
            </p>
          )}

          <div>
            <label htmlFor="start-flow-search" className="block text-xs font-medium text-foreground mb-1">
              Flujo
            </label>
            <input
              id="start-flow-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar flujo…"
              className={inputClass}
            />
            <div className="mt-2 max-h-52 overflow-y-auto rounded-lg border border-border divide-y divide-border" role="listbox" aria-label="Flujos activos">
              {flows === null ? (
                <p className="p-3 text-xs text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando flujos…
                </p>
              ) : filtered.length === 0 ? (
                <p className="p-3 text-xs text-muted-foreground">
                  {flows.length ? "Sin resultados" : "No hay flujos activos. Activa uno en Comunicaciones → Flujos."}
                </p>
              ) : (
                filtered.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    role="option"
                    aria-selected={flowId === f.id}
                    onClick={() => setFlowId(f.id)}
                    className={`w-full text-left px-3 py-2 text-sm transition-colors ${flowId === f.id ? "bg-brand-50 text-brand-700 dark:bg-brand-700/40 dark:text-brand-100" : "text-foreground hover:bg-muted"}`}
                  >
                    {f.name}
                    {f.description && <span className="block text-[11px] text-muted-foreground truncate">{f.description}</span>}
                  </button>
                ))
              )}
            </div>
          </div>

          {needsTemplate && (
            <div className="space-y-2 rounded-lg border border-amber-300/60 bg-amber-50/60 dark:bg-amber-500/10 p-3">
              <p className="text-xs text-amber-800 dark:text-amber-200">
                La ventana de 24 horas está cerrada. Se enviará una plantilla y el flujo empezará cuando el contacto la
                responda (hasta 72 horas).
              </p>
              <label htmlFor="start-flow-tpl" className="block text-xs font-medium text-foreground">
                Plantilla
              </label>
              <select
                id="start-flow-tpl"
                value={templateName}
                onChange={(e) => {
                  setTemplateName(e.target.value);
                  setParams([]);
                }}
                className={inputClass}
                disabled={templates === null}
              >
                <option value="">{templates === null ? "Cargando plantillas…" : "Selecciona una plantilla…"}</option>
                {(templates ?? []).map((t) => (
                  <option key={`${t.name}-${t.language}`} value={t.name}>
                    {t.name} · {t.language}
                  </option>
                ))}
              </select>
              {template && (
                <p className="text-[11px] text-muted-foreground whitespace-pre-wrap">
                  {template.components.find((c) => c.type === "BODY")?.text}
                </p>
              )}
              {Array.from({ length: paramCount }, (_, i) => (
                <input
                  key={i}
                  aria-label={`Variable {{${i + 1}}}`}
                  value={params[i] ?? ""}
                  onChange={(e) => setParams((p) => Object.assign([...p], { [i]: e.target.value }))}
                  placeholder={`Valor de {{${i + 1}}}`}
                  className={inputClass}
                />
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="px-4 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 disabled:opacity-50 text-white text-xs font-medium transition-colors inline-flex items-center gap-1.5"
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {needsTemplate ? "Enviar plantilla e iniciar" : "Iniciar flujo"}
          </button>
        </div>
      </div>
    </div>
  );
}
