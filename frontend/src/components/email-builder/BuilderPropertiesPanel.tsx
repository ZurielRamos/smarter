import { useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Trash2, Mail, Braces, ChevronDown } from "lucide-react";
import type { EmailRow, ContentBlock, BlockType } from "./types";
import { BLOCK_CATALOG } from "./types";
import { BlockProperties } from "./BlockProperties";
import { RowProperties, DEFAULT_ROW_STYLE } from "./properties";
import { BLOCK_ICONS } from "./BuilderSidebar";
import { useContactVariables } from "./properties/RichTextEditor";
import type { Variable } from "./properties/RichTextEditor";
import { VariableInput } from "./properties/VariableInput";
import { FourSideEditor, Stepper, ColorPicker } from "./properties/shared";
import { ImageUploader } from "./properties/ImageUploader";

interface CanvasStyle {
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  width: number;
  backgroundColor: string;
  backgroundImage: string;
}

interface BuilderPropertiesPanelProps {
  selectedBlock: ContentBlock | null;
  selectedRowId: string | null;
  rows: EmailRow[];
  onDeleteBlock: (id: string) => void;
  onUpdateBlockProps: (id: string, props: Record<string, any>) => void;
  onAddBlockToCell: (rowId: string, cellId: string, type: BlockType) => void;
  onUpdateRowStyle: (rowId: string, style: EmailRow["style"]) => void;
  templateSubject: string;
  onSubjectChange: (v: string) => void;
  canvasStyle: CanvasStyle;
  onCanvasStyleChange: (style: CanvasStyle) => void;
}

/* ─── Inline Variables Button for subject ─── */
function SubjectVariablesButton({ onSelect }: { onSelect: (v: Variable) => void }) {
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

export function BuilderPropertiesPanel({ selectedBlock, selectedRowId, rows, onDeleteBlock, onUpdateBlockProps, onAddBlockToCell, onUpdateRowStyle, templateSubject, onSubjectChange, canvasStyle, onCanvasStyleChange }: BuilderPropertiesPanelProps) {
  const subjectRef = useRef<HTMLInputElement>(null);
  const [globalTab, setGlobalTab] = useState<"config" | "spacing" | "styles">("config");
  const variables = useContactVariables();

  const insertSubjectVariable = (variable: Variable) => {
    const input = subjectRef.current;
    if (input) {
      const start = input.selectionStart ?? templateSubject.length;
      const end = input.selectionEnd ?? templateSubject.length;
      const newText = templateSubject.slice(0, start) + `{{${variable.field}}}` + templateSubject.slice(end);
      onSubjectChange(newText);
      setTimeout(() => {
        const pos = start + `{{${variable.field}}}`.length;
        input.setSelectionRange(pos, pos);
        input.focus();
      }, 0);
    } else {
      onSubjectChange(templateSubject + `{{${variable.field}}}`);
    }
  };

  if (selectedBlock) {
    return (
      <div className="absolute right-4 top-4 z-10 w-72 bg-white rounded-xl shadow-lg border border-gray-200 max-h-[calc(100%-32px)] flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            {(() => { const Icon = BLOCK_ICONS[selectedBlock.type]; return <Icon className="h-4 w-4 text-gray-500" />; })()}
            <span className="text-sm font-semibold text-gray-800">
              {BLOCK_CATALOG.find((c) => c.type === selectedBlock.type)?.label}
            </span>
          </div>
          <button onClick={() => onDeleteBlock(selectedBlock.id)} className="p-1.5 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="overflow-y-auto p-4">
          <BlockProperties block={selectedBlock} onChange={(props) => onUpdateBlockProps(selectedBlock.id, props)} />
        </div>
      </div>
    );
  }

  if (selectedRowId) {
    const selectedRow = rows.find((r) => r.id === selectedRowId);
    return (
      <div className="absolute right-4 top-4 z-10 w-72 bg-white rounded-xl shadow-lg border border-gray-200 max-h-[calc(100%-32px)] flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 shrink-0">
          <h4 className="text-xs font-semibold text-gray-700 uppercase">Fila</h4>
          <p className="text-[10px] text-gray-400 mt-0.5">{selectedRow?.cells.length} columna(s)</p>
        </div>
        <div className="overflow-y-auto p-4">
          <RowProperties
            style={selectedRow?.style || DEFAULT_ROW_STYLE}
            onChange={(style) => onUpdateRowStyle(selectedRowId, style)}
          />
        </div>
      </div>
    );
  }

  // No selection → global template properties
  return (
    <div className="absolute right-4 top-4 z-10 w-72 bg-white rounded-xl shadow-lg border border-gray-200 max-h-[calc(100%-32px)] flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2 shrink-0">
        <Mail className="h-4 w-4 text-gray-500" />
        <span className="text-sm font-semibold text-gray-800">Plantilla</span>
      </div>
      <div className="overflow-y-auto">
        {/* Tabs */}
        <div className="flex border-b border-gray-200 px-4 pt-2">
          <button
            onClick={() => setGlobalTab("config")}
            className={`flex-1 pb-2 text-[10px] font-semibold uppercase tracking-wide border-b-2 transition-colors ${globalTab === "config" ? "border-brand-500 text-brand-700" : "border-transparent text-gray-400 hover:text-gray-600"}`}
          >
            Configuracion
          </button>
          <button
            onClick={() => setGlobalTab("styles")}
            className={`flex-1 pb-2 text-[10px] font-semibold uppercase tracking-wide border-b-2 transition-colors ${globalTab === "styles" ? "border-brand-500 text-brand-700" : "border-transparent text-gray-400 hover:text-gray-600"}`}
          >
            Estilos
          </button>
          <button
            onClick={() => setGlobalTab("spacing")}
            className={`flex-1 pb-2 text-[10px] font-semibold uppercase tracking-wide border-b-2 transition-colors ${globalTab === "spacing" ? "border-brand-500 text-brand-700" : "border-transparent text-gray-400 hover:text-gray-600"}`}
          >
            Espacios
          </button>
        </div>

        <div className="p-4">
          {globalTab === "config" && (
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-medium text-gray-500 uppercase mb-1">Asunto del email</label>
                <div className="flex items-center rounded-md border border-gray-200 overflow-hidden focus-within:ring-2 focus-within:ring-brand-500">
                  <VariableInput
                    value={templateSubject}
                    onChange={onSubjectChange}
                    variables={variables}
                    placeholder="Escribe el asunto..."
                  />
                  <SubjectVariablesButton onSelect={insertSubjectVariable} />
                </div>
                <p className="text-[9px] text-gray-400 mt-1.5">Usa variables para personalizar el asunto por contacto.</p>
              </div>
            </div>
          )}

          {globalTab === "styles" && (
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-medium text-gray-500 uppercase mb-2">Color de fondo</label>
                <ColorPicker value={canvasStyle.backgroundColor} onChange={(v) => onCanvasStyleChange({ ...canvasStyle, backgroundColor: v })} />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-gray-500 uppercase mb-2">Imagen de fondo</label>
                <ImageUploader value={canvasStyle.backgroundImage} onChange={(v) => onCanvasStyleChange({ ...canvasStyle, backgroundImage: v })} compact />
              </div>
            </div>
          )}

          {globalTab === "spacing" && (
            <div className="divide-y divide-gray-100">
              <div className="py-3">
                <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide mb-3">Ancho del contenido (px)</p>
                <Stepper value={canvasStyle.width} onChange={(v) => onCanvasStyleChange({ ...canvasStyle, width: v })} min={320} max={900} />
              </div>
              <div className="py-3">
                <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide mb-3">Relleno (padding)</p>
                <FourSideEditor
                  top={canvasStyle.paddingTop}
                  right={canvasStyle.paddingRight}
                  bottom={canvasStyle.paddingBottom}
                  left={canvasStyle.paddingLeft}
                  onChange={(t, r, b, l) => onCanvasStyleChange({ ...canvasStyle, paddingTop: t, paddingRight: r, paddingBottom: b, paddingLeft: l })}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
