import { useEffect, useRef } from "react";

/**
 * Input de código OTP segmentado: una casilla por dígito. Soporta pegar el
 * código completo, borrar con retroceso, moverse con flechas y auto-enfoca la
 * casilla activa. Llama `onComplete` cuando se llenan todas las casillas.
 */
export function OtpInput({
  value,
  onChange,
  onComplete,
  length = 6,
  primary = "#0f766e",
  autoFocus = true,
}: {
  value: string;
  onChange: (code: string) => void;
  onComplete?: (code: string) => void;
  length?: number;
  primary?: string;
  autoFocus?: boolean;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = value.split("").slice(0, length);

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  const setDigit = (index: number, d: string) => {
    const arr = value.split("");
    arr[index] = d;
    // Normaliza a longitud fija (rellena huecos con "").
    const next = Array.from({ length }, (_, i) => arr[i] ?? "").join("").replace(/[^0-9]/g, "");
    onChange(next);
    return next;
  };

  const handleChange = (index: number, raw: string) => {
    const only = raw.replace(/[^0-9]/g, "");
    if (!only) {
      const next = setDigit(index, "");
      maybeComplete(next);
      return;
    }
    // Si pegó varios dígitos, los distribuye desde la casilla actual.
    if (only.length > 1) {
      const arr = value.split("");
      let i = index;
      for (const ch of only) {
        if (i >= length) break;
        arr[i] = ch;
        i++;
      }
      const next = Array.from({ length }, (_, k) => arr[k] ?? "").join("");
      onChange(next);
      refs.current[Math.min(i, length - 1)]?.focus();
      maybeComplete(next);
      return;
    }
    const next = setDigit(index, only);
    if (index < length - 1) refs.current[index + 1]?.focus();
    maybeComplete(next);
  };

  const maybeComplete = (code: string) => {
    if (code.length === length && !code.includes("")) onComplete?.(code);
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (digits[index]) {
        setDigit(index, "");
      } else if (index > 0) {
        refs.current[index - 1]?.focus();
        setDigit(index - 1, "");
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      refs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < length - 1) {
      refs.current[index + 1]?.focus();
    }
  };

  return (
    <div className="flex items-center justify-center gap-2 sm:gap-2.5" dir="ltr">
      {Array.from({ length }).map((_, i) => {
        const filled = !!digits[i];
        return (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="text"
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            maxLength={length}
            value={digits[i] ?? ""}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onFocus={(e) => e.target.select()}
            className="h-14 w-11 sm:w-12 rounded-xl border bg-white text-center text-2xl font-bold text-slate-900 transition-all focus:outline-none focus:ring-2 focus:ring-offset-0"
            style={{
              borderColor: filled ? primary : "#e2e8f0",
              // Anillo sutil del color del tema al enfocar.
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ["--tw-ring-color" as any]: `${primary}33`,
            }}
          />
        );
      })}
    </div>
  );
}
