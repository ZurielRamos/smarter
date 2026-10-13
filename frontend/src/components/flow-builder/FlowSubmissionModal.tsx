import { Workflow, CheckCircle2, X } from "lucide-react";
import { describeSubmission } from "./model";
import type { FlowSubmissionRecord } from "@/services/api";

/**
 * Modal con el detalle de una respuesta de Flow/encuesta, formateado con las
 * preguntas y los títulos de las opciones (no los ids crudos), agrupado por
 * pantalla. Reutilizable desde el detalle del contacto y desde el chat.
 */
export function FlowSubmissionModal({
  submission,
  onClose,
  contained = false,
}: {
  submission: FlowSubmissionRecord;
  onClose: () => void;
  /**
   * Si es true, el modal se posiciona ABSOLUTO dentro de su contenedor
   * posicionado más cercano (p. ej. el panel del chat) en vez de FIJO sobre
   * toda la ventana. Útil para centrarlo dentro del área del chat.
   */
  contained?: boolean;
}) {
  const completed = submission.status === "completed";
  const answers = describeSubmission(submission.flow?.flowJson, submission.responseData || {});

  // Agrupar por pantalla preservando el orden de aparición.
  const groups: { screen: string; items: typeof answers }[] = [];
  for (const a of answers) {
    const key = a.screen || "Respuestas";
    let g = groups.find((x) => x.screen === key);
    if (!g) {
      g = { screen: key, items: [] };
      groups.push(g);
    }
    g.items.push(a);
  }

  return (
    <div className={`${contained ? "absolute" : "fixed"} inset-0 z-50 flex items-center justify-center`}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card text-card-foreground rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-start justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-lg bg-green-50 dark:bg-green-500/15 flex items-center justify-center shrink-0">
              <Workflow className="h-4.5 w-4.5 text-green-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-foreground truncate">
                {submission.flow?.name || "Respuesta de Flow"}
              </h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex items-center gap-1 ${
                    completed
                      ? "bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300"
                      : "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                  }`}
                >
                  {completed && <CheckCircle2 className="h-2.5 w-2.5" />}
                  {completed ? "Completado" : "En proceso"}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {new Date(submission.completedAt || submission.createdAt).toLocaleString("es-CO")}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto space-y-5">
          {answers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Esta respuesta no tiene datos registrados.
            </p>
          ) : (
            groups.map((group, gi) => (
              <div key={gi}>
                {group.screen && (
                  <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    {group.screen}
                  </h3>
                )}
                <div className="space-y-3">
                  {group.items.map((a) => (
                    <div key={a.key} className="border-b border-border pb-2.5 last:border-0 last:pb-0">
                      <p className="text-xs text-muted-foreground mb-0.5">{a.question}</p>
                      <p className="text-sm text-foreground font-medium break-words">{a.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
