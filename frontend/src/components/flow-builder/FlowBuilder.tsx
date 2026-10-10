import { useMemo, useState, useRef } from "react";
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
import { groupMetaErrors } from "./meta-errors";
import { FlowBuilderSidebar } from "./FlowBuilderSidebar";
import { FlowBuilderCanvas } from "./FlowBuilderCanvas";
import { FlowBuilderProperties } from "./FlowBuilderProperties";
import { FlowPreview } from "./FlowPreview";

interface FlowBuilderProps {
  flowJson: Record<string, any>;
  flowId: string;
  canEdit: boolean;
  onSaved: () => void;
  /**
   * Base de la API para guardar/validar el flow.json. Por defecto apunta a los
   * WhatsApp Flows; la sección de Encuestas la sobreescribe con "/surveys" para
   * operar sobre sus propios endpoints (que comparten el mismo motor de Flows).
   */
  apiBase?: string;
  /**
   * Muestra el botón "Ejecutar" que valida el flow.json contra Meta. Las
   * encuestas locales (aún no publicadas en Meta) lo ocultan porque no existe
   * un Flow en Meta contra el que validar; la validación local sigue activa.
   */
  showMetaValidation?: boolean;
}

export function FlowBuilder({
  flowJson,
  flowId,
  canEdit,
  onSaved,
  apiBase = "/whatsapp-flows",
  showMetaValidation = true,
}: FlowBuilderProps) {
  // JSON original tal cual vino de Meta/BD. Se conserva para NO degradarlo:
  // mientras el usuario no edite, se envía este original a Meta en vez del
  // re-serializado (nuestro serializador simplifica la estructura y Meta lo
  // marcaría con warnings aunque el Flow funcione).
  const originalJsonRef = useRef<Record<string, any> | null>(
    flowJson && Object.keys(flowJson).length ? flowJson : null,
  );

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
  const [showIssues, setShowIssues] = useState(false);
  const [activeDragType, setActiveDragType] = useState<FlowComponentType | null>(null);
  const [isOverCanvas, setIsOverCanvas] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const issues = useMemo(() => validateFlow(model), [model]);
  const errors = issues.filter((i) => i.level === "error");
  const localErrorCount = errors.length;
  const warningCount = issues.filter((i) => i.level === "warning").length;

  // Errores devueltos por Meta al "Ejecutar/validar" (con ruta exacta).
  const [metaErrors, setMetaErrors] = useState<
    Array<{ code?: string; type?: string; message: string; pointer?: string }>
  >([]);
  const [validating, setValidating] = useState(false);
  const [metaValidated, setMetaValidated] = useState<null | boolean>(null);

  // Contamos PROBLEMAS distintos de Meta (agrupando reglas por ruta), no reglas.
  const metaGroups = useMemo(() => groupMetaErrors(metaErrors), [metaErrors]);
  const metaBlockingCount = metaGroups.filter((g) => g.type !== "WARNING").length;
  const metaWarningCount = metaGroups.filter((g) => g.type === "WARNING").length;
  const totalIssueCount = issues.length + metaGroups.length;

  // Devuelve el JSON a enviar a Meta: el ORIGINAL si no hubo ediciones (para no
  // degradar un Flow que ya funciona), o el re-serializado si el usuario editó.
  const buildJsonToSend = (): Record<string, any> => {
    if (!dirty && originalJsonRef.current) return originalJsonRef.current;
    return serializeToFlowJson(model);
  };

  const handleValidate = async () => {
    // Primero la validación local; si hay errores de estructura, ni llamamos a Meta.
    if (errors.length > 0) {
      toast.error("Corrige primero los errores locales marcados abajo");
      return;
    }
    setValidating(true);
    setMetaValidated(null);
    try {
      const json = buildJsonToSend();
      const { data } = await api.post(`${apiBase}/${flowId}/validate`, { flowJson: json });
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
    const json = buildJsonToSend();
    setSaving(true);
    try {
      const { data } = await api.post(`${apiBase}/${flowId}/flow-json`, { flowJson: json });

      // Mostrar en el panel los errores que Meta devuelva al re-sincronizar (si
      // los hay), con su ruta exacta. Si no hay, limpiar el panel.
      if (data?.validationErrors?.length) {
        setMetaErrors(
          data.validationErrors.map((e: any) => ({
            code: e.code ?? e.error,
            type: e.type ?? e.error_type,
            message: e.message || String(e),
            pointer: e.pointer ?? e.pointers?.[0]?.path,
          })),
        );
        setMetaValidated(false);
      } else {
        setMetaErrors([]);
      }

      // Las encuestas locales devuelven el objeto guardado; los Flows de Meta
      // devuelven { success }. Tratamos como éxito salvo error explícito.
      // `error` presente (encuesta en Meta rechazada) => el cambio quedó local
      // pero Meta no se sincronizó: lo avisamos sin bloquear el guardado local.
      if (data && data.success !== false && !data?.error) {
        toast.success(showMetaValidation ? "Flow guardado en Meta" : "Encuesta guardada");
        setDirty(false);
        onSaved();
      } else {
        toast.error(data?.error || "No se pudo guardar");
        // El guardado local sí ocurrió; reflejamos que no está sucio en balde.
        if (data?.success) setDirty(false);
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
          {showMetaValidation && (
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
          )}
          {canEdit && (
            <button
              onClick={handleSave}
              disabled={saving || !dirty || errors.length > 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-xs font-medium transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {showMetaValidation ? "Guardar en Meta" : "Guardar"}
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

      {/* Barra-resumen de validación: un solo renglón con un botón que abre el
          modal con el detalle completo (locales + Meta). */}
      {(issues.length > 0 || metaErrors.length > 0 || metaValidated === true) && (
        <div className="border-t border-border px-3 py-2 bg-muted/20 shrink-0 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 text-[11px]">
            {localErrorCount > 0 && (
              <span className="flex items-center gap-1 text-red-600">
                <AlertTriangle className="h-3.5 w-3.5" /> {localErrorCount} error
                {localErrorCount !== 1 ? "es" : ""} de formato
              </span>
            )}
            {warningCount + metaWarningCount > 0 && (
              <span className="flex items-center gap-1 text-amber-600">
                <AlertTriangle className="h-3.5 w-3.5" /> {warningCount + metaWarningCount} aviso
                {warningCount + metaWarningCount !== 1 ? "s" : ""}
              </span>
            )}
            {metaBlockingCount > 0 && (
              <span className="flex items-center gap-1 text-red-600">
                <AlertTriangle className="h-3.5 w-3.5" /> {metaBlockingCount} error
                {metaBlockingCount !== 1 ? "es" : ""} de Meta
              </span>
            )}
            {totalIssueCount === 0 && metaValidated === true && (
              <span className="flex items-center gap-1 text-green-600">
                <CheckCircle2 className="h-3.5 w-3.5" /> Validado por Meta sin errores
              </span>
            )}
          </div>
          {totalIssueCount > 0 && (
            <button
              onClick={() => setShowIssues(true)}
              className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border text-[11px] font-medium text-foreground hover:bg-muted transition-colors"
            >
              <AlertTriangle className="h-3.5 w-3.5" /> Ver {totalIssueCount} problema
              {totalIssueCount !== 1 ? "s" : ""}
            </button>
          )}
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
      {showIssues && (
        <IssuesModal
          issues={issues}
          metaErrors={metaErrors}
          onClose={() => setShowIssues(false)}
        />
      )}
    </div>
  );
}

// ─── Modal: detalle de problemas de validación (locales + Meta) ─────

function IssuesModal({
  issues,
  metaErrors,
  onClose,
}: {
  issues: Array<{ level: "error" | "warning"; message: string; screenId?: string }>;
  metaErrors: Array<{ code?: string; type?: string; message: string; pointer?: string }>;
  onClose: () => void;
}) {
  const localErrors = issues.filter((i) => i.level === "error");
  const localWarnings = issues.filter((i) => i.level === "warning");
  // Agrupar los errores de Meta por ruta: cada grupo es UN problema (aunque
  // Meta reporte varias reglas para el mismo campo).
  const groups = groupMetaErrors(metaErrors);
  const metaBlocking = groups.filter((g) => g.type !== "WARNING");
  const metaWarns = groups.filter((g) => g.type === "WARNING");

  const totalProblems = issues.length + groups.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card text-card-foreground rounded-2xl shadow-xl w-full max-w-xl mx-4 max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-semibold">
              Problemas de validación{totalProblems > 0 ? ` (${totalProblems})` : ""}
            </h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xs">
            Cerrar
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {(localErrors.length > 0 || metaBlocking.length > 0) && (
            <IssueGroup
              title="Errores (impiden guardar/publicar)"
              tone="error"
              items={[
                ...localErrors.map((i) => ({ message: i.message, where: i.screenId })),
                ...metaBlocking.map((g) => ({
                  message: g.messages.join(" "),
                  where: g.pointer,
                  tag: `Meta${g.codes.length ? ` · ${g.codes.join(", ")}` : ""}`,
                })),
              ]}
            />
          )}

          {(localWarnings.length > 0 || metaWarns.length > 0) && (
            <IssueGroup
              title="Avisos (no bloquean, pero conviene revisar)"
              tone="warning"
              items={[
                ...localWarnings.map((i) => ({ message: i.message, where: i.screenId })),
                ...metaWarns.map((g) => ({
                  message: g.messages.join(" "),
                  where: g.pointer,
                  tag: `Meta${g.codes.length ? ` · ${g.codes.join(", ")}` : ""}`,
                })),
              ]}
            />
          )}

          {totalProblems === 0 && (
            <p className="text-sm text-muted-foreground">No hay problemas.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function IssueGroup({
  title,
  tone,
  items,
}: {
  title: string;
  tone: "error" | "warning";
  items: Array<{ message: string; where?: string; tag?: string }>;
}) {
  if (items.length === 0) return null;
  const color = tone === "error" ? "text-red-600" : "text-amber-600";
  const border = tone === "error" ? "border-red-200 dark:border-red-500/30" : "border-amber-200 dark:border-amber-500/30";
  const bg = tone === "error" ? "bg-red-50 dark:bg-red-500/10" : "bg-amber-50 dark:bg-amber-500/10";
  return (
    <div>
      <h4 className={`text-[11px] font-semibold uppercase mb-2 ${color}`}>
        {title} ({items.length})
      </h4>
      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={i} className={`rounded-lg border ${border} ${bg} px-3 py-2`}>
            <div className="flex items-start gap-2">
              <AlertTriangle className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${color}`} />
              <div className="min-w-0">
                {it.tag && (
                  <span className={`text-[9px] font-semibold ${color} mr-1.5`}>{it.tag}</span>
                )}
                <span className="text-xs text-foreground">{it.message}</span>
                {it.where && (
                  <p className="text-[10px] font-mono text-muted-foreground mt-1 break-all">
                    {it.where}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
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
