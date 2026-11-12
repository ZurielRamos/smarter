export function formatDuration(ms: number | null | undefined) {
  if (ms === null || ms === undefined) return "—";
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export const triggerLabels: Record<string, string> = {
  manual: "Manual",
  test: "Prueba",
  webhook: "Webhook",
  schedule: "Programada",
  event: "Evento del CRM",
};

