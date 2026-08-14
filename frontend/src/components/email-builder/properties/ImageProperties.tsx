import { Upload, Trash2 } from "lucide-react";
import { inputCls, labelCls, AlignButtons } from "./shared";
import { ImageUploader } from "./ImageUploader";

interface Props {
  props: Record<string, any>;
  onChange: (props: Record<string, any>) => void;
}

function Stepper({ value, onChange, min = 0, max = 1000, suffix = "px" }: { value: number; onChange: (v: number) => void; min?: number; max?: number; suffix?: string }) {
  return (
    <div className="inline-flex items-center border border-gray-200 rounded-full overflow-hidden">
      <button onClick={() => onChange(Math.max(min, value - 10))} className="w-7 h-7 flex items-center justify-center text-gray-500 hover:bg-gray-50 text-xs">&minus;</button>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Math.max(min, Math.min(max, parseInt(e.target.value) || 0)))}
        className="w-12 h-7 text-center text-[10px] font-semibold text-gray-700 border-x border-gray-200 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button onClick={() => onChange(Math.min(max, value + 10))} className="w-7 h-7 flex items-center justify-center text-gray-500 hover:bg-gray-50 text-xs">+</button>
    </div>
  );
}

export function ImageProperties({ props: p, onChange }: Props) {
  const update = (key: string, value: any) => onChange({ ...p, [key]: value });

  // No image yet — show upload area
  if (!p.src) {
    return (
      <div className="space-y-3">
        <ImageUploader value="" onChange={(url) => update("src", url)} />
      </div>
    );
  }

  // Image set — show config
  const maxHeight = p.maxHeight || 300;

  return (
    <div className="space-y-4">
      {/* Preview with actions */}
      <div className="relative rounded-lg border border-gray-200 overflow-hidden bg-gray-50 group">
        <img
          src={p.src}
          alt={p.alt || "Preview"}
          className="w-full object-contain"
          style={{ maxHeight: `${maxHeight}px` }}
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
          <button
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = "image/*";
              input.onchange = (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (!file) return;
                update("src", URL.createObjectURL(file));
              };
              input.click();
            }}
            className="p-2 rounded-lg bg-white/90 text-gray-700 hover:bg-white shadow-sm transition-colors"
            title="Cambiar"
          >
            <Upload className="h-4 w-4" />
          </button>
          <button
            onClick={() => update("src", "")}
            className="p-2 rounded-lg bg-white/90 text-red-600 hover:bg-white shadow-sm transition-colors"
            title="Eliminar"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Configuration */}
      <div className="divide-y divide-gray-100">
        {/* Max height */}
        <div className="py-3">
          <label className={labelCls}>Alto maximo</label>
          <div className="flex items-center gap-2">
            <Stepper value={maxHeight} onChange={(v) => update("maxHeight", v)} min={50} max={1000} />
            <span className="text-[9px] text-gray-400">px</span>
          </div>
          <p className="text-[9px] text-gray-400 mt-1">La imagen mantiene su proporcion</p>
        </div>

        {/* Width */}
        <div className="py-3">
          <label className={labelCls}>Ancho</label>
          <div className="flex gap-1">
            {["100%", "75%", "50%", "auto"].map((w) => (
              <button
                key={w}
                onClick={() => update("width", w)}
                className={`flex-1 py-1.5 rounded-md text-[10px] font-medium border transition-colors ${p.width === w ? "bg-brand-50 border-brand-300 text-brand-700" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}
              >
                {w}
              </button>
            ))}
          </div>
        </div>

        {/* Alt text */}
        <div className="py-3">
          <label className={labelCls}>Texto alternativo</label>
          <input type="text" value={p.alt} onChange={(e) => update("alt", e.target.value)} className={inputCls} />
        </div>

        {/* Link */}
        <div className="py-3">
          <label className={labelCls}>Enlace (opcional)</label>
          <input type="text" value={p.link} onChange={(e) => update("link", e.target.value)} placeholder="https://..." className={inputCls} />
        </div>

        {/* Alignment */}
        <div className="py-3">
          <label className={labelCls}>Alineacion</label>
          <AlignButtons value={p.align} onSelect={(v) => update("align", v)} />
        </div>
      </div>
    </div>
  );
}
