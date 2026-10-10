import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Option {
  value: string;
  label: string;
}

interface DropdownSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  className?: string;
}

export function DropdownSelect({ value, onChange, options, className }: DropdownSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // Posición del menú en coordenadas de viewport (el menú se renderiza en un
  // portal en <body> para que NINGÚN ancestro con overflow lo recorte).
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const selected = options.find((o) => o.value === value);

  const updatePosition = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const menuMaxHeight = 280;
    const spaceBelow = window.innerHeight - r.bottom;
    // Si no cabe debajo y hay más espacio arriba, abrir hacia arriba.
    const openUp = spaceBelow < Math.min(menuMaxHeight, 200) && r.top > spaceBelow;
    setPos({
      top: openUp ? r.top - 4 : r.bottom + 4,
      left: r.left,
      width: r.width,
    });
    // Guardamos también si abre hacia arriba usando top negativo via transform.
    (updatePosition as any)._openUp = openUp;
  }, []);

  const toggle = () => {
    if (!open) updatePosition();
    setOpen((v) => !v);
  };

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    const reposition = () => updatePosition();
    document.addEventListener("mousedown", handleClick);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, updatePosition]);

  const openUp = (updatePosition as any)._openUp as boolean | undefined;

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={toggle}
        className={cn(
          "flex items-center justify-between gap-2 w-full px-3 py-2 text-sm border rounded-lg bg-card whitespace-nowrap transition-colors",
          open ? "border-brand-400 ring-1 ring-brand-400" : "border-border hover:border-border"
        )}
      >
        <span className="font-medium text-foreground truncate">{selected?.label || value}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform shrink-0", open && "rotate-180")} />
      </button>

      {open && pos &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              top: openUp ? undefined : pos.top,
              bottom: openUp ? window.innerHeight - pos.top : undefined,
              left: pos.left,
              minWidth: pos.width,
              maxWidth: Math.max(pos.width, 280),
            }}
            className="z-[9999] max-h-[280px] overflow-y-auto bg-card border border-border rounded-lg shadow-lg p-1"
          >
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex items-center gap-2 w-full px-3 py-1.5 text-sm rounded-md text-left transition-colors",
                  option.value === value
                    ? "bg-brand-50 text-brand-700"
                    : "text-foreground hover:bg-muted"
                )}
              >
                <Check className={cn("h-3.5 w-3.5 shrink-0", option.value === value ? "opacity-100" : "opacity-0")} />
                <span className="truncate">{option.label}</span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
