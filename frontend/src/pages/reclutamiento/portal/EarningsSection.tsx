import { useEffect, useRef, useState } from "react";
import { isUnauthorized, recruitPortalApi } from "@/services/recruitPortal";
import type { LedgerPage } from "@/services/reclutamiento";
import { formatDateTime, formatMoney } from "../format";
import { LEDGER_LABELS, entryDetail } from "../ledgerLabels";

/** Lo que la persona tiene por cobrar y sus movimientos: encuestas aprobadas, reversas y pagos. */
export function EarningsSection({ slug, token, onSessionLost }: { slug: string; token: string; onSessionLost: () => void }) {
  const [data, setData] = useState<LedgerPage | null>(null);
  const lost = useRef(onSessionLost);
  lost.current = onSessionLost;
  useEffect(() => {
    recruitPortalApi
      .earnings(slug, token)
      .then(setData)
      .catch((err) => {
        if (isUnauthorized(err)) lost.current();
        else setData({ balances: [], data: [], total: 0, page: 1, limit: 30 });
      });
  }, [slug, token]);
  if (!data || (data.balances.length === 0 && data.data.length === 0)) return null;
  return (
    <section aria-label="Tus ganancias" className="rounded-xl bg-card px-4 py-3 shadow-sm">
      <h2 className="text-xs font-semibold uppercase text-muted-foreground">Tus ganancias</h2>
      <div className="mt-2 flex flex-wrap gap-3">
        {data.balances.map((b) => (
          <div key={b.currency}>
            <p className="text-[11px] text-muted-foreground">Por cobrar</p>
            <p className="text-xl font-semibold tabular-nums text-foreground">{formatMoney(b.balance, b.currency)}</p>
          </div>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">Cada encuesta aprobada por tu reclutadora suma; si el cliente la rechaza, se descuenta. Tu reclutadora registra aquí los pagos que te hace.</p>
      {data.data.length > 0 && (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Movimientos ({data.total})</summary>
          <ul className="mt-2 divide-y divide-border">
            {data.data.map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-1.5">
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
        </details>
      )}
    </section>
  );
}
