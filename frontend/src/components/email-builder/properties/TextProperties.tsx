import { useState } from "react";
import { labelCls, AlignButtons, VerticalAlignButtons, ColorPicker, FourSideEditor, Stepper, FontSelector } from "./shared";
import { RichTextEditor, useContactVariables } from "./RichTextEditor";

interface Props {
  props: Record<string, any>;
  onChange: (props: Record<string, any>) => void;
}

export function TextProperties({ props: p, onChange }: Props) {
  const [activeTab, setActiveTab] = useState<"content" | "spacing">("content");
  const variables = useContactVariables();
  const update = (key: string, value: any) => onChange({ ...p, [key]: value });

  return (
    <div>
      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-3">
        <button
          onClick={() => setActiveTab("content")}
          className={`flex-1 pb-2 text-[10px] font-semibold uppercase tracking-wide border-b-2 transition-colors ${activeTab === "content" ? "border-brand-500 text-brand-700" : "border-transparent text-gray-400 hover:text-gray-600"}`}
        >
          Contenido
        </button>
        <button
          onClick={() => setActiveTab("spacing")}
          className={`flex-1 pb-2 text-[10px] font-semibold uppercase tracking-wide border-b-2 transition-colors ${activeTab === "spacing" ? "border-brand-500 text-brand-700" : "border-transparent text-gray-400 hover:text-gray-600"}`}
        >
          Espacios
        </button>
      </div>

      {activeTab === "content" && (
        <div className="space-y-3">
          <div>
            <label className={labelCls}>Contenido</label>
            <RichTextEditor value={p.text} onChange={(v) => update("text", v)} variables={variables} />
          </div>
          <div>
            <label className={labelCls}>Fuente</label>
            <FontSelector value={p.fontFamily || "Arial, sans-serif"} onChange={(v) => update("fontFamily", v)} />
          </div>
          <div>
            <label className={labelCls}>Tamano (px)</label>
            <Stepper value={parseInt(p.fontSize) || 14} onChange={(v) => update("fontSize", `${v}px`)} min={8} max={48} />
          </div>
          <div>
            <label className={labelCls}>Alineacion</label>
            <AlignButtons value={p.align} onSelect={(v) => update("align", v)} />
          </div>
          <div>
            <label className={labelCls}>Color</label>
            <ColorPicker value={p.color} onChange={(v) => update("color", v)} />
          </div>
        </div>
      )}

      {activeTab === "spacing" && (
        <div className="divide-y divide-gray-100">
          <div className="py-3">
            <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide mb-3">Relleno (padding)</p>
            <FourSideEditor
              top={p.paddingTop ?? 0}
              right={p.paddingRight ?? 0}
              bottom={p.paddingBottom ?? 0}
              left={p.paddingLeft ?? 0}
              onChange={(t, r, b, l) => onChange({ ...p, paddingTop: t, paddingRight: r, paddingBottom: b, paddingLeft: l })}
            />
          </div>
          <div className="py-3">
            <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide mb-3">Alineacion horizontal</p>
            <AlignButtons value={p.align} onSelect={(v) => update("align", v)} />
          </div>
          <div className="py-3">
            <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide mb-3">Alineacion vertical</p>
            <VerticalAlignButtons value={p.verticalAlign || "top"} onSelect={(v) => update("verticalAlign", v)} />
          </div>
        </div>
      )}
    </div>
  );
}
