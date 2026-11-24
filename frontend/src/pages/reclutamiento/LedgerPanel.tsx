import { useCallback, useEffect, useState } from "react";
import { Loader2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { reclutamientoApi, type LedgerPage, type SurveyorPaymentMethod } from "@/services/reclutamiento";
import { Field, ModalShell, inputClass, primaryButton, secondaryButton } from "./shared";
import { formatDateTime, formatMoney, PAYMENT_METHOD_LABELS } from "./format";
import { LEDGER_LABELS, entryDetail } from "./ledgerLabels";

const apiMessage = (err: unknown, fallback: string): string => {
  const m = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return typeof m === "string" ? m : fallback;
};

/** Saldo del encuestador y sus movimientos; registrar pagos hechos por fuera y ajustes con motivo. */
export function LedgerPanel({ tenantId, profileId, methods }: { tenantId: string; profileId: string; methods: SurveyorPaymentMethod[] }) {
  const [data, setData] = useState<LedgerPage | null>(null);
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<null | "payout" | "adjust">(null);
  const load = useCallback(() => {
    reclutamientoApi
      .ledger(tenantId, profileId, page)
      .then(setData)
      .catch(() => toast.error("No se pudo cargar el saldo"));
  }, [tenantId, profileId, page]);
  useEffect(load, [load]);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  const owed = data?.balances.filter((b) => b.balance > 0) ?? [];

  return (
    <section aria-label="Saldo y pagos" className="rounded-xl border border-border bg-background">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <Wallet className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Saldo y pagos</h3>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={() => setDialog("adjust")} className={secondaryButton}>
            Ajuste
          </button>
          <button type="button" disabled={owed.length === 0} onClick={() => setDialog("payout")} className={`${primaryButton} disabled:opacity-50`}>
            Registrar pago
          </button>
        </div>
      </header>
      <div className="space-y-3 px-4 py-3">
        <p className="text-[11px] text-muted-foreground">Cada encuesta que apruebas suma la tarifa del contrato vigente; si el cliente la rechaza después, se descuenta. Los pagos los haces por fuera y aquí los registras.</p>
        {!data ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <>
            <div className="flex flex-wrap gap-3">
              {data.balances.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin movimientos todavía.</p>
              ) : (
                data.balances.map((b) => (
                  <div key={b.currency} className="rounded-lg bg-muted/50 px-3 py-2">
                    <p className="text-[11px] text-muted-foreground">Por pagar</p>
                    <p className={`text-lg font-semibold tabular-nums ${b.balance < 0 ? "text-rose-600 dark:text-rose-400" : "text-foreground"}`}>{formatMoney(b.balance, b.currency)}</p>
                  </div>
                ))
              )}
            </div>
            {data.data.length > 0 && (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {data.data.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 px-3 py-2 text-xs">
                    <span className="min-w-0 flex-1">
                      <span className="block text-foreground">{LEDGER_LABELS[e.type]}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {formatDateTime(e.createdAt)}
                        {entryDetail(e) ? ` · ${entryDetail(e)}` : ""}
                      </span>
                    </span>
                    <span className={`shrink-0 tabular-nums ${e.amount < 0 ? "text-rose-600 dark:text-rose-400" : "text-green-700 dark:text-green-300"}`}>
                      {e.amount > 0 ? "+" : ""}
                      {formatMoney(e.amount, e.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {pages > 1 && (
              <div className="flex items-center justify-center gap-2 text-xs">
                <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className={secondaryButton}>
                  Anterior
                </button>
                <span className="text-muted-foreground">
                  {page} de {pages}
                </span>
                <button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className={secondaryButton}>
                  Siguiente
                </button>
              </div>
            )}
          </>
        )}
      </div>
      {dialog === "payout" && data && (
        <PayoutModal
          balances={owed}
          methods={methods}
          onClose={() => setDialog(null)}
          onSave={async (input) => {
            const r = await reclutamientoApi.registerPayout(tenantId, profileId, input);
            toast.success(`Pago registrado. Saldo: ${formatMoney(r.balance, r.currency)}`);
            setDialog(null);
            setPage(1);
            load();
          }}
        />
      )}
      {dialog === "adjust" && (
        <AdjustModal
          currencies={data?.balances.map((b) => b.currency) ?? []}
          onClose={() => setDialog(null)}
          onSave={async (input) => {
            await reclutamientoApi.registerAdjustment(tenantId, profileId, input);
            toast.success("Ajuste registrado");
            setDialog(null);
            setPage(1);
            load();
          }}
        />
      )}
    </section>
  );
}

function PayoutModal({
  balances,
  methods,
  onClose,
  onSave,
}: {
  balances: Array<{ currency: string; balance: number }>;
  methods: SurveyorPaymentMethod[];
  onClose: () => void;
  onSave: (input: { amount: number; currency: string; paidAt: string; reference: string | null; note: string | null; paymentMethodId: string | null }) => Promise<void>;
}) {
  const [currency, setCurrency] = useState(balances[0]?.currency ?? "COP");
  const owed = balances.find((b) => b.currency === currency)?.balance ?? 0;
  const [amount, setAmount] = useState(String(owed));
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const usable = methods.filter((m) => m.verifiedAt);
  const [methodId, setMethodId] = useState(usable.find((m) => m.isDefault)?.id ?? usable[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const n = Number(amount);
  const valid = Number.isFinite(n) && n > 0 && n <= owed + 0.001;
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await onSave({ amount: n, currency, paidAt, reference: reference.trim() || null, note: note.trim() || null, paymentMethodId: methodId || null });
    } catch (err) {
      setError(apiMessage(err, "No se pudo registrar el pago"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <ModalShell title="Registrar pago" onClose={onClose} busy={busy}>
      <div className="space-y-3 px-5 py-4">
        <p className="text-xs text-muted-foreground">Registra un pago que ya hiciste por fuera de la plataforma. Se descuenta del saldo y la persona lo ve en su portal.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Valor" hint={`Saldo por pagar: ${formatMoney(owed, currency)}`}>
            <input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} />
          </Field>
          {balances.length > 1 ? (
            <Field label="Moneda">
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputClass}>
                {balances.map((b) => (
                  <option key={b.currency}>{b.currency}</option>
                ))}
              </select>
            </Field>
          ) : (
            <Field label="Fecha del pago">
              <input type="date" max={new Date().toISOString().slice(0, 10)} value={paidAt} onChange={(e) => setPaidAt(e.target.value)} className={inputClass} />
            </Field>
          )}
        </div>
        {balances.length > 1 && (
          <Field label="Fecha del pago">
            <input type="date" max={new Date().toISOString().slice(0, 10)} value={paidAt} onChange={(e) => setPaidAt(e.target.value)} className={inputClass} />
          </Field>
        )}
        <Field label="Método de pago">
          <select value={methodId} onChange={(e) => setMethodId(e.target.value)} className={inputClass}>
            <option value="">Sin especificar</option>
            {usable.map((m) => (
              <option key={m.id} value={m.id}>
                {PAYMENT_METHOD_LABELS[m.method]} · {m.holderName}
                {m.hint ? ` · ${m.hint}` : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Referencia (opcional)" hint="Número de transferencia o comprobante.">
          <input value={reference} maxLength={120} onChange={(e) => setReference(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Nota (opcional)">
          <input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} className={inputClass} />
        </Field>
        {error && (
          <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}
      </div>
      <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
        <button type="button" onClick={onClose} disabled={busy} className={secondaryButton}>
          Cancelar
        </button>
        <button type="button" onClick={save} disabled={!valid || busy} className={`${primaryButton} disabled:opacity-50`}>
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Registrar pago
        </button>
      </div>
    </ModalShell>
  );
}

function AdjustModal({ currencies, onClose, onSave }: { currencies: string[]; onClose: () => void; onSave: (input: { amount: number; currency: string; note: string }) => Promise<void> }) {
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(currencies[0] ?? "COP");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const n = Number(amount);
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await onSave({ amount: n, currency, note: note.trim() });
    } catch (err) {
      setError(apiMessage(err, "No se pudo registrar el ajuste"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <ModalShell title="Ajuste de saldo" onClose={onClose} busy={busy}>
      <div className="space-y-3 px-5 py-4">
        <p className="text-xs text-muted-foreground">Para corregir el saldo: positivo suma lo que se le debe a la persona, negativo lo resta. Queda registrado con el motivo.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Valor (con signo)">
            <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Moneda">
            <input value={currency} maxLength={3} onChange={(e) => setCurrency(e.target.value.toUpperCase())} className={`${inputClass} uppercase`} />
          </Field>
        </div>
        <Field label="Motivo">
          <input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} className={inputClass} />
        </Field>
        {error && (
          <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}
      </div>
      <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
        <button type="button" onClick={onClose} disabled={busy} className={secondaryButton}>
          Cancelar
        </button>
        <button type="button" onClick={save} disabled={busy || !Number.isFinite(n) || n === 0 || note.trim().length < 3 || !/^[A-Z]{3}$/.test(currency)} className={`${primaryButton} disabled:opacity-50`}>
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Registrar ajuste
        </button>
      </div>
    </ModalShell>
  );
}
