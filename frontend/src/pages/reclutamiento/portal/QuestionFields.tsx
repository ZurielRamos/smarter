import type { FormQuestion } from "@/services/reclutamiento";
import { inputClass } from "../shared";
import type { Answers } from "./answers";

/** Campos del formulario de postulación de un proyecto. */
export function QuestionFields({ questions, answers, onChange }: { questions: FormQuestion[]; answers: Answers; onChange: (id: string, value: unknown) => void }) {
  return (
    <div className="space-y-4">
      {questions.map((q) => {
        const value = answers[q.id];
        const labelId = `q-${q.id}-label`;
        return (
          <div key={q.id}>
            <p id={labelId} className="mb-1 block text-xs font-medium text-foreground">
              {q.label}
              {q.required && <span className="text-rose-500" aria-label="obligatoria"> *</span>}
            </p>
            {q.help && <p className="mb-1.5 text-[11px] text-muted-foreground">{q.help}</p>}
            {q.type === "short" && (
              <input aria-labelledby={labelId} value={(value as string) ?? ""} maxLength={200} onChange={(e) => onChange(q.id, e.target.value)} className={inputClass} />
            )}
            {q.type === "long" && (
              <textarea aria-labelledby={labelId} rows={3} value={(value as string) ?? ""} maxLength={1000} onChange={(e) => onChange(q.id, e.target.value)} className={inputClass} />
            )}
            {q.type === "number" && (
              <input
                aria-labelledby={labelId}
                type="number"
                inputMode="decimal"
                min={q.min ?? undefined}
                max={q.max ?? undefined}
                value={(value as string | number) ?? ""}
                onChange={(e) => onChange(q.id, e.target.value)}
                className={inputClass}
              />
            )}
            {q.type === "single" && (
              <div role="radiogroup" aria-labelledby={labelId} className="space-y-1.5">
                {q.options.map((o) => (
                  <label key={o} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${value === o ? "border-brand-600 bg-brand-50 dark:bg-brand-700/30" : "border-border hover:bg-muted"}`}>
                    <input type="radio" name={`q-${q.id}`} checked={value === o} onChange={() => onChange(q.id, o)} />
                    <span className="text-foreground">{o}</span>
                  </label>
                ))}
              </div>
            )}
            {q.type === "multi" && (
              <div role="group" aria-labelledby={labelId} className="space-y-1.5">
                {q.options.map((o) => {
                  const picked = Array.isArray(value) ? (value as string[]) : [];
                  const on = picked.includes(o);
                  return (
                    <label key={o} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${on ? "border-brand-600 bg-brand-50 dark:bg-brand-700/30" : "border-border hover:bg-muted"}`}>
                      <input type="checkbox" checked={on} onChange={() => onChange(q.id, on ? picked.filter((x) => x !== o) : [...picked, o])} />
                      <span className="text-foreground">{o}</span>
                    </label>
                  );
                })}
              </div>
            )}
            {q.type === "yesno" && (
              <div role="radiogroup" aria-labelledby={labelId} className="grid grid-cols-2 gap-2">
                {[true, false].map((b) => (
                  <button
                    key={String(b)}
                    type="button"
                    role="radio"
                    aria-checked={value === b}
                    onClick={() => onChange(q.id, b)}
                    className={`rounded-lg border px-3 py-2 text-sm ${value === b ? "border-brand-600 bg-brand-50 text-brand-800 dark:bg-brand-700/30 dark:text-brand-100" : "border-border text-muted-foreground hover:bg-muted"}`}
                  >
                    {b ? "Sí" : "No"}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
