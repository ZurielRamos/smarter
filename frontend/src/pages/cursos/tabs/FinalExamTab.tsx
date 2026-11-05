import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, GraduationCap } from "lucide-react";
import {
  listQuizzes,
  createQuiz,
  updateQuiz,
  type CourseQuiz,
} from "@/services/cursos";
import { QuestionsEditor } from "../QuestionsEditor";
import { NumberField } from "@/components/ui/number-field";
import { DropdownSelect } from "@/components/ui/dropdown-select";

export function FinalExamTab({ courseId }: { courseId: string }) {
  const [quiz, setQuiz] = useState<CourseQuiz | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = () => {
    setLoading(true);
    listQuizzes(courseId)
      .then((all) => setQuiz(all.find((q) => q.kind === "final_exam") ?? null))
      .finally(() => setLoading(false));
  };

  useEffect(load, [courseId]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const created = await createQuiz(courseId, { kind: "final_exam", title: "Examen final" });
      setQuiz(created);
      toast.success("Examen final creado");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "No se pudo crear el examen");
    } finally {
      setCreating(false);
    }
  };

  const save = async (patch: Partial<CourseQuiz>) => {
    if (!quiz) return;
    const updated = await updateQuiz(courseId, quiz.id, patch);
    setQuiz(updated);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!quiz) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-16">
        <div className="h-12 w-12 rounded-2xl bg-brand-50 dark:bg-brand-500/15 flex items-center justify-center mb-3">
          <GraduationCap className="h-6 w-6 text-brand-600" />
        </div>
        <h2 className="text-sm font-semibold text-foreground">Sin examen final</h2>
        <p className="text-xs text-muted-foreground mt-1 max-w-xs">
          El examen final es una evaluación global del curso. Crea uno para medir el dominio completo.
        </p>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-xs font-medium disabled:opacity-50"
        >
          {creating && <Loader2 className="h-3 w-3 animate-spin" />}
          Crear examen final
        </button>
      </div>
    );
  }

  return (
    <div className="p-5 space-y-4 max-w-3xl">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Labeled label="Tiempo total (s)">
          <NumberField
            decimals={0}
            min={0}
            value={quiz.totalTimeLimitSec}
            placeholder="Sin límite"
            onCommit={(v) => save({ totalTimeLimitSec: v })}
            onChange={() => {}}
          />
        </Labeled>
        <Labeled label="Aprobación (%)">
          <NumberField
            decimals={0}
            min={0}
            max={100}
            value={quiz.passingScore}
            onCommit={(v) => save({ passingScore: v ?? 0 })}
            onChange={() => {}}
          />
        </Labeled>
        <Labeled label="Peso en curso">
          <NumberField
            min={0}
            value={quiz.weightInCourse}
            onCommit={(v) => save({ weightInCourse: v ?? 0 })}
            onChange={() => {}}
          />
        </Labeled>
        <Labeled label="Intentos">
          <NumberField
            decimals={0}
            min={1}
            value={quiz.maxAttempts}
            onCommit={(v) => save({ maxAttempts: v ?? 1 })}
            onChange={() => {}}
          />
        </Labeled>
      </div>

      <div className="flex items-center gap-4 flex-wrap text-[11px] text-muted-foreground">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={quiz.shuffleQuestions}
            onChange={(e) => save({ shuffleQuestions: e.target.checked })}
          />
          Barajar preguntas
        </label>
        <div className="flex items-center gap-2">
          Activa:
          <DropdownSelect
            className="w-32"
            value={quiz.status}
            onChange={(v) => save({ status: v })}
            options={[
              { value: "draft", label: "Borrador" },
              { value: "active", label: "Activa" },
            ]}
          />
        </div>
      </div>

      <div className="pt-3 border-t border-border">
        <QuestionsEditor courseId={courseId} quizId={quiz.id} />
      </div>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">{label}</label>
      {children}
    </div>
  );
}
