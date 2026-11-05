import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, Clock, Award } from "lucide-react";
import { ConfirmModal } from "@/components/ConfirmModal";
import { NumberField } from "@/components/ui/number-field";
import {
  listQuestions,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  type CourseQuestion,
} from "@/services/cursos";

const TYPE_LABELS: Record<string, string> = {
  single_choice: "Opción única",
  multiple_choice: "Opción múltiple",
  true_false: "Verdadero / Falso",
  short_text: "Texto corto",
  numeric: "Numérica",
  ordering: "Ordenar",
};

/**
 * Editor de preguntas de un quiz (clase o examen final). Soporta tipos,
 * ponderación (puntos, penalización, crédito parcial) y tiempo límite con bonus.
 */
export function QuestionsEditor({ courseId, quizId }: { courseId: string; quizId: string }) {
  const [questions, setQuestions] = useState<CourseQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const refresh = () => {
    setLoading(true);
    listQuestions(courseId, quizId)
      .then(setQuestions)
      .catch(() => toast.error("No se pudieron cargar las preguntas"))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, [courseId, quizId]);

  const addQuestion = async (type: CourseQuestion["type"]) => {
    const defaults: Record<string, { text: string; isCorrect: boolean }[]> = {
      single_choice: [
        { text: "Opción 1", isCorrect: true },
        { text: "Opción 2", isCorrect: false },
      ],
      multiple_choice: [
        { text: "Opción 1", isCorrect: true },
        { text: "Opción 2", isCorrect: false },
      ],
      true_false: [
        { text: "Verdadero", isCorrect: true },
        { text: "Falso", isCorrect: false },
      ],
      ordering: [
        { text: "Elemento 1", isCorrect: true },
        { text: "Elemento 2", isCorrect: true },
      ],
    };
    try {
      await createQuestion(courseId, {
        quizId,
        type,
        prompt: "Nueva pregunta",
        points: 1,
        options: defaults[type],
      });
      refresh();
    } catch {
      toast.error("No se pudo crear la pregunta");
    }
  };

  const handleDelete = async (id: string) => {
    await deleteQuestion(courseId, id);
    refresh();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase">
          Preguntas ({questions.length})
        </h4>
        <div className="flex items-center gap-1">
          <TypeMenu onPick={addQuestion} />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : questions.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6 border border-dashed border-border rounded-lg">
          Añade preguntas a esta evaluación.
        </p>
      ) : (
        questions.map((q, i) => (
          <QuestionCard
            key={q.id}
            index={i}
            courseId={courseId}
            question={q}
            onSaved={refresh}
            onDelete={() => setConfirmDel(q.id)}
          />
        ))
      )}

      <ConfirmModal
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={() => {
          if (confirmDel) return handleDelete(confirmDel);
        }}
        title="Eliminar pregunta"
        description="Se eliminará la pregunta de esta evaluación."
        confirmLabel="Eliminar"
        variant="danger"
      />
    </div>
  );
}

function TypeMenu({ onPick }: { onPick: (t: CourseQuestion["type"]) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-xs font-medium"
      >
        <Plus className="h-3.5 w-3.5" />
        Añadir pregunta
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 z-20 w-44 rounded-lg border border-border bg-card shadow-lg py-1">
            {Object.entries(TYPE_LABELS).map(([type, label]) => (
              <button
                key={type}
                onClick={() => {
                  onPick(type as CourseQuestion["type"]);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-foreground hover:bg-muted"
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function QuestionCard({
  index,
  courseId,
  question,
  onSaved,
  onDelete,
}: {
  index: number;
  courseId: string;
  question: CourseQuestion;
  onSaved: () => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState<CourseQuestion>(question);
  const [saving, setSaving] = useState(false);
  const hasOptions = ["single_choice", "multiple_choice", "true_false", "ordering"].includes(draft.type);

  const save = async () => {
    setSaving(true);
    try {
      await updateQuestion(courseId, question.id, {
        prompt: draft.prompt,
        options: draft.options,
        correctAnswer: draft.correctAnswer,
        points: draft.points,
        negativeOnWrong: draft.negativeOnWrong,
        partialCredit: draft.partialCredit,
        timeLimitSec: draft.timeLimitSec,
        timeBonus: draft.timeBonus,
        explanation: draft.explanation,
      });
      toast.success("Pregunta guardada");
      onSaved();
    } catch {
      toast.error("No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  const toggleCorrect = (optId: string) => {
    setDraft((d) => ({
      ...d,
      options: d.options.map((o) => {
        if (d.type === "single_choice" || d.type === "true_false") {
          return { ...o, isCorrect: o.id === optId };
        }
        return o.id === optId ? { ...o, isCorrect: !o.isCorrect } : o;
      }),
    }));
  };

  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-3">
      <div className="flex items-start gap-2">
        <span className="text-xs font-semibold text-muted-foreground mt-2">{index + 1}.</span>
        <div className="flex-1 space-y-2">
          <input
            value={draft.prompt}
            onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
            className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-sm font-medium focus:outline-none focus:border-brand-300"
            placeholder="Enunciado de la pregunta"
          />
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
            {TYPE_LABELS[draft.type]}
          </span>
        </div>
        <button onClick={onDelete} className="p-1.5 rounded text-muted-foreground hover:text-red-600">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {hasOptions && (
        <div className="space-y-1.5 pl-6">
          {draft.options.map((o) => (
            <div key={o.id} className="flex items-center gap-2">
              <button
                onClick={() => toggleCorrect(o.id)}
                className={`h-4 w-4 rounded border shrink-0 flex items-center justify-center text-[10px] ${
                  o.isCorrect ? "bg-green-500 border-green-500 text-white" : "border-border"
                }`}
                title={o.isCorrect ? "Correcta" : "Incorrecta"}
              >
                {o.isCorrect ? "✓" : ""}
              </button>
              <input
                value={o.text}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    options: draft.options.map((x) => (x.id === o.id ? { ...x, text: e.target.value } : x)),
                  })
                }
                className="flex-1 px-2 py-1 rounded border border-border bg-background text-xs focus:outline-none focus:border-brand-300"
              />
              {draft.type !== "true_false" && (
                <button
                  onClick={() => setDraft({ ...draft, options: draft.options.filter((x) => x.id !== o.id) })}
                  className="p-1 text-muted-foreground hover:text-red-600"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
          {draft.type !== "true_false" && (
            <button
              onClick={() =>
                setDraft({
                  ...draft,
                  options: [
                    ...draft.options,
                    { id: `tmp-${Date.now()}`, text: "Nueva opción", isCorrect: false },
                  ],
                })
              }
              className="text-[11px] text-brand-600 hover:text-brand-500 inline-flex items-center gap-1"
            >
              <Plus className="h-3 w-3" /> Añadir opción
            </button>
          )}
          {draft.type === "ordering" && (
            <p className="text-[10px] text-muted-foreground">
              El orden mostrado aquí es el correcto; al participante se le barajará.
            </p>
          )}
        </div>
      )}

      {draft.type === "short_text" && (
        <input
          value={draft.correctAnswer?.text ?? ""}
          onChange={(e) => setDraft({ ...draft, correctAnswer: { ...draft.correctAnswer, text: e.target.value } })}
          placeholder="Respuesta correcta esperada"
          className="w-full ml-6 px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:border-brand-300"
        />
      )}
      {draft.type === "numeric" && (
        <div className="flex gap-2 pl-6">
          <NumberField
            className="flex-1"
            value={draft.correctAnswer?.number}
            placeholder="Valor correcto"
            onChange={(v) =>
              setDraft({ ...draft, correctAnswer: { ...draft.correctAnswer, number: v ?? undefined } })
            }
          />
          <NumberField
            className="w-28"
            value={draft.correctAnswer?.tolerance}
            placeholder="± tolerancia"
            onChange={(v) =>
              setDraft({ ...draft, correctAnswer: { ...draft.correctAnswer, tolerance: v ?? undefined } })
            }
          />
        </div>
      )}

      {/* Ponderación y tiempo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pl-6 pt-1 border-t border-border">
        <Field label="Puntos" icon={Award}>
          <NumberField
            min={0}
            value={draft.points}
            onChange={(v) => setDraft({ ...draft, points: v ?? 0 })}
          />
        </Field>
        <Field label="Penalización">
          <NumberField
            min={0}
            value={draft.negativeOnWrong}
            onChange={(v) => setDraft({ ...draft, negativeOnWrong: v ?? 0 })}
          />
        </Field>
        <Field label="Tiempo (s)" icon={Clock}>
          <NumberField
            decimals={0}
            min={0}
            value={draft.timeLimitSec}
            placeholder="Sin límite"
            onChange={(v) => setDraft({ ...draft, timeLimitSec: v })}
          />
        </Field>
        <Field label="Bonus rapidez">
          <NumberField
            min={0}
            value={draft.timeBonus?.maxBonusPoints}
            placeholder="0"
            onChange={(v) =>
              setDraft({
                ...draft,
                timeBonus: v ? { enabled: true, maxBonusPoints: v, decayModel: "linear" } : null,
              })
            }
          />
        </Field>
      </div>

      {(draft.type === "multiple_choice" || draft.type === "ordering") && (
        <label className="flex items-center gap-2 pl-6 text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            checked={draft.partialCredit}
            onChange={(e) => setDraft({ ...draft, partialCredit: e.target.checked })}
          />
          Permitir crédito parcial (puntúa proporcional a lo acertado)
        </label>
      )}

      <div className="flex justify-end pl-6">
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-xs font-medium disabled:opacity-50"
        >
          {saving && <Loader2 className="h-3 w-3 animate-spin" />}
          Guardar pregunta
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon?: typeof Clock;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground mb-0.5">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </label>
      {children}
    </div>
  );
}
