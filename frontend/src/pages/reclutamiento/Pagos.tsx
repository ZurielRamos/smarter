import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Search, Wallet } from "lucide-react";
import { toast } from "sonner";
import { reclutamientoApi, type BalanceRow } from "@/services/reclutamiento";
import { ProfileStatusBadge, Spinner, inputClass } from "./shared";
import { formatDateTime, formatMoney } from "./format";
import { useTenantId } from "./useTenantId";

/** Saldos de la cuenta: a quién se le debe por encuestas aprobadas y cuánto en total. */
export function Pagos() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const tenantId = useTenantId();
  const [search, setSearch] = useState("");
  const [data, setData] = useState<{ data: BalanceRow[]; totals: Array<{ currency: string; total: number }> } | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    const t = setTimeout(() => {
      reclutamientoApi
        .balances(tenantId, search)
        .then(setData)
        .catch(() => toast.error("No se pudieron cargar los saldos"));
    }, 250);
    return () => clearTimeout(t);
  }, [tenantId, search]);

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">Pagos</h2>
          <p className="text-xs text-muted-foreground">Lo que le debes a cada encuestador por encuestas aprobadas. Abre a la persona para registrar un pago.</p>
        </div>
        <div className="relative ml-auto w-64 max-w-full">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar encuestador" aria-label="Buscar encuestador" className={`${inputClass} pl-9`} />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {!data ? (
          <Spinner />
        ) : (
          <div className="mx-auto max-w-4xl space-y-4">
            <div className="flex flex-wrap gap-3">
              {data.totals.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay saldos pendientes.</p>
              ) : (
                data.totals.map((t) => (
                  <div key={t.currency} className="rounded-xl border border-border bg-background px-4 py-3">
                    <p className="text-[11px] uppercase text-muted-foreground">Total por pagar</p>
                    <p className="text-xl font-semibold tabular-nums text-foreground">{formatMoney(t.total, t.currency)}</p>
                  </div>
                ))
              )}
            </div>
            {data.data.length === 0 ? (
              <div className="mx-auto mt-8 max-w-sm text-center">
                <Wallet className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">{search ? "Nadie coincide con la búsqueda." : "Cuando apruebes encuestas, aquí verás lo que le debes a cada persona."}</p>
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="text-[11px] uppercase text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 font-medium">Encuestador</th>
                    <th className="px-3 py-2 font-medium">Estado</th>
                    <th className="px-3 py-2 font-medium">Último movimiento</th>
                    <th className="px-3 py-2 text-right font-medium">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((r) => (
                    <tr key={`${r.profileId}-${r.currency}`} onClick={() => navigate(`/${slug}/reclutamiento/${r.profileId}`)} className="cursor-pointer border-b border-border hover:bg-muted/50">
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-foreground">{r.name ?? "Sin nombre"}</p>
                        {r.email && <p className="text-[11px] text-muted-foreground">{r.email}</p>}
                      </td>
                      <td className="px-3 py-2.5">{r.status && <ProfileStatusBadge status={r.status} />}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{formatDateTime(r.lastMovement)}</td>
                      <td className={`px-3 py-2.5 text-right tabular-nums ${r.balance < 0 ? "text-rose-600 dark:text-rose-400" : "text-foreground"}`}>{formatMoney(r.balance, r.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
