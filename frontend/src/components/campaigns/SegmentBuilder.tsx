import { useState, useEffect } from "react";
import {
  DndContext,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from "@dnd-kit/core";
import { GripVertical, Plus, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { DropdownSelect } from "@/components/ui/dropdown-select";
import { cn } from "@/lib/utils";

export interface SegmentCondition {
  id: string;
  field: string;
  operator: string;
  value: string | number | boolean;
}

export interface SegmentGroup {
  id: string;
  logic: "AND" | "OR";
  conditions: SegmentCondition[];
}

interface FieldDef {
  field: string;
  label: string;
  type: "text" | "number" | "date" | "boolean" | "list";
  operators: { value: string; label: string }[];
}

const AVAILABLE_FIELDS: FieldDef[] = [
  {
    field: "estado",
    label: "Estado",
    type: "list",
    operators: [
      { value: "equals", label: "es" },
      { value: "not_equals", label: "no es" },
    ],
  },
  {
    field: "numTransacciones",
    label: "Nº Transacciones",
    type: "number",
    operators: [
      { value: "greater_than", label: "mayor que" },
      { value: "less_than", label: "menor que" },
      { value: "greater_or_equal", label: "mayor o igual a" },
      { value: "less_or_equal", label: "menor o igual a" },
      { value: "equals", label: "igual a" },
    ],
  },
  {
    field: "montoTotal",
    label: "Monto Total",
    type: "number",
    operators: [
      { value: "greater_than", label: "mayor que" },
      { value: "less_than", label: "menor que" },
      { value: "greater_or_equal", label: "mayor o igual a" },
      { value: "less_or_equal", label: "menor o igual a" },
    ],
  },
  {
    field: "segmentoValor",
    label: "Segmento Valor",
    type: "list",
    operators: [
      { value: "equals", label: "es" },
      { value: "not_equals", label: "no es" },
    ],
  },
  {
    field: "ciudad",
    label: "Ciudad",
    type: "text",
    operators: [
      { value: "equals", label: "es" },
      { value: "not_equals", label: "no es" },
      { value: "contains", label: "contiene" },
    ],
  },
  {
    field: "productoPreferido",
    label: "Producto Preferido",
    type: "list",
    operators: [
      { value: "equals", label: "es" },
      { value: "not_equals", label: "no es" },
    ],
  },
  {
    field: "frecuenciaSemanal",
    label: "Frecuencia Semanal",
    type: "number",
    operators: [
      { value: "greater_than", label: "mayor que" },
      { value: "less_than", label: "menor que" },
    ],
  },
  {
    field: "tieneBonoActivo",
    label: "Tiene Bono Activo",
    type: "boolean",
    operators: [
      { value: "is_true", label: "Sí" },
      { value: "is_false", label: "No" },
    ],
  },
  {
    field: "ultimoJuego",
    label: "Último Juego",
    type: "list",
    operators: [
      { value: "equals", label: "es" },
      { value: "not_equals", label: "no es" },
    ],
  },
];

interface SegmentBuilderProps {
  groups: SegmentGroup[];
  onChange: (groups: SegmentGroup[]) => void;
  matchedCount: number | null;
  previewSample: Array<{ idCliente: string; nombreCompleto: string; estado: string; numTransacciones: number }>;
  onPreview: () => void;
}

// Draggable field chip
function DraggableFieldChip({ field }: { field: FieldDef }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `field_${field.field}`,
    data: { field },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        "flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm cursor-grab active:cursor-grabbing select-none transition-colors",
        isDragging
          ? "opacity-30 border-dashed border-brand-300"
          : "bg-white border-gray-200 hover:border-brand-400 hover:bg-brand-50"
      )}
    >
      <GripVertical className="h-3.5 w-3.5 text-gray-400" />
      <span className="font-medium text-gray-700">{field.label}</span>
    </div>
  );
}

// Droppable zone for conditions
function ConditionDropZone({ groupId, isEmpty }: { groupId: string; isEmpty: boolean }) {
  const { isOver, setNodeRef } = useDroppable({ id: `dropzone_${groupId}` });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-lg border-2 border-dashed p-4 transition-all min-h-[60px] flex items-center justify-center",
        isOver ? "border-brand-400 bg-brand-50" : "border-gray-200",
        isEmpty && "py-8"
      )}
    >
      {isEmpty && !isOver && (
        <p className="text-sm text-gray-400">
          Arrastra campos aquí para crear condiciones
        </p>
      )}
      {isOver && (
        <p className="text-sm text-brand-600 font-medium">Soltar aquí</p>
      )}
    </div>
  );
}

// Condition row with operator and value
function ConditionRow({
  condition,
  fieldDef,
  fieldOptions,
  onUpdate,
  onRemove,
}: {
  condition: SegmentCondition;
  fieldDef: FieldDef | undefined;
  fieldOptions: string[];
  onUpdate: (updates: Partial<SegmentCondition>) => void;
  onRemove: () => void;
}) {
  if (!fieldDef) return null;

  const needsValue = !["is_true", "is_false", "is_null", "is_not_null"].includes(condition.operator);
  const isNumeric = fieldDef.type === "number";

  return (
    <div className="flex items-center gap-2 p-3 bg-white rounded-lg border border-gray-200">
      <span className="text-sm font-medium text-brand-700 shrink-0">
        {fieldDef.label}
      </span>

      <DropdownSelect
        value={condition.operator}
        onChange={(val) => onUpdate({ operator: val })}
        options={fieldDef.operators}
      />

      {needsValue && isNumeric && (
        <input
          type="number"
          value={condition.value as number}
          onChange={(e) => onUpdate({ value: Number(e.target.value) })}
          placeholder="Valor..."
          className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-md min-w-[100px] focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400"
        />
      )}

      {needsValue && !isNumeric && (
        <Combobox
          value={condition.value as string}
          onChange={(val) => onUpdate({ value: val })}
          options={fieldOptions}
          placeholder="Seleccionar valor..."
          className="flex-1 min-w-[150px]"
        />
      )}

      <button
        onClick={onRemove}
        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors shrink-0"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

export function SegmentBuilder({ groups, onChange, matchedCount, previewSample, onPreview }: SegmentBuilderProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [fieldOptionsCache, setFieldOptionsCache] = useState<Record<string, string[]>>({});

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Load distinct values for a field
  const loadFieldOptions = async (field: string) => {
    if (fieldOptionsCache[field]) return;
    try {
      const res = await fetch(`/api/records/distinct-values?field=${field}`);
      const values = await res.json();
      setFieldOptionsCache((prev) => ({ ...prev, [field]: values }));
    } catch {
      // silently fail
    }
  };

  // Load options for existing conditions on mount
  useEffect(() => {
    const nonNumericFields = new Set<string>();
    for (const group of groups) {
      for (const cond of group.conditions) {
        const def = AVAILABLE_FIELDS.find((f) => f.field === cond.field);
        if (def && def.type !== "number") {
          nonNumericFields.add(cond.field);
        }
      }
    }
    nonNumericFields.forEach((field) => loadFieldOptions(field));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const overId = over.id as string;
    if (!overId.startsWith("dropzone_")) return;

    const groupId = overId.replace("dropzone_", "");
    const fieldData = active.data.current?.field as FieldDef | undefined;
    if (!fieldData) return;

    // Add condition to group
    const newCondition: SegmentCondition = {
      id: `cond_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      field: fieldData.field,
      operator: fieldData.operators[0].value,
      value: fieldData.type === "number" ? 0 : "",
    };

    const newGroups = groups.map((g) =>
      g.id === groupId
        ? { ...g, conditions: [...g.conditions, newCondition] }
        : g
    );
    onChange(newGroups);

    // Load options for non-numeric fields
    if (fieldData.type !== "number") {
      loadFieldOptions(fieldData.field);
    }
  };

  const addGroup = () => {
    const newGroup: SegmentGroup = {
      id: `group_${Date.now()}`,
      logic: "AND",
      conditions: [],
    };
    onChange([...groups, newGroup]);
  };

  const removeGroup = (groupId: string) => {
    onChange(groups.filter((g) => g.id !== groupId));
  };

  const updateGroupLogic = (groupId: string, logic: "AND" | "OR") => {
    onChange(groups.map((g) => (g.id === groupId ? { ...g, logic } : g)));
  };

  const updateCondition = (groupId: string, condId: string, updates: Partial<SegmentCondition>) => {
    onChange(
      groups.map((g) =>
        g.id === groupId
          ? {
              ...g,
              conditions: g.conditions.map((c) =>
                c.id === condId ? { ...c, ...updates } : c
              ),
            }
          : g
      )
    );
  };

  const removeCondition = (groupId: string, condId: string) => {
    onChange(
      groups.map((g) =>
        g.id === groupId
          ? { ...g, conditions: g.conditions.filter((c) => c.id !== condId) }
          : g
      )
    );
  };

  const activeField = activeId
    ? AVAILABLE_FIELDS.find((f) => `field_${f.field}` === activeId)
    : null;

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex h-full gap-4">
        {/* Left: Available fields */}
        <div className="w-[220px] shrink-0 flex flex-col">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">
            Campos disponibles
          </h4>
          <div className="space-y-1.5 overflow-y-auto flex-1 pr-1">
            {AVAILABLE_FIELDS.map((field) => (
              <DraggableFieldChip key={field.field} field={field} />
            ))}
          </div>
        </div>

        {/* Right: Segment groups */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-gray-700">
              Condiciones de segmentación
            </h4>
            {matchedCount !== null && (
              <div className="flex items-center gap-1.5 px-3 py-1 bg-accent-50 rounded-full border border-accent-200">
                <Users className="h-3.5 w-3.5 text-accent-600" />
                <span className="text-sm font-medium text-accent-700">
                  {matchedCount.toLocaleString()} clientes
                </span>
              </div>
            )}
          </div>

          {/* Preview sample */}
          {previewSample.length > 0 && (
            <div className="mb-3 rounded-lg border border-accent-200 bg-accent-50 overflow-hidden">
              <div className="px-3 py-1.5 text-xs font-medium text-accent-700 border-b border-accent-200">
                Muestra de resultados
              </div>
              <div className="divide-y divide-accent-100 max-h-[120px] overflow-y-auto">
                {previewSample.map((client, idx) => (
                  <div key={idx} className="flex items-center gap-4 px-3 py-1.5 text-xs">
                    <span className="font-mono text-gray-500 w-[80px]">{client.idCliente}</span>
                    <span className="text-gray-700 flex-1">{client.nombreCompleto || "—"}</span>
                    <span className="text-gray-500">{client.estado || "—"}</span>
                    <span className="text-gray-500">{client.numTransacciones ?? "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {groups.map((group, idx) => (
              <div
                key={group.id}
                className="rounded-xl border border-gray-200 bg-gray-50 p-4"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-500 uppercase">
                      Grupo {idx + 1}
                    </span>
                    <div className="flex items-center bg-white border border-gray-200 rounded-md overflow-hidden">
                      <button
                        onClick={() => updateGroupLogic(group.id, "AND")}
                        className={cn(
                          "px-2 py-0.5 text-xs font-medium transition-colors",
                          group.logic === "AND"
                            ? "bg-brand-600 text-white"
                            : "text-gray-500 hover:bg-gray-100"
                        )}
                      >
                        Y (AND)
                      </button>
                      <button
                        onClick={() => updateGroupLogic(group.id, "OR")}
                        className={cn(
                          "px-2 py-0.5 text-xs font-medium transition-colors",
                          group.logic === "OR"
                            ? "bg-brand-600 text-white"
                            : "text-gray-500 hover:bg-gray-100"
                        )}
                      >
                        O (OR)
                      </button>
                    </div>
                  </div>
                  {groups.length > 1 && (
                    <button
                      onClick={() => removeGroup(group.id)}
                      className="p-1 text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Existing conditions */}
                <div className="space-y-2 mb-2">
                  {group.conditions.map((cond) => (
                    <ConditionRow
                      key={cond.id}
                      condition={cond}
                      fieldDef={AVAILABLE_FIELDS.find((f) => f.field === cond.field)}
                      fieldOptions={fieldOptionsCache[cond.field] || []}
                      onUpdate={(updates) => updateCondition(group.id, cond.id, updates)}
                      onRemove={() => removeCondition(group.id, cond.id)}
                    />
                  ))}
                </div>

                {/* Drop zone */}
                <ConditionDropZone groupId={group.id} isEmpty={group.conditions.length === 0} />
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-3 shrink-0 border-t border-gray-100 mt-3">
            <Button variant="outline" size="sm" onClick={addGroup} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Agregar grupo
            </Button>
            <Button
              size="sm"
              onClick={onPreview}
              className="gap-1.5 bg-accent-500 hover:bg-accent-600 text-white"
            >
              <Users className="h-3.5 w-3.5" />
              Previsualizar
            </Button>
          </div>
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeField ? (
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-brand-300 bg-brand-50 text-sm shadow-lg cursor-grabbing">
            <GripVertical className="h-3.5 w-3.5 text-brand-400" />
            <span className="font-medium text-brand-700">{activeField.label}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
