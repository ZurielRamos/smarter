import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Copy, FileSearch, Globe, Loader2, Send, XCircle } from "lucide-react";
import { toast } from "sonner";
import { ConfirmModal } from "@/components/ConfirmModal";
import { reclutamientoApi, type DocumentStatus, type PortalDocumentCurrent, type PortalStatus } from "@/services/reclutamiento";
import { ModalShell, ReasonModal, primaryButton, secondaryButton } from "./shared";
import { formatDateTime } from "./format";

const STATUS_LABEL: Record<DocumentStatus, { text: string; className: string }> = {
  pending: { text: "Por revisar", className: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200" },
  approved: { text: "Aprobado", className: "bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-200" },
  rejected: { text: "Rechazado", className: "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-200" },
};

const CHANNEL_LABEL: Record<string, string> = { email: "correo", whatsapp: "WhatsApp" };

const formatSize = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/** Vista del documento: se descarga descifrado por la API y se muestra aquí, sin dejar una URL pública. */
function DocumentViewer({ tenantId, doc, label, onClose }: { tenantId: string; doc: PortalDocumentCurrent; label: string; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    reclutamientoApi
      .documentBlob(tenantId, doc.id)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [tenantId, doc.id]);

  return (
    <ModalShell title={label} onClose={onClose} wide>
      <div className="px-5 py-4">
        <p className="mb-2 text-xs text-muted-foreground">{doc.fileName} · {formatSize(doc.sizeBytes)}</p>
        {failed ? (
          <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">No se pudo abrir el documento.</p>
        ) : !url ? (
          <div className="flex justify-center p-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Cargando" /></div>
        ) : doc.mimeType === "application/pdf" ? (
          <iframe title={label} src={url} sandbox="" className="h-[70vh] w-full rounded-lg border border-border" />
        ) : (
          <img src={url} alt={label} className="mx-auto max-h-[70vh] rounded-lg border border-border object-contain" />
        )}
      </div>
    </ModalShell>
  );
}

/** Acceso del encuestador al portal: invitación, estado e historial de documentos para revisar. */
export function PortalPanel({ tenantId, profileId, locked }: { tenantId: string; profileId: string; locked: boolean }) {
  const [status, setStatus] = useState<PortalStatus | null>(null);
  const [inviting, setInviting] = useState(false);
  const [confirmInvite, setConfirmInvite] = useState(false);
  const [link, setLink] = useState<{ url: string; sent: string[]; failed: string[] } | null>(null);
  const [viewing, setViewing] = useState<{ doc: PortalDocumentCurrent; label: string } | null>(null);
  const [rejecting, setRejecting] = useState<PortalDocumentCurrent | null>(null);
  const [busyDoc, setBusyDoc] = useState<string | null>(null);

  const load = useCallback(() => {
    reclutamientoApi.portalStatus(tenantId, profileId).then(setStatus).catch(() => setStatus(null));
  }, [tenantId, profileId]);
  useEffect(load, [load]);

  const invite = async () => {
    setInviting(true);
    try {
      const res = await reclutamientoApi.invite(tenantId, profileId);
      setLink({ url: res.link, sent: res.sent, failed: res.failed });
      if (res.sent.length) toast.success(`Invitación enviada por ${res.sent.map((c) => CHANNEL_LABEL[c] ?? c).join(" y ")}`);
      if (res.failed.length) toast.warning(`No se pudo enviar por ${res.failed.map((c) => CHANNEL_LABEL[c] ?? c).join(" y ")}. Comparte el enlace.`);
      load();
    } catch {
      /* el interceptor muestra el motivo */
    } finally {
      setInviting(false);
    }
  };

  const review = async (doc: PortalDocumentCurrent, decision: "approve" | "reject", reason?: string) => {
    setBusyDoc(doc.id);
    try {
      await reclutamientoApi.reviewDocument(tenantId, doc.id, decision, reason);
      toast.success(decision === "approve" ? "Documento aprobado" : "Documento rechazado");
      load();
    } finally {
      setBusyDoc(null);
    }
  };

  const active = status?.lastInvitation?.active;

  return (
    <section className="rounded-xl border border-border bg-background">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <Globe className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Portal del encuestador</h3>
        {!locked && (
          <button type="button" onClick={() => (active ? setConfirmInvite(true) : invite())} disabled={inviting} className={`${primaryButton} ml-auto`}>
            {inviting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            {status?.lastInvitation ? "Reenviar invitación" : "Invitar al portal"}
          </button>
        )}
      </header>

      <div className="space-y-3 px-4 py-3">
        <p className="text-xs text-muted-foreground">
          {status?.lastInvitation ? (
            <>
              Última invitación: {formatDateTime(status.lastInvitation.createdAt)}
              {status.lastInvitation.channels.length > 0 && <> por {status.lastInvitation.channels.map((c) => CHANNEL_LABEL[c] ?? c).join(" y ")}</>}
              {active ? ` · vence ${formatDateTime(status.lastInvitation.expiresAt)}` : " · vencida o reemplazada"}.{" "}
            </>
          ) : (
            "Aún no se ha invitado. "
          )}
          {status?.lastPortalLoginAt ? `Último ingreso: ${formatDateTime(status.lastPortalLoginAt)}.` : "Todavía no ha ingresado."}
        </p>

        {link && (
          <div className="rounded-lg bg-muted px-3 py-2">
            <p className="mb-1 text-[11px] text-muted-foreground">Enlace personal (solo se muestra ahora; si lo pierdes, reenvía la invitación):</p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate text-xs text-foreground">{link.url}</code>
              <button type="button" aria-label="Copiar enlace" className={secondaryButton} onClick={() => navigator.clipboard.writeText(link.url).then(() => toast.success("Enlace copiado"))}>
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {status && status.documents.length > 0 && (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {status.documents.map((d) => (
              <li key={d.key} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground">
                    {d.label} {d.required && <span className="text-muted-foreground">(obligatorio)</span>}
                  </p>
                  {d.current ? (
                    <p className="truncate text-[11px] text-muted-foreground">
                      {d.current.fileName} · {formatSize(d.current.sizeBytes)} · {formatDateTime(d.current.uploadedAt)}
                      {d.current.rejectReason && <> · «{d.current.rejectReason}»</>}
                    </p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">Sin subir</p>
                  )}
                </div>
                {d.current && (
                  <>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_LABEL[d.current.status].className}`}>{STATUS_LABEL[d.current.status].text}</span>
                    <button type="button" onClick={() => setViewing({ doc: d.current!, label: d.label })} className={secondaryButton}>
                      <FileSearch className="h-3.5 w-3.5" /> Ver
                    </button>
                    {!locked && d.current.status !== "approved" && (
                      <button type="button" disabled={busyDoc === d.current.id} onClick={() => review(d.current!, "approve")} className={secondaryButton}>
                        <CheckCircle2 className="h-3.5 w-3.5" /> Aprobar
                      </button>
                    )}
                    {!locked && d.current.status !== "rejected" && (
                      <button type="button" disabled={busyDoc === d.current.id} onClick={() => setRejecting(d.current)} className={secondaryButton}>
                        <XCircle className="h-3.5 w-3.5" /> Rechazar
                      </button>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {viewing && <DocumentViewer tenantId={tenantId} doc={viewing.doc} label={viewing.label} onClose={() => setViewing(null)} />}
      <ReasonModal
        open={!!rejecting}
        title="Rechazar documento"
        description="Explica qué debe corregir el encuestador (por ejemplo, «la foto está borrosa»). Lo verá en su portal y podrá subir otro."
        confirmLabel="Rechazar"
        required
        onClose={() => setRejecting(null)}
        onConfirm={async (reason) => {
          if (rejecting) await review(rejecting, "reject", reason);
          setRejecting(null);
        }}
      />
      <ConfirmModal
        open={confirmInvite}
        onClose={() => setConfirmInvite(false)}
        onConfirm={async () => {
          setConfirmInvite(false);
          await invite();
        }}
        title="Reenviar invitación"
        description="El enlace anterior dejará de funcionar y se enviará uno nuevo."
        confirmLabel="Reenviar"
        variant="warning"
      />
    </section>
  );
}
