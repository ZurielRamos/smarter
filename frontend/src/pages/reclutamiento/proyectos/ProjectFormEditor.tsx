import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ClipboardList, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { reclutamientoApi, type FormQuestion, type PersonalField, type PortalFieldDef, type ProjectVerification, type QuestionType } from "@/services/reclutamiento";
import { Field, Segmented, Spinner, inputClass, primaryButton, secondaryButton } from "../shared";
import { WhatsappPicker } from "../PortalConfig";

const MAX_QUESTIONS = 15;

const TYPE_OPTIONS: Array<{ value: QuestionType; label: string }> = [
  { value: "short", label: "Texto" },
  { value: "long", label: "Párrafo" },
  { value: "single", label: "Una opción" },
  { value: "multi", label: "Varias" },
  { value: "yesno", label: "Sí / No" },
  { value: "number", label: "Número" },
];

/** Pregunta en edición: las opciones viajan como texto (una por línea) mientras se escriben. */
interface Draft {
  key: string;
  id: string;
  type: QuestionType;
  label: string;
  help: string;
  required: boolean;
  optionsText: string;
  min: string;
  max: string;
}

let seq = 0;
const newKey = () => `k${++seq}`;

const toDraft = (q: FormQuestion): Draft => ({
  key: newKey(),
  id: q.id,
  type: q.type,
  label: q.label,
  help: q.help,
  required: q.required,
  optionsText: q.options.join("\n"),
  min: q.min === null ? "" : String(q.min),
  max: q.max === null ? "" : String(q.max),
});

/** Cuerpo para la API. Las preguntas nuevas viajan sin id: el servidor les asigna uno estable. */
const toPayload = (d: Draft): Partial<FormQuestion> => ({
  id: d.id,
  type: d.type,
  label: d.label.trim(),
  help: d.help.trim(),
  required: d.required,
  options: d.type === "single" || d.type === "multi" ? d.optionsText.split("\n").map((o) => o.trim()).filter(Boolean) : [],
  min: d.type === "number" && d.min.trim() !== "" ? Number(d.min) : null,
  max: d.type === "number" && d.max.trim() !== "" ? Number(d.max) : null,
});

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
  const [catalog, setCatalog] = useState<PortalFieldDef[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    reclutamientoApi
      .projectFace(tenantId, projectId)
      .then((f) => {
        const list = f.form.questions.map(toDraft);
        setDrafts(list);
        setFields(f.form.fields ?? []);
        setVerification(f.form.verification ?? null);
        setSaved(JSON.stringify({ q: list.map(toPayload), f: f.form.fields ?? [], v: f.form.verification ?? null }));
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
  const payload = useMemo(() => JSON.stringify({ q: (drafts ?? []).map(toPayload), f: fields, v: verification }), [drafts, fields, verification]);
  const dirty = drafts !== null && payload !== saved;

  if (!drafts) return <div className="flex-1"><Spinner /></div>;

  const edit = (key: string, patch: Partial<Draft>) => {
    setDrafts((list) => (list ? list.map((d) => (d.key === key ? { ...d, ...patch } : d)) : list));
    setError("");
  };
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
  const move = (i: number, dir: -1 | 1) =>
    setDrafts((list) => {
      if (!list) return list;
      const j = i + dir;
      if (j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const form = await reclutamientoApi.saveProjectForm(tenantId, projectId, { questions: drafts.map(toPayload) as FormQuestion[], fields, verification });
      const list = form.questions.map(toDraft);
      setDrafts(list);
      setFields(form.fields);
      setVerification(form.verification);
      setSaved(JSON.stringify({ q: list.map(toPayload), f: form.fields, v: form.verification }));
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
        {!readOnly && (
          <button type="button" onClick={save} disabled={!dirty || saving} className={`${primaryButton} ml-auto`}>
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
          <p className="rounded-lg bg-muted/60 px-3 py-2 text-[11px] text-muted-foreground">
            Pide solo lo necesario para decidir. No se admiten preguntas de datos sensibles (salud, religión, origen étnico, orientación sexual, opiniones políticas o sindicales, datos biométricos o antecedentes judiciales). Las respuestas solo las ve tu cuenta.
          </p>
          {drafts.length === 0 && (
            <div className="mx-auto mt-8 max-w-sm text-center">
              <ClipboardList className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm font-medium text-foreground">Sin preguntas propias</p>
              <p className="mt-1 text-xs text-muted-foreground">Quien se registre dejará sus datos de contacto, los datos personales que elijas arriba y lo que preguntes aquí.</p>
            </div>
          )}
          {drafts.map((d, i) => (
            <section key={d.key} className="rounded-xl border border-border bg-background p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground">Pregunta {i + 1}</span>
                {!readOnly && (
                  <div className="ml-auto flex items-center gap-1">
                    <button type="button" aria-label={`Subir la pregunta ${i + 1}`} disabled={i === 0} onClick={() => move(i, -1)} className="rounded-md p-1 text-muted-foreground hover:bg-muted disabled:opacity-30">
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" aria-label={`Bajar la pregunta ${i + 1}`} disabled={i === drafts.length - 1} onClick={() => move(i, 1)} className="rounded-md p-1 text-muted-foreground hover:bg-muted disabled:opacity-30">
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" aria-label={`Quitar la pregunta ${i + 1}`} onClick={() => setDrafts((list) => (list ? list.filter((x) => x.key !== d.key) : list))} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-rose-500">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
              <fieldset disabled={readOnly} className="space-y-3">
                <Segmented<QuestionType> label="Tipo de respuesta" value={d.type} onChange={(type) => edit(d.key, { type })} options={TYPE_OPTIONS} disabled={readOnly} />
                <Field label="Pregunta">
                  <input value={d.label} maxLength={200} onChange={(e) => edit(d.key, { label: e.target.value })} placeholder="¿En qué ciudad vives?" className={inputClass} />
                </Field>
                <Field label="Ayuda (opcional)">
                  <input value={d.help} maxLength={300} onChange={(e) => edit(d.key, { help: e.target.value })} className={inputClass} />
                </Field>
                {(d.type === "single" || d.type === "multi") && (
                  <Field label="Opciones" hint="Una por línea, de 2 a 12.">
                    <textarea rows={4} value={d.optionsText} onChange={(e) => edit(d.key, { optionsText: e.target.value })} className={inputClass} />
                  </Field>
                )}
                {d.type === "number" && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Mínimo (opcional)">
                      <input type="number" value={d.min} onChange={(e) => edit(d.key, { min: e.target.value })} className={inputClass} />
                    </Field>
                    <Field label="Máximo (opcional)">
                      <input type="number" value={d.max} onChange={(e) => edit(d.key, { max: e.target.value })} className={inputClass} />
                    </Field>
                  </div>
                )}
                <label className="flex items-center gap-2 text-xs text-foreground">
                  <input type="checkbox" checked={d.required} onChange={(e) => edit(d.key, { required: e.target.checked })} />
                  Respuesta obligatoria
                </label>
              </fieldset>
            </section>
          ))}
          {!readOnly && (
            <button
              type="button"
              disabled={drafts.length >= MAX_QUESTIONS}
              onClick={() =>
                setDrafts((list) => [
                  ...(list ?? []),
                  { key: newKey(), id: "", type: "short", label: "", help: "", required: false, optionsText: "", min: "", max: "" },
                ])
              }
              className={secondaryButton}
            >
              <Plus className="h-3.5 w-3.5" /> Agregar pregunta {drafts.length >= MAX_QUESTIONS ? `(máximo ${MAX_QUESTIONS})` : ""}
            </button>
          )}
          {readOnly && <p className="text-center text-[11px] text-muted-foreground">El proyecto terminó: el formulario ya no se puede editar.</p>}
        </div>
      </div>
    </div>
  );
}
