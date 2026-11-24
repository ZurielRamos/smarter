import { useEffect, useState, type ReactNode } from "react";
import { Loader2, X } from "lucide-react";
import type { ContractStatus, ProfileStatus, ProjectStatus, ProspectCatalog, ProspectState, TemplateStatus } from "@/services/reclutamiento";

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

export function Pill({ cls, children }: { cls: string; children: ReactNode }) {
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

const PROJECT_STATUS: Record<ProjectStatus, { label: string; cls: string }> = {
  draft: { label: "Borrador", cls: "bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-300" },
  active: { label: "Activo", cls: "bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300" },
  paused: { label: "Pausado", cls: "bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300" },
  ended: { label: "Terminado", cls: "bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-300" },
};

/** Color de un estado según su naturaleza: inicial, en curso, logro o descarte. */
export function stateClass(state: ProspectState | undefined, initial: boolean): string {
  if (!state) return "bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-300";
  if (state.negative) return "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300";
  if (state.participated || state.public === "selected") return "bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300";
  if (initial) return "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300";
  return "bg-brand-50 text-brand-700 dark:bg-brand-700/30 dark:text-brand-100";
}
/** Estado de un prospecto con su etiqueta del catálogo. */
export function ProspectStatusBadge({ catalog, status }: { catalog: ProspectCatalog | null; status: string }) {
  const state = catalog?.states.find((s) => s.key === status);
  return <Pill cls={stateClass(state, catalog?.initial === status)}>{state?.label ?? status}</Pill>;
}
export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const s = PROJECT_STATUS[status];
  return <Pill cls={s.cls}>{s.label}</Pill>;
}

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

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
  /** Con descripción, las opciones se muestran como tarjetas. */
  description?: string;
}

/**
 * Selector de una opción entre pocas (reemplaza al desplegable nativo): todas las
 * opciones a la vista, navegación con las flechas y estado claro de la elegida.
 */
export function Segmented<T extends string>({
  label,
  hint,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  hint?: string;
  value: T;
  onChange: (value: T) => void;
  options: Array<SegmentedOption<T>>;
  disabled?: boolean;
}) {
  const cards = options.some((o) => o.description);
  const move = (from: number, dir: 1 | -1) => {
    const next = options[(from + dir + options.length) % options.length];
    onChange(next.value);
    // El foco sigue a la opción elegida con las flechas.
    requestAnimationFrame(() => document.getElementById(`seg-${label}-${next.value}`)?.focus());
  };
  return (
    <div>
      <span className="mb-1.5 block text-xs font-medium text-foreground">{label}</span>
      <div
        role="radiogroup"
        aria-label={label}
        className={cards ? "grid gap-2 sm:grid-cols-2" : "inline-flex w-full rounded-xl border border-border bg-muted/50 p-1"}
        style={cards ? { gridTemplateColumns: options.length >= 3 ? `repeat(auto-fit, minmax(10rem, 1fr))` : undefined } : undefined}
      >
        {options.map((o, i) => {
          const selected = o.value === value;
          return (
            <button
              key={o.value}
              id={`seg-${label}-${o.value}`}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              disabled={disabled}
              onClick={() => onChange(o.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                  e.preventDefault();
                  move(i, 1);
                } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                  e.preventDefault();
                  move(i, -1);
                }
              }}
              className={
                cards
                  ? `flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 disabled:opacity-50 ${selected ? "border-brand-600 bg-brand-50 dark:bg-brand-700/30" : "border-border hover:bg-muted"}`
                  : `flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 disabled:opacity-50 ${selected ? "bg-card text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground"}`
              }
            >
              <span className={`flex items-center gap-1.5 ${cards ? "text-sm font-medium text-foreground" : ""}`}>
                {o.icon}
                {o.label}
              </span>
              {o.description && <span className="text-[11px] leading-snug text-muted-foreground">{o.description}</span>}
            </button>
          );
        })}
      </div>
      {hint && <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>}
    </div>
  );
}
