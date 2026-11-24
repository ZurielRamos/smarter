import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Layers, Loader2, Lock, Plus, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { reclutamientoApi, type FormLayout, type FormStep, type PersonalField, type PortalFieldDef, type ProjectVerification } from "@/services/reclutamiento";
import { inputClass, secondaryButton } from "../shared";
import { MAX_STEP_ITEMS, MAX_STEPS, formItems, resolveSteps } from "../formLayout";
import { draftIssues, toPayload, type Draft } from "./questionDrafts";

interface Props {
  tenantId: string;
  projectId: string;
  drafts: Draft[];
  fields: PersonalField[];
  catalog: PortalFieldDef[];
  verification: ProjectVerification | null;
  /** Verificación vigente (la del proyecto o la de la cuenta), para explicar el último paso. */
  effective: ProjectVerification | null;
  layout: FormLayout | null;
  onChange: (layout: FormLayout | null) => void;
  readOnly: boolean;
}

const smallInput =
  "w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200";

/**
 * Pantallas del formulario de registro: quien se registra avanza de una en
 * una. Se pueden dejar automáticas, pedir una propuesta a la IA o ajustarlas a
 * mano (títulos, orden y qué va en cada pantalla). Nada se publica hasta guardar.
 */
export function FormLayoutEditor({ tenantId, projectId, drafts, fields, catalog, verification, effective, layout, onChange, readOnly }: Props) {
  const [thinking, setThinking] = useState(false);
  const items = useMemo(() => formItems(fields, drafts.map((d) => d.id)), [fields, drafts]);
  const steps = useMemo(() => resolveSteps(layout, items, true), [layout, items]);

  const labelOf = (item: string): { label: string; kind: string } => {
    if (item.startsWith("field:")) {
      const key = item.slice(6);
      return { label: catalog.find((c) => c.key === key)?.label ?? key, kind: "Dato personal" };
    }
    const d = drafts.find((x) => `question:${x.id}` === item);
    return { label: d?.label.trim() || "Pregunta sin texto", kind: "Pregunta" };
  };

  /** Cualquier cambio a mano convierte el diseño en personalizado. */
  const commit = (next: FormStep[]) => onChange({ steps: next, source: "manual" });
  const setStep = (id: string, patch: Partial<FormStep>) => commit(steps.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const moveItem = (item: string, toStep: string, index?: number) => {
    const next = steps.map((s) => ({ ...s, items: s.items.filter((x) => x !== item) }));
    const target = next.find((s) => s.id === toStep);
    if (!target) return;
    const at = index === undefined ? target.items.length : Math.max(0, Math.min(index, target.items.length));
    target.items.splice(at, 0, item);
    commit(next);
  };
  const shiftItem = (stepId: string, i: number, dir: -1 | 1) => {
    const s = steps.find((x) => x.id === stepId)!;
    const j = i + dir;
    if (j < 0 || j >= s.items.length) return;
    const list = [...s.items];
    [list[i], list[j]] = [list[j], list[i]];
    setStep(stepId, { items: list });
  };
  const shiftStep = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  };
  const addStep = () => {
    let n = steps.length + 1;
    while (steps.some((s) => s.id === `s${n}`)) n++;
    commit([...steps, { id: `s${n}`, title: `Pantalla ${steps.length + 2}`, description: "", items: [] }]);
  };
  /** Al quitar una pantalla, sus campos pasan a la anterior (o a la siguiente). */
  const removeStep = (i: number) => {
    const next = steps.map((s) => ({ ...s, items: [...s.items] }));
    const [removed] = next.splice(i, 1);
    const heir = next[i - 1] ?? next[i];
    if (heir) heir.items.push(...removed.items);
    commit(next);
  };

  const organizeWithAi = async () => {
    const broken = drafts.findIndex((d) => draftIssues(d).length > 0);
    if (broken !== -1) {
      toast.error(`Completa la pregunta ${broken + 1} antes de organizar: ${draftIssues(drafts[broken])[0]}`);
      return;
    }
    setThinking(true);
    try {
      const suggestion = await reclutamientoApi.suggestFormLayout(tenantId, projectId, { questions: drafts.map(toPayload), fields, verification });
      onChange(suggestion);
      toast.success("Propuesta lista. Revísala y guarda el formulario para publicarla.");
    } catch (err) {
      const m = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
      toast.error(typeof m === "string" ? m : "No se pudo organizar con IA");
    } finally {
      setThinking(false);
    }
  };

  const badge = !layout ? "Automática" : layout.source === "ai" ? "Propuesta por IA" : "Personalizada";
  const total = steps.length + 1;

  return (
    <section aria-label="Pantallas del formulario" className="rounded-xl border border-border bg-background">
      <div className="flex flex-wrap items-start gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <h4 className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <Layers className="h-3.5 w-3.5 text-muted-foreground" /> Pantallas del formulario
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{badge}</span>
          </h4>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Quien se registra avanza de una pantalla a la otra con una barra de progreso. Al final verifica su {verificationLabel(effective)} con un código.
          </p>
        </div>
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2">
            {layout && (
              <button type="button" onClick={() => onChange(null)} className={secondaryButton} title="Organizar automáticamente según el orden del formulario">
                <RotateCcw className="h-3.5 w-3.5" /> Automática
              </button>
            )}
            <button
              type="button"
              onClick={organizeWithAi}
              disabled={thinking || items.length < 2}
              title={items.length < 2 ? "Agrega al menos dos datos o preguntas" : "La IA agrupa los campos por tema y propone títulos. Consume créditos de IA."}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-brand-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {thinking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {thinking ? "Organizando…" : "Organizar con IA"}
            </button>
          </div>
        )}
      </div>

      <ol className="space-y-2 p-4">
        <li className="rounded-xl border border-dashed border-border bg-muted/30 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <StepNumber n={1} total={total} />
            <span className="text-sm font-medium text-foreground">Tus datos de contacto</span>
            <Lock className="ml-auto h-3.5 w-3.5 text-muted-foreground" aria-label="Fija" />
          </div>
          <p className="mt-1 pl-8 text-[11px] text-muted-foreground">Perfil (si hay varios), nombre completo, WhatsApp y correo. Siempre va primero.</p>
        </li>

        {steps.map((s, i) => (
          <li key={s.id} className="rounded-xl border border-border bg-card px-3 py-2.5">
            <div className="flex items-center gap-2">
              <StepNumber n={i + 2} total={total} />
              {readOnly ? (
                <span className="text-sm font-medium text-foreground">{s.title}</span>
              ) : (
                <input aria-label={`Título de la pantalla ${i + 2}`} value={s.title} maxLength={60} onChange={(e) => setStep(s.id, { title: e.target.value })} placeholder="Título de la pantalla" className={cn(smallInput, "font-medium")} />
              )}
              {!readOnly && (
                <div className="flex shrink-0 items-center gap-0.5">
                  <IconBtn label={`Subir la pantalla ${i + 2}`} disabled={i === 0} onClick={() => shiftStep(i, -1)}>
                    <ArrowUp className="h-3.5 w-3.5" />
                  </IconBtn>
                  <IconBtn label={`Bajar la pantalla ${i + 2}`} disabled={i === steps.length - 1} onClick={() => shiftStep(i, 1)}>
                    <ArrowDown className="h-3.5 w-3.5" />
                  </IconBtn>
                  <IconBtn label={`Quitar la pantalla ${i + 2}`} disabled={steps.length <= 1} onClick={() => removeStep(i)} danger>
                    <Trash2 className="h-3.5 w-3.5" />
                  </IconBtn>
                </div>
              )}
            </div>
            <div className="mt-1.5 pl-8">
              {readOnly ? (
                s.description && <p className="text-[11px] text-muted-foreground">{s.description}</p>
              ) : (
                <input aria-label={`Descripción de la pantalla ${i + 2}`} value={s.description} maxLength={160} onChange={(e) => setStep(s.id, { description: e.target.value })} placeholder="Frase breve (opcional)" className={cn(inputClass, "py-1.5 text-xs")} />
              )}
              {s.items.length === 0 ? (
                <p className="mt-2 rounded-lg border border-dashed border-border px-3 py-2 text-[11px] text-muted-foreground">Pantalla vacía: mueve aquí datos o preguntas. Si queda vacía, no se mostrará.</p>
              ) : (
                <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
                  {s.items.map((item, j) => {
                    const meta = labelOf(item);
                    return (
                      <li key={item} className="flex items-center gap-2 px-2.5 py-1.5">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-foreground">{meta.label}</span>
                          <span className="block text-[10px] text-muted-foreground">{meta.kind}</span>
                        </span>
                        {!readOnly && (
                          <>
                            <IconBtn label={`Subir «${meta.label}»`} disabled={j === 0} onClick={() => shiftItem(s.id, j, -1)}>
                              <ArrowUp className="h-3 w-3" />
                            </IconBtn>
                            <IconBtn label={`Bajar «${meta.label}»`} disabled={j === s.items.length - 1} onClick={() => shiftItem(s.id, j, 1)}>
                              <ArrowDown className="h-3 w-3" />
                            </IconBtn>
                            {steps.length > 1 && (
                              <select
                                aria-label={`Mover «${meta.label}» a otra pantalla`}
                                value={s.id}
                                onChange={(e) => moveItem(item, e.target.value)}
                                className="max-w-[9rem] rounded-md border border-border bg-background px-1.5 py-1 text-[11px] text-muted-foreground focus:outline-none focus:ring-1 focus:ring-brand-200"
                              >
                                {steps.map((t, k) => (
                                  <option key={t.id} value={t.id} disabled={t.id !== s.id && t.items.length >= MAX_STEP_ITEMS}>
                                    {t.id === s.id ? "Mover a…" : `${k + 2}. ${t.title || "Sin título"}`}
                                  </option>
                                ))}
                              </select>
                            )}
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </li>
        ))}

        {steps.length === 0 && <li className="py-2 text-center text-[11px] text-muted-foreground">Sin datos personales ni preguntas: el registro es una sola pantalla.</li>}
      </ol>

      {!readOnly && steps.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-3 text-[11px] text-muted-foreground">
          <button type="button" onClick={addStep} disabled={steps.length >= MAX_STEPS} className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline disabled:opacity-40 dark:text-brand-300">
            <Plus className="h-3 w-3" /> {steps.length >= MAX_STEPS ? `Máximo ${MAX_STEPS} pantallas` : "Agregar pantalla"}
          </button>
          <span>Las preguntas nuevas se agregan al final de la última pantalla. «Organizar con IA» consume créditos de IA de la cuenta.</span>
        </div>
      )}
    </section>
  );
}

const verificationLabel = (v: ProjectVerification | null) =>
  !v ? "teléfono o correo" : v.channels.length === 2 ? "WhatsApp o correo" : v.channels[0] === "phone" ? "WhatsApp" : "correo";

function StepNumber({ n, total }: { n: number; total: number }) {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[11px] font-semibold text-brand-800 dark:bg-brand-700/40 dark:text-brand-100" title={`Pantalla ${n} de ${total}`}>
      {n}
    </span>
  );
}

function IconBtn({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn("rounded-md p-1 text-muted-foreground hover:bg-muted disabled:opacity-30", danger ? "hover:text-rose-500" : "hover:text-foreground")}
    >
      {children}
    </button>
  );
}
