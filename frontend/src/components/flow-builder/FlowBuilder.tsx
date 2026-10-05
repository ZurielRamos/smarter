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
import { Loader2, Save, Eye, Plus, Trash2, GripHorizontal, Copy, AlertTriangle, Code2, Settings, PlayCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/services/api";
import type { FlowModel, FlowScreenModel, FlowComponent, FlowComponentType } from "./types";
import { parseFlowJson, serializeToFlowJson, createComponent, createScreen, COMPONENT_META, validateFlow } from "./model";
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
  const [showJson, setShowJson] = useState(false);
  const [showGlobal, setShowGlobal] = useState(false);
  const [activeDragType, setActiveDragType] = useState<FlowComponentType | null>(null);
  const [isOverCanvas, setIsOverCanvas] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const issues = useMemo(() => validateFlow(model), [model]);
  const errors = issues.filter((i) => i.level === "error");

  // Errores devueltos por Meta al "Ejecutar/validar" (con ruta exacta).
  const [metaErrors, setMetaErrors] = useState<
    Array<{ code?: string; type?: string; message: string; pointer?: string }>
  >([]);
  const [validating, setValidating] = useState(false);
  const [metaValidated, setMetaValidated] = useState<null | boolean>(null);

  const handleValidate = async () => {
    // Primero la validación local; si hay errores de estructura, ni llamamos a Meta.
    if (errors.length > 0) {
      toast.error("Corrige primero los errores locales marcados abajo");
      return;
    }
    setValidating(true);
    setMetaValidated(null);
    try {
      const json = serializeToFlowJson(model);
      const { data } = await api.post(`/whatsapp-flows/${flowId}/validate`, { flowJson: json });
      setMetaErrors(data?.errors || []);
      if (!data?.metaReachable) {
        toast.message("Validación local OK (el Flow aún no existe en Meta para validar allá)");
        setMetaValidated(true);
      } else if (data?.valid) {
        toast.success("Sin errores. El Flow es válido para Meta");
        setMetaValidated(true);
        setDirty(false); // validar también aplica el JSON en Meta
      } else {
        toast.error(`Meta detectó ${data.errors.length} problema(s)`);
        setMetaValidated(false);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Error al validar en Meta");
    } finally {
      setValidating(false);
    }
  };

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
    // Al editar, los resultados de validación de Meta quedan obsoletos.
    setMetaErrors([]);
    setMetaValidated(null);
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

  const duplicateScreen = (sid: string) => {
    const src = model.screens.find((s) => s._id === sid);
    if (!src) return;
    const copy: FlowScreenModel = JSON.parse(JSON.stringify(src));
    // Nuevos ids internos y nuevo id de pantalla único.
    copy._id = `s_${Date.now().toString(36)}`;
    let n = model.screens.length + 1;
    while (model.screens.some((s) => s.id === `SCREEN_${n}`)) n++;
    copy.id = `SCREEN_${n}`;
    copy.title = `${src.title} (copia)`;
    const reId = (comps: FlowComponent[]) =>
      comps.forEach((c) => {
        c._id = `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
        if (c.thenComponents) reId(c.thenComponents);
        if (c.elseComponents) reId(c.elseComponents);
      });
    reId(copy.components);
    mutate((m) => {
      const idx = m.screens.findIndex((s) => s._id === sid);
      m.screens.splice(idx + 1, 0, copy);
    });
    setActiveScreenId(copy._id);
  };

  const applyJson = (text: string) => {
    try {
      const parsed = JSON.parse(text);
      const next = parseFlowJson(parsed);
      if (next.screens.length === 0) {
        toast.error("El JSON no tiene pantallas");
        return;
      }
      setModel(next);
      setActiveScreenId(next.screens[0]._id);
      setSelectedComponentId(null);
      setDirty(true);
      setShowJson(false);
      toast.success("JSON aplicado al editor");
    } catch (e: any) {
      toast.error("JSON inválido: " + e.message);
    }
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
    if (errors.length > 0) {
      toast.error(`Corrige ${errors.length} error(es) antes de guardar`);
      return;
    }
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
          {errors.length > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-red-600" title={errors.map((e) => e.message).join("\n")}>
              <AlertTriangle className="h-3.5 w-3.5" />
              {errors.length} error{errors.length !== 1 ? "es" : ""}
            </span>
          )}
          {canEdit && (
            <button
              onClick={() => setShowGlobal(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-xs text-foreground hover:bg-muted transition-colors"
            >
              <Settings className="h-3.5 w-3.5" /> Ajustes
            </button>
          )}
          <button
            onClick={() => setShowJson(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-xs text-foreground hover:bg-muted transition-colors"
          >
            <Code2 className="h-3.5 w-3.5" /> JSON
          </button>
          <button
            onClick={() => setShowPreview(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-xs text-foreground hover:bg-muted transition-colors"
          >
            <Eye className="h-3.5 w-3.5" /> Vista previa
          </button>
          {/* Ejecutar: valida el flow.json contra Meta (como el editor de Meta) */}
          <button
            onClick={handleValidate}
            disabled={validating}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors disabled:opacity-50 ${
              metaValidated === true
                ? "border-green-300 text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-500/10"
                : metaValidated === false
                  ? "border-red-300 text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-500/10"
                  : "border-border text-foreground hover:bg-muted"
            }`}
          >
            {validating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : metaValidated === true ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <PlayCircle className="h-3.5 w-3.5" />
            )}
            Ejecutar
          </button>
          {canEdit && (
            <button
              onClick={handleSave}
              disabled={saving || !dirty || errors.length > 0}
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
              className={`flex items-center gap-1.5 pl-2.5 pr-11 py-1.5 rounded-lg text-[11px] transition-colors ${
                activeScreenId === s._id
                  ? "bg-brand-100 text-brand-700 dark:bg-brand-700 dark:text-brand-100"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              <GripHorizontal className="h-3 w-3 opacity-40" />
              {s.title}
            </button>
            {canEdit && (
              <button
                onClick={() => duplicateScreen(s._id)}
                className="absolute right-5 top-1/2 -translate-y-1/2 p-0.5 rounded opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-brand-600 transition-opacity"
                title="Duplicar pantalla"
              >
                <Copy className="h-3 w-3" />
              </button>
            )}
            {canEdit && model.screens.length > 1 && (
              <button
                onClick={() => deleteScreen(s._id)}
                className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500 transition-opacity"
                title="Eliminar pantalla"
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

      {/* Panel de errores/avisos de validación (locales + Meta) */}
      {(issues.length > 0 || metaErrors.length > 0 || metaValidated === true) && (
        <div className="border-t border-border px-3 py-2 max-h-36 overflow-y-auto bg-muted/20 shrink-0 space-y-1">
          {/* Validación local */}
          {issues.map((iss, i) => (
            <div
              key={`local-${i}`}
              className={`flex items-start gap-1.5 text-[11px] ${
                iss.level === "error" ? "text-red-600" : "text-amber-600"
              }`}
            >
              <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
              <span>{iss.message}</span>
            </div>
          ))}

          {/* Resultado de la validación en Meta */}
          {metaValidated === true && metaErrors.length === 0 && (
            <div className="flex items-center gap-1.5 text-[11px] text-green-600">
              <CheckCircle2 className="h-3 w-3 shrink-0" />
              <span>Meta validó el Flow sin errores.</span>
            </div>
          )}
          {metaErrors.map((me, i) => (
            <div key={`meta-${i}`} className={`flex items-start gap-1.5 text-[11px] ${me.type === "WARNING" ? "text-amber-600" : "text-red-600"}`}>
              <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
              <span>
                <span className="font-semibold">Meta{me.code ? ` · ${me.code}` : ""}:</span> {me.message}
                {me.pointer && <span className="block font-mono text-[10px] text-muted-foreground mt-0.5">{me.pointer}</span>}
              </span>
            </div>
          ))}
        </div>
      )}

      {showPreview && <FlowPreview model={model} onClose={() => setShowPreview(false)} />}
      {showJson && (
        <JsonModal model={model} canEdit={canEdit} onApply={applyJson} onClose={() => setShowJson(false)} />
      )}
      {showGlobal && (
        <GlobalSettingsModal
          model={model}
          onChange={(patch) => {
            mutate((m) => Object.assign(m, patch));
          }}
          onClose={() => setShowGlobal(false)}
        />
      )}
    </div>
  );
}

// ─── Modal: edición del JSON crudo ──────────────────────────────────

function JsonModal({
  model,
  canEdit,
  onApply,
  onClose,
}: {
  model: FlowModel;
  canEdit: boolean;
  onApply: (text: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(() => JSON.stringify(serializeToFlowJson(model), null, 2));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card text-card-foreground rounded-2xl shadow-xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h3 className="text-sm font-semibold">flow.json</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xs">Cerrar</button>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          readOnly={!canEdit}
          spellCheck={false}
          className="flex-1 min-h-[400px] px-4 py-3 bg-background text-foreground text-[11px] font-mono resize-none focus:outline-none"
        />
        <div className="px-5 py-3 border-t border-border flex items-center justify-between">
          <button
            onClick={() => navigator.clipboard.writeText(text)}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            Copiar
          </button>
          {canEdit && (
            <button
              onClick={() => onApply(text)}
              className="px-3 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-xs font-medium"
            >
              Aplicar al editor
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Modal: ajustes globales del Flow ───────────────────────────────

function GlobalSettingsModal({
  model,
  onChange,
  onClose,
}: {
  model: FlowModel;
  onChange: (patch: Partial<FlowModel>) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card text-card-foreground rounded-2xl shadow-xl w-full max-w-sm mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h3 className="text-sm font-semibold">Ajustes del Flow</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xs">Cerrar</button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-[11px] font-medium text-foreground mb-1">Versión del Flow</label>
            <input
              value={model.version}
              onChange={(e) => onChange({ version: e.target.value })}
              className="w-full px-2.5 py-1.5 rounded-md border border-border bg-background text-foreground text-xs focus:outline-none focus:border-brand-300"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-foreground mb-1">data_api_version</label>
            <input
              value={model.dataApiVersion}
              onChange={(e) => onChange({ dataApiVersion: e.target.value })}
              className="w-full px-2.5 py-1.5 rounded-md border border-border bg-background text-foreground text-xs focus:outline-none focus:border-brand-300"
            />
            <p className="text-[9px] text-muted-foreground mt-1">
              Debe coincidir con la que soporta el endpoint (3.0).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
