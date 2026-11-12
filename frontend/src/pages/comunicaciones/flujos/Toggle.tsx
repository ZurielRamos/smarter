import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

/** Interruptor con etiqueta y descripción (role="switch"). */
export function Toggle({ checked, onChange, label, description, disabled }: ToggleProps) {
  const id = useId();
  return (
    <div className={cn("flex items-start gap-2.5", disabled && "opacity-50")}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? `${id}-desc` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300",
          checked ? "bg-brand-600" : "bg-muted-foreground/30",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "inline-block h-3 w-3 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-3.5" : "translate-x-0.5",
          )}
        />
      </button>
      <div className="min-w-0">
        <label htmlFor={id} className="block cursor-pointer text-xs font-medium text-foreground">
          {label}
        </label>
        {description && (
          <p id={`${id}-desc`} className="text-[11px] text-muted-foreground">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
