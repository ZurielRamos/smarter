import { useId } from "react";
import { cn } from "@/lib/utils";
import { AI_MODE_OPTIONS } from "./inputs";
import type { FlowAiMode } from "./types";

const labelClass = "block text-xs font-medium text-foreground mb-1";

/** Modo de la IA en botones, como la «Velocidad de respuesta» de los bots. */
export function AiModePicker({ value, onChange }: { value?: FlowAiMode; onChange: (v: FlowAiMode | undefined) => void }) {
  const current = value ?? "";
  const labelId = useId();
  return (
    <div>
      <span id={labelId} className={labelClass}>
        Modo
      </span>
      <div role="radiogroup" aria-labelledby={labelId} className="grid grid-cols-2 gap-1.5">
        {AI_MODE_OPTIONS.map((m) => {
          const active = current === m.value;
          return (
            <button
              key={m.value || "balanced"}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(m.value || undefined)}
              className={cn(
                "rounded-lg border px-2 py-1.5 text-left transition-colors",
                active
                  ? "border-brand-400 bg-brand-100 dark:bg-brand-900/40"
                  : "border-border bg-card hover:bg-muted",
              )}
            >
              <span
                className={cn(
                  "block text-xs font-medium",
                  active ? "text-brand-800 dark:text-brand-100" : "text-foreground",
                )}
              >
                {m.label}
              </span>
              <span className="block text-[10px] text-muted-foreground">{m.description}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

