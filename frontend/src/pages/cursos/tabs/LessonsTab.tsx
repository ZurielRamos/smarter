import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Loader2, Trash2, ChevronRight, GripVertical } from "lucide-react";
import { ConfirmModal } from "@/components/ConfirmModal";
import {
  listLessons,
  createLesson,
  deleteLesson,
  listQuizzes,
  type CourseLesson,
  type CourseQuiz,
} from "@/services/cursos";
import { LessonEditor } from "../LessonEditor";

export function LessonsTab({ courseId }: { courseId: string }) {
  const [lessons, setLessons] = useState<CourseLesson[]>([]);
  const [quizzes, setQuizzes] = useState<CourseQuiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const refresh = () => {
    setLoading(true);
    Promise.all([listLessons(courseId), listQuizzes(courseId)])
      .then(([l, q]) => {
        setLessons(l);
        setQuizzes(q);
        if (!selected && l.length) setSelected(l[0].id);
      })
      .catch(() => toast.error("No se pudieron cargar las clases"))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, [courseId]);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const lesson = await createLesson(courseId, { title: newTitle.trim() });
      setNewTitle("");
      setSelected(lesson.id);
      refresh();
      toast.success("Clase creada");
    } catch {
      toast.error("No se pudo crear la clase");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteLesson(courseId, id);
    if (selected === id) setSelected(null);
    refresh();
    toast.success("Clase eliminada");
  };

  const lessonQuiz = (lessonId: string) =>
    quizzes.find((q) => q.kind === "lesson_quiz" && q.lessonId === lessonId);

  return (
    <div className="flex h-full min-h-[70vh]">
      {/* Lista de clases */}
      <div className="w-72 border-r border-border flex flex-col shrink-0">
        <div className="p-3 border-b border-border">
          <div className="flex gap-1.5">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder="Nueva clase..."
              className="flex-1 px-2.5 py-1.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-brand-300"
            />
            <button
              onClick={handleCreate}
              disabled={creating || !newTitle.trim()}
              className="p-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 text-white disabled:opacity-50"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : lessons.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8 px-3">
              Añade la primera clase del curso.
            </p>
          ) : (
            lessons.map((lesson, i) => {
              const q = lessonQuiz(lesson.id);
              return (
                <div
                  key={lesson.id}
                  className={`group flex items-center gap-2 px-3 py-2.5 cursor-pointer border-l-2 transition-colors ${
                    selected === lesson.id
                      ? "bg-brand-50 border-brand-600 dark:bg-brand-700/30"
                      : "border-transparent hover:bg-muted"
                  }`}
                  onClick={() => setSelected(lesson.id)}
                >
                  <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {i + 1}. {lesson.title}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {lesson.materials.length} material · {q ? "con evaluación" : "sin evaluación"}
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDel(lesson.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-y-auto">
        {selected ? (
          <LessonEditor
            key={selected}
            courseId={courseId}
            lessonId={selected}
            quiz={lessonQuiz(selected)}
            onChanged={refresh}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Selecciona o crea una clase para editarla
          </div>
        )}
      </div>

      <ConfirmModal
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={() => {
          if (confirmDel) return handleDelete(confirmDel);
        }}
        title="Eliminar clase"
        description="Se eliminará la clase junto con su material y preguntas."
        confirmLabel="Eliminar"
        variant="danger"
      />
    </div>
  );
}
