import { useState } from "react";
import type { FormQuestion } from "@/services/reclutamiento";
import { inputClass } from "../shared";
import type { Answers } from "./answers";

/** Con más opciones que esto (y sin «Otra»), una pregunta de una opción se muestra como lista desplegable. */
const DROPDOWN_FROM = 8;

const choiceClass = (on: boolean) =>
  `flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${on ? "border-brand-600 bg-brand-50 dark:bg-brand-700/30" : "border-border hover:bg-muted"}`;

/** Campos del formulario de registro de un proyecto (también es la vista previa del editor). */
export function QuestionFields({ questions, answers, onChange }: { questions: FormQuestion[]; answers: Answers; onChange: (id: string, value: unknown) => void }) {
  return (
    <div className="space-y-5">
      {questions.map((q) => (
        <QuestionField key={q.id} q={q} value={answers[q.id]} onChange={(v) => onChange(q.id, v)} />
      ))}
    </div>
  );
}

function QuestionField({ q, value, onChange }: { q: FormQuestion; value: unknown; onChange: (v: unknown) => void }) {
  const labelId = `q-${q.id}-label`;
  const helpId = q.help ? `q-${q.id}-help` : undefined;
  return (
    <div>
      <p id={labelId} className="mb-1 block text-sm font-medium text-foreground">
        {q.label}
        {q.required && <span className="text-rose-500" aria-label="obligatoria"> *</span>}
      </p>
      {q.help && (
        <p id={helpId} className="mb-2 text-xs text-muted-foreground">
          {q.help}
        </p>
      )}
      {q.type === "short" && (
        <input aria-labelledby={labelId} aria-describedby={helpId} value={(value as string) ?? ""} maxLength={200} placeholder={q.placeholder || undefined} onChange={(e) => onChange(e.target.value)} className={inputClass} />
      )}
      {q.type === "long" && (
        <>
          <textarea aria-labelledby={labelId} aria-describedby={helpId} rows={4} value={(value as string) ?? ""} maxLength={1000} placeholder={q.placeholder || undefined} onChange={(e) => onChange(e.target.value)} className={`${inputClass} resize-y`} />
          <p className="mt-1 text-right text-[11px] text-muted-foreground">{String(value ?? "").length}/1000</p>
        </>
      )}
      {q.type === "number" && (
        <input
          aria-labelledby={labelId}
          aria-describedby={helpId}
          type="number"
          inputMode="decimal"
          min={q.min ?? undefined}
          max={q.max ?? undefined}
          placeholder={q.placeholder || (q.min !== null && q.max !== null ? `Entre ${q.min} y ${q.max}` : undefined)}
          value={(value as string | number) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        />
      )}
      {q.type === "date" && (
        <input aria-labelledby={labelId} aria-describedby={helpId} type="date" min="1900-01-01" max="2100-12-31" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} className={inputClass} />
      )}
      {q.type === "single" && <SingleChoice q={q} labelId={labelId} value={value} onChange={onChange} />}
      {q.type === "multi" && <MultiChoice q={q} labelId={labelId} value={value} onChange={onChange} />}
      {q.type === "yesno" && (
        <div role="radiogroup" aria-labelledby={labelId} className="grid grid-cols-2 gap-2">
          {[true, false].map((b) => (
            <button
              key={String(b)}
              type="button"
              role="radio"
              aria-checked={value === b}
              onClick={() => onChange(b)}
              className={`rounded-lg border px-3 py-2 text-sm ${value === b ? "border-brand-600 bg-brand-50 text-brand-800 dark:bg-brand-700/30 dark:text-brand-100" : "border-border text-muted-foreground hover:bg-muted"}`}
            >
              {b ? "Sí" : "No"}
            </button>
          ))}
        </div>
      )}
      {q.type === "scale" && <Scale q={q} labelId={labelId} value={value} onChange={onChange} />}
    </div>
  );
}

function SingleChoice({ q, labelId, value, onChange }: { q: FormQuestion; labelId: string; value: unknown; onChange: (v: unknown) => void }) {
  const current = typeof value === "string" ? value : "";
  const isOption = q.options.includes(current);
  const [otherOn, setOtherOn] = useState(!!current && !isOption);
  if (!q.allowOther && q.options.length > DROPDOWN_FROM) {
    return (
      <select aria-labelledby={labelId} value={current} onChange={(e) => onChange(e.target.value)} className={inputClass}>
        <option value="">Elige una opción…</option>
        {q.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  return (
    <div role="radiogroup" aria-labelledby={labelId} className="space-y-1.5">
      {q.options.map((o) => (
        <label key={o} className={choiceClass(!otherOn && current === o)}>
          <input
            type="radio"
            name={`q-${q.id}`}
            checked={!otherOn && current === o}
            onChange={() => {
              setOtherOn(false);
              onChange(o);
            }}
          />
          <span className="text-foreground">{o}</span>
        </label>
      ))}
      {q.allowOther && (
        <OtherOption
          name={`q-${q.id}`}
          kind="radio"
          on={otherOn}
          text={otherOn && !isOption ? current : ""}
          onToggle={() => {
            setOtherOn(true);
            onChange(isOption ? "" : current);
          }}
          onText={(t) => onChange(t)}
        />
      )}
    </div>
  );
}

function MultiChoice({ q, labelId, value, onChange }: { q: FormQuestion; labelId: string; value: unknown; onChange: (v: unknown) => void }) {
  const picked = Array.isArray(value) ? (value as string[]) : [];
  const chosen = picked.filter((x) => q.options.includes(x));
  const otherText = picked.find((x) => !q.options.includes(x)) ?? "";
  const [otherOn, setOtherOn] = useState(!!otherText);
  const emit = (options: string[], other: string, on: boolean) => onChange([...options, ...(on && other.trim() ? [other] : [])]);
  return (
    <div role="group" aria-labelledby={labelId} className="space-y-1.5">
      {q.options.map((o) => {
        const on = chosen.includes(o);
        return (
          <label key={o} className={choiceClass(on)}>
            <input type="checkbox" checked={on} onChange={() => emit(on ? chosen.filter((x) => x !== o) : [...chosen, o], otherText, otherOn)} />
            <span className="text-foreground">{o}</span>
          </label>
        );
      })}
      {q.allowOther && (
        <OtherOption
          kind="checkbox"
          on={otherOn}
          text={otherText}
          onToggle={() => {
            setOtherOn(!otherOn);
            emit(chosen, otherText, !otherOn);
          }}
          onText={(t) => emit(chosen, t, true)}
        />
      )}
    </div>
  );
}

function OtherOption({ name, kind, on, text, onToggle, onText }: { name?: string; kind: "radio" | "checkbox"; on: boolean; text: string; onToggle: () => void; onText: (t: string) => void }) {
  return (
    <div className={`${choiceClass(on)} cursor-default`}>
      <input type={kind} name={name} checked={on} onChange={onToggle} aria-label="Otra" className="cursor-pointer" />
      <span className="shrink-0 text-foreground">Otra:</span>
      <input
        aria-label="Escribe tu respuesta"
        value={text}
        maxLength={100}
        disabled={!on}
        placeholder={on ? "Escribe tu respuesta" : ""}
        onChange={(e) => onText(e.target.value)}
        className="min-w-0 flex-1 border-0 border-b border-border bg-transparent px-1 py-0.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-brand-500 focus:outline-none disabled:opacity-50"
      />
    </div>
  );
}

function Scale({ q, labelId, value, onChange }: { q: FormQuestion; labelId: string; value: unknown; onChange: (v: unknown) => void }) {
  const min = q.min ?? 1;
  const max = q.max ?? 5;
  const steps = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <div>
      <div role="radiogroup" aria-labelledby={labelId} className="flex flex-wrap gap-1.5">
        {steps.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n}${n === min && q.minLabel ? ` (${q.minLabel})` : ""}${n === max && q.maxLabel ? ` (${q.maxLabel})` : ""}`}
            onClick={() => onChange(n)}
            className={`h-10 min-w-10 flex-1 rounded-lg border text-sm font-medium transition-colors ${value === n ? "border-brand-600 bg-brand-600 text-white" : "border-border text-foreground hover:bg-muted"}`}
          >
            {n}
          </button>
        ))}
      </div>
      {(q.minLabel || q.maxLabel) && (
        <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
          <span>{q.minLabel}</span>
          <span>{q.maxLabel}</span>
        </div>
      )}
    </div>
  );
}
