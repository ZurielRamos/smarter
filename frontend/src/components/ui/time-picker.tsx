import { useState, useRef, useEffect } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface TimePickerProps {
  value: string; // HH:mm format (24h internally)
  onChange: (value: string) => void;
}

export function TimePicker({ value, onChange }: TimePickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse value
  const [hour, minute] = value ? value.split(":").map(Number) : [8, 0];
  const isPM = hour >= 12;
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const setHour = (h: number) => {
    const h24 = isPM ? (h === 12 ? 12 : h + 12) : (h === 12 ? 0 : h);
    onChange(`${h24.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`);
  };

  const setMinute = (m: number) => {
    onChange(`${hour.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`);
  };

  const togglePeriod = () => {
    const newHour = isPM ? hour - 12 : hour + 12;
    onChange(`${newHour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`);
  };

  const displayValue = value
    ? `${displayHour}:${minute.toString().padStart(2, "0")} ${isPM ? "PM" : "AM"}`
    : "";

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 text-sm border rounded-lg bg-white transition-colors min-w-[120px]",
          open ? "border-brand-400 ring-1 ring-brand-400" : "border-gray-200 hover:border-gray-300",
          !value && "text-gray-400"
        )}
      >
        <Clock className="h-3.5 w-3.5 text-gray-400" />
        <span>{displayValue || "Hora"}</span>
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg p-3 w-[220px]">
          <div className="flex gap-2">
            {/* Hours */}
            <div className="flex-1">
              <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1.5 text-center">Hora</p>
              <div className="h-[180px] overflow-y-auto space-y-0.5 pr-1">
                {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setHour(h)}
                    className={cn(
                      "w-full py-1.5 rounded-md text-sm font-medium transition-colors",
                      displayHour === h
                        ? "bg-brand-600 text-white"
                        : "text-gray-700 hover:bg-gray-100"
                    )}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>

            {/* Minutes */}
            <div className="flex-1">
              <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1.5 text-center">Min</p>
              <div className="h-[180px] overflow-y-auto space-y-0.5 pr-1">
                {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMinute(m)}
                    className={cn(
                      "w-full py-1.5 rounded-md text-sm font-medium transition-colors",
                      minute === m
                        ? "bg-brand-600 text-white"
                        : "text-gray-700 hover:bg-gray-100"
                    )}
                  >
                    {m.toString().padStart(2, "0")}
                  </button>
                ))}
              </div>
            </div>

            {/* AM/PM */}
            <div className="w-[50px]">
              <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1.5 text-center">  </p>
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => { if (isPM) togglePeriod(); }}
                  className={cn(
                    "w-full py-2 rounded-md text-xs font-semibold transition-colors",
                    !isPM
                      ? "bg-brand-600 text-white"
                      : "text-gray-500 hover:bg-gray-100"
                  )}
                >
                  AM
                </button>
                <button
                  type="button"
                  onClick={() => { if (!isPM) togglePeriod(); }}
                  className={cn(
                    "w-full py-2 rounded-md text-xs font-semibold transition-colors",
                    isPM
                      ? "bg-brand-600 text-white"
                      : "text-gray-500 hover:bg-gray-100"
                  )}
                >
                  PM
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
