import * as Popover from "@radix-ui/react-popover";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Selector de color elegante: muestra el color actual, un popover con muestras
 * (swatches) de un clic, un picker nativo y entrada hex manual.
 */

// Paleta curada de muestras (tonos de marca + neutros habituales).
const SWATCHES = [
  "#1f6feb", "#2563eb", "#7c3aed", "#db2777", "#e11d48", "#ea580c",
  "#f59e0b", "#16a34a", "#059669", "#0891b2", "#0f172a", "#334155",
  "#64748b", "#94a3b8", "#e2e8f0", "#f3f4f6", "#ffffff", "#000000",
];

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function ColorPicker({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (hex: string) => void;
  label?: string;
}) {
  const normalized = HEX_RE.test(value) ? value : "#000000";

  return (
    <div>
      {label && (
        <label className="block text-[11px] font-medium text-foreground mb-1.5">{label}</label>
      )}
      <Popover.Root>
        <Popover.Trigger asChild>
          <button
            type="button"
            className="flex items-center gap-2 w-full px-2.5 py-2 rounded-lg border border-border bg-background hover:border-brand-300 transition-colors"
          >
            <span
              className="h-6 w-6 rounded-md border border-border shrink-0"
              style={{ background: normalized }}
            />
            <span className="text-sm font-mono text-foreground">{value || "—"}</span>
          </button>
        </Popover.Trigger>

        <Popover.Portal>
          <Popover.Content
            sideOffset={6}
            align="start"
            className="z-[9999] w-60 rounded-xl border border-border bg-card shadow-xl p-3 animate-in fade-in zoom-in-95 duration-150"
          >
            {/* Muestras */}
            <div className="grid grid-cols-6 gap-1.5 mb-3">
              {SWATCHES.map((c) => {
                const active = c.toLowerCase() === normalized.toLowerCase();
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => onChange(c)}
                    title={c}
                    className={cn(
                      "h-7 w-7 rounded-md border flex items-center justify-center transition-transform hover:scale-110",
                      active ? "border-brand-500 ring-1 ring-brand-400" : "border-border",
                    )}
                    style={{ background: c }}
                  >
                    {active && (
                      <Check
                        className="h-3.5 w-3.5"
                        style={{ color: isLight(c) ? "#111827" : "#ffffff" }}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Picker nativo + hex. min-w-0 permite que el input se encoja
                dentro del flex y no desborde el popover. */}
            <div className="flex items-center gap-2 w-full">
              <input
                type="color"
                value={normalized}
                onChange={(e) => onChange(e.target.value)}
                className="h-9 w-10 rounded-md border border-border bg-background cursor-pointer p-0.5 shrink-0"
                title="Selector de color"
              />
              <input
                type="text"
                value={value}
                onChange={(e) => {
                  // Permite escribir con/sin #; normaliza al vuelo.
                  let v = e.target.value.trim();
                  if (v && !v.startsWith("#")) v = `#${v}`;
                  onChange(v);
                }}
                placeholder="#RRGGBB"
                className="flex-1 min-w-0 px-2.5 py-2 rounded-md border border-border bg-background text-foreground text-sm font-mono focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200"
              />
            </div>
            {value && !HEX_RE.test(value) && (
              <p className="text-[10px] text-amber-600 mt-1.5">Formato hex inválido (usa #RRGGBB).</p>
            )}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

/** true si el color es claro (para elegir el color del check de contraste). */
function isLight(hex: string): boolean {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  // Luminancia percibida.
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6;
}
