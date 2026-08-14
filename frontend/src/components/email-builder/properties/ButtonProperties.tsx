import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Braces, ChevronDown } from "lucide-react";
import { inputCls, labelCls, AlignButtons, VerticalAlignButtons, ColorPicker, Stepper, FourSideEditor, FontSelector } from "./shared";
import { useContactVariables } from "./RichTextEditor";
import type { Variable } from "./RichTextEditor";

interface Props {
  props: Record<string, any>;
  onChange: (props: Record<string, any>) => void;
}

/* ─── Inline Variables Button ─── */
function InlineVariablesButton({ onSelect }: { onSelect: (v: Variable) => void }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [search, setSearch] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const variables = useContactVariables();

  const handleOpen = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setCoords({ top: rect.bottom + 4, left: Math.min(rect.left, window.innerWidth - 220) });
    }
    setOpen(true);
    setSearch("");
  };

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const filtered = variables.filter(
    (v) => v.label.toLowerCase().includes(search.toLowerCase()) || v.field.toLowerCase().includes(search.toLowerCase())
  );

  const grouped: Record<string, Variable[]> = {};
  for (const v of filtered) {
    if (!grouped[v.group]) grouped[v.group] = [];
    grouped[v.group].push(v);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        className="shrink-0 h-full px-2 border-l border-gray-200 text-gray-400 hover:text-brand-600 hover:bg-gray-50 transition-colors flex items-center gap-0.5"
        title="Insertar variable"
      >
        <Braces className="h-3.5 w-3.5" />
        <ChevronDown className="h-2.5 w-2.5" />
      </button>

      {open && createPortal(
        <div
          ref={popoverRef}
          className="fixed z-[9999] bg-white rounded-xl shadow-2xl border border-gray-200 w-[210px] overflow-hidden"
          style={{ top: coords.top, left: coords.left }}
        >
          <div className="px-2 pt-2 pb-1">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar campo..."
              className="w-full px-2 py-1.5 rounded-md border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
              autoFocus
            />
          </div>
          <div className="max-h-[240px] overflow-y-auto pb-1">
            {Object.keys(grouped).length === 0 && (
              <p className="text-xs text-gray-400 px-3 py-2">Sin resultados</p>
            )}
            {Object.entries(grouped).map(([group, vars]) => (
              <div key={group}>
                <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide px-3 pt-2 pb-1">{group}</p>
                {vars.map((v) => (
                  <button
                    key={v.field}
                    onClick={() => { onSelect(v); setOpen(false); }}
                    className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-brand-50 hover:text-brand-700 transition-colors flex items-center gap-2"
                  >
                    <Braces className="h-3 w-3 text-gray-400 shrink-0" />
                    <span className="truncate">{v.label}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

export function ButtonProperties({ props: p, onChange }: Props) {
  const [activeTab, setActiveTab] = useState<"config" | "styles" | "spacing">("config");
  const update = (key: string, value: any) => onChange({ ...p, [key]: value });
  const inputRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);

  const insertVariable = (variable: Variable) => {
    const input = inputRef.current;
    if (input) {
      const start = input.selectionStart ?? p.text.length;
      const end = input.selectionEnd ?? p.text.length;
      const newText = p.text.slice(0, start) + `{{${variable.field}}}` + p.text.slice(end);
      update("text", newText);
      setTimeout(() => {
        const pos = start + `{{${variable.field}}}`.length;
        input.setSelectionRange(pos, pos);
        input.focus();
      }, 0);
    } else {
      update("text", p.text + `{{${variable.field}}}`);
    }
  };

  const insertUrlVariable = (variable: Variable) => {
    const input = urlRef.current;
    if (input) {
      const start = input.selectionStart ?? p.url.length;
      const end = input.selectionEnd ?? p.url.length;
      const newUrl = p.url.slice(0, start) + `{{${variable.field}}}` + p.url.slice(end);
      update("url", newUrl);
      setTimeout(() => {
        const pos = start + `{{${variable.field}}}`.length;
        input.setSelectionRange(pos, pos);
        input.focus();
      }, 0);
    } else {
      update("url", p.url + `{{${variable.field}}}`);
    }
  };

  return (
    <div>
      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-3">
        <button
          onClick={() => setActiveTab("config")}
          className={`flex-1 pb-2 text-[10px] font-semibold uppercase tracking-wide border-b-2 transition-colors ${activeTab === "config" ? "border-brand-500 text-brand-700" : "border-transparent text-gray-400 hover:text-gray-600"}`}
        >
          Configuracion
        </button>
        <button
          onClick={() => setActiveTab("styles")}
          className={`flex-1 pb-2 text-[10px] font-semibold uppercase tracking-wide border-b-2 transition-colors ${activeTab === "styles" ? "border-brand-500 text-brand-700" : "border-transparent text-gray-400 hover:text-gray-600"}`}
        >
          Estilos
        </button>
        <button
          onClick={() => setActiveTab("spacing")}
          className={`flex-1 pb-2 text-[10px] font-semibold uppercase tracking-wide border-b-2 transition-colors ${activeTab === "spacing" ? "border-brand-500 text-brand-700" : "border-transparent text-gray-400 hover:text-gray-600"}`}
        >
          Espacios
        </button>
      </div>

      {activeTab === "config" && (
        <div className="space-y-3">
          <div>
            <label className={labelCls}>Texto</label>
            <div className="flex items-center rounded-md border border-gray-200 overflow-hidden focus-within:ring-2 focus-within:ring-brand-500">
              <input
                ref={inputRef}
                type="text"
                value={p.text}
                onChange={(e) => update("text", e.target.value)}
                className="flex-1 px-2.5 py-1.5 text-xs focus:outline-none"
              />
              <InlineVariablesButton onSelect={insertVariable} />
            </div>
          </div>
          <div>
            <label className={labelCls}>URL</label>
            <div className="flex items-center rounded-md border border-gray-200 overflow-hidden focus-within:ring-2 focus-within:ring-brand-500">
              <input
                ref={urlRef}
                type="text"
                value={p.url}
                onChange={(e) => update("url", e.target.value)}
                className="flex-1 px-2.5 py-1.5 text-xs focus:outline-none"
              />
              <InlineVariablesButton onSelect={insertUrlVariable} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Alineacion</label>
            <AlignButtons value={p.align} onSelect={(v) => update("align", v)} />
          </div>
        </div>
      )}

      {activeTab === "styles" && (
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Fuente</label>
            <FontSelector value={p.fontFamily || "Arial, sans-serif"} onChange={(v) => update("fontFamily", v)} />
          </div>
          <div>
            <label className={labelCls}>Tamano de fuente (px)</label>
            <Stepper value={p.fontSize || 14} onChange={(v) => update("fontSize", v)} min={8} max={48} />
          </div>
          <div>
            <label className={labelCls}>Peso de fuente</label>
            <div className="flex gap-1">
              {([
                { value: "normal", label: "Normal" },
                { value: "bold", label: "Bold" },
                { value: "600", label: "Semi" },
                { value: "800", label: "Extra" },
              ] as const).map((w) => (
                <button
                  key={w.value}
                  onClick={() => update("fontWeight", w.value)}
                  className={`flex-1 py-1.5 rounded-md text-[10px] font-medium border transition-colors ${(p.fontWeight || "bold") === w.value ? "bg-brand-50 border-brand-300 text-brand-700" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={labelCls}>Color de fondo</label>
            <ColorPicker value={p.bgColor} onChange={(v) => update("bgColor", v)} />
          </div>
          <div>
            <label className={labelCls}>Color de texto</label>
            <ColorPicker value={p.textColor} onChange={(v) => update("textColor", v)} />
          </div>
          <div>
            <label className={labelCls}>Radio de borde (px)</label>
            <Stepper value={parseInt(p.borderRadius) || 4} onChange={(v) => update("borderRadius", `${v}px`)} min={0} max={50} />
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
            <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide mb-3">Margen (margin)</p>
            <FourSideEditor
              top={p.marginTop ?? 0}
              right={p.marginRight ?? 0}
              bottom={p.marginBottom ?? 0}
              left={p.marginLeft ?? 0}
              onChange={(t, r, b, l) => onChange({ ...p, marginTop: t, marginRight: r, marginBottom: b, marginLeft: l })}
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
