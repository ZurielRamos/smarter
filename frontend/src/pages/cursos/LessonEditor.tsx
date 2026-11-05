import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  MonitorPlay,
  FileText,
  Video,
  Link as LinkIcon,
  Image as ImageIcon,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { ConfirmModal } from "@/components/ConfirmModal";
import { NumberField } from "@/components/ui/number-field";
import { DropdownSelect } from "@/components/ui/dropdown-select";
import {
  listLessons,
  updateLesson,
  addMaterial,
  uploadMaterial,
  removeMaterial,
  updateQuiz,
  type CourseLesson,
  type CourseQuiz,
  type LessonMaterial,
} from "@/services/cursos";
import { QuestionsEditor } from "./QuestionsEditor";

const MATERIAL_ICONS: Record<string, typeof MonitorPlay> = {
  youtube: MonitorPlay,
  video_url: Video,
  video_upload: Video,
  document: FileText,
  image: ImageIcon,
  link: LinkIcon,
  text: FileText,
};

export function LessonEditor({
  courseId,
  lessonId,
  quiz,
  onChanged,
}: {
  courseId: string;
  lessonId: string;
  quiz?: CourseQuiz;
  onChanged: () => void;
}) {
  const [lesson, setLesson] = useState<CourseLesson | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  // Modal para añadir material por enlace (YouTube o enlace externo).
  const [linkModal, setLinkModal] = useState<"youtube" | "link" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => {
    setLoading(true);
    listLessons(courseId)
      .then((all) => setLesson(all.find((l) => l.id === lessonId) ?? null))
      .finally(() => setLoading(false));
  };

  useEffect(load, [courseId, lessonId]);

  const patchLesson = async (patch: Partial<CourseLesson>) => {
    if (!lesson) return;
    const updated = await updateLesson(courseId, lesson.id, patch);
    setLesson(updated);
    onChanged();
  };

  const handleAddLinkMaterial = async (title: string, url: string) => {
    const type = linkModal === "youtube" ? "youtube" : "link";
    const updated = await addMaterial(courseId, lessonId, {
      type,
      title: title.trim() || (type === "youtube" ? "Video" : "Enlace"),
      url: url.trim(),
    });
    setLesson(updated);
    onChanged();
    setLinkModal(null);
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const updated = await uploadMaterial(courseId, lessonId, file, { title: file.name });
      setLesson(updated);
      onChanged();
      toast.success("Material subido");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "No se pudo subir el archivo");
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveMaterial = async (materialId: string) => {
    const updated = await removeMaterial(courseId, lessonId, materialId);
    setLesson(updated);
    onChanged();
  };

  if (loading || !lesson) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-5 space-y-5 max-w-3xl">
      {/* Datos de la clase */}
      <div className="space-y-2">
        <input
          value={lesson.title}
          onChange={(e) => setLesson({ ...lesson, title: e.target.value })}
          onBlur={() => patchLesson({ title: lesson.title })}
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-base font-semibold focus:outline-none focus:border-brand-300"
        />
        <textarea
          value={lesson.description ?? ""}
          onChange={(e) => setLesson({ ...lesson, description: e.target.value })}
          onBlur={() => patchLesson({ description: lesson.description })}
          rows={2}
          placeholder="Descripción de la clase (opcional)"
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm resize-none focus:outline-none focus:border-brand-300"
        />
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            Estado:
            <DropdownSelect
              className="w-32"
              value={lesson.status}
              onChange={(v) => patchLesson({ status: v })}
              options={[
                { value: "draft", label: "Borrador" },
                { value: "published", label: "Publicada" },
              ]}
            />
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            Tiempo mín. en material (s):
            <NumberField
              className="w-24"
              decimals={0}
              min={0}
              value={lesson.minSecondsBeforeQuiz}
              onChange={(v) => setLesson({ ...lesson, minSecondsBeforeQuiz: v ?? 0 })}
              onCommit={(v) => patchLesson({ minSecondsBeforeQuiz: v ?? 0 })}
            />
          </div>
        </div>
      </div>

      {/* Material */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase">Material didáctico</h4>
          <div className="flex items-center gap-1">
            <MaterialButton icon={MonitorPlay} label="YouTube" onClick={() => setLinkModal("youtube")} />
            <MaterialButton icon={LinkIcon} label="Enlace" onClick={() => setLinkModal("link")} />
            <MaterialButton
              icon={Upload}
              label={uploading ? "Subiendo…" : "Archivo / Video"}
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            />
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept="video/*,image/*,application/pdf,.doc,.docx,.ppt,.pptx"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
                e.target.value = "";
              }}
            />
          </div>
        </div>

        {lesson.materials.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-5 border border-dashed border-border rounded-lg">
            Añade videos de YouTube, videos propios, PDFs o enlaces de lectura.
          </p>
        ) : (
          <div className="space-y-1.5">
            {lesson.materials.map((m) => (
              <MaterialRow key={m.id} material={m} onRemove={() => setConfirmDel(m.id)} />
            ))}
          </div>
        )}
      </div>

      {/* Evaluación de la clase */}
      {quiz && <LessonQuizConfig courseId={courseId} quiz={quiz} onChanged={onChanged} />}

      <ConfirmModal
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={() => {
          if (confirmDel) return handleRemoveMaterial(confirmDel);
        }}
        title="Quitar material"
        description="Se eliminará este material de la clase."
        confirmLabel="Quitar"
        variant="warning"
      />

      {linkModal && (
        <AddLinkModal
          kind={linkModal}
          onClose={() => setLinkModal(null)}
          onSubmit={handleAddLinkMaterial}
        />
      )}
    </div>
  );
}

function AddLinkModal({
  kind,
  onClose,
  onSubmit,
}: {
  kind: "youtube" | "link";
  onClose: () => void;
  onSubmit: (title: string, url: string) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const isYoutube = kind === "youtube";
  const valid = url.trim().length > 0;

  const handleSubmit = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      await onSubmit(title, url);
    } catch {
      toast.error("No se pudo añadir el material");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-card text-card-foreground rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">
            {isYoutube ? "Añadir video de YouTube" : "Añadir enlace"}
          </h3>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">
              {isYoutube ? "Enlace de YouTube" : "URL del enlace"}
            </label>
            <input
              type="url"
              autoFocus
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && valid && handleSubmit()}
              placeholder={isYoutube ? "https://www.youtube.com/watch?v=..." : "https://..."}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">
              Título <span className="text-muted-foreground font-normal">(opcional)</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && valid && handleSubmit()}
              placeholder={isYoutube ? "Video de la clase" : "Material de lectura"}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200"
            />
          </div>
        </div>
        <div className="px-5 py-4 border-t border-border flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!valid || saving}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-xs font-medium transition-colors disabled:opacity-50"
          >
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            Añadir
          </button>
        </div>
      </div>
    </div>
  );
}

function MaterialButton({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: typeof MonitorPlay;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-border text-[11px] font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function MaterialRow({ material, onRemove }: { material: LessonMaterial; onRemove: () => void }) {
  const Icon = MATERIAL_ICONS[material.type] || FileText;
  return (
    <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-border bg-card">
      <div className="h-8 w-8 rounded-lg bg-brand-50 dark:bg-brand-500/15 flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-brand-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{material.title}</p>
        {material.url && (
          <a
            href={material.url}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-brand-600 hover:underline truncate block"
          >
            {material.url}
          </a>
        )}
      </div>
      {material.required && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">Obligatorio</span>
      )}
      <button onClick={onRemove} className="p-1 text-muted-foreground hover:text-red-600">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function LessonQuizConfig({
  courseId,
  quiz,
  onChanged,
}: {
  courseId: string;
  quiz: CourseQuiz;
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState(quiz);
  const [saving, setSaving] = useState(false);

  const save = async (patch: Partial<CourseQuiz>) => {
    setSaving(true);
    try {
      const updated = await updateQuiz(courseId, quiz.id, patch);
      setDraft(updated);
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 pt-4 border-t border-border">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase">Evaluación de la clase</h4>
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Labeled label="Tiempo total (s)">
          <NumberField
            decimals={0}
            min={0}
            value={draft.totalTimeLimitSec}
            placeholder="Sin límite"
            onChange={(v) => setDraft({ ...draft, totalTimeLimitSec: v })}
            onCommit={(v) => save({ totalTimeLimitSec: v })}
          />
        </Labeled>
        <Labeled label="Aprobación (%)">
          <NumberField
            decimals={0}
            min={0}
            max={100}
            value={draft.passingScore}
            onChange={(v) => setDraft({ ...draft, passingScore: v ?? 0 })}
            onCommit={(v) => save({ passingScore: v ?? 0 })}
          />
        </Labeled>
        <Labeled label="Peso en curso">
          <NumberField
            min={0}
            value={draft.weightInCourse}
            onChange={(v) => setDraft({ ...draft, weightInCourse: v ?? 0 })}
            onCommit={(v) => save({ weightInCourse: v ?? 0 })}
          />
        </Labeled>
        <Labeled label="Intentos">
          <NumberField
            decimals={0}
            min={1}
            value={draft.maxAttempts}
            onChange={(v) => setDraft({ ...draft, maxAttempts: v ?? 1 })}
            onCommit={(v) => save({ maxAttempts: v ?? 1 })}
          />
        </Labeled>
      </div>

      <div className="flex items-center gap-4 flex-wrap text-[11px] text-muted-foreground">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={draft.shuffleQuestions}
            onChange={(e) => save({ shuffleQuestions: e.target.checked })}
          />
          Barajar preguntas
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={draft.shuffleOptions}
            onChange={(e) => save({ shuffleOptions: e.target.checked })}
          />
          Barajar opciones
        </label>
        <div className="flex items-center gap-2">
          Activa:
          <DropdownSelect
            className="w-32"
            value={draft.status}
            onChange={(v) => save({ status: v })}
            options={[
              { value: "draft", label: "Borrador" },
              { value: "active", label: "Activa" },
            ]}
          />
        </div>
      </div>

      <QuestionsEditor courseId={courseId} quizId={quiz.id} />
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
