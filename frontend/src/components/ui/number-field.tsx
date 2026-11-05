import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface NumberFieldProps {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  /** Se dispara al salir del campo / Enter, con el valor ya normalizado. */
  onCommit?: (value: number | null) => void;
  min?: number;
  max?: number;
  /** Decimales permitidos (0 = enteros). Default: 2. */
  decimals?: number;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Campo numérico SIN controles nativos (nada de <input type="number">, sin
 * spinners del navegador). Usa type="text" con inputMode numérico y filtra la
 * entrada a dígitos (opcionalmente con signo y decimales). Mantiene un string
 * interno para permitir estados intermedios (vacío, "-", "1.") y emite number
 * al padre; al confirmar aplica min/max.
 */
export function NumberField({
  value,
  onChange,
  onCommit,
  min,
  max,
  decimals = 2,
  placeholder,
  className,
  disabled,
}: NumberFieldProps) {
  const [text, setText] = useState(value == null ? "" : String(value));

  // Sincroniza cuando el valor externo cambia (y no es el mismo que escribimos).
  useEffect(() => {
    const external = value == null ? "" : String(value);
    if (parseFloat(text) !== value && !(text === "" && value == null)) {
      setText(external);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const sanitize = (raw: string): string => {
    const allowNeg = min === undefined || min < 0;
    // Permite dígitos, un punto decimal (si aplica) y signo al inicio.
    let cleaned = raw.replace(decimals > 0 ? /[^0-9.\-]/g : /[^0-9\-]/g, "");
    if (!allowNeg) cleaned = cleaned.replace(/-/g, "");
    else cleaned = cleaned.replace(/(?!^)-/g, ""); // solo un signo al inicio
    if (decimals > 0) {
      const parts = cleaned.split(".");
      cleaned = parts.shift()! + (parts.length ? "." + parts.join("").slice(0, decimals) : "");
    }
    return cleaned;
  };

  const handleChange = (raw: string) => {
    const cleaned = sanitize(raw);
    setText(cleaned);
    if (cleaned === "" || cleaned === "-" || cleaned === ".") {
      onChange(null);
      return;
    }
    const n = parseFloat(cleaned);
    if (!isNaN(n)) onChange(n);
  };

  const commit = () => {
    if (text === "" || text === "-" || text === ".") {
      setText("");
      onCommit?.(null);
      return;
    }
    let n = parseFloat(text);
    if (isNaN(n)) {
      setText(value == null ? "" : String(value));
      return;
    }
    if (min !== undefined) n = Math.max(min, n);
    if (max !== undefined) n = Math.min(max, n);
    setText(String(n));
    onChange(n);
    onCommit?.(n);
  };

  return (
    <input
      type="text"
      inputMode={decimals > 0 ? "decimal" : "numeric"}
      value={text}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => handleChange(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className={cn(
        "w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200 disabled:opacity-60",
        className,
      )}
    />
  );
}
