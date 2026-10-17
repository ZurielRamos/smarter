import { useEffect, useMemo, useState } from "react";
import { Mail, FileText, ExternalLink, ShieldCheck, AlertTriangle, Users, Braces } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { api } from "@/services/api";

interface EmailTemplateTranslation {
  language: string;
  subject: string;
  html?: string;
}

interface EmailTemplateItem {
  id: string;
  name: string;
  defaultLanguage: string;
  translations: EmailTemplateTranslation[];
}

interface EmailDomainConfig {
  provider: string;
  fromEmail: string;
  fromName: string;
  domain: string;
  domainStatus: "pending" | "verified" | "failed";
}

interface VariableOption {
  field: string;
  label: string;
}

interface EmailCampaignEditorProps {
  tenantId: string;
  inboxId: string | null;
  emailTemplateId: string | null;
  emailSubject: string;
  /** Segmentos actuales de la campaña, para estimar audiencia con opt-in. */
  segments?: Array<{ logic: string; conditions: Array<{ field: string; operator: string; value: unknown }> }>;
  usingList?: boolean;
  onTemplateChange: (id: string | null) => void;
  onSubjectChange: (value: string) => void;
  onSave: () => void;
  saving?: boolean;
  variables?: VariableOption[];
}

export function EmailCampaignEditor({
  tenantId,
  inboxId,
  emailTemplateId,
  emailSubject,
  segments,
  usingList,
  onTemplateChange,
  onSubjectChange,
  onSave,
  saving,
  variables,
}: EmailCampaignEditorProps) {
  const navigate = useNavigate();
  const { slug } = useParams();

  const [templates, setTemplates] = useState<EmailTemplateItem[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [domainConfig, setDomainConfig] = useState<EmailDomainConfig | null>(null);
  const [optInCount, setOptInCount] = useState<number | null>(null);
  const [loadingAudience, setLoadingAudience] = useState(false);
  const [showVars, setShowVars] = useState(false);

  // ─── Cargar plantillas de email del tenant ───
  // Las plantillas de campaña viven en el módulo `templates` (canal 'email'),
  // que es el que resuelve el worker vía campaign.emailTemplateId.
  useEffect(() => {
    if (!tenantId) return;
    setLoadingTemplates(true);
    api
      .get<EmailTemplateItem[]>("/templates", { params: { tenantId, channel: "email" } })
      .then(({ data }) => setTemplates(data))
      .catch(() => {})
      .finally(() => setLoadingTemplates(false));
  }, [tenantId]);

  // ─── Cargar config de dominio (remitente) ───
  useEffect(() => {
    if (!inboxId) return;
    api
      .get<EmailDomainConfig | null>(`/email-config/inbox/${inboxId}`)
      .then(({ data }) => setDomainConfig(data))
      .catch(() => {});
  }, [inboxId]);

  // ─── Estimar audiencia con opt-in de email ───
  useEffect(() => {
    if (usingList || !segments || segments.length === 0) {
      setOptInCount(null);
      return;
    }
    setLoadingAudience(true);
    api
      .post<{ count: number }>("/campaigns/preview", {
        segments: segments.map((g) => ({ logic: g.logic, conditions: g.conditions })),
        tenantId,
        channel: "email_transaccional",
      })
      .then(({ data }) => setOptInCount(data.count))
      .catch(() => setOptInCount(null))
      .finally(() => setLoadingAudience(false));
  }, [segments, usingList, tenantId]);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === emailTemplateId) || null,
    [templates, emailTemplateId],
  );

  // El asunto efectivo: el de la plantilla (idioma por defecto) tiene prioridad
  // en el envío; el campo de la campaña es fallback.
  const templateSubject = useMemo(() => {
    if (!selectedTemplate) return null;
    const def =
      selectedTemplate.translations.find((t) => t.language === selectedTemplate.defaultLanguage) ||
      selectedTemplate.translations[0];
    return def?.subject || null;
  }, [selectedTemplate]);

  const insertVariable = (field: string) => {
    onSubjectChange(`${emailSubject}{{${field}}}`);
    setShowVars(false);
  };

  const domainVerified = domainConfig?.domainStatus === "verified";

  return (
    <div className="bg-card rounded-xl border border-border p-6 space-y-5">
      <div className="flex items-center gap-2">
        <Mail className="h-5 w-5 text-purple-600" />
        <h2 className="text-base font-semibold text-foreground">Contenido del Email</h2>
      </div>

      {/* ─── Remitente (solo lectura, desde la config del canal) ─── */}
      <div className="rounded-lg border border-border bg-muted/40 p-3">
        <p className="text-[10px] font-medium text-muted-foreground uppercase mb-1">Remitente</p>
        {domainConfig ? (
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-foreground truncate">
              {domainConfig.fromName}{" "}
              <span className="text-muted-foreground">&lt;{domainConfig.fromEmail}&gt;</span>
            </p>
            <span
              className={cn(
                "shrink-0 px-1.5 py-0.5 rounded text-[9px] font-medium",
                domainVerified
                  ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300"
                  : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
              )}
            >
              {domainVerified ? "Dominio verificado" : "Dominio sin verificar"}
            </span>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No hay configuración de email para esta bandeja.
          </p>
        )}
      </div>

      {/* ─── Selector de plantilla ─── */}
      <div>
        <label className="block text-xs font-medium text-foreground mb-1.5">Plantilla de email</label>
        {loadingTemplates ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <div className="h-4 w-4 border-2 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
            Cargando plantillas...
          </div>
        ) : templates.length === 0 ? (
          <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground border border-dashed border-border rounded-lg p-3">
            <span>No hay plantillas de email creadas.</span>
            <button
              type="button"
              onClick={() => navigate(`/${slug}/email-builder/global/new`)}
              className="text-brand-600 hover:underline inline-flex items-center gap-1 shrink-0"
            >
              Crear una <ExternalLink className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <select
              value={emailTemplateId || ""}
              onChange={(e) => onTemplateChange(e.target.value || null)}
              className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">— Selecciona una plantilla —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.translations.length > 1 ? ` (${t.translations.length} idiomas)` : ""}
                </option>
              ))}
            </select>
            {selectedTemplate && (
              <button
                type="button"
                onClick={() => navigate(`/${slug}/email-builder/global/${selectedTemplate.id}`)}
                className="shrink-0 inline-flex items-center gap-1 px-2.5 py-2 rounded-lg border border-border text-xs text-muted-foreground hover:text-brand-600 hover:bg-muted transition-colors"
                title="Editar en el constructor"
              >
                <FileText className="h-3.5 w-3.5" /> Editar
              </button>
            )}
          </div>
        )}
      </div>

      {/* ─── Asunto ─── */}
      <div>
        <label className="block text-xs font-medium text-foreground mb-1.5">
          Asunto del email
          {templateSubject && (
            <span className="ml-1 font-normal text-muted-foreground">(fallback — la plantilla ya define un asunto)</span>
          )}
        </label>
        <div className="flex items-center rounded-lg border border-border overflow-hidden focus-within:ring-2 focus-within:ring-brand-500 relative">
          <input
            type="text"
            value={emailSubject}
            onChange={(e) => onSubjectChange(e.target.value)}
            placeholder={templateSubject || "Escribe el asunto..."}
            className="flex-1 px-3 py-2 bg-background text-foreground text-sm outline-none"
          />
          <button
            type="button"
            onClick={() => setShowVars((v) => !v)}
            className="shrink-0 h-full px-2 border-l border-border text-muted-foreground hover:text-brand-600 hover:bg-muted transition-colors"
            title="Insertar variable"
          >
            <Braces className="h-3.5 w-3.5" />
          </button>
          {showVars && (variables?.length ?? 0) > 0 && (
            <div className="absolute right-0 top-full mt-1 z-20 w-56 max-h-56 overflow-y-auto bg-card border border-border rounded-lg shadow-lg p-1">
              {variables!.map((v) => (
                <button
                  key={v.field}
                  type="button"
                  onClick={() => insertVariable(v.field)}
                  className="w-full text-left px-2.5 py-1.5 rounded-md text-xs text-foreground hover:bg-muted"
                >
                  {v.label} <span className="text-muted-foreground">{`{{${v.field}}}`}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ─── Aviso de desuscripción (cumplimiento) ─── */}
      <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3">
        <ShieldCheck className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          El enlace de cancelación de suscripción se incluye automáticamente (cabecera{" "}
          <span className="font-mono">List-Unsubscribe</span> y footer si la plantilla no usa{" "}
          <span className="font-mono">{"{{unsubscribe_url}}"}</span>). Los contactos dados de baja se
          excluyen del envío.
        </p>
      </div>

      {/* ─── Estimación de audiencia con opt-in ─── */}
      {!usingList && (
        <div
          className={cn(
            "flex items-start gap-2 rounded-lg border p-3",
            optInCount === 0
              ? "border-amber-300 bg-amber-50 dark:bg-amber-500/10"
              : "border-border bg-muted/40",
          )}
        >
          {optInCount === 0 ? (
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          ) : (
            <Users className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          )}
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {loadingAudience ? (
              "Calculando audiencia con consentimiento de email..."
            ) : optInCount === null ? (
              "La audiencia se filtra por contactos con opt-in de email activo."
            ) : optInCount === 0 ? (
              <span className="text-amber-700 dark:text-amber-300 font-medium">
                Ningún contacto del segmento tiene opt-in de email activo. El envío no alcanzaría a nadie.
              </span>
            ) : (
              <>
                <span className="font-medium text-foreground">{optInCount}</span> contacto(s) del
                segmento tienen opt-in de email y recibirían la campaña.
              </>
            )}
          </p>
        </div>
      )}

      {/* ─── Guardar ─── */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-brand-800 hover:bg-brand-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? "Guardando..." : "Guardar configuración"}
        </button>
      </div>
    </div>
  );
}
