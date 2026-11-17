import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Circle, History, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { reclutamientoApi, type AuditEntry, type SurveyorDetail } from "@/services/reclutamiento";
import { ContractsPanel } from "./ContractsPanel";
import { PaymentMethodsPanel } from "./PaymentMethodsPanel";
import { PortalPanel } from "./PortalPanel";
import {
  ProfileStatusBadge,
  ReasonModal,
  Spinner,
  primaryButton,
  secondaryButton,
} from "./shared";
import { formatDateTime } from "./format";

const ACTION_LABELS: Record<string, string> = {
  "reclutamiento.profile.create": "Perfil creado",
  "reclutamiento.profile.update": "Datos del perfil editados",
  "reclutamiento.profile.activate": "Encuestador activado",
  "reclutamiento.profile.suspend": "Encuestador suspendido",
  "reclutamiento.profile.end": "Perfil terminado",
  "reclutamiento.profile.reopen": "Perfil reabierto",
  "reclutamiento.contract.create": "Contrato creado",
  "reclutamiento.contract.update": "Contrato editado",
  "reclutamiento.contract.activate": "Contrato activado",
  "reclutamiento.contract.end": "Contrato terminado",
  "reclutamiento.contract.delete": "Borrador de contrato eliminado",
  "reclutamiento.contract.sign": "Firma de contrato registrada",
  "reclutamiento.contract.send": "Contrato enviado al portal",
  "reclutamiento.contract.withdraw": "Contrato retirado del portal",
  "reclutamiento.portal.invite": "Invitación al portal enviada",
  "reclutamiento.portal.login": "Ingresó al portal",
  "reclutamiento.portal.data_update": "Completó sus datos en el portal",
  "reclutamiento.document.upload": "Subió un documento",
  "reclutamiento.document.delete": "Eliminó un documento",
  "reclutamiento.document.view": "Documento consultado",
  "reclutamiento.document.approve": "Documento aprobado",
  "reclutamiento.document.reject": "Documento rechazado",
  "reclutamiento.payment_method.create": "Método de pago agregado",
  "reclutamiento.payment_method.update": "Método de pago editado",
  "reclutamiento.payment_method.verify": "Método de pago verificado",
  "reclutamiento.payment_method.default": "Método de pago predeterminado cambiado",
  "reclutamiento.payment_method.delete": "Método de pago eliminado",
  "reclutamiento.payment_method.reveal": "Datos de pago consultados",
};

type Dialog = "suspend" | "end" | null;

export function ReclutamientoDetail() {
  const { slug, profileId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const tenantId = user?.tenantRoles.find((tr) => tr.tenant.slug === slug)?.tenantId ?? "";

  const [detail, setDetail] = useState<SurveyorDetail | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId || !profileId) return;
    try {
      const [d, a] = await Promise.all([
        reclutamientoApi.detail(tenantId, profileId),
        reclutamientoApi.audit(tenantId, profileId),
      ]);
      setDetail(d);
      setAudit(a.data);
    } catch (err) {
      if ((err as { response?: { status?: number } })?.response?.status === 404) setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [tenantId, profileId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const back = () => navigate(`/${slug}/reclutamiento`);

  if (loading) return <div className="flex-1"><Spinner /></div>;

  if (notFound || !detail) {
    return (
      <div className="mx-auto mt-16 max-w-sm text-center">
        <p className="text-sm font-medium text-foreground">Encuestador no encontrado</p>
        <button type="button" onClick={back} className={`${secondaryButton} mt-3`}>
          <ArrowLeft className="h-3.5 w-3.5" /> Volver a la lista
        </button>
      </div>
    );
  }

  const { profile, contact, contracts, paymentMethods } = detail;
  const hasActiveContract = contracts.some((c) => c.status === "active");
  const hasVerifiedPayment = paymentMethods.some((m) => !!m.verifiedAt);
  const canActivate = hasActiveContract && hasVerifiedPayment;
  const locked = profile.status === "ended";
  const needsActivation = profile.status === "candidate" || profile.status === "suspended";

  const run = async (action: "activate" | "reopen") => {
    if (!tenantId) return;
    setActing(true);
    try {
      await reclutamientoApi.transition(tenantId, profile.id, action);
      toast.success(action === "activate" ? "Encuestador activado" : "Perfil reabierto");
      await load();
    } catch {
      /* mensaje mostrado por el interceptor */
    } finally {
      setActing(false);
    }
  };

  const runWithReason = async (action: "suspend" | "end", reason: string) => {
    await reclutamientoApi.transition(tenantId, profile.id, action, reason || undefined);
    setDialog(null);
    toast.success(action === "suspend" ? "Encuestador suspendido" : "Perfil terminado");
    await load();
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <button type="button" aria-label="Volver a la lista" onClick={back} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 truncate text-sm font-semibold text-foreground">
            {contact?.name || "Sin nombre"}
            <ProfileStatusBadge status={profile.status} />
          </h2>
          <p className="truncate text-xs text-muted-foreground">
            {[contact?.phone, contact?.email, contact?.city].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {needsActivation && (
            <button type="button" onClick={() => run("activate")} disabled={!canActivate || acting} className={primaryButton}>
              {acting && <Loader2 className="h-3 w-3 animate-spin" />}
              Activar
            </button>
          )}
          {profile.status === "active" && (
            <button type="button" onClick={() => setDialog("suspend")} className={secondaryButton}>
              Suspender
            </button>
          )}
          {!locked && (
            <button type="button" onClick={() => setDialog("end")} className={secondaryButton}>
              Terminar
            </button>
          )}
          {locked && (
            <button type="button" onClick={() => run("reopen")} disabled={acting} className={primaryButton}>
              {acting && <Loader2 className="h-3 w-3 animate-spin" />}
              Reabrir
            </button>
          )}
        </div>
      </div>

      <div className="space-y-4 p-4">
        {profile.statusReason && (profile.status === "suspended" || profile.status === "ended") && (
          <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Motivo: </span>
            {profile.statusReason}
          </p>
        )}

        {needsActivation && (
          <div className="rounded-xl border border-border bg-background px-4 py-3">
            <p className="mb-2 text-xs font-medium text-foreground">Requisitos para activar</p>
            <ul className="space-y-1">
              <Requirement done={hasActiveContract} label="Contrato vigente" />
              <Requirement done={hasVerifiedPayment} label="Método de pago verificado por una persona" />
            </ul>
          </div>
        )}

        <PortalPanel tenantId={tenantId} profileId={profile.id} locked={locked || profile.status === "suspended"} />
        <ContractsPanel tenantId={tenantId} profileId={profile.id} contracts={contracts} locked={locked} onChanged={load} />
        <PaymentMethodsPanel tenantId={tenantId} profileId={profile.id} methods={paymentMethods} locked={locked} onChanged={load} />

        <section className="rounded-xl border border-border bg-background">
          <header className="flex items-center gap-2 border-b border-border px-4 py-3">
            <History className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Historial</h3>
          </header>
          {audit.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-muted-foreground">Sin actividad registrada.</p>
          ) : (
            <ul className="divide-y divide-border">
              {audit.map((a) => (
                <li key={a.id} className="flex flex-wrap items-baseline gap-x-3 px-4 py-2 text-xs">
                  <span className="font-medium text-foreground">{ACTION_LABELS[a.action] ?? a.action}</span>
                  {typeof a.metadata?.reason === "string" && <span className="text-muted-foreground">«{a.metadata.reason}»</span>}
                  <span className="ml-auto text-muted-foreground">
                    {a.actorLabel ?? a.actorType} · {formatDateTime(a.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <ReasonModal
        open={dialog === "suspend"}
        title="Suspender encuestador"
        description="El encuestador no podrá trabajar y sus sesiones se cerrarán de inmediato. Podrás activarlo de nuevo cuando cumpla los requisitos."
        confirmLabel="Suspender"
        required
        onClose={() => setDialog(null)}
        onConfirm={(reason) => runWithReason("suspend", reason)}
      />
      <ReasonModal
        open={dialog === "end"}
        title="Terminar perfil"
        description="Se terminarán sus contratos vigentes y sus sesiones se cerrarán. Podrás reabrir el perfil más adelante si es necesario."
        confirmLabel="Terminar perfil"
        required={false}
        onClose={() => setDialog(null)}
        onConfirm={(reason) => runWithReason("end", reason)}
      />
    </div>
  );
}

function Requirement({ done, label }: { done: boolean; label: string }) {
  return (
    <li className={`flex items-center gap-2 text-xs ${done ? "text-green-700 dark:text-green-300" : "text-muted-foreground"}`}>
      {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
      {label}
    </li>
  );
}
