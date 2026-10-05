import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2, Plus } from "lucide-react";
import { COMPONENT_META } from "./model";
import type { FlowScreenModel, FlowComponent } from "./types";

interface CanvasProps {
  screen: FlowScreenModel | null;
  selectedComponentId: string | null;
  onSelectComponent: (id: string | null) => void;
  onDeleteComponent: (id: string) => void;
  isOver: boolean;
}

export function FlowBuilderCanvas({
  screen,
  selectedComponentId,
  onSelectComponent,
  onDeleteComponent,
  isOver,
}: CanvasProps) {
  const { setNodeRef } = useDroppable({ id: "canvas-dropzone", data: { dropzone: true } });

  if (!screen) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground bg-muted/20">
        Crea o selecciona una pantalla para empezar
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-muted/20 flex justify-center py-8 px-4">
      {/* Teléfono */}
      <div className="w-[340px] shrink-0">
        <div className="rounded-[2rem] border-[6px] border-gray-800 dark:border-gray-700 bg-[#e5ddd5] dark:bg-gray-900 shadow-2xl overflow-hidden">
          {/* Barra superior estilo WhatsApp */}
          <div className="bg-[#008069] text-white px-4 py-2.5 flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-white/20" />
            <div className="min-w-0">
              <p className="text-xs font-medium truncate">{screen.title}</p>
              <p className="text-[9px] text-white/70">Formulario</p>
            </div>
          </div>

          {/* Zona de contenido droppable */}
          <div
            ref={setNodeRef}
            onClick={() => onSelectComponent(null)}
            className={`bg-white dark:bg-gray-800 min-h-[380px] max-h-[460px] overflow-y-auto p-3 space-y-2 transition-colors ${
              isOver ? "ring-2 ring-brand-400 ring-inset" : ""
            }`}
          >
            {screen.components.length === 0 ? (
              <div className="h-[340px] flex flex-col items-center justify-center text-center border-2 border-dashed border-gray-200 dark:border-gray-600 rounded-xl">
                <Plus className="h-5 w-5 text-gray-300 mb-1" />
                <p className="text-[11px] text-gray-400">Arrastra componentes aquí</p>
              </div>
            ) : (
              <SortableContext
                items={screen.components.map((c) => c._id)}
                strategy={verticalListSortingStrategy}
              >
                {screen.components.map((comp) => (
                  <SortableComponent
                    key={comp._id}
                    comp={comp}
                    selected={selectedComponentId === comp._id}
                    onSelect={() => onSelectComponent(comp._id)}
                    onDelete={() => onDeleteComponent(comp._id)}
                  />
                ))}
              </SortableContext>
            )}
          </div>

          {/* Footer / botón de la pantalla */}
          <div className="bg-white dark:bg-gray-800 px-3 pb-3 pt-1">
            <div className="w-full rounded-full bg-[#008069] text-white text-center text-xs font-medium py-2.5">
              {screen.footerLabel || (screen.next ? "Continuar" : "Enviar")}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Render de cada componente dentro del teléfono ──────────────────

function SortableComponent({
  comp,
  selected,
  onSelect,
  onDelete,
}: {
  comp: FlowComponent;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: comp._id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      className={`group relative rounded-lg border px-2.5 py-2 bg-white dark:bg-gray-800 cursor-pointer ${
        selected ? "border-brand-400 ring-1 ring-brand-300" : "border-transparent hover:border-gray-200 dark:hover:border-gray-600"
      }`}
    >
      {/* Controles */}
      <div className="absolute -right-1 -top-1 opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity z-10">
        <button
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="p-0.5 rounded bg-gray-700 text-white cursor-grab active:cursor-grabbing"
          title="Mover"
        >
          <GripVertical className="h-3 w-3" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-0.5 rounded bg-red-500 text-white"
          title="Eliminar"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      <ComponentPreview comp={comp} />
    </div>
  );
}

function ComponentPreview({ comp }: { comp: FlowComponent }) {
  switch (comp.type) {
    case "TextHeading":
      return <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{comp.text}</p>;
    case "TextSubheading":
      return <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">{comp.text}</p>;
    case "TextBody":
      return <p className="text-[11px] text-gray-700 dark:text-gray-300 leading-snug">{comp.text}</p>;
    case "TextCaption":
      return <p className="text-[10px] text-gray-400">{comp.text}</p>;
    case "TextInput":
    case "TextArea":
      return (
        <div>
          <p className="text-[10px] text-gray-500 mb-0.5">
            {comp.label}
            {comp.required ? " *" : ""}
          </p>
          <div
            className={`w-full rounded-md border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 ${
              comp.type === "TextArea" ? "h-12" : "h-7"
            }`}
          />
        </div>
      );
    case "DatePicker":
      return (
        <div>
          <p className="text-[10px] text-gray-500 mb-0.5">{comp.label}</p>
          <div className="w-full h-7 rounded-md border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 flex items-center px-2 text-[10px] text-gray-400">
            dd/mm/aaaa
          </div>
        </div>
      );
    case "Dropdown":
      return (
        <div>
          <p className="text-[10px] text-gray-500 mb-0.5">
            {comp.label}
            {comp.required ? " *" : ""}
          </p>
          <div className="w-full h-7 rounded-md border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 flex items-center justify-between px-2 text-[10px] text-gray-400">
            Selecciona… <span>▾</span>
          </div>
        </div>
      );
    case "RadioButtonsGroup":
      return (
        <div>
          <p className="text-[10px] text-gray-500 mb-1">{comp.label}</p>
          <div className="space-y-1">
            {(comp.options || []).slice(0, 4).map((o) => (
              <div key={o.id} className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full border border-gray-300" />
                <span className="text-[10px] text-gray-700 dark:text-gray-300">{o.title}</span>
              </div>
            ))}
          </div>
        </div>
      );
    case "CheckboxGroup":
      return (
        <div>
          <p className="text-[10px] text-gray-500 mb-1">{comp.label}</p>
          <div className="space-y-1">
            {(comp.options || []).slice(0, 4).map((o) => (
              <div key={o.id} className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded border border-gray-300" />
                <span className="text-[10px] text-gray-700 dark:text-gray-300">{o.title}</span>
              </div>
            ))}
          </div>
        </div>
      );
    case "OptIn":
      return (
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border border-gray-300" />
          <span className="text-[10px] text-gray-700 dark:text-gray-300">{comp.label}</span>
        </div>
      );
    case "RichText":
      return (
        <p className="text-[11px] text-gray-700 dark:text-gray-300 leading-snug whitespace-pre-wrap">
          {comp.text}
        </p>
      );
    case "PhotoPicker":
      return (
        <div>
          <p className="text-[10px] text-gray-500 mb-0.5">{comp.label}{comp.required ? " *" : ""}</p>
          <div className="w-full h-10 rounded-md border border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center gap-1.5 text-[10px] text-gray-400">
            📷 {comp.description || "Subir foto"}
          </div>
        </div>
      );
    case "DocumentPicker":
      return (
        <div>
          <p className="text-[10px] text-gray-500 mb-0.5">{comp.label}{comp.required ? " *" : ""}</p>
          <div className="w-full h-10 rounded-md border border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center gap-1.5 text-[10px] text-gray-400">
            📎 {comp.description || "Subir documento"}
          </div>
        </div>
      );
    case "Image":
      return comp.src && /^https?:\/\/.+/.test(comp.src) ? (
        <img src={comp.src} alt={comp.altText || ""} className="w-full max-h-24 object-contain rounded-md" />
      ) : (
        <div className="w-full h-16 rounded-md bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-[10px] text-gray-400">
          {comp.altText || "Imagen"}
        </div>
      );
    case "ImageCarousel":
      return (
        <div className="flex gap-1 overflow-hidden">
          {(comp.images || []).slice(0, 3).map((_, i) => (
            <div key={i} className="h-12 w-12 shrink-0 rounded-md bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-[9px] text-gray-400">
              {i + 1}
            </div>
          ))}
          <div className="h-12 flex items-center text-[9px] text-gray-400">carrusel</div>
        </div>
      );
    case "EmbeddedLink":
      return <p className="text-[11px] text-brand-600 underline">{comp.text}</p>;
    case "If":
      return (
        <div className="rounded-md border border-dashed border-purple-300 dark:border-purple-500/40 bg-purple-50/50 dark:bg-purple-500/10 p-2">
          <p className="text-[9px] font-semibold text-purple-600 dark:text-purple-300 uppercase mb-1">
            Si {comp.condition || "…"}
          </p>
          <div className="text-[9px] text-gray-500 pl-2 border-l-2 border-purple-200">
            Entonces: {(comp.thenComponents || []).length} componente(s)
          </div>
          {comp.elseComponents && comp.elseComponents.length > 0 && (
            <div className="text-[9px] text-gray-500 pl-2 border-l-2 border-gray-200 mt-1">
              Si no: {comp.elseComponents.length} componente(s)
            </div>
          )}
        </div>
      );
    default:
      return <p className="text-[10px] text-gray-400">{comp.type}</p>;
  }
}
