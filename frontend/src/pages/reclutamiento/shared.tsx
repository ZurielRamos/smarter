import { useEffect, useState, type ReactNode } from "react";
import { Loader2, X } from "lucide-react";
import type { ContractStatus, ProfileStatus, TemplateStatus } from "@/services/reclutamiento";

export const inputClass =
  "w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200";

export const primaryButton =
  "inline-flex items-center gap-1.5 rounded-lg bg-brand-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50";

export const secondaryButton =
  "inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50";

const PROFILE_STATUS: Record<ProfileStatus, { label: string; cls: string }> = {
  candidate: { label: "Candidato", cls: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
  active: { label: "Activo", cls: "bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300" },
  suspended: { label: "Suspendido", cls: "bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300" },
  ended: { label: "Terminado", cls: "bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-300" },
};

const CONTRACT_STATUS: Record<ContractStatus, { label: string; cls: string }> = {
  draft: { label: "Borrador", cls: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
  active: { label: "Vigente", cls: "bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300" },
  ended: { label: "Terminado", cls: "bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-300" },
};

function Pill({ cls, children }: { cls: string; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${cls}`}>{children}</span>;
}

export function ProfileStatusBadge({ status }: { status: ProfileStatus }) {
  const s = PROFILE_STATUS[status];
  return <Pill cls={s.cls}>{s.label}</Pill>;
}

export function ContractStatusBadge({ status }: { status: ContractStatus }) {
  const s = CONTRACT_STATUS[status];
  return <Pill cls={s.cls}>{s.label}</Pill>;
}

const TEMPLATE_STATUS: Record<TemplateStatus, { label: string; cls: string }> = {
  draft: { label: "Borrador", cls: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
  published: { label: "Publicada", cls: "bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300" },
  archived: { label: "Archivada", cls: "bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-300" },
};

export function TemplateStatusBadge({ status }: { status: TemplateStatus }) {
  const s = TEMPLATE_STATUS[status];
  return <Pill cls={s.cls}>{s.label}</Pill>;
}

export function SignatureBadge({ signed }: { signed: boolean }) {
  return signed ? (
    <Pill cls="bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300">Firmado</Pill>
  ) : (
    <Pill cls="bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">Sin firmar</Pill>
  );
}

export function Spinner() {
  return (
    <div className="flex justify-center p-8">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Cargando" />
    </div>
  );
}

/** Cascarón de modal de formulario (la confirmación de acciones usa ConfirmModal). */
export function ModalShell({
  title,
  onClose,
  children,
  busy = false,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  busy?: boolean;
  /** Para documentos largos (contratos, vistas previas). */
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={busy ? undefined : onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative mx-4 max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-card text-card-foreground shadow-xl ${wide ? "max-w-3xl" : "max-w-md"}`}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            disabled={busy}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-foreground">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

/**
 * Modal para acciones que piden un motivo (suspender, terminar). No usa los
 * diálogos nativos del navegador.
 */
export function ReasonModal({
  open,
  title,
  description,
  confirmLabel,
  required,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  required: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  if (!open) return null;

  const canSubmit = !busy && (!required || reason.trim().length > 0);

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await onConfirm(reason.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell title={title} onClose={onClose} busy={busy}>
      <div className="space-y-3 px-5 py-4">
        <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
        <Field label={required ? "Motivo" : "Motivo (opcional)"}>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            className={inputClass}
            autoFocus
          />
        </Field>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
        <button type="button" onClick={onClose} disabled={busy} className={secondaryButton}>
          Cancelar
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy && <Loader2 className="h-3 w-3 animate-spin" />}
          {confirmLabel}
        </button>
      </div>
    </ModalShell>
  );
}
