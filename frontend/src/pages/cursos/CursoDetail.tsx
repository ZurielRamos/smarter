import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Loader2,
  ArrowLeft,
  BookOpen,
  GraduationCap,
  Users,
  Trophy,
  Settings as SettingsIcon,
  Award,
  Rocket,
  Link as LinkIcon,
  Copy,
} from "lucide-react";
import { ConfirmModal } from "@/components/ConfirmModal";
import {
  getCurso,
  updateCurso,
  deleteCurso,
  publishCurso,
  archiveCurso,
  type Course,
} from "@/services/cursos";
import { LessonsTab } from "./tabs/LessonsTab";
import { FinalExamTab } from "./tabs/FinalExamTab";
import { EnrollmentsTab } from "./tabs/EnrollmentsTab";
import { RankingTab } from "./tabs/RankingTab";
import { SettingsTab } from "./tabs/SettingsTab";
import { CertificateTab } from "./tabs/CertificateTab";
import headerBg from "@/assets/header-background.jpg";

function statusLabel(status: string) {
  return { active: "Activo", draft: "Borrador", archived: "Archivado" }[status] || status;
}

type TabKey = "lessons" | "final" | "enrollments" | "ranking" | "certificate" | "settings";

const TABS: { key: TabKey; label: string; icon: typeof BookOpen }[] = [
  { key: "lessons", label: "Clases", icon: BookOpen },
  { key: "final", label: "Examen final", icon: GraduationCap },
  { key: "enrollments", label: "Inscripciones", icon: Users },
  { key: "ranking", label: "Ranking", icon: Trophy },
  { key: "certificate", label: "Certificado", icon: Award },
  { key: "settings", label: "Ajustes", icon: SettingsIcon },
];

export function CursoDetail() {
  const { slug, courseId } = useParams();
  const navigate = useNavigate();

  const [curso, setCurso] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>("lessons");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    if (!courseId) return;
    getCurso(courseId)
      .then(setCurso)
      .catch(() => toast.error("No se pudo cargar el curso"))
      .finally(() => setLoading(false));
  }, [courseId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handlePublish = async () => {
    if (!curso) return;
    setBusy(true);
    try {
      const updated = await publishCurso(curso.id);
      setCurso(updated);
      toast.success("Curso publicado. Ya puedes inscribir participantes");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "No se pudo publicar");
    } finally {
      setBusy(false);
    }
  };

  const handleArchive = async () => {
    if (!curso) return;
    setBusy(true);
    try {
      const updated = await archiveCurso(curso.id);
      setCurso(updated);
      toast.success("Curso archivado");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!curso) return;
    await deleteCurso(curso.id);
    toast.success("Curso eliminado");
    navigate(`/${slug}/cursos`);
  };

  const publicUrl = curso?.slug ? `${window.location.origin}/c/${curso.slug}` : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!curso) return null;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Hero */}
      <div
        className="px-5 pt-3 pb-3 shrink-0 rounded-b-2xl"
        style={{ backgroundImage: `url(${headerBg})`, backgroundSize: "cover", backgroundPosition: "center" }}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => navigate(`/${slug}/cursos`)}
              className="p-1.5 rounded-lg hover:bg-white/10 text-white transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-white truncate">{curso.name}</h1>
              <p className="text-brand-300 mt-0.5 text-sm capitalize">{statusLabel(curso.status)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {publicUrl && (
              <button
                onClick={() => {
                  navigator.clipboard.writeText(publicUrl);
                  toast.success("Enlace copiado");
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors"
                title={publicUrl}
              >
                <LinkIcon className="h-4 w-4" />
                Enlace público
                <Copy className="h-3.5 w-3.5" />
              </button>
            )}
            {curso.status !== "active" ? (
              <button
                onClick={handlePublish}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                Publicar
              </button>
            ) : (
              <button
                onClick={handleArchive}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-50"
              >
                Archivar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-6 border-b border-border shrink-0 flex items-center gap-1 overflow-x-auto">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`inline-flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === key
                ? "border-brand-600 text-brand-700 dark:text-brand-300"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === "lessons" && <LessonsTab courseId={curso.id} />}
        {tab === "final" && <FinalExamTab courseId={curso.id} />}
        {tab === "enrollments" && <EnrollmentsTab course={curso} />}
        {tab === "ranking" && <RankingTab courseId={curso.id} />}
        {tab === "certificate" && (
          <CertificateTab
            course={curso}
            onChange={(patch) =>
              updateCurso(curso.id, patch).then((u) => {
                setCurso(u);
                toast.success("Certificado guardado");
              })
            }
          />
        )}
        {tab === "settings" && (
          <SettingsTab
            course={curso}
            onChange={(patch) =>
              updateCurso(curso.id, patch).then((u) => {
                setCurso(u);
                toast.success("Ajustes guardados");
              })
            }
            onCourseUpdated={setCurso}
            onDelete={() => setConfirmDelete(true)}
          />
        )}
      </div>

      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title="Eliminar curso"
        description="Se eliminarán el curso, sus clases, preguntas e inscripciones. Esta acción no se puede deshacer."
        confirmLabel="Eliminar curso"
        variant="danger"
        verificationText="ELIMINAR"
        verificationPlaceholder="Escribe ELIMINAR"
      />
    </div>
  );
}
