import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { HexColorPicker } from "react-colorful";
import { Lock, Unlock, ChevronDown, Check } from "lucide-react";

export const inputCls = "w-full px-2.5 py-1.5 rounded-md border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500";
export const labelCls = "block text-[10px] font-medium text-gray-500 uppercase mb-1";

export function AlignButtons({ value, onSelect }: { value: string; onSelect: (v: string) => void }) {
  return (
    <div className="flex gap-1">
      {(["left", "center", "right"] as const).map((a) => (
        <button key={a} onClick={() => onSelect(a)} className={`flex-1 py-1 rounded text-xs font-medium border transition-colors ${value === a ? "bg-brand-50 border-brand-300 text-brand-700" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
          {a === "left" ? "Izq" : a === "center" ? "Centro" : "Der"}
        </button>
      ))}
    </div>
  );
}

export function VerticalAlignButtons({ value, onSelect }: { value: string; onSelect: (v: string) => void }) {
  return (
    <div className="flex gap-1">
      {(["top", "middle", "bottom"] as const).map((a) => (
        <button key={a} onClick={() => onSelect(a)} className={`flex-1 py-1 rounded text-xs font-medium border transition-colors ${value === a ? "bg-brand-50 border-brand-300 text-brand-700" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
          {a === "top" ? "Arriba" : a === "middle" ? "Centro" : "Abajo"}
        </button>
      ))}
    </div>
  );
}

export function Stepper({ value, onChange, min = 0, max = 200 }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <div className="inline-flex items-center border border-gray-200 rounded-full overflow-hidden">
      <button onClick={() => onChange(Math.max(min, value - 1))} className="w-8 h-8 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors text-sm">&minus;</button>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Math.max(min, Math.min(max, parseInt(e.target.value) || 0)))}
        className="w-10 h-8 text-center text-xs font-semibold text-gray-700 border-x border-gray-200 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button onClick={() => onChange(Math.min(max, value + 1))} className="w-8 h-8 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors text-sm">+</button>
    </div>
  );
}

function LockButton({ locked, onClick }: { locked: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-colors ${locked ? "border-green-400 bg-green-50 text-green-600" : "border-gray-300 text-gray-400 hover:border-gray-400"}`}
    >
      {locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
    </button>
  );
}

export function FourSideEditor({ top, right, bottom, left, onChange }: { top: number; right: number; bottom: number; left: number; onChange: (t: number, r: number, b: number, l: number) => void }) {
  const [linked, setLinked] = useState(top === right && right === bottom && bottom === left);

  const handle = (side: "top" | "right" | "bottom" | "left", value: number) => {
    if (linked) {
      onChange(value, value, value, value);
    } else {
      const v = { top, right, bottom, left, [side]: value };
      onChange(v.top, v.right, v.bottom, v.left);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <Stepper value={top} onChange={(v) => handle("top", v)} />
      <div className="flex items-center gap-3">
        <Stepper value={left} onChange={(v) => handle("left", v)} />
        <LockButton locked={linked} onClick={() => setLinked(!linked)} />
        <Stepper value={right} onChange={(v) => handle("right", v)} />
      </div>
      <Stepper value={bottom} onChange={(v) => handle("bottom", v)} />
    </div>
  );
}

export function ColorPicker({ value, onChange, fullWidth }: { value: string; onChange: (v: string) => void; fullWidth?: boolean }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const openPicker = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setCoords({ top: rect.bottom + 6, left: Math.min(rect.left, window.innerWidth - 240) });
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node) && triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <>
      <div ref={triggerRef} className="flex items-center gap-2">
        <button
          onClick={openPicker}
          className="w-8 h-8 rounded-lg border border-gray-200 shadow-sm cursor-pointer shrink-0 transition-transform hover:scale-105"
          style={{ backgroundColor: value }}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${fullWidth ? "flex-1" : "w-20"} px-2.5 py-1.5 rounded-md border border-gray-200 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-brand-500`}
        />
      </div>

      {open && createPortal(
        <div ref={popoverRef} className="fixed z-[9999]" style={{ top: coords.top, left: coords.left }}>
          <div className="bg-white rounded-xl shadow-2xl border border-gray-200 p-3 w-[220px]">
            <HexColorPicker color={value} onChange={onChange} style={{ width: "100%", height: "160px" }} />
            <div className="mt-3 flex items-center gap-2">
              <div className="w-6 h-6 rounded-md border border-gray-200" style={{ backgroundColor: value }} />
              <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className="flex-1 px-2 py-1 rounded-md border border-gray-200 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {["#000000", "#ffffff", "#f44336", "#e91e63", "#9c27b0", "#673ab7", "#3f51b5", "#2196f3", "#03a9f4", "#009688", "#4caf50", "#8bc34a", "#ffeb3b", "#ff9800", "#ff5722", "#795548"].map((c) => (
                <button key={c} onClick={() => onChange(c)} className="w-5 h-5 rounded-md border border-gray-200 transition-transform hover:scale-110" style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}


const EMAIL_FONTS = [
  { value: "Arial, sans-serif", label: "Arial" },
  { value: "Helvetica, Arial, sans-serif", label: "Helvetica" },
  { value: "Georgia, serif", label: "Georgia" },
  { value: "'Times New Roman', Times, serif", label: "Times New Roman" },
  { value: "Verdana, sans-serif", label: "Verdana" },
  { value: "'Trebuchet MS', sans-serif", label: "Trebuchet MS" },
  { value: "'Courier New', monospace", label: "Courier New" },
  { value: "Tahoma, sans-serif", label: "Tahoma" },
];

export function FontSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const selectedFont = EMAIL_FONTS.find((f) => f.value === value) || EMAIL_FONTS[0];

  const handleOpen = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setCoords({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node) && triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        onClick={handleOpen}
        className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors text-left"
      >
        <span className="text-xs text-gray-700" style={{ fontFamily: selectedFont.value }}>{selectedFont.label}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && createPortal(
        <div
          ref={popoverRef}
          className="fixed z-[9999] bg-white rounded-xl shadow-2xl border border-gray-200 py-1 overflow-hidden"
          style={{ top: coords.top, left: coords.left, width: coords.width }}
        >
          <div className="max-h-[240px] overflow-y-auto">
            {EMAIL_FONTS.map((font) => (
              <button
                key={font.value}
                onClick={() => { onChange(font.value); setOpen(false); }}
                className={`w-full flex items-center justify-between px-3 py-2 text-left hover:bg-gray-50 transition-colors ${value === font.value ? "bg-brand-50" : ""}`}
              >
                <span className="text-sm text-gray-700" style={{ fontFamily: font.value }}>{font.label}</span>
                {value === font.value && <Check className="h-3.5 w-3.5 text-brand-600" />}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
