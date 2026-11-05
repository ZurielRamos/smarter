import { useEffect, useState } from "react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  Loader2,
  GraduationCap,
  PlayCircle,
  FileText,
  CheckCircle2,
  Clock,
  Trophy,
  ArrowLeft,
  ArrowRight,
  Lock,
  Award,
} from "lucide-react";
import {
  getPublicCourse,
  startAttempt,
  submitAttempt,
  markMaterialWatched,
  issueCourseCertificate,
} from "@/services/cursos";
import { YouTubePlayer } from "./YouTubePlayer";
import { CertificateModal, type CertificateData } from "./CertificateCanvas";

export interface PublicLessonMaterial {
  id: string;
  type: string;
  title: string;
  url?: string;
  content?: string;
  required?: boolean;
}
export interface PublicQuizMeta {
  id: string;
  kind: string;
  title: string | null;
  totalTimeLimitSec: number | null;
  passingScore: number;
  maxAttempts: number;
  usedAttempts?: number;
  attemptsLeft?: number;
  bestPercentage?: number | null;
  passed?: boolean;
  presented?: boolean;
}
export interface PublicLesson {
  id: string;
  title: string;
  description: string | null;
  order: number;
  minSecondsBeforeQuiz: number;
  materials: PublicLessonMaterial[];
  quiz: PublicQuizMeta | null;
}
export interface PublicData {
  course: {
    id: string;
    name: string;
    description: string | null;
    coverUrl: string | null;
    slug: string;
    tenantSlug: string | null;
    theme: { primary?: string; background?: string } | null;
    collectDataAt: "start" | "end";
    publishLeaderboard: boolean;
    verification: { enabled: boolean; channel: "email" | "phone" | "both" };
  };
  lessons: PublicLesson[];
  finalExam: PublicQuizMeta | null;
  enrollment: {
    id: string;
    accessToken: string;
    status: string;
    weightedScore: number;
    rank: number | null;
    hasParticipantData: boolean;
  } | null;
  certificate: {
    id: string;
    serial: string;
    participantName: string;
    courseName: string;
    tenantName: string;
    score: number;
    rank: number | null;
    config?: import("@/services/cursos").CourseCertificateConfig | null;
    issuedAt: string;
  } | null;
  progress: Array<{
    lessonId: string;
    status: string;
    quizScore: number | null;
    attemptsUsed: number;
    watchedMaterials: string[];
  }>;
}

/** Vista dentro del runner, controlada por la URL desde el portal. */
export type RunnerView =
  | { kind: "list" }
  | { kind: "final" }
  | { kind: "lesson"; lessonId: string }
  | { kind: "lesson-quiz"; lessonId: string };

/**
 * Runner del curso. La vista activa (lista / clase / evaluación / examen) la
 * controla el contenedor vía la prop `view` (derivada de la URL), y los cambios
 * de vista se piden con `onNavigate`, de modo que toda la navegación vive en la
 * URL y sobrevive a recargas. `onBack` vuelve al portal (lista de cursos).
 */
export function CourseRunner({
  slug,
  accessToken,
  embedded,
  onBack,
  view = { kind: "list" },
  onNavigate,
  themePrimary,
  themeOnPrimary,
}: {
  slug: string;
  accessToken: string;
  embedded?: boolean;
  onBack?: () => void;
  view?: RunnerView;
  onNavigate?: (v: RunnerView) => void;
  /** Tema del portal; tiene prioridad sobre el tema propio del curso. */
  themePrimary?: string;
  themeOnPrimary?: string;
}) {
  const [data, setData] = useState<PublicData | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  const go = (v: RunnerView) => {
    onNavigate?.(v);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const reload = () =>
    getPublicCourse(slug, accessToken)
      .then((d: PublicData) => {
        setData(d);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, accessToken]);

  // El tema del portal tiene prioridad; si no se provee, se usa el del curso.
  const primary = themePrimary || data?.course.theme?.primary || "#0f766e";
  const onPrimary = themeOnPrimary || "#ffffff";

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (status === "error" || !data) {
    return (
      <div className="text-center py-16">
        <GraduationCap className="h-8 w-8 text-slate-300 mx-auto mb-2" />
        <p className="text-sm text-slate-600">No se pudo cargar el curso.</p>
        {onBack && (
          <button onClick={onBack} className="mt-3 text-sm font-medium" style={{ color: primary }}>
            Volver
          </button>
        )}
      </div>
    );
  }

  const progressByLesson = new Map(data.progress.map((p) => [p.lessonId, p]));

  // Resuelve la vista de la URL a datos concretos. Si la clase/evaluación de la
  // URL no existe, cae a la lista.
  const lessonId = view.kind === "lesson" || view.kind === "lesson-quiz" ? view.lessonId : null;
  const activeLesson = lessonId ? data.lessons.find((l) => l.id === lessonId) ?? null : null;
  const activeQuiz: PublicQuizMeta | null =
    view.kind === "final"
      ? data.finalExam
      : view.kind === "lesson-quiz"
        ? activeLesson?.quiz ?? null
        : null;

  let content: React.ReactNode;
  if (activeQuiz) {
    content = (
      <QuizRunner
        slug={slug}
        token={accessToken}
        quiz={activeQuiz}
        primary={primary}
        onPrimary={onPrimary}
        onFinish={async () => {
          const wasFinal = activeQuiz.kind === "final_exam";
          await reload();
          // Tras una evaluación de clase, volvemos a la clase; tras el final, a la lista.
          go(wasFinal || !activeLesson ? { kind: "list" } : { kind: "lesson", lessonId: activeLesson.id });
        }}
      />
    );
  } else if (activeLesson) {
    content = (
      <LessonDetail
        lesson={activeLesson}
        progress={progressByLesson.get(activeLesson.id)}
        primary={primary}
        onPrimary={onPrimary}
        slug={slug}
        token={accessToken}
        onBack={() => go({ kind: "list" })}
        onProgress={() => reload()}
        onStartQuiz={() => go({ kind: "lesson-quiz", lessonId: activeLesson.id })}
      />
    );
  } else {
    content = (
      <CourseOverview
        data={data}
        primary={primary}
        onPrimary={onPrimary}
        slug={slug}
        token={accessToken}
        onCertificateIssued={() => reload()}
        onBack={onBack}
        onOpenLesson={(id) => go({ kind: "lesson", lessonId: id })}
        onStartFinal={() => go({ kind: "final" })}
      />
    );
  }

  if (embedded) return <div>{content}</div>;

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6">{content}</main>
    </div>
  );
}

/** Vista principal del curso: título + progreso + lista de clases (filas) + examen. */
function CourseOverview({
  data,
  primary,
  onPrimary = "#ffffff",
  slug,
  token,
  onCertificateIssued,
  onBack,
  onOpenLesson,
  onStartFinal,
}: {
  data: PublicData;
  primary: string;
  onPrimary?: string;
  slug: string;
  token: string;
  onCertificateIssued: () => void;
  onBack?: () => void;
  onOpenLesson: (lessonId: string) => void;
  onStartFinal: (q: PublicQuizMeta) => void;
}) {
  const progressByLesson = new Map(data.progress.map((p) => [p.lessonId, p]));
  const completedCount = data.progress.filter((p) => p.status === "quiz_completed").length;
  const total = data.lessons.length;
  const allLessonsDone = total > 0 && completedCount >= total;

  return (
    <div className="space-y-4">
      {/* En desktop (fuera de la portada) el volver va como enlace; en mobile
          flota sobre la imagen (más abajo). */}
      {onBack && (
        <button
          onClick={onBack}
          className="hidden sm:inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a cursos
        </button>
      )}

      {/* Portada / título del curso. En mobile: imagen completa 16:9 a sangre
          (full-bleed: anula el padding lateral del contenedor). En desktop:
          dentro de una tarjeta redondeada. */}
      <div className="overflow-hidden ring-slate-900/5 bg-white -mx-4 sm:mx-0 sm:rounded-2xl sm:ring-1">
        <div className="relative aspect-[16/9] sm:aspect-auto sm:h-32" style={{ backgroundColor: primary }}>
          {data.course.coverUrl ? (
            <img src={data.course.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <GraduationCap className="h-10 w-10 text-white/30" />
            </div>
          )}

          {/* Degradado + título sobre la imagen. No captura clics. */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent pointer-events-none" />
          <div className="absolute inset-x-0 bottom-0 p-4 pointer-events-none">
            <div className="text-white">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-white/80">
                <GraduationCap className="h-3.5 w-3.5" /> Capacitación
              </div>
              <h1 className="text-xl font-bold leading-tight drop-shadow">{data.course.name}</h1>
            </div>
          </div>

          {/* Botón volver flotante (solo mobile). Va al final para quedar por
              encima del degradado y recibir el clic. */}
          {onBack && (
            <button
              onClick={onBack}
              aria-label="Volver a cursos"
              className="sm:hidden absolute top-3 left-3 z-10 h-10 w-10 rounded-full bg-black/40 backdrop-blur-sm text-white flex items-center justify-center hover:bg-black/55 transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
        </div>
        <div className="p-4 space-y-2.5">
          {data.course.description && <p className="text-sm text-slate-600">{data.course.description}</p>}
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-700">
              {completedCount} de {total} clases completadas
            </p>
            {data.enrollment?.rank != null && (
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                style={{ backgroundColor: primary, color: onPrimary }}
              >
                <Trophy className="h-3.5 w-3.5" /> Puesto #{data.enrollment.rank}
              </span>
            )}
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${total ? (completedCount / total) * 100 : 0}%`, backgroundColor: primary }}
            />
          </div>
        </div>
      </div>

      {/* Lista de clases (solo filas, llevan al detalle) */}
      <div className="rounded-2xl overflow-hidden ring-1 ring-slate-900/5 bg-white divide-y divide-slate-100">
        <div className="px-5 py-3">
          <h2 className="text-xs font-semibold text-slate-500 uppercase">Clases</h2>
        </div>
        {data.lessons.map((lesson, i) => {
          const p = progressByLesson.get(lesson.id);
          const done = p?.status === "quiz_completed";
          // Progresión secuencial: una clase se habilita solo cuando TODAS las
          // anteriores están completadas. La primera siempre está habilitada.
          const prevDone = data.lessons
            .slice(0, i)
            .every((l) => progressByLesson.get(l.id)?.status === "quiz_completed");
          const locked = !prevDone;

          return (
            <button
              key={lesson.id}
              onClick={() => !locked && onOpenLesson(lesson.id)}
              disabled={locked}
              className={`w-full flex items-center gap-3 px-5 py-4 text-left transition-colors ${
                locked ? "opacity-60 cursor-not-allowed" : "hover:bg-slate-50"
              }`}
            >
              <div
                className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold shrink-0"
                style={{
                  backgroundColor: done ? "#16a34a" : locked ? "#cbd5e1" : primary,
                  color: done || locked ? "#fff" : onPrimary,
                }}
              >
                {done ? <CheckCircle2 className="h-4 w-4" /> : locked ? <Lock className="h-3.5 w-3.5" /> : i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold truncate ${locked ? "text-slate-400" : "text-slate-800"}`}>
                  {lesson.title}
                </p>
                <p className="text-xs text-slate-500">
                  {locked
                    ? "Completa la clase anterior para desbloquear"
                    : `${lesson.materials.length} material${lesson.materials.length === 1 ? "" : "es"}${
                        lesson.quiz ? " · con evaluación" : ""
                      }`}
                </p>
              </div>
              {done ? (
                <span className="text-[11px] text-green-600 font-medium shrink-0">Completada</span>
              ) : locked ? (
                <Lock className="h-4 w-4 text-slate-300 shrink-0" />
              ) : (
                <ArrowRight className="h-4 w-4 text-slate-400 shrink-0" />
              )}
            </button>
          );
        })}
      </div>

      {/* Examen final */}
      {data.finalExam &&
        (() => {
          const fe = data.finalExam;
          const presented = !!fe.presented;
          const attemptsLeft = fe.attemptsLeft ?? fe.maxAttempts;
          const exhausted = attemptsLeft <= 0;

          // Estado APROBADO: tarjeta de celebración.
          if (presented && fe.passed) {
            return (
              <div className="rounded-2xl ring-1 ring-green-200 bg-green-50/60 p-5">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-2xl bg-green-500 flex items-center justify-center text-white shrink-0">
                    <Award className="h-6 w-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-bold text-green-800">¡Examen final aprobado!</h3>
                    <p className="text-sm text-green-700">
                      Completaste <span className="font-semibold">{data.course.name}</span>.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-4">
                  <div className="rounded-xl bg-white/70 ring-1 ring-green-200 p-3 text-center">
                    <p className="text-[11px] text-green-700/80">Tu calificación</p>
                    <p className="text-xl font-bold text-green-800">
                      {fe.bestPercentage != null ? `${fe.bestPercentage}%` : "—"}
                    </p>
                  </div>
                  <div className="rounded-xl bg-white/70 ring-1 ring-green-200 p-3 text-center">
                    <p className="text-[11px] text-green-700/80">Puesto en el ranking</p>
                    <p className="text-xl font-bold text-green-800 inline-flex items-center justify-center gap-1">
                      {data.enrollment?.rank != null ? (
                        <>
                          <Trophy className="h-4 w-4 text-yellow-500" /> #{data.enrollment.rank}
                        </>
                      ) : (
                        "—"
                      )}
                    </p>
                  </div>
                </div>

                {/* Certificado: generar si no existe, o verlo si ya está emitido. */}
                <CertificateBlock
                  slug={slug}
                  token={token}
                  certificate={data.certificate}
                  primary={primary}
                  onIssued={onCertificateIssued}
                />
              </div>
            );
          }

          return (
            <div className="rounded-2xl ring-1 ring-slate-900/5 bg-white p-5">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2">
                  <GraduationCap className="h-5 w-5" style={{ color: primary }} />
                  <h3 className="text-base font-semibold text-slate-800">{fe.title || "Examen final"}</h3>
                </div>
                {presented && !fe.passed && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-red-50 text-red-700">
                    No aprobado{fe.bestPercentage != null ? ` · ${fe.bestPercentage}%` : ""}
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-500 mb-3">
                {!allLessonsDone
                  ? "Completa todas las clases para habilitarlo."
                  : exhausted
                    ? presented
                      ? `No alcanzaste el puntaje de aprobación y usaste todos tus intentos (${fe.maxAttempts}).`
                      : "No quedan intentos disponibles."
                    : `Evaluación global del curso · ${attemptsLeft} intento${attemptsLeft === 1 ? "" : "s"} disponible${attemptsLeft === 1 ? "" : "s"}.`}
              </p>

              {exhausted ? (
                <div className="inline-flex items-center gap-1.5 text-sm text-slate-400">
                  <Lock className="h-4 w-4" /> Sin intentos disponibles
                </div>
              ) : (
                <button
                  onClick={() => onStartFinal(fe)}
                  disabled={!allLessonsDone}
                  style={{ backgroundColor: primary, color: onPrimary }}
                  className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-40 shadow-sm hover:brightness-110 transition-all"
                >
                  {presented ? "Reintentar examen final" : "Iniciar examen final"}
                </button>
              )}
            </div>
          );
        })()}
    </div>
  );
}

/**
 * Bloque de certificado dentro de la tarjeta de curso aprobado. Si aún no hay
 * certificado emitido, muestra un botón "Generar certificado"; una vez emitido
 * (o si ya existía), permite verlo/descargarlo.
 */
function CertificateBlock({
  slug,
  token,
  certificate,
  primary,
  onIssued,
}: {
  slug: string;
  token: string;
  certificate: PublicData["certificate"];
  primary: string;
  onIssued: () => void;
}) {
  const [issuing, setIssuing] = useState(false);
  const [preview, setPreview] = useState<CertificateData | null>(null);

  const generate = async () => {
    setIssuing(true);
    try {
      const cert = await issueCourseCertificate(slug, token);
      setPreview(cert);
      onIssued(); // refresca data para que el runner tenga el certificado
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "No se pudo generar el certificado");
    } finally {
      setIssuing(false);
    }
  };

  return (
    <div className="mt-4 pt-4 border-t border-green-200/70">
      {certificate ? (
        <button
          onClick={() => setPreview(certificate)}
          style={{ backgroundColor: primary }}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold shadow-sm hover:brightness-110 transition-all"
        >
          <Award className="h-4 w-4" /> Ver certificado
        </button>
      ) : (
        <button
          onClick={generate}
          disabled={issuing}
          style={{ backgroundColor: primary }}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50 shadow-sm hover:brightness-110 transition-all"
        >
          {issuing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Award className="h-4 w-4" />}
          Generar certificado
        </button>
      )}

      {preview && (
        <CertificateModal data={preview} fallbackAccent={primary} onClose={() => setPreview(null)} />
      )}
    </div>
  );
}

/** Detalle de una clase: material + evaluación. Vista separada de la lista. */
function LessonDetail({
  lesson,
  progress,
  primary,
  onPrimary = "#ffffff",
  slug,
  token,
  onBack,
  onProgress,
  onStartQuiz,
}: {
  lesson: PublicLesson;
  progress?: PublicData["progress"][number];
  primary: string;
  onPrimary?: string;
  slug: string;
  token: string;
  onBack: () => void;
  onProgress: () => void;
  onStartQuiz: (q: PublicQuizMeta) => void;
}) {
  const [watched, setWatched] = useState<Set<string>>(new Set(progress?.watchedMaterials ?? []));
  const done = progress?.status === "quiz_completed";
  const attemptsUsed = progress?.attemptsUsed ?? 0;

  const markWatched = async (materialId: string) => {
    if (watched.has(materialId)) return;
    setWatched((prev) => new Set(prev).add(materialId));
    try {
      const res = await markMaterialWatched(slug, token, lesson.id, materialId);
      if (res.lessonCompleted) {
        toast.success("Clase completada");
        onProgress();
      }
    } catch {
      /* se reintenta al recargar */
    }
  };

  const hasQuiz = !!lesson.quiz;
  const requiredMaterials = lesson.materials.filter((m) => m.required);
  const targetMaterials = requiredMaterials.length > 0 ? requiredMaterials : lesson.materials;
  const canQuiz = targetMaterials.length === 0 || targetMaterials.every((m) => watched.has(m.id));
  const quizExhausted = lesson.quiz ? attemptsUsed >= lesson.quiz.maxAttempts : false;

  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      className="space-y-4"
    >
      <div className="-mx-4 sm:mx-0 ring-slate-900/5 bg-white p-5 sm:rounded-2xl sm:ring-1">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <button
              onClick={onBack}
              aria-label="Volver a las clases"
              className="h-8 w-8 shrink-0 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors -ml-1"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-slate-900">{lesson.title}</h1>
              {lesson.description && <p className="text-sm text-slate-500 mt-0.5">{lesson.description}</p>}
            </div>
          </div>
          {done && (
            <span className="inline-flex items-center gap-1 text-[11px] text-green-600 font-medium shrink-0 mt-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> Completada
            </span>
          )}
        </div>
      </div>

      <div className="space-y-3 -mt-4 sm:mt-0">
        {lesson.materials.map((m) => {
          // El video va "a sangre" (sin card); el resto de materiales sí van en card.
          const isVideo =
            m.type === "youtube" || m.type === "video_upload" || m.type === "video_url";
          return isVideo ? (
            <MaterialView
              key={m.id}
              material={m}
              watched={watched.has(m.id)}
              onWatched={() => markWatched(m.id)}
            />
          ) : (
            <div key={m.id} className="rounded-2xl ring-1 ring-slate-900/5 bg-white p-4">
              <MaterialView material={m} watched={watched.has(m.id)} onWatched={() => markWatched(m.id)} />
            </div>
          );
        })}
      </div>

      {/* Evaluación de la clase */}
      {hasQuiz && (
        <div className="rounded-2xl ring-1 ring-slate-900/5 bg-white p-5">
          {done ? (
            <p className="text-sm text-green-600 inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" /> Evaluación completada
            </p>
          ) : quizExhausted ? (
            <p className="text-sm text-slate-400">Sin intentos disponibles</p>
          ) : (
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={() => onStartQuiz(lesson.quiz!)}
                disabled={!canQuiz}
                style={{ backgroundColor: primary, color: onPrimary }}
                className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-40 shadow-sm hover:brightness-110 transition-all"
              >
                Iniciar evaluación
              </button>
              {!canQuiz && (
                <span className="text-xs text-slate-400 inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Revisa el material para continuar
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {!hasQuiz && (
        <div className="rounded-2xl ring-1 ring-slate-900/5 bg-white p-5">
          {done ? (
            <p className="text-sm text-green-600 inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" /> Clase completada
            </p>
          ) : (
            <p className="text-sm text-slate-400 inline-flex items-center gap-1.5">
              <Clock className="h-4 w-4" /> Revisa todo el material para completar la clase
            </p>
          )}
        </div>
      )}
    </motion.div>
  );
}

function MaterialView({
  material,
  watched,
  onWatched,
}: {
  material: PublicLessonMaterial;
  watched: boolean;
  onWatched: () => void;
}) {
  const badge = watched ? (
    <span className="inline-flex items-center gap-1 text-[11px] text-green-600 font-medium">
      <CheckCircle2 className="h-3.5 w-3.5" /> Visto
    </span>
  ) : null;

  if (material.type === "youtube" && material.url) {
    const id = extractYoutubeId(material.url);
    return (
      <div className="space-y-1.5">
        {/* Full-bleed en mobile para que el video ocupe todo el ancho. */}
        <div className="-mx-4 sm:mx-0">
          <YouTubePlayer videoId={id} onWatched={onWatched} />
        </div>
        <div className="flex items-center justify-between px-0.5">
          <span className="text-xs text-slate-500">{material.title}</span>
          {badge}
        </div>
      </div>
    );
  }
  if (material.type === "video_upload" || material.type === "video_url") {
    return (
      <div className="space-y-1.5">
        <div className="-mx-4 sm:mx-0">
          <video
            controls
            playsInline
            src={material.url}
            className="w-full aspect-video bg-black sm:rounded-xl"
            onEnded={onWatched}
            onTimeUpdate={(e) => {
              const v = e.currentTarget;
              if (v.duration > 0 && v.currentTime / v.duration >= 0.9) onWatched();
            }}
          />
        </div>
        <div className="flex items-center justify-between px-0.5">
          <span className="text-xs text-slate-500">{material.title}</span>
          {badge}
        </div>
      </div>
    );
  }
  if (material.type === "image") {
    return <img src={material.url} alt={material.title} className="w-full rounded-xl" onLoad={onWatched} />;
  }
  if (material.type === "text") {
    return (
      <div className="space-y-2">
        <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700 whitespace-pre-wrap">{material.content}</div>
        <WatchedToggle watched={watched} onWatched={onWatched} label="Marcar como leído" />
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <a
        href={material.url}
        target="_blank"
        rel="noreferrer"
        onClick={onWatched}
        className="flex items-center gap-2.5 rounded-xl border border-slate-200 px-4 py-3 hover:bg-slate-50"
      >
        {material.type === "link" ? (
          <PlayCircle className="h-5 w-5 text-slate-500" />
        ) : (
          <FileText className="h-5 w-5 text-slate-500" />
        )}
        <span className="text-sm text-slate-700 flex-1">{material.title}</span>
        {badge}
      </a>
      {!watched && <WatchedToggle watched={watched} onWatched={onWatched} label="Marcar como visto" />}
    </div>
  );
}

function WatchedToggle({ watched, onWatched, label }: { watched: boolean; onWatched: () => void; label: string }) {
  if (watched) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-green-600 font-medium">
        <CheckCircle2 className="h-3.5 w-3.5" /> Visto
      </span>
    );
  }
  return (
    <button
      onClick={onWatched}
      className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 hover:text-slate-800 border border-slate-200 rounded-lg px-2.5 py-1"
    >
      {label}
    </button>
  );
}

function extractYoutubeId(url: string): string {
  const m = url.match(/(?:youtu\.be\/|v=|embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : url;
}

// ─────────── Runner del quiz (reloj servidor + envío) ───────────

function QuizRunner({
  slug,
  token,
  quiz,
  primary,
  onPrimary = "#ffffff",
  onFinish,
}: {
  slug: string;
  token: string;
  quiz: PublicQuizMeta;
  primary: string;
  onPrimary?: string;
  onFinish: () => void;
}) {
  const [questions, setQuestions] = useState<any[] | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [starts, setStarts] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  // true cuando no quedan intentos (para mostrar una pantalla explicativa).
  const [noAttempts, setNoAttempts] = useState(false);

  useEffect(() => {
    startAttempt(slug, token, quiz.id)
      .then((res: any) => {
        setAttemptId(res.attemptId);
        setQuestions(res.questions);
        const now = Date.now();
        const s: Record<string, number> = {};
        res.questions.forEach((q: any) => (s[q.id] = now));
        setStarts(s);
      })
      .catch((err: any) => {
        const msg: string = err?.response?.data?.message || "No se pudo iniciar la evaluación";
        if (/intento/i.test(msg)) setNoAttempts(true);
        setError(msg);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setAnswer = (qid: string, value: any) => setAnswers((a) => ({ ...a, [qid]: value }));

  const submit = async () => {
    if (!attemptId || !questions) return;
    setSubmitting(true);
    try {
      const payload = questions.map((q) => ({
        questionId: q.id,
        answer: answers[q.id] ?? null,
        timeTakenSec: Math.round((Date.now() - (starts[q.id] || Date.now())) / 1000),
      }));
      const res = await submitAttempt(slug, token, attemptId, payload);
      setResult(res);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "No se pudo enviar");
    } finally {
      setSubmitting(false);
    }
  };

  if (noAttempts) {
    return (
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-900/5 p-8 text-center space-y-3">
        <div className="h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto">
          <Lock className="h-7 w-7 text-slate-400" />
        </div>
        <h2 className="text-lg font-semibold text-slate-900">Ya usaste todos tus intentos</h2>
        <p className="text-sm text-slate-500 max-w-sm mx-auto">
          Esta evaluación permite {quiz.maxAttempts} intento{quiz.maxAttempts === 1 ? "" : "s"} y ya lo
          {quiz.maxAttempts === 1 ? " completaste" : "s completaste"}. Tu calificación quedó registrada; no
          es posible volver a presentarla.
        </p>
        <div className="pt-1">
          <button
            onClick={onFinish}
            style={{ backgroundColor: primary, color: onPrimary }}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold shadow-sm hover:brightness-110 transition-all"
          >
            Volver al curso
          </button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-900/5 p-8 text-center space-y-3">
        <div className="h-14 w-14 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto">
          <Clock className="h-7 w-7 text-amber-500" />
        </div>
        <h2 className="text-lg font-semibold text-slate-900">No se puede iniciar la evaluación</h2>
        <p className="text-sm text-slate-500 max-w-sm mx-auto">{error}</p>
        <div className="pt-1">
          <button
            onClick={onFinish}
            style={{ backgroundColor: primary, color: onPrimary }}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold shadow-sm hover:brightness-110 transition-all"
          >
            Volver al curso
          </button>
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-900/5 p-6 text-center space-y-3">
        <div
          className="h-14 w-14 rounded-full flex items-center justify-center mx-auto text-white"
          style={{ backgroundColor: result.passed ? "#16a34a" : "#dc2626" }}
        >
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <h2 className="text-lg font-semibold text-slate-900">
          {result.expired ? "Tiempo agotado" : result.passed ? "¡Aprobado!" : "No aprobado"}
        </h2>
        {result.percentage != null && (
          <p className="text-sm text-slate-600">
            Puntaje: {result.score} / {result.maxScore} ({result.percentage}%)
          </p>
        )}
        <div className="pt-1">
          <button
            onClick={onFinish}
            style={{ backgroundColor: primary, color: onPrimary }}
            className="w-full py-2.5 rounded-xl text-sm font-semibold shadow-sm hover:brightness-110 transition-all"
          >
            Continuar
          </button>
        </div>
      </div>
    );
  }

  if (!questions) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-slate-900 px-1">{quiz.title || "Evaluación"}</h2>
      {questions.map((q, i) => (
        <QuestionInput key={q.id} index={i} question={q} value={answers[q.id]} onChange={(v) => setAnswer(q.id, v)} />
      ))}
      <button
        onClick={submit}
        disabled={submitting}
        style={{ backgroundColor: primary, color: onPrimary }}
        className="w-full py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2 shadow-sm hover:brightness-110 transition-all"
      >
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        Enviar respuestas
      </button>
    </div>
  );
}

function QuestionInput({
  index,
  question,
  value,
  onChange,
}: {
  index: number;
  question: any;
  value: any;
  onChange: (v: any) => void;
}) {
  const multi = question.type === "multiple_choice";
  const hasOptions = ["single_choice", "multiple_choice", "true_false", "ordering"].includes(question.type);

  const toggle = (optId: string) => {
    if (multi) {
      const arr: string[] = Array.isArray(value) ? value : [];
      onChange(arr.includes(optId) ? arr.filter((x) => x !== optId) : [...arr, optId]);
    } else {
      onChange(optId);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-900/5 p-5 space-y-3">
      <p className="text-sm font-medium text-slate-800">
        {index + 1}. {question.prompt}
        <span className="text-xs text-slate-400 font-normal ml-2">({question.points} pts)</span>
      </p>
      {question.mediaUrl && <img src={question.mediaUrl} alt="" className="rounded-lg max-h-48" />}

      {hasOptions ? (
        <div className="space-y-2">
          {question.options.map((o: any) => {
            const selected = multi ? Array.isArray(value) && value.includes(o.id) : value === o.id;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => toggle(o.id)}
                className={`w-full flex items-center gap-3 text-left px-3 py-2.5 rounded-xl border text-sm transition-colors ${
                  selected
                    ? "border-gray-900 bg-gray-900/5 font-medium text-gray-900"
                    : "border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                <span
                  className={`flex items-center justify-center shrink-0 h-5 w-5 border-2 ${
                    multi ? "rounded-md" : "rounded-full"
                  } ${selected ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300"}`}
                >
                  {selected && <CheckCircle2 className="h-3.5 w-3.5" />}
                </span>
                <span className="flex-1">{o.text}</span>
              </button>
            );
          })}
        </div>
      ) : question.type === "numeric" ? (
        <input
          type="text"
          inputMode="decimal"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.\-]/g, ""))}
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-slate-400"
        />
      ) : (
        <input
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-slate-400"
        />
      )}
    </div>
  );
}
