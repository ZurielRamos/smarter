import type { PaymentMethodType } from "@/services/reclutamiento";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethodType, string> = {
  bank_transfer: "Transferencia bancaria",
  wallet: "Billetera digital",
  other: "Otro",
};

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("es", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

/** Fecha calendario (AAAA-MM-DD) sin desfase por zona horaria. */
export function formatDate(value: string | null): string {
  if (!value) return "—";
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("es", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
