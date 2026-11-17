import { useState, type FormEvent } from "react";
import { BadgeCheck, Eye, Landmark, Loader2, Pencil, Plus, ShieldCheck, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmModal } from "@/components/ConfirmModal";
import {
  apiErrorMessage,
  reclutamientoApi,
  type PaymentMethodInput,
  type PaymentMethodType,
  type SurveyorPaymentMethod,
} from "@/services/reclutamiento";
import {
  Field,
  ModalShell,
  inputClass,
  primaryButton,
  secondaryButton,
} from "./shared";
import { PAYMENT_METHOD_LABELS, formatDateTime } from "./format";

/** Campos de los datos de pago por tipo. Las claves deben coincidir con las que espera el backend. */
const FIELD_SETS: Record<PaymentMethodType, { key: string; label: string; required: boolean }[]> = {
  bank_transfer: [
    { key: "bankName", label: "Banco", required: true },
    { key: "accountType", label: "Tipo de cuenta", required: false },
    { key: "accountNumber", label: "Número de cuenta", required: true },
    { key: "documentNumber", label: "Documento del titular", required: false },
  ],
  wallet: [
    { key: "provider", label: "Proveedor", required: true },
    { key: "identifier", label: "Número o usuario de la cuenta", required: true },
  ],
  other: [
    { key: "description", label: "Descripción", required: true },
    { key: "identifier", label: "Identificador de la cuenta", required: false },
  ],
};

const FIELD_LABELS: Record<string, string> = Object.fromEntries(
  Object.values(FIELD_SETS)
    .flat()
    .map((f) => [f.key, f.label]),
);

interface Props {
  tenantId: string;
  profileId: string;
  methods: SurveyorPaymentMethod[];
  locked: boolean;
  onChanged: () => void;
}

export function PaymentMethodsPanel({ tenantId, profileId, methods, locked, onChanged }: Props) {
  const [editing, setEditing] = useState<SurveyorPaymentMethod | "new" | null>(null);
  const [toReveal, setToReveal] = useState<SurveyorPaymentMethod | null>(null);
  const [revealed, setRevealed] = useState<{ title: string; details: Record<string, string> } | null>(null);
  const [toDelete, setToDelete] = useState<SurveyorPaymentMethod | null>(null);
  const [toVerify, setToVerify] = useState<SurveyorPaymentMethod | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const setDefault = async (m: SurveyorPaymentMethod) => {
    setBusyId(m.id);
    try {
      await reclutamientoApi.setDefaultPaymentMethod(tenantId, m.id);
      onChanged();
    } catch {
      /* mensaje mostrado por el interceptor */
    } finally {
      setBusyId(null);
    }
  };

  const verify = async () => {
    if (!toVerify) return;
    await reclutamientoApi.verifyPaymentMethod(tenantId, toVerify.id);
    setToVerify(null);
    toast.success("Método de pago verificado");
    onChanged();
  };

  const reveal = async () => {
    if (!toReveal) return;
    const res = await reclutamientoApi.revealPaymentMethod(tenantId, toReveal.id);
    setToReveal(null);
    setRevealed({ title: `${PAYMENT_METHOD_LABELS[res.method]} · ${res.holderName}`, details: res.details });
  };

  const remove = async () => {
    if (!toDelete) return;
    await reclutamientoApi.deletePaymentMethod(tenantId, toDelete.id);
    setToDelete(null);
    toast.success("Método de pago eliminado");
    onChanged();
  };

  return (
    <section className="rounded-xl border border-border bg-background">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Landmark className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Métodos de pago</h3>
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3 w-3" /> Cifrados
        </span>
        {!locked && (
          <button type="button" onClick={() => setEditing("new")} className={`${primaryButton} ml-auto`}>
            <Plus className="h-3.5 w-3.5" /> Agregar
          </button>
        )}
      </header>

      {methods.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-muted-foreground">
          Sin métodos de pago. Agrégalo y verifícalo para poder activar al encuestador.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {methods.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                  {PAYMENT_METHOD_LABELS[m.method]}
                  {m.hint && <span className="font-mono text-xs text-muted-foreground">{m.hint}</span>}
                  {m.isDefault && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-700 dark:bg-brand-700 dark:text-brand-100">
                      <Star className="h-2.5 w-2.5" /> Predeterminado
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  Titular: {m.holderName} ·{" "}
                  {m.verifiedAt ? (
                    <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-300">
                      <BadgeCheck className="h-3 w-3" /> Verificado el {formatDateTime(m.verifiedAt)}
                    </span>
                  ) : (
                    <span className="text-amber-700 dark:text-amber-300">Sin verificar</span>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setToReveal(m)} className={secondaryButton}>
                  <Eye className="h-3.5 w-3.5" /> Ver datos
                </button>
                {!locked && !m.verifiedAt && (
                  <button type="button" onClick={() => setToVerify(m)} className={primaryButton}>
                    Verificar
                  </button>
                )}
                {!locked && !m.isDefault && (
                  <button type="button" onClick={() => setDefault(m)} disabled={busyId === m.id} className={secondaryButton}>
                    {busyId === m.id && <Loader2 className="h-3 w-3 animate-spin" />}
                    Predeterminado
                  </button>
                )}
                {!locked && (
                  <>
                    <button
                      type="button"
                      aria-label="Editar método de pago"
                      onClick={() => setEditing(m)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Eliminar método de pago"
                      onClick={() => setToDelete(m)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-rose-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <PaymentFormModal
          tenantId={tenantId}
          profileId={profileId}
          method={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            toast.success("Método de pago guardado");
            onChanged();
          }}
        />
      )}

      {revealed && (
        <ModalShell title="Datos de pago" onClose={() => setRevealed(null)}>
          <div className="space-y-3 px-5 py-4">
            <p className="text-xs font-medium text-foreground">{revealed.title}</p>
            <dl className="space-y-2">
              {Object.entries(revealed.details).map(([key, value]) => (
                <div key={key}>
                  <dt className="text-[11px] text-muted-foreground">{FIELD_LABELS[key] ?? key}</dt>
                  <dd className="select-all break-all font-mono text-sm text-foreground">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="text-[11px] text-muted-foreground">Esta consulta quedó registrada en el historial.</p>
          </div>
          <div className="flex justify-end border-t border-border px-5 py-3">
            <button type="button" onClick={() => setRevealed(null)} className={secondaryButton}>
              Cerrar
            </button>
          </div>
        </ModalShell>
      )}

      <ConfirmModal
        open={!!toReveal}
        onClose={() => setToReveal(null)}
        onConfirm={reveal}
        title="Ver datos de pago"
        description="Vas a mostrar los datos completos de pago de este encuestador. La consulta queda registrada en el historial con tu usuario."
        confirmLabel="Ver datos"
        variant="warning"
      />
      <ConfirmModal
        open={!!toVerify}
        onClose={() => setToVerify(null)}
        onConfirm={verify}
        title="Verificar método de pago"
        description="Confirma que ya comprobaste que los datos de pago pertenecen al encuestador. Quedará registrado a tu nombre. Si luego se editan los datos, deberá verificarse de nuevo."
        confirmLabel="Marcar como verificado"
      />
      <ConfirmModal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        title="Eliminar método de pago"
        description="Se eliminará este método de pago del encuestador. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        variant="danger"
      />
    </section>
  );
}

function PaymentFormModal({
  tenantId,
  profileId,
  method,
  onClose,
  onSaved,
}: {
  tenantId: string;
  profileId: string;
  method: SurveyorPaymentMethod | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<PaymentMethodType>(method?.method ?? "bank_transfer");
  const [holderName, setHolderName] = useState(method?.holderName ?? "");
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const fields = FIELD_SETS[type];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (holderName.trim().length < 2) return setError("El nombre del titular es requerido");
    const details: Record<string, string> = {};
    for (const f of fields) {
      const v = (values[f.key] ?? "").trim();
      if (f.required && !v) return setError(`${f.label} es requerido`);
      if (v) details[f.key] = v;
    }

    const input: PaymentMethodInput = { method: type, holderName: holderName.trim(), details };
    setSaving(true);
    try {
      if (method) await reclutamientoApi.updatePaymentMethod(tenantId, method.id, input);
      else await reclutamientoApi.createPaymentMethod(tenantId, profileId, input);
      onSaved();
    } catch (err) {
      setError(apiErrorMessage(err, "No se pudo guardar el método de pago"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title={method ? "Editar método de pago" : "Agregar método de pago"} onClose={onClose} busy={saving}>
      <form onSubmit={submit}>
        <div className="space-y-3 px-5 py-4">
          {method && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
              Por seguridad los datos actuales no se muestran. Al guardar se reemplazan por completo y el método vuelve a quedar sin verificar.
            </p>
          )}
          <Field label="Tipo">
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value as PaymentMethodType);
                setValues({});
              }}
              className={inputClass}
            >
              {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethodType[]).map((k) => (
                <option key={k} value={k}>
                  {PAYMENT_METHOD_LABELS[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Titular">
            <input value={holderName} onChange={(e) => setHolderName(e.target.value)} maxLength={120} className={inputClass} />
          </Field>
          {fields.map((f) => (
            <Field key={f.key} label={f.required ? f.label : `${f.label} (opcional)`}>
              <input
                value={values[f.key] ?? ""}
                onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                maxLength={200}
                autoComplete="off"
                className={inputClass}
              />
            </Field>
          ))}
          {error && (
            <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
              {error}
            </p>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button type="button" onClick={onClose} disabled={saving} className={secondaryButton}>
            Cancelar
          </button>
          <button type="submit" disabled={saving} className={primaryButton}>
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            Guardar
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
