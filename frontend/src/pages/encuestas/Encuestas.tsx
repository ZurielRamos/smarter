import { useEffect, useState } from "react";
import { useParams, useNavigate, Outlet } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Plus, Loader2, ClipboardList, X, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { listSurveys, listPublishedSurveyFlows, createSurvey, type SurveyItem } from "@/services/surveys";
import headerBg from "@/assets/header-background.jpg";

const STATUS_STYLES: Record<string, string> = {
  active: "bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300",
  draft: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  archived: "bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-300",
};

function statusLabel(status: string) {
  const map: Record<string, string> = {
    active: "Activa",
    draft: "Borrador",
    archived: "Archivada",
  };
  return map[status] || status;
}

export function Encuestas() {
  const { slug, surveyId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const tenantRole = user?.tenantRoles.find((tr: any) => tr.tenant.slug === slug);
  const tenantId = tenantRole?.tenantId || "";

  const [surveys, setSurveys] = useState<SurveyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  // IDs de encuestas realmente PUBLISHED en Meta (una sola llamada en lote).
  const [publishedIds, setPublishedIds] = useState<Set<string>>(new Set());

  const fetchSurveys = (): Promise<SurveyItem[]> => {
    if (!tenantId) return Promise.resolve([]);
    setLoading(true);
    return listSurveys(tenantId)
      .then((data) => {
        setSurveys(data);
        return data;
      })
      .catch(() => [] as SurveyItem[])
      .finally(() => setLoading(false));
  };

  // Estado de publicación en Meta de todas las encuestas, en UNA sola petición.
  const fetchPublished = () => {
    if (!tenantId) return;
    listPublishedSurveyFlows(tenantId)
      .then((flows) => setPublishedIds(new Set(flows.map((f) => f.id))))
      .catch(() => setPublishedIds(new Set()));
  };

  useEffect(() => {
    fetchSurveys();
    fetchPublished();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Hero */}
      <div
        className="px-8 pt-16 pb-3 shrink-0 rounded-b-2xl"
        style={{ backgroundImage: `url(${headerBg})`, backgroundSize: "cover", backgroundPosition: "center" }}
      >
        <div>
          <h1 className="text-xl font-bold text-white">Encuestas</h1>
          <p className="text-brand-300 mt-0.5 text-sm">
            Crea encuestas y recoge respuestas por enlace o WhatsApp
          </p>
        </div>
      </div>

      {/* Main layout */}
      <div className="flex-1 flex overflow-hidden mt-4 rounded-t-xl border border-border bg-card min-w-0">
        {/* Sidebar — lista de encuestas */}
        <div className="w-80 border-r border-border flex flex-col shrink-0">
          <div className="px-3 py-3 border-b border-border flex items-center justify-between">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase">Encuestas</h3>
            <button
              onClick={() => setShowCreate(true)}
              className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Nueva encuesta"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : surveys.length === 0 ? (
              <div className="px-3 py-8 text-center">
                <ClipboardList className="h-6 w-6 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">Sin encuestas</p>
                <p className="text-[10px] text-muted-foreground mt-1 mb-3">
                  Crea tu primera encuesta dinámica
                </p>
                <button
                  onClick={() => setShowCreate(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-[11px] font-medium transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  Nueva encuesta
                </button>
              </div>
            ) : (
              surveys.map((survey) => (
                <button
                  key={survey.id}
                  onClick={() => navigate(`/${slug}/encuestas/${survey.id}`)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors ${
                    surveyId === survey.id
                      ? "bg-brand-50 text-brand-700 dark:bg-brand-700 dark:text-brand-100"
                      : "text-foreground hover:bg-muted"
                  }`}
                >
                  <div className="h-7 w-7 rounded-lg bg-brand-50 dark:bg-brand-500/15 flex items-center justify-center shrink-0">
                    <ClipboardList className="h-3.5 w-3.5 text-brand-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{survey.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span
                        className={`text-[9px] px-1.5 py-0 rounded font-medium ${
                          STATUS_STYLES[survey.status] || STATUS_STYLES.draft
                        }`}
                      >
                        {statusLabel(survey.status)}
                      </span>
                      {survey.metaFlowId && (
                        publishedIds.has(survey.id) ? (
                          <span className="inline-flex items-center gap-0.5 text-[9px] text-green-600 font-medium" title="Publicada en WhatsApp (lista para plantillas)">
                            <MessageCircle className="h-2.5 w-2.5" /> WhatsApp
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 text-[9px] text-amber-600 font-medium" title="Vinculada a WhatsApp pero en borrador (no usable en plantillas)">
                            <MessageCircle className="h-2.5 w-2.5" /> Borrador
                          </span>
                        )
                      )}
                      <span className="text-[9px] text-muted-foreground">
                        {survey.responseCount} resp.
                      </span>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Panel de detalle */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {surveyId ? (
            <Outlet context={{ refreshSurveys: () => { fetchSurveys(); fetchPublished(); } }} />
          ) : (
            <EmptyState onCreate={() => setShowCreate(true)} />
          )}
        </div>
      </div>

      {showCreate && (
        <CreateSurveyModal
          tenantId={tenantId}
          onClose={() => setShowCreate(false)}
          onCreated={(createdId) => {
            setShowCreate(false);
            fetchSurveys();
            if (createdId) navigate(`/${slug}/encuestas/${createdId}`);
          }}
        />
      )}
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
      <div className="h-12 w-12 rounded-2xl bg-brand-50 dark:bg-brand-500/15 flex items-center justify-center mb-3">
        <ClipboardList className="h-6 w-6 text-brand-600" />
      </div>
      <h2 className="text-sm font-semibold text-foreground">Selecciona una encuesta</h2>
      <p className="text-xs text-muted-foreground mt-1 max-w-xs">
        Elige una encuesta de la lista para editar sus preguntas y ver resultados, o crea una nueva.
      </p>
      <button
        onClick={onCreate}
        className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-xs font-medium transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        Nueva encuesta
      </button>
    </div>
  );
}

// === Modal de creación: solo nombre, 100% local ===

function CreateSurveyModal({
  tenantId,
  onClose,
  onCreated,
}: {
  tenantId: string;
  onClose: () => void;
  onCreated: (surveyId: string | null) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!name.trim() || !tenantId) {
      toast.error("Escribe un nombre para la encuesta");
      return;
    }
    setSaving(true);
    try {
      const survey = await createSurvey({
        tenantId,
        name: name.trim(),
        description: description.trim() || undefined,
      });
      toast.success("Encuesta creada. Edítala en el constructor");
      onCreated(survey.id);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Error al crear la encuesta");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative bg-card text-card-foreground rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h3 className="text-sm font-semibold text-foreground">Nueva encuesta</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
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
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) handleCreate();
              }}
              placeholder="Ej: Satisfacción del cliente"
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
              placeholder="Breve descripción de la encuesta"
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200 resize-none"
            />
          </div>
          <p className="text-[11px] text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
            Se creará localmente con una pantalla de ejemplo. Luego podrás construir las preguntas,
            compartirla por enlace o publicarla como Flow de WhatsApp.
          </p>
        </div>

        <div className="px-5 py-4 border-t border-border flex items-center justify-end gap-2 shrink-0">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || saving}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            Crear encuesta
          </button>
        </div>
      </div>
    </div>
  );
}
