import { useMemo, useState } from "react";
import {
  DndContext,
  pointerWithin,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent, DragOverEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { Loader2, Save, Eye, Plus, Trash2, GripHorizontal } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/services/api";
import type { FlowModel, FlowScreenModel, FlowComponent, FlowComponentType } from "./types";
import { parseFlowJson, serializeToFlowJson, createComponent, createScreen, COMPONENT_META } from "./model";
import { FlowBuilderSidebar } from "./FlowBuilderSidebar";
import { FlowBuilderCanvas } from "./FlowBuilderCanvas";
import { FlowBuilderProperties } from "./FlowBuilderProperties";
import { FlowPreview } from "./FlowPreview";

interface FlowBuilderProps {
  flowJson: Record<string, any>;
  flowId: string;
  canEdit: boolean;
  onSaved: () => void;
}

export function FlowBuilder({ flowJson, flowId, canEdit, onSaved }: FlowBuilderProps) {
  const [model, setModel] = useState<FlowModel>(() => {
    const parsed = parseFlowJson(flowJson || {});
    if (parsed.screens.length === 0) parsed.screens.push(createScreen(0));
    return parsed;
  });
  const [activeScreenId, setActiveScreenId] = useState<string>(model.screens[0]?._id || "");
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [activeDragType, setActiveDragType] = useState<FlowComponentType | null>(null);
  const [isOverCanvas, setIsOverCanvas] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const screen = model.screens.find((s) => s._id === activeScreenId) || null;
  const selectedComponent = useMemo(
    () => screen?.components.find((c) => c._id === selectedComponentId) || null,
    [screen, selectedComponentId],
  );

  const mutate = (fn: (m: FlowModel) => void) => {
    setModel((prev) => {
      const next: FlowModel = JSON.parse(JSON.stringify(prev));
      fn(next);
      return next;
    });
    setDirty(true);
  };

  // ─── Pantallas ──────────────────────────────────────────────
  const addScreen = () => {
    const newScreen = createScreen(model.screens.length);
    mutate((m) => {
      // Enlazar la última pantalla no terminal a la nueva (routing lineal).
      const last = m.screens[m.screens.length - 1];
      if (last && !last.next) last.next = newScreen.id;
      m.screens.push(newScreen);
    });
    setActiveScreenId(newScreen._id);
    setSelectedComponentId(null);
  };

  const deleteScreen = (sid: string) => {
    if (model.screens.length <= 1) {
      toast.error("El Flow debe tener al menos una pantalla");
      return;
    }
    const removed = model.screens.find((s) => s._id === sid);
    mutate((m) => {
      m.screens = m.screens.filter((s) => s._id !== sid);
      // Limpiar routing que apuntaba a la pantalla eliminada.
      for (const s of m.screens) {
        if (removed && s.next === removed.id) s.next = null;
      }
    });
    if (activeScreenId === sid) {
      const remaining = model.screens.filter((s) => s._id !== sid);
      setActiveScreenId(remaining[0]?._id || "");
    }
    setSelectedComponentId(null);
  };

  const updateScreen = (patch: Partial<FlowScreenModel>) => {
    mutate((m) => {
      const s = m.screens.find((x) => x._id === activeScreenId);
      if (!s) return;
      const oldId = s.id;
      Object.assign(s, patch);
      // Si cambió el id, actualizar referencias de routing.
      if (patch.id && patch.id !== oldId) {
        for (const other of m.screens) {
          if (other.next === oldId) other.next = patch.id;
        }
      }
    });
  };

  // ─── Componentes ────────────────────────────────────────────
  const updateComponent = (patch: Partial<FlowComponent>) => {
    if (!selectedComponentId) return;
    mutate((m) => {
      const s = m.screens.find((x) => x._id === activeScreenId);
      const c = s?.components.find((x) => x._id === selectedComponentId);
      if (c) Object.assign(c, patch);
    });
  };

  const deleteComponent = (cid: string) => {
    mutate((m) => {
      const s = m.screens.find((x) => x._id === activeScreenId);
      if (s) s.components = s.components.filter((c) => c._id !== cid);
    });
    if (selectedComponentId === cid) setSelectedComponentId(null);
  };

  const addComponent = (type: FlowComponentType) => {
    const comp = createComponent(type);
    mutate((m) => {
      const s = m.screens.find((x) => x._id === activeScreenId);
      if (s) s.components.push(comp);
    });
    setSelectedComponentId(comp._id);
  };

  // ─── DnD ────────────────────────────────────────────────────
  const handleDragStart = (e: DragStartEvent) => {
    const data = e.active.data.current;
    if (data?.fromPalette) setActiveDragType(data.type as FlowComponentType);
  };

  const handleDragOver = (e: DragOverEvent) => {
    const overId = e.over?.id;
    const activeData = e.active.data.current;
    if (activeData?.fromPalette) {
      // Está sobre el canvas si el destino es la dropzone o un componente.
      setIsOverCanvas(overId === "canvas-dropzone" || !!screen?.components.some((c) => c._id === overId));
    }
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveDragType(null);
    setIsOverCanvas(false);
    if (!over) return;

    const activeData = active.data.current;

    // Soltar un componente nuevo desde la paleta.
    if (activeData?.fromPalette) {
      if (over.id === "canvas-dropzone" || screen?.components.some((c) => c._id === over.id)) {
        addComponent(activeData.type as FlowComponentType);
      }
      return;
    }

    // Reordenar componentes dentro de la pantalla.
    if (active.id !== over.id && screen) {
      const oldIdx = screen.components.findIndex((c) => c._id === active.id);
      const newIdx = screen.components.findIndex((c) => c._id === over.id);
      if (oldIdx >= 0 && newIdx >= 0) {
        mutate((m) => {
          const s = m.screens.find((x) => x._id === activeScreenId);
          if (s) s.components = arrayMove(s.components, oldIdx, newIdx);
        });
      }
    }
  };

  // ─── Guardar ────────────────────────────────────────────────
  const handleSave = async () => {
    const json = serializeToFlowJson(model);
    setSaving(true);
    try {
      const { data } = await api.post(`/whatsapp-flows/${flowId}/flow-json`, { flowJson: json });
      if (data?.success) {
        toast.success("Flow guardado en Meta");
        setDirty(false);
        onSaved();
      } else {
        toast.error(data?.error || "No se pudo guardar");
        if (data?.validationErrors?.length) console.error(data.validationErrors);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full border border-border rounded-xl overflow-hidden bg-card">
      {/* Toolbar */}
      <div className="px-3 py-2 border-b border-border flex items-center justify-between shrink-0 bg-muted/30">
        <span className="text-[11px] text-muted-foreground">
          {model.screens.length} pantalla{model.screens.length !== 1 ? "s" : ""}
          {dirty && <span className="ml-2 text-amber-600">● sin guardar</span>}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowPreview(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-xs text-foreground hover:bg-muted transition-colors"
          >
            <Eye className="h-3.5 w-3.5" /> Vista previa
          </button>
          {canEdit && (
            <button
              onClick={handleSave}
              disabled={saving || !dirty}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-xs font-medium transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Guardar en Meta
            </button>
          )}
        </div>
      </div>

      {/* Tabs de pantallas */}
      <div className="px-3 py-2 border-b border-border flex items-center gap-1.5 overflow-x-auto shrink-0">
        {model.screens.map((s) => (
          <div key={s._id} className="relative group shrink-0">
            <button
              onClick={() => {
                setActiveScreenId(s._id);
                setSelectedComponentId(null);
              }}
              className={`flex items-center gap-1.5 pl-2.5 pr-6 py-1.5 rounded-lg text-[11px] transition-colors ${
                activeScreenId === s._id
                  ? "bg-brand-100 text-brand-700 dark:bg-brand-700 dark:text-brand-100"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              <GripHorizontal className="h-3 w-3 opacity-40" />
              {s.title}
            </button>
            {canEdit && model.screens.length > 1 && (
              <button
                onClick={() => deleteScreen(s._id)}
                className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500 transition-opacity"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
        {canEdit && (
          <button
            onClick={addScreen}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-dashed border-border text-[11px] text-muted-foreground hover:text-foreground hover:border-brand-300 transition-colors shrink-0"
          >
            <Plus className="h-3 w-3" /> Pantalla
          </button>
        )}
      </div>

      {/* Área principal: paleta + canvas + propiedades */}
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex-1 flex overflow-hidden min-h-[520px]">
          {canEdit && <FlowBuilderSidebar />}
          <FlowBuilderCanvas
            screen={screen}
            selectedComponentId={selectedComponentId}
            onSelectComponent={setSelectedComponentId}
            onDeleteComponent={deleteComponent}
            isOver={isOverCanvas}
          />
          <FlowBuilderProperties
            model={model}
            screen={screen}
            component={canEdit ? selectedComponent : null}
            onUpdateComponent={updateComponent}
            onUpdateScreen={updateScreen}
          />
        </div>

        <DragOverlay dropAnimation={null}>
          {activeDragType ? (
            <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-white dark:bg-gray-800 shadow-xl border border-brand-300">
              {(() => {
                const Icon = COMPONENT_META[activeDragType].icon;
                return <Icon className="h-3.5 w-3.5 text-brand-600" />;
              })()}
              <span className="text-[11px] text-foreground">{COMPONENT_META[activeDragType].label}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {showPreview && <FlowPreview model={model} onClose={() => setShowPreview(false)} />}
    </div>
  );
}
