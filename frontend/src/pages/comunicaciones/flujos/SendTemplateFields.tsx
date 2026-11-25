import { useContext, useEffect, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getTemplateFields } from "@/lib/templateFields";
import { FlowSelect } from "./FlowSelect";
import { VariableInput } from "./VariableField";
import { FlowEditorContext } from "./editorContext";
import { flowsApi, type FlowAction, type FlowTemplateRecipients } from "./types";
import { sendTemplateIssue } from "./sendTemplate";

const inputClass =
  "w-full px-3 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200";
const labelClass = "block text-[11px] font-medium text-muted-foreground mb-1";

interface WhatsAppTemplate {
  name: string;
  language: string;
  status: string;
  category: string;
  components: any[];
}
interface ContactLite {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
}
const contactName = (c: ContactLite) => [c.firstName, c.lastName].filter(Boolean).join(" ") || c.phone || c.email || "Sin nombre";

const MODES: Array<{ value: FlowTemplateRecipients["mode"]; label: string }> = [
  { value: "current", label: "Este contacto" },
  { value: "contacts", label: "Contactos" },
  { value: "list", label: "Una lista" },
];

/** Plantillas aprobadas del canal elegido. */
function useTemplates(inboxId: string | undefined) {
  const [state, setState] = useState<{ list: WhatsAppTemplate[] | null; error: boolean }>({ list: null, error: false });
  useEffect(() => {
    if (!inboxId) {
      setState({ list: null, error: false });
      return;
    }
    let alive = true;
    setState({ list: null, error: false });
    flowsApi
      .get<WhatsAppTemplate[]>("/chats/whatsapp/templates", { params: { inboxId } })
      .then(({ data }) => alive && setState({ list: (Array.isArray(data) ? data : []).filter((t) => t.status === "APPROVED"), error: false }))
      .catch(() => alive && setState({ list: null, error: true }));
    return () => {
      alive = false;
    };
  }, [inboxId]);
  return state;
}

/** «Enviar plantilla»: canal, plantilla, valores de sus variables y a quién se envía. */
export function SendTemplateFields({
  action: a,
  tenantId,
  onChange,
}: {
  action: FlowAction;
  tenantId?: string;
  onChange: (patch: Partial<FlowAction>) => void;
}) {
  const { inboxes } = useContext(FlowEditorContext);
  const whatsapp = inboxes.filter((i) => i.channel === "whatsapp");
  const { list: templates, error } = useTemplates(a.inboxId || undefined);
  const fields = getTemplateFields(a.templateComponents);
  const values = a.templateVariables ?? {};
  const recipients = a.recipients ?? { mode: "current" as const };
  const issue = sendTemplateIssue(a);
  const current = a.templateName ? `${a.templateName}::${a.templateLanguage || ""}` : "";
  const known = !!templates?.some((t) => `${t.name}::${t.language}` === current);

  return (
    <div className="space-y-2.5">
      <div>
        <label className={labelClass}>Enviar desde</label>
        <FlowSelect
          compact
          aria-label="Canal de WhatsApp"
          value={a.inboxId || ""}
          // Cambiar de canal cambia las plantillas disponibles.
          onChange={(v) =>
            onChange(
              v !== a.inboxId
                ? { inboxId: v, templateName: "", templateLanguage: "", templateCategory: undefined, templateComponents: undefined, templateVariables: {} }
                : {},
            )
          }
          placeholder={whatsapp.length ? "Selecciona un canal de WhatsApp…" : "La cuenta no tiene canales de WhatsApp"}
          options={whatsapp.map((i) => ({ value: i.id, label: i.name }))}
        />
      </div>

      {a.inboxId && (
        <div>
          <label className={labelClass}>Plantilla</label>
          {!templates && !error ? (
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Cargando plantillas…
            </p>
          ) : error ? (
            <p className="text-[11px] text-amber-700 dark:text-amber-300">No se pudieron cargar las plantillas del canal.</p>
          ) : (
            <FlowSelect
              compact
              searchable={templates!.length > 8}
              aria-label="Plantilla"
              value={current}
              onChange={(v) => {
                const [name, language] = v.split("::");
                const t = templates!.find((x) => x.name === name && x.language === language);
                // Al cambiar de plantilla se reinician sus variables.
                onChange({ templateName: name, templateLanguage: language, templateCategory: t?.category?.toLowerCase(), templateComponents: t?.components, templateVariables: {} });
              }}
              placeholder={templates!.length ? "Selecciona una plantilla…" : "El canal no tiene plantillas aprobadas"}
              options={[
                ...(current && !known ? [{ value: current, label: `${a.templateName} (ya no disponible)` }] : []),
                ...templates!.map((t) => ({ value: `${t.name}::${t.language}`, label: `${t.name} (${t.language})`, hint: t.category?.toLowerCase() })),
              ]}
            />
          )}
        </div>
      )}

      {a.templateName && fields.length > 0 && (
        <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-2">
          <p className="text-[10px] font-semibold uppercase text-muted-foreground">Variables de la plantilla</p>
          {fields.map((f) => (
            <div key={f.key}>
              <label className={labelClass}>{f.label}</label>
              <VariableInput
                aria-label={f.label}
                value={values[f.key] || ""}
                onChange={(v) => onChange({ templateVariables: { ...values, [f.key]: v } })}
                placeholder={f.kind === "media" ? "https://… (opcional)" : f.example ? `Ej.: ${f.example}` : "Valor"}
                className={inputClass}
              />
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground">
            Escribe {"{"} para usar una variable del flujo o un dato del contacto de esta conversación (el que escribe), sin importar quién reciba la plantilla.
          </p>
        </div>
      )}

      <div>
        <label className={labelClass}>Destinatarios</label>
        <div role="radiogroup" aria-label="Destinatarios" className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-0.5">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={recipients.mode === m.value}
              onClick={() => recipients.mode !== m.value && onChange({ recipients: { mode: m.value } })}
              className={cn(
                "rounded-md px-1.5 py-1.5 text-[11px] font-medium transition-colors",
                recipients.mode === m.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        {recipients.mode === "current" && <p className="mt-1 text-[11px] text-muted-foreground">El contacto que está en esta conversación.</p>}
        {recipients.mode === "contacts" && (
          <ContactsPicker tenantId={tenantId} ids={recipients.recordIds ?? []} onChange={(recordIds) => onChange({ recipients: { mode: "contacts", recordIds } })} />
        )}
        {recipients.mode === "list" && (
          <ListPicker tenantId={tenantId} listId={recipients.listId ?? ""} onChange={(listId) => onChange({ recipients: { mode: "list", listId } })} />
        )}
        {recipients.mode !== "current" && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            Se envía en segundo plano y el resultado queda en una nota de la conversación. Respeta el opt-in de WhatsApp de cada contacto y consume créditos por cada envío.
          </p>
        )}
      </div>

      {issue && <p className="text-[11px] text-amber-700 dark:text-amber-300">{issue}</p>}
    </div>
  );
}

function ListPicker({ tenantId, listId, onChange }: { tenantId?: string; listId: string; onChange: (id: string) => void }) {
  const [lists, setLists] = useState<Array<{ id: string; name: string; type: string }> | null>(null);
  useEffect(() => {
    if (!tenantId) return;
    flowsApi
      .get<Array<{ id: string; name: string; type: string }>>("/record-lists", { params: { tenantId } })
      .then(({ data }) => setLists(data))
      .catch(() => setLists([]));
  }, [tenantId]);
  return (
    <div className="mt-1.5">
      <FlowSelect
        compact
        searchable={(lists?.length ?? 0) > 8}
        aria-label="Lista de contactos"
        value={listId}
        onChange={onChange}
        placeholder={lists && !lists.length ? "La cuenta no tiene listas" : "Selecciona una lista…"}
        options={[
          ...(listId && lists && !lists.some((l) => l.id === listId) ? [{ value: listId, label: "(lista eliminada)" }] : []),
          ...(lists ?? []).map((l) => ({ value: l.id, label: l.name, hint: l.type === "dynamic" ? "dinámica" : "estática" })),
        ]}
      />
    </div>
  );
}

const MAX_CONTACTS = 25;

/** Búsqueda de contactos del CRM; los elegidos se muestran como fichas. */
function ContactsPicker({ tenantId, ids, onChange }: { tenantId?: string; ids: string[]; onChange: (ids: string[]) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ContactLite[]>([]);
  const [searching, setSearching] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({});
  const asked = useRef(new Set<string>());

  // Nombres de los ya elegidos (la acción solo guarda sus ids).
  useEffect(() => {
    for (const id of ids) {
      if (names[id] || asked.current.has(id)) continue;
      asked.current.add(id);
      flowsApi
        .get<ContactLite>(`/records/${id}`)
        .then(({ data }) => setNames((n) => ({ ...n, [id]: contactName(data) })))
        .catch(() => setNames((n) => ({ ...n, [id]: "(contacto no disponible)" })));
    }
  }, [ids, names]);

  useEffect(() => {
    const q = query.trim();
    if (!tenantId || q.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(() => {
      flowsApi
        .get<{ contacts: ContactLite[] }>("/records/search", { params: { tenantId, q, limit: 8 } })
        .then(({ data }) => setResults(data.contacts ?? []))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(t);
  }, [query, tenantId]);

  const add = (c: ContactLite) => {
    setNames((n) => ({ ...n, [c.id]: contactName(c) }));
    onChange([...ids, c.id]);
    setQuery("");
    setResults([]);
  };

  return (
    <div className="mt-1.5 space-y-1.5">
      {ids.length > 0 && (
        <ul className="flex flex-wrap gap-1">
          {ids.map((id) => (
            <li key={id} className="flex items-center gap-1 rounded-full bg-brand-50 py-0.5 pl-2 pr-1 text-[11px] text-brand-700 dark:bg-brand-700/30 dark:text-brand-200">
              <span className="max-w-[140px] truncate">{names[id] ?? "…"}</span>
              <button type="button" aria-label={`Quitar ${names[id] ?? "contacto"}`} onClick={() => onChange(ids.filter((x) => x !== id))} className="rounded-full p-0.5 hover:bg-brand-100 dark:hover:bg-brand-700/60">
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {ids.length < MAX_CONTACTS ? (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            aria-label="Buscar contacto"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre, teléfono o email…"
            className={cn(inputClass, "pl-8")}
          />
          {(searching || results.length > 0) && (
            <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-popover py-1 shadow-lg">
              {searching && results.length === 0 && <li className="px-3 py-1.5 text-[11px] text-muted-foreground">Buscando…</li>}
              {results
                .filter((c) => !ids.includes(c.id))
                .map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => add(c)} className="flex w-full flex-col px-3 py-1.5 text-left hover:bg-muted">
                      <span className="text-xs text-foreground">{contactName(c)}</span>
                      <span className="text-[10px] text-muted-foreground">{[c.phone, c.email].filter(Boolean).join(" · ")}</span>
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">Máximo {MAX_CONTACTS} contactos. Para más, usa una lista.</p>
      )}
    </div>
  );
}
