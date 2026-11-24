import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { glassButton } from "./glass";

interface Option {
  value: string;
  label: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  /** Nombre accesible del selector. */
  label: string;
}

/**
 * Selector para la banda oscura. Mismo menú desplegable que usa Contactos en
 * "Listas": botón translúcido y lista flotante propia, sin <select> nativo.
 */
export function GlassSelect({ value, onChange, options, label }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button type="button" aria-label={label} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((v) => !v)} className={glassButton}>
        <span>{selected?.label ?? label}</span>
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={label}
          className="absolute right-0 top-full mt-2 w-48 bg-popover text-popover-foreground rounded-lg shadow-lg border border-border py-1 z-50 animate-in fade-in slide-in-from-top-1 duration-150"
        >
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
            >
              <Check className={`h-3.5 w-3.5 shrink-0 ${o.value === value ? "opacity-100" : "opacity-0"}`} />
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
