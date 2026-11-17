import { AlertTriangle, CheckCircle2, Info, Loader2 } from "lucide-react";
import type { PreviewResult } from "@/services/reclutamiento";

const SOURCE_HINT: Record<string, string> = {
  contact: "Falta en la ficha del contacto (o se completa al generar el contrato)",
  input: "Se completa al generar el contrato",
  contract: "Se define al generar el contrato",
  template: "Defínelo en la plantilla",
};

/** Resultado de redactar la plantilla con datos de ejemplo: datos que faltan y texto final. */
export function TemplatePreview({ result, loading }: { result: PreviewResult | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Generando vista previa" />
      </div>
    );
  }
  if (!result) {
    return <p className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-xs text-muted-foreground">La vista previa aparece aquí.</p>;
  }

  const { missing, blockers, warnings } = result;
  const hasErrors = result.errors.length > 0;

  return (
    <div className="space-y-3">
      {blockers.length > 0 && (
        <div role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:bg-rose-500/15 dark:text-rose-200">
          <ul className="list-disc pl-4">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
        </div>
      )}
      {missing.length > 0 && (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-500/15 dark:text-amber-100">
          <p className="mb-1 flex items-center gap-1 font-medium"><AlertTriangle className="h-3.5 w-3.5" /> Sin valor en la vista previa</p>
          <ul className="list-disc space-y-0.5 pl-4">
            {missing.map((m) => (
              <li key={m.path}><strong>{m.label}</strong> <span className="opacity-80">· {SOURCE_HINT[m.source]}</span></li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          <p className="mb-1 flex items-center gap-1 font-medium text-foreground"><Info className="h-3.5 w-3.5" /> Avisos</p>
          <ul className="list-disc space-y-0.5 pl-4">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </div>
      )}
      {!hasErrors && missing.length === 0 && blockers.length === 0 && (
        <p className="flex items-center gap-1.5 text-xs text-green-700 dark:text-green-300">
          <CheckCircle2 className="h-3.5 w-3.5" /> El contrato se redacta completo con los datos de ejemplo.
        </p>
      )}
      {result.text && <ContractText clauses={[{ number: 1, title: "", body: result.text }]} />}
    </div>
  );
}

/** Documento del contrato. Los contratos anteriores traen cláusulas con título; los nuevos, un único bloque sin título. */
export function ContractText({
  clauses,
  language = "es",
}: {
  clauses: Array<{ number: number; title: string; body: string }>;
  language?: "es" | "en";
}) {
  return (
    <article className="space-y-4 rounded-xl border border-border bg-white p-6 text-sm leading-relaxed text-gray-900 shadow-sm">
      {clauses.map((c) => (
        <section key={c.number}>
          {c.title && (
            <h4 className="mb-1 font-semibold uppercase tracking-wide text-gray-800">
              {language === "en" ? "Clause" : "Cláusula"} {c.number}. {c.title}
            </h4>
          )}
          {/* Texto plano: React escapa el contenido; whitespace-pre-wrap conserva los saltos de línea del contrato. */}
          <p className="whitespace-pre-wrap text-justify">{c.body}</p>
        </section>
      ))}
    </article>
  );
}
