import type { LedgerEntry } from "@/services/reclutamiento";
import { formatDate } from "./format";

export const LEDGER_LABELS: Record<LedgerEntry["type"], string> = {
  accrual: "Encuesta aprobada",
  reversal: "Reversa: rechazada por el cliente",
  payout: "Pago",
  adjustment: "Ajuste",
};

export const entryDetail = (e: LedgerEntry) =>
  [e.study, e.point, e.type === "payout" && e.paidAt ? `pagado el ${formatDate(e.paidAt)}` : null, e.reference, e.type !== "reversal" ? e.note : null].filter(Boolean).join(" · ");

