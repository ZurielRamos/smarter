import { useEffect, useMemo, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { reclutamientoApi, type FormLayout, type PersonalField, type PortalFieldDef, type ProjectVerification } from "@/services/reclutamiento";
import { FormLayoutEditor } from "./FormLayoutEditor";
import { Spinner, primaryButton } from "../shared";
import { QuestionBuilder } from "./QuestionBuilder";
import { draftIssues, toDraft, toPayload, type Draft } from "./questionDrafts";
import { WhatsappPicker } from "../PortalConfig";

const apiMessage = (err: unknown, fallback: string): string => {
  const m = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return typeof m === "string" ? m : fallback;
};

/** El nombre ya se pide siempre; no se ofrece como dato adicional. */
const NAME_KEYS = new Set(["nombre_completo", "nombre", "apellido"]);

/**
 * Formulario de registro del proyecto: los datos personales que se piden y se
 * guardan en el contacto, y las preguntas de selección propias del proyecto.
 */
export function ProjectFormEditor({ tenantId, projectId, readOnly }: { tenantId: string; projectId: string; readOnly: boolean }) {
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [saved, setSaved] = useState("");
  const [fields, setFields] = useState<PersonalField[]>([]);
  /** Nulo: el proyecto usa la verificación de la cuenta. */
  const [verification, setVerification] = useState<ProjectVerification | null>(null);
  const [accountVerification, setAccountVerification] = useState<ProjectVerification | null>(null);
  /** Pantallas del formulario. Nulo: automáticas. */
  const [layout, setLayout] = useState<FormLayout | null>(null);
  const [catalog, setCatalog] = useState<PortalFieldDef[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  /** Pregunta a abrir porque tiene algo por corregir. */
  const [focusKey, setFocusKey] = useState<string | null>(null);

  useEffect(() => {
    reclutamientoApi
      .projectFace(tenantId, projectId)
      .then((f) => {
        const list = f.form.questions.map(toDraft);
        setDrafts(list);
        setFields(f.form.fields ?? []);
        setVerification(f.form.verification ?? null);
        setLayout(f.form.layout ?? null);
        setSaved(JSON.stringify({ q: list.map(toPayload), f: f.form.fields ?? [], v: f.form.verification ?? null, l: f.form.layout ?? null }));
      })
      .catch(() => toast.error("No se pudo cargar el formulario"));
    reclutamientoApi
      .portalConfig(tenantId)
      .then((r) => {
        setCatalog(r.fields.filter((d) => !NAME_KEYS.has(d.key)));
        const ch = r.config.verification.channel;
        setAccountVerification({ channels: ch === "both" ? ["phone", "email"] : [ch], whatsapp: r.config.verification.whatsapp });
      })
      .catch(() => toast.error("No se pudieron cargar los datos personales disponibles"));
  }, [tenantId, projectId]);
  const payload = useMemo(() => JSON.stringify({ q: (drafts ?? []).map(toPayload), f: fields, v: verification, l: layout }), [drafts, fields, verification, layout]);
  const dirty = drafts !== null && payload !== saved;

  // Avisar antes de cerrar la pestaña con cambios sin guardar.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  if (!drafts) return <div className="flex-1"><Spinner /></div>;

  /** Lo que rige hoy: lo del proyecto, o lo de la cuenta mientras no lo cambie. */
  const effective: ProjectVerification | null = verification ?? accountVerification;
  const editVerification = (fn: (v: ProjectVerification) => ProjectVerification) => {
    if (!effective) return;
    setVerification(fn(effective));
    setError("");
  };
  /** Marca o desmarca un canal. Siempre queda al menos uno. */
  const toggleVerify = (channel: "email" | "phone", on: boolean) =>
    editVerification((v) => {
      const channels = on ? Array.from(new Set([...v.channels, channel])) : v.channels.filter((c) => c !== channel);
      return channels.length === 0 ? v : { ...v, channels };
    });
  const toggleField = (key: string, on: boolean) => {
    setFields((list) => (on ? [...list, { key, required: false }] : list.filter((f) => f.key !== key)));
    setError("");
  };
  const requireField = (key: string, required: boolean) => setFields((list) => list.map((f) => (f.key === key ? { ...f, required } : f)));
  const updateDrafts = (fn: (list: Draft[]) => Draft[]) => {
    setDrafts((list) => (list ? fn(list) : list));
    setError("");
  };

  const save = async () => {
    // Lo que el servidor rechazaría se señala antes, en la pregunta que hay que corregir.
    const broken = drafts.findIndex((d) => draftIssues(d).length > 0);
    if (broken !== -1) {
      setError(`Pregunta ${broken + 1}: ${draftIssues(drafts[broken])[0]}`);
      setFocusKey(null);
      requestAnimationFrame(() => setFocusKey(drafts[broken].key));
      return;
    }
    setSaving(true);
    setError("");
    try {
      const form = await reclutamientoApi.saveProjectForm(tenantId, projectId, { questions: drafts.map(toPayload), fields, verification, layout });
      const list = form.questions.map(toDraft);
      setDrafts(list);
      setFields(form.fields);
      setVerification(form.verification);
      setLayout(form.layout ?? null);
      setSaved(JSON.stringify({ q: list.map(toPayload), f: form.fields, v: form.verification, l: form.layout ?? null }));
      toast.success("Formulario guardado");
    } catch (err) {
      setError(apiMessage(err, "No se pudo guardar el formulario"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Formulario de registro</h3>
          <p className="text-xs text-muted-foreground">Lo que se pide al registrarse. La persona queda como contacto del CRM y como prospecto de este proyecto.</p>
        </div>
        {!readOnly && dirty && <span className="ml-auto text-[11px] font-medium text-amber-600 dark:text-amber-400">Cambios sin guardar</span>}
        {!readOnly && (
          <button type="button" onClick={save} disabled={!dirty || saving} className={`${primaryButton} ${dirty ? "" : "ml-auto"}`}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Guardar
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-3xl space-y-3">
          {error && (
            <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:bg-rose-500/15 dark:text-rose-200">
              {error}
            </p>
          )}
          <section aria-label="Datos personales" className="rounded-xl border border-border bg-background p-4">
            <h4 className="text-xs font-semibold text-foreground">Datos personales</h4>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Se guardan en el contacto del CRM. En un contacto que ya existe solo se llenan los campos vacíos. Pide solo lo necesario: lo demás se puede pedir después.</p>
            <ul className="mt-3 divide-y divide-border rounded-lg border border-border text-sm">
              <li className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="text-foreground">Nombre completo</span>
                <span className="text-[11px] text-muted-foreground">Siempre</span>
              </li>
              <li className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="text-foreground">Teléfono (WhatsApp)</span>
                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <input type="checkbox" checked={!!effective?.channels.includes("phone")} disabled={readOnly || !effective || (effective.channels.length === 1 && effective.channels[0] === "phone")} onChange={(e) => toggleVerify("phone", e.target.checked)} />
                  Verificar con código
                </label>
              </li>
              <li className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="text-foreground">Correo electrónico</span>
                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <input type="checkbox" checked={!!effective?.channels.includes("email")} disabled={readOnly || !effective || (effective.channels.length === 1 && effective.channels[0] === "email")} onChange={(e) => toggleVerify("email", e.target.checked)} />
                  Verificar con código
                </label>
              </li>
              {catalog.map((c) => {
                const picked = fields.find((f) => f.key === c.key);
                return (
                  <li key={c.key} className="flex items-center justify-between gap-3 px-3 py-2">
                    <label className="flex items-center gap-2 text-foreground">
                      <input type="checkbox" checked={!!picked} disabled={readOnly || (!picked && fields.length >= 15)} onChange={(e) => toggleField(c.key, e.target.checked)} />
                      {c.label}
                    </label>
                    {picked && (
                      <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <input type="checkbox" checked={picked.required} disabled={readOnly} onChange={(e) => requireField(c.key, e.target.checked)} />
                        Obligatorio
                      </label>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Siempre se pide el teléfono y el correo. Hay que verificar al menos uno; con los dos marcados la persona elige cuál. El que no se verifica se pide sin verificar (el teléfono es obligatorio y el correo es opcional).
              {verification === null && " Ahora se usa la verificación del portal de la cuenta; si cambias algo aquí, este proyecto tendrá la suya."}
            </p>
            {effective?.channels.includes("email") && <p className="mt-1 text-[11px] text-muted-foreground">El código por correo usa el mensaje definido en «Portal de registro».</p>}
            {effective?.channels.includes("phone") && (
              <div className="mt-3 rounded-lg border border-border p-3">
                <h5 className="mb-2 text-xs font-semibold text-foreground">Código por WhatsApp</h5>
                {readOnly ? (
                  <p className="text-xs text-muted-foreground">Plantilla: {effective.whatsapp.templateName || "sin elegir"}</p>
                ) : (
                  <WhatsappPicker
                    tenantId={tenantId}
                    value={effective.whatsapp}
                    onChange={(w) => editVerification((v) => ({ ...v, whatsapp: { ...v.whatsapp, ...w } }))}
                    helpBody="Elige el número y una plantilla de autenticación aprobada por Meta: el código se envía en su primera variable."
                  />
                )}
              </div>
            )}
            {verification !== null && !readOnly && (
              <button type="button" onClick={() => setVerification(null)} className="mt-2 text-[11px] font-medium text-brand-700 hover:underline dark:text-brand-300">
                Volver a usar la verificación de la cuenta
              </button>
            )}
          </section>
          <QuestionBuilder drafts={drafts} onChange={updateDrafts} readOnly={readOnly} focusKey={focusKey} />
          <FormLayoutEditor
            tenantId={tenantId}
            projectId={projectId}
            drafts={drafts}
            fields={fields}
            catalog={catalog}
            verification={verification}
            effective={effective}
            layout={layout}
            onChange={(l) => {
              setLayout(l);
              setError("");
            }}
            readOnly={readOnly}
          />
        </div>
      </div>
    </div>
  );
}
