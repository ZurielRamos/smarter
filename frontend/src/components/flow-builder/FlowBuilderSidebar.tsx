import { useDraggable } from "@dnd-kit/core";
import { COMPONENT_META, PALETTE_ORDER } from "./model";
import type { FlowComponentType } from "./types";

const CATEGORY_LABELS: Record<string, string> = {
  texto: "Texto",
  entrada: "Entrada",
  seleccion: "Selección",
  medios: "Medios",
};

function PaletteItem({ type }: { type: FlowComponentType }) {
  const meta = COMPONENT_META[type];
  const Icon = meta.icon;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${type}`,
    data: { fromPalette: true, type },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border border-border bg-card cursor-grab active:cursor-grabbing hover:border-brand-300 hover:bg-muted transition-colors select-none ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span className="text-[11px] text-foreground">{meta.label}</span>
    </div>
  );
}

export function FlowBuilderSidebar() {
  const grouped = PALETTE_ORDER.reduce<Record<string, FlowComponentType[]>>((acc, t) => {
    const cat = COMPONENT_META[t].category;
    (acc[cat] = acc[cat] || []).push(t);
    return acc;
  }, {});

  return (
    <div className="w-52 border-r border-border bg-muted/30 flex flex-col shrink-0 overflow-y-auto">
      <div className="px-3 py-3 border-b border-border">
        <h3 className="text-xs font-semibold text-foreground">Componentes</h3>
        <p className="text-[10px] text-muted-foreground mt-0.5">Arrástralos a la pantalla</p>
      </div>
      <div className="p-3 space-y-4">
        {Object.entries(grouped).map(([cat, types]) => (
          <div key={cat}>
            <p className="text-[9px] font-semibold text-muted-foreground uppercase mb-1.5">
              {CATEGORY_LABELS[cat] || cat}
            </p>
            <div className="space-y-1.5">
              {types.map((t) => (
                <PaletteItem key={t} type={t} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
