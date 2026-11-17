import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { Copy, ExternalLink, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  reclutamientoApi,
  type InvitationChannel,
  type PortalConfig as PortalConfigType,
  type PortalFieldDef,
  type VerificationChannel,
  type WhatsappInbox,
  type WhatsappTemplate,
} from "@/services/reclutamiento";
import { Field, Spinner, inputClass, primaryButton, secondaryButton } from "./shared";
import { useTenantId } from "./useTenantId";

const VARIABLE_LABELS: Record<string, string> = { nombre: "Nombre", empresa: "Nombre de la empresa", enlace: "Enlace al portal" };

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-background p-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {description && <p className="mb-3 mt-0.5 text-xs text-muted-foreground">{description}</p>}
      <div className={description ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

/** Número de WhatsApp y plantilla aprobada de Meta con la que se envía el mensaje. */
function WhatsappPicker({
  tenantId,
  value,
  onChange,
  variables,
  onVariablesChange,
  helpBody,
}: {
  tenantId: string;
  value: { inboxId: string | null; templateName: string; language: string };
  onChange: (v: { inboxId: string | null; templateName: string; language: string }) => void;
  /** Solo en la invitación: qué dato va en cada variable de la plantilla. */
  variables?: string[];
  onVariablesChange?: (v: string[]) => void;
  helpBody: string;
}) {
  const [inboxes, setInboxes] = useState<WhatsappInbox[] | null>(null);
  const [templates, setTemplates] = useState<WhatsappTemplate[]>([]);
  const [loadingTpl, setLoadingTpl] = useState(false);

  useEffect(() => {
    reclutamientoApi.whatsappInboxes(tenantId).then(setInboxes).catch(() => setInboxes([]));
  }, [tenantId]);

  useEffect(() => {
    if (!value.inboxId) {
      setTemplates([]);
      return;
    }
    setLoadingTpl(true);
    reclutamientoApi
      .whatsappTemplates(tenantId, value.inboxId)
      .then(setTemplates)
      .catch(() => setTemplates([]))
      .finally(() => setLoadingTpl(false));
  }, [tenantId, value.inboxId]);

  const tpl = templates.find((t) => t.name === value.templateName && t.language === value.language) ?? templates.find((t) => t.name === value.templateName);

  if (inboxes && inboxes.length === 0) {
    return <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-500/15 dark:text-amber-100">Esta cuenta no tiene un número de WhatsApp conectado. Conéctalo en Comunicaciones para usar este canal.</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">{helpBody}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Número de WhatsApp">
          <select
            value={value.inboxId ?? ""}
            onChange={(e) => onChange({ inboxId: e.target.value || null, templateName: "", language: "es" })}
            className={inputClass}
          >
            <option value="">Elegir…</option>
            {(inboxes ?? []).map((i) => (
              <option key={i.id} value={i.id}>{i.name}{i.connected ? "" : " (desconectado)"}</option>
            ))}
          </select>
        </Field>
        <Field label="Plantilla aprobada">
          <select
            value={tpl ? `${tpl.name}|${tpl.language}` : ""}
            disabled={!value.inboxId || loadingTpl}
            onChange={(e) => {
              const [name, language] = e.target.value.split("|");
              onChange({ ...value, templateName: name ?? "", language: language ?? "es" });
              if (onVariablesChange) {
                const t = templates.find((x) => x.name === name && x.language === language);
                if (t) onVariablesChange(Array.from({ length: t.variableCount }, (_, i) => variables?.[i] ?? ["nombre", "enlace", "empresa"][i] ?? "nombre"));
              }
            }}
            className={inputClass}
          >
            <option value="">{loadingTpl ? "Cargando…" : "Elegir…"}</option>
            {templates.map((t) => (
              <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>{t.name} · {t.language} · {t.category}</option>
            ))}
          </select>
        </Field>
      </div>
      {tpl && <p className="whitespace-pre-wrap rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">{tpl.bodyText}</p>}
      {variables && onVariablesChange && tpl && tpl.variableCount > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: tpl.variableCount }, (_, i) => (
            <Field key={i} label={`Variable {{${i + 1}}}`}>
              <select
                value={variables[i] ?? "nombre"}
                onChange={(e) => onVariablesChange(Array.from({ length: tpl.variableCount }, (_, j) => (j === i ? e.target.value : variables[j] ?? "nombre")))}
                className={inputClass}
              >
                {Object.entries(VARIABLE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Field>
          ))}
        </div>
      )}
    </div>
  );
}

/** Configuración del portal del encuestador: canales de invitación y de verificación, datos y documentos que se piden. */
export function PortalConfig() {
  const { slug } = useParams();
  const tenantId = useTenantId();
  const [cfg, setCfg] = useState<PortalConfigType | null>(null);
  const [catalog, setCatalog] = useState<PortalFieldDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    if (!tenantId) return;
    reclutamientoApi
      .portalConfig(tenantId)
      .then((r) => {
        setCfg(r.config);
        setCatalog(r.fields);
      })
      .catch(() => toast.error("No se pudo cargar la configuración"))
      .finally(() => setLoading(false));
  }, [tenantId]);
  useEffect(load, [load]);

  const edit = (fn: (c: PortalConfigType) => PortalConfigType) => {
    setCfg((c) => (c ? fn(c) : c));
    setDirty(true);
    setError("");
  };

  const save = async () => {
    if (!cfg) return;
    setSaving(true);
    setError("");
    try {
      const saved = await reclutamientoApi.savePortalConfig(tenantId, cfg);
      setCfg(saved);
      setDirty(false);
      toast.success("Configuración guardada");
    } catch (err) {
      const m = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
      setError(typeof m === "string" ? m : "No se pudo guardar la configuración");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !cfg) return <div className="flex-1"><Spinner /></div>;

  const portalUrl = `${window.location.origin}/encuestador/${slug}`;
  const useWhatsappInvitation = cfg.invitation.channel === "whatsapp" || cfg.invitation.channel === "both";
  const useEmailInvitation = cfg.invitation.channel === "email" || cfg.invitation.channel === "both";
  const useWhatsappCode = cfg.verification.channel === "phone" || cfg.verification.channel === "both";
  const useEmailCode = cfg.verification.channel === "email" || cfg.verification.channel === "both";

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Portal del encuestador</h2>
          <p className="text-xs text-muted-foreground">Los encuestadores invitados completan sus datos, suben sus documentos y firman sus contratos.</p>
        </div>
        <button type="button" onClick={save} disabled={!dirty || saving} className={`${primaryButton} ml-auto`}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Guardar
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <div className="mx-auto max-w-3xl space-y-4">
          {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:bg-rose-500/15 dark:text-rose-200">{error}</p>}

          <Section title="Dirección del portal" description="Es la misma para todos tus encuestadores. Cada invitación lleva además un enlace personal.">
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-muted px-3 py-2 text-xs text-foreground">{portalUrl}</code>
              <button type="button" aria-label="Copiar dirección" className={secondaryButton} onClick={() => navigator.clipboard.writeText(portalUrl).then(() => toast.success("Dirección copiada"))}>
                <Copy className="h-3.5 w-3.5" />
              </button>
              <a href={portalUrl} target="_blank" rel="noreferrer" aria-label="Abrir el portal" className={secondaryButton}>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </Section>

          <Section title="Invitación" description="Cómo le llega al encuestador el enlace para entrar al portal.">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Canal de la invitación">
                <select value={cfg.invitation.channel} onChange={(e) => edit((c) => ({ ...c, invitation: { ...c.invitation, channel: e.target.value as InvitationChannel } }))} className={inputClass}>
                  <option value="email">Correo electrónico</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="both">Correo y WhatsApp</option>
                  <option value="manual">Solo copiar el enlace (yo lo envío)</option>
                </select>
              </Field>
              <Field label="Vigencia del enlace (días)">
                <input type="number" min={1} max={60} value={cfg.invitation.expiresDays} onChange={(e) => edit((c) => ({ ...c, invitation: { ...c.invitation, expiresDays: Number(e.target.value) } }))} className={inputClass} />
              </Field>
            </div>
            {useEmailInvitation && (
              <div className="mt-3 space-y-3">
                <Field label="Asunto del correo" hint="Puedes usar {{nombre}}, {{empresa}} y {{dias}}.">
                  <input value={cfg.invitation.email.subject} maxLength={200} onChange={(e) => edit((c) => ({ ...c, invitation: { ...c.invitation, email: { ...c.invitation.email, subject: e.target.value } } }))} className={inputClass} />
                </Field>
                <Field label="Mensaje del correo" hint="Debe incluir {{enlace}}. También {{nombre}}, {{empresa}} y {{dias}}.">
                  <textarea rows={6} value={cfg.invitation.email.body} maxLength={3000} onChange={(e) => edit((c) => ({ ...c, invitation: { ...c.invitation, email: { ...c.invitation.email, body: e.target.value } } }))} className={inputClass} />
                </Field>
              </div>
            )}
            {useWhatsappInvitation && (
              <div className="mt-3">
                <WhatsappPicker
                  tenantId={tenantId}
                  value={cfg.invitation.whatsapp}
                  onChange={(w) => edit((c) => ({ ...c, invitation: { ...c.invitation, whatsapp: { ...c.invitation.whatsapp, ...w } } }))}
                  variables={cfg.invitation.whatsapp.variables}
                  onVariablesChange={(v) => edit((c) => ({ ...c, invitation: { ...c.invitation, whatsapp: { ...c.invitation.whatsapp, variables: v } } }))}
                  helpBody="WhatsApp solo permite iniciar una conversación con una plantilla aprobada por Meta. Elige la plantilla y qué dato va en cada variable; el enlace debe ir en una de ellas."
                />
              </div>
            )}
          </Section>

          <Section title="Verificación de identidad" description="El encuestador recibe un código de un solo uso para entrar al portal y para firmar cada contrato. Vence en 10 minutos.">
            <Field label="Canal del código">
              <select value={cfg.verification.channel} onChange={(e) => edit((c) => ({ ...c, verification: { ...c.verification, channel: e.target.value as VerificationChannel } }))} className={inputClass}>
                <option value="email">Correo electrónico</option>
                <option value="phone">WhatsApp</option>
                <option value="both">El encuestador elige: correo o WhatsApp</option>
              </select>
            </Field>
            {useEmailCode && (
              <div className="mt-3 space-y-3">
                <Field label="Asunto del correo con el código" hint="Puedes usar {{empresa}}.">
                  <input value={cfg.verification.email.subject} maxLength={200} onChange={(e) => edit((c) => ({ ...c, verification: { ...c.verification, email: { ...c.verification.email, subject: e.target.value } } }))} className={inputClass} />
                </Field>
                <Field label="Mensaje" hint="Debe incluir {{code}}. También {{empresa}}.">
                  <textarea rows={5} value={cfg.verification.email.body} maxLength={3000} onChange={(e) => edit((c) => ({ ...c, verification: { ...c.verification, email: { ...c.verification.email, body: e.target.value } } }))} className={inputClass} />
                </Field>
              </div>
            )}
            {useWhatsappCode && (
              <div className="mt-3">
                <WhatsappPicker
                  tenantId={tenantId}
                  value={cfg.verification.whatsapp}
                  onChange={(w) => edit((c) => ({ ...c, verification: { ...c.verification, whatsapp: { ...c.verification.whatsapp, ...w } } }))}
                  helpBody="Usa una plantilla de autenticación aprobada por Meta: el código se envía en su primera variable."
                />
              </div>
            )}
          </Section>

          <Section title="Datos que se piden" description="Lo que el encuestador revisa o completa en su ficha. Son los mismos datos que usan tus contratos. El correo y el teléfono no se editan desde el portal.">
            <ul className="divide-y divide-border rounded-lg border border-border">
              {catalog.map((f) => {
                const item = cfg.fields.find((x) => x.key === f.key);
                return (
                  <li key={f.key} className="flex items-center gap-3 px-3 py-2">
                    <label className="flex min-w-0 flex-1 items-center gap-2 text-xs text-foreground">
                      <input
                        type="checkbox"
                        checked={!!item}
                        onChange={(e) => edit((c) => ({ ...c, fields: e.target.checked ? [...c.fields, { key: f.key, required: false }] : c.fields.filter((x) => x.key !== f.key) }))}
                      />
                      <span className="truncate">{f.label}</span>
                      {f.source === "custom" && <span className="rounded bg-muted px-1.5 text-[10px] text-muted-foreground">Campo del CRM</span>}
                    </label>
                    <label className={`flex items-center gap-1.5 text-xs ${item ? "text-foreground" : "text-muted-foreground/50"}`}>
                      <input
                        type="checkbox"
                        disabled={!item}
                        checked={!!item?.required}
                        onChange={(e) => edit((c) => ({ ...c, fields: c.fields.map((x) => (x.key === f.key ? { ...x, required: e.target.checked } : x)) }))}
                      />
                      Obligatorio
                    </label>
                  </li>
                );
              })}
            </ul>
          </Section>

          <Section title="Documentos que se piden" description="Cédula, certificado bancario, RUT… Se guardan cifrados y solo los ve tu equipo.">
            <ul className="space-y-2">
              {cfg.documents.map((d, i) => (
                <li key={d.key} className="rounded-lg border border-border p-3">
                  <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                    <Field label="Nombre del documento">
                      <input value={d.label} maxLength={100} onChange={(e) => edit((c) => ({ ...c, documents: c.documents.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) }))} className={inputClass} />
                    </Field>
                    <div className="flex items-end gap-3 pb-1.5">
                      <label className="flex items-center gap-1.5 text-xs text-foreground">
                        <input type="checkbox" checked={d.required} onChange={(e) => edit((c) => ({ ...c, documents: c.documents.map((x, j) => (j === i ? { ...x, required: e.target.checked } : x)) }))} />
                        Obligatorio
                      </label>
                      <button type="button" aria-label={`Quitar ${d.label || "documento"}`} onClick={() => edit((c) => ({ ...c, documents: c.documents.filter((_, j) => j !== i) }))} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-rose-500">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <Field label="Indicaciones para el encuestador (opcional)">
                    <input value={d.help} maxLength={300} onChange={(e) => edit((c) => ({ ...c, documents: c.documents.map((x, j) => (j === i ? { ...x, help: e.target.value } : x)) }))} className={inputClass} />
                  </Field>
                </li>
              ))}
            </ul>
            <button
              type="button"
              disabled={cfg.documents.length >= 15}
              onClick={() =>
                edit((c) => {
                  let n = c.documents.length + 1;
                  while (c.documents.some((d) => d.key === `documento_${n}`)) n++;
                  return { ...c, documents: [...c.documents, { key: `documento_${n}`, label: "", required: false, help: "" }] };
                })
              }
              className={`${secondaryButton} mt-3`}
            >
              <Plus className="h-3.5 w-3.5" /> Agregar documento
            </button>
            <p className="mt-2 text-[11px] text-muted-foreground">Formatos admitidos: PDF, JPG, PNG y WebP, hasta 8 MB.</p>
          </Section>

          <Section title="Sesión y bienvenida">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Duración de la sesión (horas)" hint="Después debe verificarse de nuevo.">
                <input type="number" min={1} max={168} value={cfg.sessionHours} onChange={(e) => edit((c) => ({ ...c, sessionHours: Number(e.target.value) }))} className={inputClass} />
              </Field>
            </div>
            <div className="mt-3">
              <Field label="Mensaje de bienvenida (opcional)">
                <textarea rows={3} value={cfg.welcomeMessage} maxLength={1000} onChange={(e) => edit((c) => ({ ...c, welcomeMessage: e.target.value }))} className={inputClass} />
              </Field>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
