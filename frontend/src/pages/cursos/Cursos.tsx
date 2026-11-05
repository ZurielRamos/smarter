import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Plus, Loader2, GraduationCap, X, Users, Link as LinkIcon, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { listCursos, createCurso, type Course } from "@/services/cursos";
import headerBg from "@/assets/header-background.jpg";

const STATUS_STYLES: Record<string, string> = {
  active: "bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300",
  draft: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  archived: "bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-300",
};

function statusLabel(status: string) {
  return { active: "Activo", draft: "Borrador", archived: "Archivado" }[status] || status;
}

export function Cursos() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const tenantId = user?.tenantRoles.find((tr) => tr.tenant.slug === slug)?.tenantId || "";

  const [cursos, setCursos] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const fetchCursos = () => {
    if (!tenantId) return;
    setLoading(true);
    listCursos(tenantId)
      .then(setCursos)
      .catch(() => setCursos([]))
      .finally(() => setLoading(false));
  };

  useEffect(fetchCursos, [tenantId]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Hero */}
      <div
        className="px-8 pt-16 pb-4 shrink-0 rounded-b-2xl"
        style={{ backgroundImage: `url(${headerBg})`, backgroundSize: "cover", backgroundPosition: "center" }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Cursos</h1>
            <p className="text-brand-300 mt-0.5 text-sm">
              Crea cursos con clases, evaluaciones y ranking de participantes para tus campañas
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(`/${slug}/cursos/portal-config`)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-white/80 hover:bg-white/10 hover:text-white text-sm font-medium transition-colors"
            >
              <Settings2 className="h-4 w-4" />
              Configurar portal
            </button>
            <button
              onClick={() => {
                const url = `${window.location.origin}/academy/${slug}`;
                navigator.clipboard.writeText(url);
                toast.success("Enlace del portal copiado");
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-white/80 hover:bg-white/10 hover:text-white text-sm font-medium transition-colors"
              title={`${window.location.origin}/academy/${slug}`}
            >
              <LinkIcon className="h-4 w-4" />
              Portal público
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/15 hover:bg-white/25 text-white text-sm font-medium transition-colors"
            >
              <Plus className="h-4 w-4" />
              Nuevo curso
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : cursos.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-16">
            <div className="h-12 w-12 rounded-2xl bg-brand-50 dark:bg-brand-500/15 flex items-center justify-center mb-3">
              <GraduationCap className="h-6 w-6 text-brand-600" />
            </div>
            <h2 className="text-sm font-semibold text-foreground">Aún no hay cursos</h2>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">
              Crea tu primer curso: añade clases con material, preguntas ponderadas y un ranking para premiar a los mejores.
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-xs font-medium transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Nuevo curso
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {cursos.map((curso) => (
              <button
                key={curso.id}
                onClick={() => navigate(`/${slug}/cursos/${curso.id}`)}
                className="text-left rounded-xl border border-border bg-card hover:border-brand-300 transition-colors overflow-hidden group"
              >
                <div className="aspect-[16/9] bg-brand-900 relative overflow-hidden">
                  {curso.coverUrl ? (
                    <img src={curso.coverUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center">
                      <GraduationCap className="h-8 w-8 text-white/30" />
                    </div>
                  )}
                  <span
                    className={`absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      STATUS_STYLES[curso.status] || STATUS_STYLES.draft
                    }`}
                  >
                    {statusLabel(curso.status)}
                  </span>
                </div>
                <div className="p-3">
                  <p className="text-sm font-semibold text-foreground truncate">{curso.name}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5 min-h-[2rem]">
                    {curso.description || "Sin descripción"}
                  </p>
                  <div className="flex items-center gap-1.5 mt-2 text-[11px] text-muted-foreground">
                    <Users className="h-3 w-3" />
                    {curso.enrollmentCount} participantes
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateCursoModal
          tenantId={tenantId}
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            setShowCreate(false);
            fetchCursos();
            if (id) navigate(`/${slug}/cursos/${id}`);
          }}
        />
      )}

    </div>
  );
}

function CreateCursoModal({
  tenantId,
  onClose,
  onCreated,
}: {
  tenantId: string;
  onClose: () => void;
  onCreated: (id: string | null) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!name.trim() || !tenantId) {
      toast.error("Escribe un nombre para el curso");
      return;
    }
    setSaving(true);
    try {
      const curso = await createCurso({
        tenantId,
        name: name.trim(),
        description: description.trim() || undefined,
      });
      toast.success("Curso creado");
      onCreated(curso.id);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Error al crear el curso");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-card text-card-foreground rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Nuevo curso</h3>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Nombre</label>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && name.trim() && handleCreate()}
              placeholder="Ej: Programa de formación comercial"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">
              Descripción <span className="text-muted-foreground font-normal">(opcional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Breve descripción del curso"
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200 resize-none"
            />
          </div>
        </div>
        <div className="px-5 py-4 border-t border-border flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted">
            Cancelar
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || saving}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-xs font-medium transition-colors disabled:opacity-50"
          >
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            Crear curso
          </button>
        </div>
      </div>
    </div>
  );
}
