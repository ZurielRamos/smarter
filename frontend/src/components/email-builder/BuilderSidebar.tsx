import { useDraggable } from "@dnd-kit/core";
import { Heading, Type, Image, MousePointerClick, Minus, MoveVertical, Code, LayoutGrid, Plus, Share2 } from "lucide-react";
import type { BlockType } from "./types";
import { BLOCK_CATALOG, LAYOUT_PRESETS } from "./types";
import { Tooltip } from "./Tooltip";

const BLOCK_ICONS: Record<BlockType, typeof Heading> = {
  heading: Heading,
  text: Type,
  image: Image,
  button: MousePointerClick,
  divider: Minus,
  spacer: MoveVertical,
  html: Code,
  social: Share2,
};

export { BLOCK_ICONS };

// Draggable sidebar item
function DraggableBlock({ type }: { type: BlockType }) {
  const Icon = BLOCK_ICONS[type];
  const catalog = BLOCK_CATALOG.find((b) => b.type === type)!;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `sidebar-${type}`,
    data: { type, fromSidebar: true },
  });

  return (
    <Tooltip label={catalog.label} description={catalog.description}>
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        className={`w-10 h-10 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-all cursor-grab active:cursor-grabbing ${isDragging ? "opacity-40 scale-90" : ""}`}
      >
        <Icon className="h-5 w-5" />
      </div>
    </Tooltip>
  );
}

interface BuilderSidebarProps {
  showLayouts: boolean;
  onToggleLayouts: () => void;
  onAddRow: (widths: number[]) => void;
}

export function BuilderSidebar({ showLayouts, onToggleLayouts, onAddRow }: BuilderSidebarProps) {
  return (
    <>
      {/* Layouts sidebar */}
      <div className="absolute left-4 top-4 z-10 w-14 bg-white rounded-xl shadow-lg border border-gray-200 flex flex-col items-center py-2.5 gap-1">
        <Tooltip label="Layouts" description="Agrega filas con diferentes distribuciones de columnas" disabled={showLayouts}>
          <button
            onClick={onToggleLayouts}
            className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${showLayouts ? "bg-gray-100 text-brand-600" : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"}`}
          >
            <LayoutGrid className="h-5 w-5" />
          </button>
        </Tooltip>
      </div>

      {/* Content blocks sidebar */}
      <div className="absolute left-4 top-[80px] z-10 w-14 bg-white rounded-xl shadow-lg border border-gray-200 flex flex-col items-center py-2.5 gap-0.5">
        {BLOCK_CATALOG.map(({ type }) => (
          <DraggableBlock key={type} type={type} />
        ))}
      </div>

      {/* Layout presets popup */}
      {showLayouts && (
        <div
          className="absolute left-[76px] top-4 z-20 w-56 bg-white rounded-xl shadow-lg border border-gray-200 py-3 px-3 animate-in"
          style={{ animation: "slideIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)" }}
        >
          <style>{`@keyframes slideIn { from { opacity: 0; transform: translateX(-8px) scale(0.95); } to { opacity: 1; transform: translateX(0) scale(1); } }`}</style>
          <p className="text-[10px] font-semibold text-gray-500 uppercase mb-2 px-1">Agregar fila</p>
          <div className="flex flex-col gap-1.5">
            {LAYOUT_PRESETS.map((layout) => (
              <button
                key={layout.id}
                onClick={() => onAddRow(layout.widths)}
                className="flex items-center gap-3 px-2.5 py-2 rounded-lg border border-gray-200 hover:border-brand-300 hover:bg-brand-50/50 transition-colors"
              >
                <div className="flex gap-1 h-6 flex-1">
                  {layout.widths.map((w, i) => (
                    <div key={i} className="bg-blue-100 border border-blue-300 rounded-sm flex items-center justify-center" style={{ flex: w }}>
                      <Plus className="h-3 w-3 text-blue-400" />
                    </div>
                  ))}
                </div>
                <span className="text-[10px] text-gray-500 font-medium shrink-0">{layout.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
