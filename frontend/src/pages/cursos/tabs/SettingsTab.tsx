import { useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Loader2, Trash2, Plus, X, Upload, Pencil, GraduationCap } from "lucide-react";
import { toast } from "sonner";
import { NumberField } from "@/components/ui/number-field";
import { DropdownSelect } from "@/components/ui/dropdown-select";
import { ImageCropper } from "@/components/ImageCropper";
import { uploadCursoCover, type Course, type CourseLevel, type CoursePrize } from "@/services/cursos";

// Proporción estándar para portadas de curso (16:9, como miniaturas de vídeo).
const COVER_ASPECT = 16 / 9;

export function SettingsTab({
  course,
  onChange,
  onCourseUpdated,
  onDelete,
}: {
  course: Course;
  onChange: (patch: Partial<Course>) => Promise<unknown>;
  /** Sincroniza el curso en el padre sin disparar un guardado (p. ej. tras subir la portada). */
  onCourseUpdated?: (course: Course) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState<Course>(course);
  const [saving, setSaving] = useState(false);

  // Portada del curso: subida con recorte 16:9.
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [cropperSrc, setCropperSrc] = useState<string | null>(null);
  const [cropperFileName, setCropperFileName] = useState("");
  const [uploadingCover, setUploadingCover] = useState(false);

  const onPickCover = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCropperSrc(URL.createObjectURL(file));
    setCropperFileName(file.name);
    e.target.value = "";
  };

  const onCoverCropped = async (cropped: File) => {
    setCropperSrc(null);
    setCropperFileName("");
    setUploadingCover(true);
    try {
      const updated = await uploadCursoCover(course.id, cropped);
      setDraft((d) => ({ ...d, coverUrl: updated.coverUrl }));
      onCourseUpdated?.(updated);
      toast.success("Imagen del curso actualizada");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "No se pudo subir la imagen");
    } finally {
      setUploadingCover(false);
    }
  };

  const settings = draft.settings ?? {};
  const ranking = draft.rankingConfig ?? {};

  const save = async () => {
    setSaving(true);
    try {
      await onChange({
        description: draft.description,
        settings: draft.settings,
        rankingConfig: draft.rankingConfig,
      });
      setDraft(draft);
    } finally {
      setSaving(false);
    }
  };

  const setSettings = (patch: Partial<typeof settings>) =>
    setDraft({ ...draft, settings: { ...settings, ...patch } });
  const setRanking = (patch: Partial<typeof ranking>) =>
    setDraft({ ...draft, rankingConfig: { ...ranking, ...patch } });

  const addPrize = () =>
    setRanking({ prizes: [...(ranking.prizes ?? []), { rank: (ranking.prizes?.length ?? 0) + 1, label: "Premio" }] });
  const updatePrize = (i: number, patch: Partial<CoursePrize>) =>
    setRanking({ prizes: (ranking.prizes ?? []).map((p, idx) => (idx === i ? { ...p, ...patch } : p)) });
  const removePrize = (i: number) =>
    setRanking({ prizes: (ranking.prizes ?? []).filter((_, idx) => idx !== i) });

  return (
    <div className="p-5 space-y-6 max-w-2xl">
      {/* General */}
      <Section title="General">
        <Labeled label="Imagen del curso">
          <div className="flex items-start gap-4">
            <button
              type="button"
              onClick={() => coverInputRef.current?.click()}
              disabled={uploadingCover}
              className="group relative w-40 shrink-0 rounded-xl border-2 border-dashed border-border hover:border-brand-400 overflow-hidden transition-all bg-muted/40 disabled:opacity-60"
              style={{ aspectRatio: String(COVER_ASPECT) }}
            >
              {uploadingCover ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : draft.coverUrl ? (
                <>
                  <img src={draft.coverUrl} alt="Portada" className="h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Pencil className="h-4 w-4 text-white" />
                  </div>
                </>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground group-hover:text-brand-500">
                  <GraduationCap className="h-5 w-5" />
                  <span className="text-[10px] font-medium">Sin imagen</span>
                </div>
              )}
            </button>
            <div className="min-w-0 pt-1">
              <button
                type="button"
                onClick={() => coverInputRef.current?.click()}
                disabled={uploadingCover}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-muted disabled:opacity-60"
              >
                <Upload className="h-3.5 w-3.5" />
                {draft.coverUrl ? "Cambiar imagen" : "Subir imagen"}
              </button>
              <p className="text-[11px] text-muted-foreground mt-1.5 max-w-[16rem]">
                Proporción 16:9 (recomendado 1280×720). La recortarás antes de subirla.
              </p>
            </div>
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              onChange={onPickCover}
              className="hidden"
            />
          </div>
        </Labeled>

        <Labeled label="Descripción">
          <textarea
            value={draft.description ?? ""}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            rows={2}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm resize-none focus:outline-none focus:border-brand-300"
          />
        </Labeled>

        <Labeled label="Nivel del curso">
          <div className="max-w-xs">
            <DropdownSelect
              value={settings.level ?? "basic"}
              onChange={(v) => setSettings({ level: v as CourseLevel })}
              options={[
                { value: "basic", label: "Básico" },
                { value: "intermediate", label: "Medio" },
                { value: "advanced", label: "Avanzado" },
                { value: "expert", label: "Experto" },
              ]}
            />
          </div>
        </Labeled>
      </Section>

      {/* Reglas */}
      <Section title="Reglas del curso">
        <div className="grid grid-cols-2 gap-3">
          <Labeled label="Aprobación del curso (%)">
            <NumberField
              decimals={0}
              min={0}
              max={100}
              value={settings.passingScore ?? 60}
              onChange={(v) => setSettings({ passingScore: v ?? 0 })}
            />
          </Labeled>
          <Labeled label="Pedir datos del participante">
            <DropdownSelect
              value={settings.collectDataAt ?? "start"}
              onChange={(v) => setSettings({ collectDataAt: v as "start" | "end" })}
              options={[
                { value: "start", label: "Al inicio" },
                { value: "end", label: "Al final" },
              ]}
            />
          </Labeled>
        </div>
        <div className="flex flex-col gap-2 pt-1">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={settings.allowOpenEnrollment ?? true}
              onChange={(e) => setSettings({ allowOpenEnrollment: e.target.checked })}
            />
            Inscripción abierta (cualquiera con el enlace puede inscribirse)
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={settings.requireSequential ?? true}
              onChange={(e) => setSettings({ requireSequential: e.target.checked })}
            />
            Obligar a completar las clases en orden
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={settings.allowReviewAfterSubmit ?? true}
              onChange={(e) => setSettings({ allowReviewAfterSubmit: e.target.checked })}
            />
            Permitir revisar respuestas tras enviar
          </label>
        </div>
      </Section>

      {/* Ranking */}
      <Section title="Ranking y premios">
        <div className="grid grid-cols-2 gap-3">
          <Labeled label="Métrica del ranking">
            <DropdownSelect
              value={ranking.metric ?? "weighted_score"}
              onChange={(v) => setRanking({ metric: v as typeof ranking.metric })}
              options={[
                { value: "weighted_score", label: "Puntaje ponderado" },
                { value: "total_score", label: "Puntaje total" },
                { value: "accuracy", label: "Precisión (% aciertos)" },
                { value: "completion_time", label: "Menor tiempo" },
              ]}
            />
          </Labeled>
          <Labeled label="Desempate">
            <DropdownSelect
              value={ranking.tieBreaker ?? "completion_time"}
              onChange={(v) => setRanking({ tieBreaker: v as typeof ranking.tieBreaker })}
              options={[
                { value: "completion_time", label: "Menor tiempo total" },
                { value: "earliest_finish", label: "Quien terminó antes" },
              ]}
            />
          </Labeled>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
          <input
            type="checkbox"
            checked={ranking.publishLeaderboard ?? false}
            onChange={(e) => setRanking({ publishLeaderboard: e.target.checked })}
          />
          Mostrar el ranking en el enlace público de los participantes
        </label>

        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground uppercase">Premios por posición</span>
            <button onClick={addPrize} className="text-[11px] text-brand-600 inline-flex items-center gap-1 hover:text-brand-500">
              <Plus className="h-3 w-3" /> Añadir premio
            </button>
          </div>
          {(ranking.prizes ?? []).map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <NumberField
                className="w-16 text-center"
                decimals={0}
                min={1}
                value={p.rank}
                onChange={(v) => updatePrize(i, { rank: v ?? 1 })}
              />
              <input
                value={p.label}
                onChange={(e) => updatePrize(i, { label: e.target.value })}
                placeholder="Premio"
                className="flex-1 px-2 py-1.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-brand-300"
              />
              <button onClick={() => removePrize(i)} className="p-1 text-muted-foreground hover:text-red-600">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </Section>

      <div className="flex items-center justify-between pt-2 border-t border-border">
        <button
          onClick={onDelete}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-red-600 text-xs font-medium hover:bg-red-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Eliminar curso
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-xs font-medium disabled:opacity-50"
        >
          {saving && <Loader2 className="h-3 w-3 animate-spin" />}
          Guardar ajustes
        </button>
      </div>

      {/* Cropper de la portada (recorte 16:9) */}
      <AnimatePresence>
        {cropperSrc && (
          <ImageCropper
            imageSrc={cropperSrc}
            fileName={cropperFileName}
            aspect={COVER_ASPECT}
            title="Recortar imagen del curso"
            onCropComplete={onCoverCropped}
            onCancel={() => {
              setCropperSrc(null);
              setCropperFileName("");
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase">{title}</h4>
      {children}
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-foreground mb-1">{label}</label>
      {children}
    </div>
  );
}
