import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { reclutamientoApi, type FormQuestion, type PortalFieldDef } from "@/services/reclutamiento";
import { cn } from "@/lib/utils";
import { FlowSelect } from "./FlowSelect";
import { Toggle } from "./Toggle";
import { VariableInput } from "./VariableField";
import type { FlowAction } from "./types";

const inputClass =
  "w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200";

/** Formulario de un proyecto: sus preguntas y los datos personales que pide (con nombre). */
interface ProjectFormInfo {
  questions: FormQuestion[];
  fields: PortalFieldDef[];
}

// Se piden una vez por proyecto mientras el editor está abierto.
const formCache = new Map<string, Promise<ProjectFormInfo>>();
const catalogCache = new Map<string, Promise<PortalFieldDef[]>>();

function loadForm(tenantId: string, projectId: string): Promise<ProjectFormInfo> {
  const key = `${tenantId}:${projectId}`;
  if (!formCache.has(key)) {
    if (!catalogCache.has(tenantId)) catalogCache.set(tenantId, reclutamientoApi.portalConfig(tenantId).then((r) => r.fields));
    const p = Promise.all([reclutamientoApi.projectFace(tenantId, projectId), catalogCache.get(tenantId)!]).then(([face, catalog]) => ({
      questions: face.form.questions,
      fields: face.form.fields.flatMap((f) => catalog.filter((c) => c.key === f.key)),
    }));
    formCache.set(key, p.catch((err) => (formCache.delete(key), Promise.reject(err))));
  }
  return formCache.get(key)!;
}

function useProjectForm(tenantId: string | undefined, projectId: string | undefined) {
  const [state, setState] = useState<{ form: ProjectFormInfo | null; error: boolean }>({ form: null, error: false });
  useEffect(() => {
    if (!tenantId || !projectId) {
      setState({ form: null, error: false });
      return;
    }
    let alive = true;
    setState({ form: null, error: false });
    loadForm(tenantId, projectId)
      .then((form) => alive && setState({ form, error: false }))
      .catch(() => alive && setState({ form: null, error: true }));
    return () => {
      alive = false;
    };
  }, [tenantId, projectId]);
  return state;
}

const QUESTION_HINT: Record<string, string> = {
  short: "Texto",
  long: "Texto largo",
  yesno: "Escribe «sí» o «no» (o una variable que lo tenga)",
  number: "Un número",
  scale: "Un número de la escala",
  date: "Fecha AAAA-MM-DD o dd/mm/aaaa",
};

/** «Guardar respuestas en proyecto»: valores para preguntas y datos personales del formulario del proyecto. */
export function ProjectAnswersFields({
  action: a,
  tenantId,
  projects,
  onChange,
}: {
  action: FlowAction;
  tenantId?: string;
  projects: Array<{ id: string; name: string; status: string }>;
  onChange: (patch: Partial<FlowAction>) => void;
}) {
  const { form, error } = useProjectForm(tenantId, a.projectId || undefined);
  const answers = a.answers ?? [];
  const setAnswer = (i: number, patch: Partial<{ item: string; value: string }>) => onChange({ answers: answers.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const project = projects.find((p) => p.id === a.projectId);
  const projectOptions = projects
    .filter((p) => p.status !== "ended" || p.id === a.projectId)
    .map((p) => ({ value: p.id, label: p.name, hint: p.status === "active" ? undefined : p.status === "paused" ? "Pausado" : p.status === "draft" ? "Borrador" : "Terminado" }));

  const itemOptions = form
    ? [
        ...form.questions.map((q) => ({ value: `question:${q.id}`, label: q.label, group: "Preguntas del proyecto" })),
        ...form.fields.map((f) => ({ value: `field:${f.key}`, label: f.label, group: "Datos personales (se guardan en el contacto)" })),
      ]
    : [];
  const describe = (item: string): { hint: string; choices: string[] } => {
    if (!form) return { hint: "", choices: [] };
    if (item.startsWith("question:")) {
      const q = form.questions.find((x) => `question:${x.id}` === item);
      if (!q) return { hint: "Esta pregunta ya no está en el formulario", choices: [] };
      if (q.type === "single") return { hint: q.allowOther ? "Una opción o un texto libre («Otra»)" : "Una de las opciones", choices: q.options };
      if (q.type === "multi") return { hint: "Opciones separadas por coma", choices: q.options };
      if (q.type === "number" && (q.min !== null || q.max !== null)) return { hint: `Número entre ${q.min ?? "−∞"} y ${q.max ?? "∞"}`, choices: [] };
      if (q.type === "scale") return { hint: `Número de ${q.min ?? 1} a ${q.max ?? 5}`, choices: [] };
      return { hint: QUESTION_HINT[q.type] ?? "", choices: [] };
    }
    const f = form.fields.find((x) => `field:${x.key}` === item);
    if (!f) return { hint: "Este dato ya no está en el formulario", choices: [] };
    if (f.type === "select") return { hint: "Una de las opciones (se guarda su valor)", choices: (f.options ?? []).map((o) => o.value) };
    if (f.type === "date") return { hint: "Fecha AAAA-MM-DD o dd/mm/aaaa", choices: [] };
    if (f.type === "boolean") return { hint: "true o false", choices: ["true", "false"] };
    return { hint: f.type === "number" ? "Un número" : "Texto", choices: [] };
  };

  return (
    <div className="space-y-2">
      <FlowSelect
        compact
        searchable={projectOptions.length > 8}
        aria-label="Proyecto"
        value={a.projectId || ""}
        onChange={(v) => onChange({ projectId: v, ...(v !== a.projectId ? { answers: [] } : {}) })}
        placeholder={projectOptions.length ? "Selecciona un proyecto…" : "La cuenta no tiene proyectos"}
        options={[...(a.projectId && !project ? [{ value: a.projectId, label: "(proyecto eliminado)" }] : []), ...projectOptions]}
      />

      {a.projectId && !form && !error && <p className="text-[11px] text-muted-foreground">Cargando el formulario del proyecto…</p>}
      {error && <p className="text-[11px] text-amber-700 dark:text-amber-300">No se pudo cargar el formulario del proyecto.</p>}
      {form && itemOptions.length === 0 && <p className="text-[11px] text-muted-foreground">El formulario de este proyecto no tiene preguntas ni datos personales. Agrégalos en Reclutamiento → Proyectos → Formulario.</p>}

      {form &&
        answers.map((x, i) => {
          const meta = describe(x.item);
          return (
            <div key={i} className="space-y-1.5 rounded-lg border border-border bg-muted/30 p-2">
              <div className="flex items-center gap-1.5">
                <FlowSelect
                  compact
                  searchable={itemOptions.length > 8}
                  aria-label={`Campo ${i + 1} del formulario`}
                  value={x.item}
                  onChange={(v) => setAnswer(i, { item: v })}
                  placeholder="Pregunta o dato…"
                  options={[
                    ...(x.item && !itemOptions.some((o) => o.value === x.item) ? [{ value: x.item, label: "(ya no está en el formulario)", group: "Otros" }] : []),
                    ...itemOptions.filter((o) => o.value === x.item || !answers.some((y) => y.item === o.value)),
                  ]}
                />
                <button
                  type="button"
                  aria-label={`Quitar el campo ${i + 1}`}
                  onClick={() => onChange({ answers: answers.filter((_, j) => j !== i) })}
                  className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-red-600 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {x.item && (
                <>
                  <VariableInput aria-label={`Valor del campo ${i + 1}`} value={x.value} onChange={(v) => setAnswer(i, { value: v })} placeholder="Valor o {{variable}}" className={cn(inputClass, "py-1.5")} />
                  {meta.hint && <p className="text-[10px] text-muted-foreground">{meta.hint}</p>}
                  {meta.choices.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {meta.choices.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setAnswer(i, { value: c })}
                          className={cn(
                            "rounded-md border px-1.5 py-0.5 text-[10px] transition-colors",
                            x.value === c ? "border-brand-400 bg-brand-100 text-brand-800 dark:bg-brand-900/40 dark:text-brand-100" : "border-border text-muted-foreground hover:bg-muted",
                          )}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}

      {form && itemOptions.length > 0 && (
        <button
          type="button"
          disabled={answers.length >= Math.min(itemOptions.length, 30)}
          onClick={() => onChange({ answers: [...answers, { item: "", value: "" }] })}
          className="flex items-center gap-1 text-[11px] font-medium text-brand-700 hover:underline disabled:opacity-40 dark:text-brand-300"
        >
          <Plus className="h-3 w-3" /> Agregar campo
        </button>
      )}

      {form && answers.length > 0 && (
        <Toggle
          checked={!!a.onlyIfEmpty}
          onChange={(v) => onChange({ onlyIfEmpty: v || undefined })}
          label="Solo si está vacío"
          description="No reemplaza respuestas ni datos que ya tenía."
        />
      )}
      <p className="text-[11px] text-muted-foreground">
        Solo actúa si el contacto ya está en el proyecto (usa antes «Agregar a proyecto»). Cada valor se valida como en el registro; lo que no sirve se omite y la nota interna de la conversación lo explica.
      </p>
    </div>
  );
}
