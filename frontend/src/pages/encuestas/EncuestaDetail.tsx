import { useEffect, useState } from "react";
import { useParams, useNavigate, useOutletContext } from "react-router-dom";
import {
  Loader2,
  ClipboardList,
  FileJson,
  BarChart3,
  Inbox,
  Share2,
  Trash2,
  Power,
  Archive,
  Copy,
  Check,
  MessageCircle,
  Link2,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  X,
  Palette,
  Settings,
  MapPin,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { FlowBuilder } from "@/components/flow-builder/FlowBuilder";
import { ConfirmModal } from "@/components/ConfirmModal";
import { describeSubmission } from "@/components/flow-builder/model";
import { groupMetaErrors } from "@/components/flow-builder/meta-errors";
import {
  WhatsAppInboxPicker,
  useWhatsAppInboxes,
} from "@/components/WhatsAppInboxPicker";
import { SurveyCrmMapping } from "./SurveyCrmMapping";
import { SurveyAppearance } from "./SurveyAppearance";
import { SurveySettings } from "./SurveySettings";
import {
  getSurvey,
  activateSurvey,
  archiveSurvey,
  deleteSurvey,
  getSurveyAnalytics,
  getSurveyResponses,
  publishSurveyToWhatsApp,
  unpublishSurveyFromWhatsApp,
  validateSurveyOnMeta,
  retrySurveySync,
  getSurveyWhatsAppStatus,
  getTenantMembers,
  getSurveyAgentLink,
  type SurveyItem,
  type SurveyAnalytics,
  type SurveyResponseItem,
  type MetaValidationError,
} from "@/services/surveys";

type Tab =
  | "constructor"
  | "apariencia"
  | "crm"
  | "configuracion"
  | "compartir"
  | "resultados"
  | "respuestas";

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

/** Fecha + hora en formato local (ej: "10/10/2026, 14:35"). */
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function EncuestaDetail() {
  const { slug, surveyId } = useParams();
  const navigate = useNavigate();
  const ctx = useOutletContext<{ refreshSurveys: () => void }>();
  const [survey, setSurvey] = useState<SurveyItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("constructor");
  const [busy, setBusy] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  // Estado real del Flow en Meta (DRAFT/PUBLISHED), compartido por el badge del
  // encabezado y el panel de WhatsApp para no duplicar llamadas a Meta.
  const [waFlowStatus, setWaFlowStatus] = useState<string | null>(null);

  const fetchSurvey = () => {
    if (!surveyId) return;
    setLoading(true);
    getSurvey(surveyId)
      .then((data) => setSurvey(data))
      .catch(() => setSurvey(null))
      .finally(() => setLoading(false));
  };

  // Consulta en Meta el estado del Flow cuando la encuesta está vinculada.
  const fetchWaStatus = () => {
    if (!surveyId) return;
    getSurveyWhatsAppStatus(surveyId)
      .then((res) => setWaFlowStatus(res.linked ? res.status : null))
      .catch(() => setWaFlowStatus(null));
  };

  useEffect(() => {
    fetchSurvey();
    setTab("constructor");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surveyId]);

  // Al cargar/cambiar la encuesta, refrescar el estado de Meta solo si está vinculada.
  useEffect(() => {
    if (survey?.metaFlowId) fetchWaStatus();
    else setWaFlowStatus(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [survey?.id, survey?.metaFlowId]);

  const refreshAll = () => {
    fetchSurvey();
    if (survey?.metaFlowId) fetchWaStatus();
    ctx?.refreshSurveys?.();
  };

  const handleActivate = async () => {
    if (!survey) return;
    setBusy(true);
    try {
      await activateSurvey(survey.id);
      toast.success("Encuesta activada. Ya puedes compartir el enlace");
      refreshAll();
      setTab("compartir");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "No se pudo activar");
    } finally {
      setBusy(false);
    }
  };

  const handleArchive = async () => {
    if (!survey) return;
    setBusy(true);
    try {
      await archiveSurvey(survey.id);
      toast.success("Encuesta archivada");
      refreshAll();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "No se pudo archivar");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!survey) return;
    try {
      await deleteSurvey(survey.id);
      toast.success("Encuesta eliminada");
      ctx?.refreshSurveys?.();
      navigate(`/${slug}/encuestas`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "No se pudo eliminar");
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!survey) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        Encuesta no encontrada
      </div>
    );
  }

  const tabs: { key: Tab; label: string; icon: any }[] = [
    { key: "constructor", label: "Constructor", icon: FileJson },
    { key: "apariencia", label: "Apariencia", icon: Palette },
    { key: "crm", label: "CRM", icon: Link2 },
    { key: "configuracion", label: "Configuración", icon: Settings },
    { key: "compartir", label: "Compartir", icon: Share2 },
    { key: "resultados", label: "Resultados", icon: BarChart3 },
    { key: "respuestas", label: "Respuestas", icon: Inbox },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-8 w-8 rounded-lg bg-brand-50 dark:bg-brand-500/15 flex items-center justify-center shrink-0">
            <ClipboardList className="h-4 w-4 text-brand-600" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground truncate">{survey.name}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <span
                className={`text-[9px] px-1.5 py-0 rounded font-medium ${
                  STATUS_STYLES[survey.status] || STATUS_STYLES.draft
                }`}
              >
                {statusLabel(survey.status)}
              </span>
              {survey.metaFlowId && (
                waFlowStatus === "PUBLISHED" ? (
                  <span className="flex items-center gap-0.5 text-[9px] text-green-600 font-medium">
                    <MessageCircle className="h-2.5 w-2.5" /> Publicada en WhatsApp
                  </span>
                ) : (
                  <span className="flex items-center gap-0.5 text-[9px] text-amber-600 font-medium">
                    <AlertTriangle className="h-2.5 w-2.5" /> Borrador en WhatsApp{waFlowStatus && waFlowStatus !== "PUBLISHED" ? ` (${waFlowStatus})` : ""}
                  </span>
                )
              )}
              {survey.metaFlowId && survey.metaSyncStatus === "out_of_sync" && (
                <span className="flex items-center gap-0.5 text-[9px] text-amber-600 font-medium">
                  <AlertTriangle className="h-2.5 w-2.5" /> No sincronizado con WhatsApp
                </span>
              )}
              <span className="text-[9px] text-muted-foreground">
                Creada el {formatDateTime(survey.createdAt)}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {survey.metaFlowId && survey.metaSyncStatus === "out_of_sync" && (
            <RetrySyncButton survey={survey} onDone={refreshAll} />
          )}
          {survey.status !== "active" && (
            <button
              onClick={handleActivate}
              disabled={busy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-xs font-medium transition-colors disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Power className="h-3 w-3" />}
              Activar
            </button>
          )}
          {survey.status === "active" && (
            <button
              onClick={handleArchive}
              disabled={busy}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              title="Archivar"
            >
              <Archive className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={() => setShowDelete(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-red-600 hover:border-red-200 transition-colors"
            title="Eliminar encuesta"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-5 border-b border-border flex items-center gap-1 shrink-0">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? "border-brand-600 text-brand-700 dark:text-brand-300"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {tab === "constructor" && <ConstructorTab survey={survey} onSaved={refreshAll} />}
        {tab === "apariencia" && (
          <div className="max-w-2xl">
            <SurveyAppearance survey={survey} onChanged={refreshAll} />
          </div>
        )}
        {tab === "crm" && <SurveyCrmMapping survey={survey} onSaved={refreshAll} />}
        {tab === "configuracion" && <SurveySettings survey={survey} onChanged={refreshAll} />}
        {tab === "compartir" && (
          <CompartirTab survey={survey} onActivate={handleActivate} onChanged={refreshAll} />
        )}
        {tab === "resultados" && <ResultadosTab surveyId={survey.id} />}
        {tab === "respuestas" && <RespuestasTab survey={survey} />}
      </div>

      <ConfirmModal
        open={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDelete}
        title="Eliminar encuesta"
        description="La encuesta y sus respuestas dejarán de estar disponibles. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        variant="danger"
      />
    </div>
  );
}

// === Botón de reintento de sincronización con Meta ===

function RetrySyncButton({ survey, onDone }: { survey: SurveyItem; onDone: () => void }) {
  const [retrying, setRetrying] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [errors, setErrors] = useState<MetaValidationError[]>(survey.metaSyncErrors || []);

  const retry = async () => {
    setRetrying(true);
    try {
      const res = await retrySurveySync(survey.id);
      if (res.metaSynced) {
        toast.success("Encuesta sincronizada con WhatsApp");
        onDone();
      } else {
        setErrors(res.metaErrors || []);
        setShowErrors(true);
        toast.error("Meta volvió a rechazar la sincronización");
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "No se pudo reintentar");
    } finally {
      setRetrying(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-1">
        <button
          onClick={retry}
          disabled={retrying}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-amber-300 text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 text-xs font-medium hover:bg-amber-100 transition-colors disabled:opacity-50"
          title="Reintentar sincronización con WhatsApp"
        >
          {retrying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Reintentar sync
        </button>
        {(survey.metaSyncErrors?.length || errors.length) > 0 && (
          <button
            onClick={() => {
              setErrors(survey.metaSyncErrors || errors);
              setShowErrors(true);
            }}
            className="px-2 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground transition-colors"
            title="Ver por qué no sincronizó"
          >
            Ver errores
          </button>
        )}
      </div>
      {showErrors && (
        <SyncErrorsModal errors={errors} onClose={() => setShowErrors(false)} />
      )}
    </>
  );
}

function SyncErrorsModal({
  errors,
  onClose,
}: {
  errors: MetaValidationError[];
  onClose: () => void;
}) {
  // Agrupar por ruta: cada grupo es UN problema, aunque Meta reporte varias
  // reglas para el mismo campo.
  const groups = groupMetaErrors(errors);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card text-card-foreground rounded-2xl shadow-xl w-full max-w-xl mx-4 max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-semibold">
              Por qué no sincronizó con WhatsApp{groups.length > 0 ? ` (${groups.length})` : ""}
            </h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
          {groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin detalle de errores.</p>
          ) : (
            groups.map((g, i) => (
              <div
                key={i}
                className="rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-3 py-2"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-red-600" />
                  <div className="min-w-0">
                    {g.codes.length > 0 && (
                      <span className="text-[9px] font-semibold text-red-600 mr-1.5">
                        Meta · {g.codes.join(", ")}
                      </span>
                    )}
                    <span className="text-xs text-foreground">{g.messages.join(" ")}</span>
                    {g.pointer && (
                      <p className="text-[10px] font-mono text-muted-foreground mt-1 break-all">
                        {g.pointer}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
          <p className="text-[11px] text-muted-foreground pt-1">
            Corrige estos puntos en el Constructor y vuelve a guardar, o pulsa "Reintentar sync".
          </p>
        </div>
      </div>
    </div>
  );
}

// === Constructor (editor visual, 100% local) ===

function ConstructorTab({ survey, onSaved }: { survey: SurveyItem; onSaved: () => void }) {
  const screens = (survey.flowJson?.screens as any[]) || [];
  const canEdit = survey.status !== "archived";

  if (!survey.flowJson || screens.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Esta encuesta no tiene contenido todavía.
      </p>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0">
        <FlowBuilder
          flowJson={survey.flowJson}
          flowId={survey.id}
          canEdit={canEdit}
          onSaved={onSaved}
          apiBase="/surveys"
          showMetaValidation={false}
        />
      </div>
    </div>
  );
}

// === Compartir: enlace público + publicar a WhatsApp (opcional) ===

function CompartirTab({
  survey,
  onActivate,
  onChanged,
}: {
  survey: SurveyItem;
  onActivate: () => void;
  onChanged: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const publicUrl = survey.slug ? `${window.location.origin}/s/${survey.slug}` : null;

  const copy = () => {
    if (!publicUrl) return;
    navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Enlace público */}
      <div className="rounded-xl border border-border p-4">
        <div className="flex items-center gap-2 mb-2">
          <Share2 className="h-4 w-4 text-brand-600" />
          <h3 className="text-sm font-semibold text-foreground">Enlace público</h3>
        </div>
        {survey.status !== "active" ? (
          <div>
            <p className="text-xs text-muted-foreground mb-3">
              Activa la encuesta para generar un enlace que cualquiera pueda abrir y responder.
            </p>
            <button
              onClick={onActivate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-xs font-medium transition-colors"
            >
              <Power className="h-3.5 w-3.5" />
              Activar encuesta
            </button>
          </div>
        ) : (
          <div>
            <p className="text-xs text-muted-foreground mb-2">
              Comparte este enlace para recibir respuestas por web. También puedes abrirlo tú mismo
              para llenar la encuesta por un contacto.
            </p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={publicUrl || ""}
                className="flex-1 px-3 py-2 rounded-lg border border-border bg-muted/40 text-foreground text-xs font-mono focus:outline-none"
              />
              <button
                onClick={copy}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-muted transition-colors"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copiado" : "Copiar"}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Enlace general: las respuestas no quedan atribuidas a ningún agente.
            </p>

            {/* Enlace personal del agente actual (atribuye las respuestas a él) */}
            <AgentLinkRow survey={survey} baseUrl={publicUrl} />
          </div>
        )}
      </div>

      {/* Publicar a WhatsApp */}
      <WhatsAppPublishPanel survey={survey} onChanged={onChanged} />
    </div>
  );
}

function AgentLinkRow({ survey, baseUrl }: { survey: SurveyItem; baseUrl: string | null }) {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const myUrl = token && baseUrl ? `${baseUrl}?a=${token}` : null;

  const generate = async () => {
    setLoading(true);
    try {
      const res = await getSurveyAgentLink(survey.id);
      setToken(res.token);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "No se pudo generar tu enlace");
    } finally {
      setLoading(false);
    }
  };

  const copy = () => {
    if (!myUrl) return;
    navigator.clipboard.writeText(myUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="mt-3 pt-3 border-t border-border">
      <div className="flex items-center gap-1.5 mb-1.5">
        <UserPlus className="h-3.5 w-3.5 text-brand-600" />
        <span className="text-xs font-medium text-foreground">Mi enlace (atribuido a ti)</span>
      </div>
      {!myUrl ? (
        <button
          onClick={generate}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
          Generar mi enlace
        </button>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={myUrl}
              className="flex-1 px-3 py-2 rounded-lg border border-border bg-muted/40 text-foreground text-xs font-mono focus:outline-none"
            />
            <button
              onClick={copy}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-muted transition-colors"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copiado" : "Copiar"}
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            Las respuestas que lleguen por este enlace se te atribuyen a ti.
          </p>
        </>
      )}
    </div>
  );
}

function WhatsAppPublishPanel({
  survey,
  onChanged,
}: {
  survey: SurveyItem;
  onChanged: () => void;
}) {
  const { inboxes, loading, error } = useWhatsAppInboxes(survey.tenantId);
  const [inboxId, setInboxId] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [validating, setValidating] = useState(false);
  const [metaErrors, setMetaErrors] = useState<MetaValidationError[] | null>(null);
  const [validatedOk, setValidatedOk] = useState(false);

  useEffect(() => {
    if (inboxes.length === 1) setInboxId(inboxes[0].id);
  }, [inboxes]);

  // Al cambiar de canal, invalidar el resultado previo.
  useEffect(() => {
    setMetaErrors(null);
    setValidatedOk(false);
  }, [inboxId]);

  const validate = async (): Promise<boolean> => {
    if (!inboxId) {
      toast.error("Selecciona un canal de WhatsApp");
      return false;
    }
    setValidating(true);
    setMetaErrors(null);
    setValidatedOk(false);
    try {
      const res = await validateSurveyOnMeta(survey.id, inboxId);
      if (!res.metaReachable) {
        toast.message("No se pudo contactar a Meta para validar (revisa el canal)");
        return false;
      }
      setMetaErrors(res.errors);
      if (res.valid) {
        setValidatedOk(true);
        toast.success("El Flow es válido para Meta");
        return true;
      }
      toast.error(`Meta detectó ${res.errors.length} problema(s)`);
      return false;
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Error al validar en Meta");
      return false;
    } finally {
      setValidating(false);
    }
  };

  const publish = async () => {
    if (!inboxId) {
      toast.error("Selecciona un canal de WhatsApp");
      return;
    }
    // Validar SIEMPRE contra Meta antes de publicar: no subir un Flow inválido.
    const ok = await validate();
    if (!ok) {
      toast.error("Corrige los errores de Meta antes de publicar");
      return;
    }
    setPublishing(true);
    try {
      const data = await publishSurveyToWhatsApp(survey.id, inboxId, false);
      if (data.success || data.metaFlowId) {
        if (data.validationErrors?.length) {
          // Publicó pero con advertencias de Meta: mostrarlas.
          setMetaErrors(data.validationErrors);
          toast.message("Publicada con advertencias de Meta");
        } else {
          toast.success("Encuesta publicada como Flow de WhatsApp (borrador en Meta)");
        }
        onChanged();
      } else {
        setMetaErrors(data.validationErrors || null);
        toast.error(data.error || "No se pudo publicar en WhatsApp");
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Error al publicar en WhatsApp");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex items-center gap-2 mb-2">
        <MessageCircle className="h-4 w-4 text-green-600" />
        <h3 className="text-sm font-semibold text-foreground">WhatsApp (opcional)</h3>
      </div>

      {survey.requireLocation ? (
        <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 rounded-lg px-3 py-2">
          Esta encuesta requiere ubicación y no se puede publicar en WhatsApp. Desactiva "Requerir
          ubicación" en Configuración para habilitar la publicación.
        </p>
      ) : survey.metaFlowId ? (
        <div className="space-y-3">
          <WhatsAppFlowStatusBadge survey={survey} onChanged={onChanged} />
          <p className="text-xs text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-500/10 rounded-lg px-3 py-2">
            Esta encuesta está vinculada a un Flow de WhatsApp (ID: {survey.metaFlowId}). Puedes
            gestionarla también desde Comunicaciones → Flows.
          </p>
          <UnpublishButton survey={survey} onChanged={onChanged} />
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Convierte la encuesta en un WhatsApp Flow de Meta para enviarla por WhatsApp. Antes de
            publicar, validamos el contenido con Meta para evitar un Flow inválido.
          </p>
          <WhatsAppInboxPicker
            inboxId={inboxId}
            onChange={setInboxId}
            inboxes={inboxes}
            loading={loading}
            error={error}
          />

          <div className="flex items-center gap-2">
            <button
              onClick={validate}
              disabled={!inboxId || validating || publishing}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors disabled:opacity-50 ${
                validatedOk
                  ? "border-green-300 text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-500/10"
                  : "border-border text-foreground hover:bg-muted"
              }`}
            >
              {validating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : validatedOk ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <ShieldCheck className="h-3.5 w-3.5" />
              )}
              Validar en Meta
            </button>
            <button
              onClick={publish}
              disabled={!inboxId || publishing || validating}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium transition-colors disabled:opacity-50"
            >
              {publishing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <MessageCircle className="h-3.5 w-3.5" />
              )}
              Publicar en WhatsApp
            </button>
          </div>

          {/* Errores/advertencias que devuelve Meta, agrupados por ruta (un
              grupo = un problema) con su ruta exacta. */}
          {metaErrors && metaErrors.length > 0 && (() => {
            const groups = groupMetaErrors(metaErrors);
            return (
              <div className="space-y-1.5 rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 p-2.5">
                <p className="text-[11px] font-semibold text-red-700 dark:text-red-300">
                  Meta reportó {groups.length} problema(s):
                </p>
                {groups.map((g, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-[11px] text-red-700 dark:text-red-300">
                    <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                    <span>
                      {g.messages.join(" ")}
                      {g.pointer && (
                        <span className="block font-mono text-[10px] text-muted-foreground mt-0.5">
                          {g.pointer}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            );
          })()}
          {metaErrors && metaErrors.length === 0 && validatedOk && (
            <p className="text-[11px] text-green-600 flex items-center gap-1">
              <Check className="h-3 w-3" /> Meta validó el contenido sin errores.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// === Resultados (analíticas agregadas) ===

function ResultadosTab({ surveyId }: { surveyId: string }) {
  const [analytics, setAnalytics] = useState<SurveyAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getSurveyAnalytics(surveyId)
      .then(setAnalytics)
      .catch(() => setAnalytics(null))
      .finally(() => setLoading(false));
  }, [surveyId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!analytics) {
    return <p className="text-sm text-muted-foreground">No se pudieron cargar los resultados.</p>;
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="grid grid-cols-3 gap-3">
        <MetricCard label="Respuestas" value={analytics.totalResponses} />
        <MetricCard label="Por web" value={analytics.byChannel.web || 0} />
        <MetricCard label="Por WhatsApp" value={analytics.byChannel.whatsapp || 0} />
      </div>

      {analytics.questions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          La encuesta aún no tiene preguntas o no hay respuestas para agregar.
        </p>
      ) : (
        <div className="space-y-4">
          {analytics.questions.map((q) => (
            <div key={q.name} className="rounded-xl border border-border p-4">
              <div className="mb-3">
                <p className="text-sm font-medium text-foreground">{q.question}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {q.screen} · {q.answered} respuesta{q.answered !== 1 ? "s" : ""}
                </p>
              </div>

              {q.options && q.options.length > 0 ? (
                <div className="space-y-2">
                  {q.options.map((o) => (
                    <div key={o.id}>
                      <div className="flex items-center justify-between text-[11px] mb-0.5">
                        <span className="text-foreground truncate">{o.title}</span>
                        <span className="text-muted-foreground shrink-0 ml-2">
                          {o.count} · {o.percentage}%
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-brand-600 rounded-full transition-all"
                          style={{ width: `${o.percentage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : q.textSamples && q.textSamples.length > 0 ? (
                <div className="space-y-1.5">
                  {q.textSamples.map((t, i) => (
                    <div
                      key={i}
                      className="text-[11px] text-foreground bg-muted/50 rounded-lg px-2.5 py-1.5"
                    >
                      {t}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">Sin respuestas todavía.</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Muestra el estado REAL del Flow en Meta (DRAFT/PUBLISHED), consultado en vivo.
 * Solo una encuesta PUBLISHED puede usarse en un botón de plantilla de WhatsApp.
 * Si está en borrador, ofrece publicarla en Meta.
 */
function WhatsAppFlowStatusBadge({
  survey,
  onChanged,
}: {
  survey: SurveyItem;
  onChanged: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getSurveyWhatsAppStatus(survey.id);
      setStatus(res.linked ? res.status : null);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [survey.id]);

  const publishNow = async () => {
    if (!survey.inboxId) {
      toast.error("La encuesta no tiene un canal de WhatsApp asociado.");
      return;
    }
    setPublishing(true);
    try {
      // publish=true: pasa el Flow de DRAFT a PUBLISHED en Meta.
      const data = await publishSurveyToWhatsApp(survey.id, survey.inboxId, true);
      if (data.success || data.status === "PUBLISHED") {
        toast.success("Encuesta publicada en WhatsApp. Ya puede usarse en plantillas.");
        await load();
        onChanged();
      } else {
        toast.error(data.error || "No se pudo publicar la encuesta en WhatsApp");
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Error al publicar la encuesta");
    } finally {
      setPublishing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Consultando estado en Meta...
      </div>
    );
  }

  const isPublished = status === "PUBLISHED";

  return (
    <div className="flex items-center flex-wrap gap-2">
      {isPublished ? (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-500/25">
          <Check className="h-3 w-3" /> Publicada en WhatsApp
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/25">
          <AlertTriangle className="h-3 w-3" /> {status === null ? "Estado desconocido" : `Borrador en Meta (${status})`}
        </span>
      )}
      {!isPublished && (
        <>
          <span className="text-[11px] text-muted-foreground">No se puede usar en plantillas hasta publicarla.</span>
          <button
            onClick={publishNow}
            disabled={publishing}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-green-600 hover:bg-green-700 text-white text-[11px] font-medium transition-colors disabled:opacity-50"
          >
            {publishing ? <Loader2 className="h-3 w-3 animate-spin" /> : <MessageCircle className="h-3 w-3" />}
            Publicar en Meta
          </button>
        </>
      )}
    </div>
  );
}

function UnpublishButton({
  survey,
  onChanged,
}: {
  survey: SurveyItem;
  onChanged: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const unpublish = async () => {
    setBusy(true);
    try {
      const res = await unpublishSurveyFromWhatsApp(survey.id);
      if (res.warning) {
        toast.message(res.warning);
      } else {
        toast.success(
          res.deletedOnMeta
            ? "Encuesta despublicada y eliminada de WhatsApp"
            : "Encuesta desvinculada de WhatsApp",
        );
      }
      onChanged();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "No se pudo despublicar");
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setConfirm(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-red-600 hover:border-red-200 transition-colors"
      >
        <X className="h-3.5 w-3.5" />
        Despublicar de WhatsApp
      </button>
      <ConfirmModal
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={unpublish}
        title="Despublicar de WhatsApp"
        description="Se desvinculará la encuesta de WhatsApp y se intentará eliminar el Flow en Meta. Las respuestas ya recibidas se conservan. La encuesta seguirá disponible por enlace público."
        confirmLabel="Despublicar"
        variant="danger"
        loading={busy}
      />
    </>
  );
}

function LocationBlock({ location }: { location: any }) {
  if (!location || typeof location.lat !== "number" || typeof location.lng !== "number") {
    return null;
  }
  const { lat, lng, accuracy } = location;
  const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
  return (
    <div className="mt-2.5 rounded-lg border border-border px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <MapPin className="h-3 w-3" /> Ubicación
      </div>
      <p className="text-sm text-foreground mt-0.5">
        {lat.toFixed(6)}, {lng.toFixed(6)}
        {typeof accuracy === "number" && (
          <span className="text-[10px] text-muted-foreground ml-2">±{Math.round(accuracy)} m</span>
        )}
      </p>
      <a
        href={mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[11px] text-brand-700 dark:text-brand-300 hover:underline inline-flex items-center gap-1 mt-1"
      >
        Ver en el mapa
      </a>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border p-4">
      <p className="text-2xl font-semibold text-foreground">{value}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

// === Respuestas individuales ===

function RespuestasTab({ survey }: { survey: SurveyItem }) {
  const { slug } = useParams();
  const [responses, setResponses] = useState<SurveyResponseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SurveyResponseItem | null>(null);
  // Mapa userId -> nombre, para mostrar el agente atribuido de cada respuesta.
  const [agentNames, setAgentNames] = useState<Record<string, string>>({});

  useEffect(() => {
    setLoading(true);
    getSurveyResponses(survey.id)
      .then((data) => setResponses(data))
      .catch(() => setResponses([]))
      .finally(() => setLoading(false));
  }, [survey.id]);

  // Cargar los miembros del tenant para resolver nombres de agente por respuesta.
  useEffect(() => {
    if (!slug) return;
    getTenantMembers(slug)
      .then((members) => {
        const map: Record<string, string> = {};
        for (const m of members) map[m.userId] = m.name || m.email;
        setAgentNames(map);
      })
      .catch(() => setAgentNames({}));
  }, [slug]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (responses.length === 0) {
    return (
      <div className="text-center py-12">
        <Inbox className="h-7 w-7 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Aún no hay respuestas</p>
        <p className="text-[11px] text-muted-foreground/70 mt-1">
          Las respuestas por enlace o WhatsApp aparecerán aquí
        </p>
      </div>
    );
  }

  const answers = selected ? describeSubmission(survey.flowJson, selected.responseData) : [];

  return (
    <div className="flex gap-4">
      <div className="w-64 shrink-0 space-y-1">
        {responses.map((r) => (
          <button
            key={r.id}
            onClick={() => setSelected(r)}
            className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
              selected?.id === r.id
                ? "border-brand-300 bg-brand-50 dark:bg-brand-700/20"
                : "border-border hover:bg-muted"
            }`}
          >
            <p className="text-xs font-medium text-foreground truncate">
              {r.attributedUserId
                ? agentNames[r.attributedUserId] || "Agente"
                : "Enlace general"}
            </p>
            {r.respondentIdentifier && (
              <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                {r.respondentIdentifier}
              </p>
            )}
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[9px] px-1 rounded bg-muted text-muted-foreground">
                {r.channel}
              </span>
              <span className="text-[9px] text-muted-foreground">
                {formatDateTime(r.createdAt)}
              </span>
            </div>
          </button>
        ))}
      </div>
      <div className="flex-1 min-w-0">
        {selected ? (
          <>
            {answers.length > 0 ? (
              <div className="space-y-2.5">
                {answers.map((a) => (
                  <div key={a.key} className="rounded-lg border border-border px-3 py-2">
                    <p className="text-[10px] text-muted-foreground">{a.question}</p>
                    <p className="text-sm text-foreground mt-0.5">{a.value}</p>
                  </div>
                ))}
              </div>
            ) : (
              <pre className="text-[10px] font-mono bg-muted/50 rounded-lg p-3 overflow-x-auto border border-border">
                {JSON.stringify(selected.responseData, null, 2)}
              </pre>
            )}
            <LocationBlock location={selected.responseData?.__location__} />
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Selecciona una respuesta para ver sus datos
          </p>
        )}
      </div>
    </div>
  );
}
