import { useState, useMemo } from "react";
import {
  DndContext,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { GripVertical, Zap } from "lucide-react";
import { DraggableField } from "./DraggableField";
import { DroppableTarget } from "./DroppableTarget";
import { TransformModal } from "./TransformModal";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Badge } from "./ui/badge";
import type { TargetField, MappingConfig, FieldType, TransformsConfig } from "@/types";

interface FieldMapperProps {
  targetFields: TargetField[];
  sourceHeaders: string[];
  preview: Record<string, string>[];
  mapping: MappingConfig;
  onMappingChange: (mapping: MappingConfig) => void;
  onSubmit: (transforms?: TransformsConfig) => void;
  isLoading: boolean;
  matchField?: string;
  onMatchFieldChange?: (field: string) => void;
  initialTransforms?: TransformsConfig;
}

/**
 * Detecta el tipo de datos probable de una columna basándose en sus valores
 */
function detectColumnType(values: string[]): FieldType {
  const nonEmpty = values.filter((v) => v && v.trim() !== "");
  if (nonEmpty.length === 0) return "text";

  // Verificar si es boolean
  const boolValues = ["true", "false", "1", "0", "si", "sí", "no", "yes", "verdadero", "falso"];
  const boolCount = nonEmpty.filter((v) =>
    boolValues.includes(v.toLowerCase().trim())
  ).length;
  if (boolCount / nonEmpty.length >= 0.8) return "boolean";

  // Verificar si es fecha
  const dateCount = nonEmpty.filter((v) => {
    const d = new Date(v);
    return !isNaN(d.getTime()) && v.match(/\d{4}[-/]\d{2}[-/]\d{2}/);
  }).length;
  if (dateCount / nonEmpty.length >= 0.7) return "date";

  // Verificar si es porcentaje
  const pctCount = nonEmpty.filter((v) => v.includes("%")).length;
  if (pctCount / nonEmpty.length >= 0.5) return "percentage";

  // Verificar si es numérico
  const numCount = nonEmpty.filter((v) => {
    const cleaned = v.replace(/[^0-9,.\-]/g, "");
    return cleaned.length > 0 && !isNaN(parseFloat(cleaned.replace(",", ".")));
  }).length;

  if (numCount / nonEmpty.length >= 0.7) {
    // Verificar si tiene decimales (currency) o es entero (number)
    const hasDecimals = nonEmpty.some((v) => {
      const cleaned = v.replace(/[^0-9,.]/g, "");
      return cleaned.includes(".") || cleaned.includes(",");
    });
    return hasDecimals ? "currency" : "number";
  }

  return "text";
}

/**
 * Verifica si un tipo de columna source es compatible con un tipo target
 */
function isTypeCompatible(sourceType: FieldType, targetType: FieldType): boolean {
  // text acepta todo (concatenación)
  if (targetType === "text") return true;
  // list acepta text y list
  if (targetType === "list") return sourceType === "text" || sourceType === "list";
  // number acepta number y currency
  if (targetType === "number") return sourceType === "number" || sourceType === "currency" || sourceType === "text";
  // currency acepta number y currency
  if (targetType === "currency") return sourceType === "currency" || sourceType === "number" || sourceType === "text";
  // percentage acepta number, percentage, currency
  if (targetType === "percentage") return sourceType === "percentage" || sourceType === "number" || sourceType === "currency";
  // boolean solo acepta boolean
  if (targetType === "boolean") return sourceType === "boolean" || sourceType === "text";
  // date solo acepta date
  if (targetType === "date") return sourceType === "date" || sourceType === "text";
  return true;
}

export function FieldMapper({
  targetFields,
  sourceHeaders,
  preview,
  mapping,
  onMappingChange,
  onSubmit,
  isLoading,
  matchField,
  onMatchFieldChange,
  initialTransforms,
}: FieldMapperProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [matchSelectorOpen, setMatchSelectorOpen] = useState(false);
  const [transforms, setTransforms] = useState<TransformsConfig>(initialTransforms || {});
  const [transformModalField, setTransformModalField] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  // Detectar tipo de cada columna source basándose en el preview
  const sourceColumnTypes = useMemo(() => {
    const types: Record<string, FieldType> = {};
    for (const header of sourceHeaders) {
      const values = preview.map((row) => row[header] || "");
      types[header] = detectColumnType(values);
    }
    return types;
  }, [sourceHeaders, preview]);

  // Qué campos del source ya están mapeados
  const mappedSourceFields = new Set(Object.values(mapping).flat());

  // Contar targets con al menos un campo o un transform fijo/template
  const mappedTargetCount = Object.entries(mapping).filter(
    ([field, fields]) => fields.length > 0 || transforms[field]?.type === 'fixed' || transforms[field]?.type === 'template'
  ).length;

  // Agrupar target fields por categoría
  const categories = useMemo(() => {
    const grouped: Record<string, TargetField[]> = {};
    for (const field of targetFields) {
      const cat = field.category || "General";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(field);
    }
    return grouped;
  }, [targetFields]);

  const getDropValidity = (targetFieldId: string): boolean => {
    if (!activeId) return false;

    const targetDef = targetFields.find((f) => f.field === targetFieldId);
    if (!targetDef) return true;

    const currentFields = mapping[targetFieldId] || [];
    const hasConcatTransform = transforms[targetFieldId]?.type === 'concat';
    if (!targetDef.allowMultiple && !hasConcatTransform && currentFields.length >= 1) return true;
    if (currentFields.includes(activeId)) return true;

    const sourceType = sourceColumnTypes[activeId] || "text";
    if (!isTypeCompatible(sourceType, targetDef.type)) return true;

    return false;
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    setOverId(event.over?.id as string | null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setOverId(null);

    if (!over) return;

    const sourceField = active.id as string;
    const targetField = over.id as string;

    const targetDef = targetFields.find((f) => f.field === targetField);
    if (!targetDef) return;

    const currentFields = mapping[targetField] || [];

    if (currentFields.includes(sourceField)) return;
    const hasConcatTransform = transforms[targetField]?.type === 'concat';
    if (!targetDef.allowMultiple && !hasConcatTransform && currentFields.length >= 1) return;

    const sourceType = sourceColumnTypes[sourceField] || "text";
    if (!isTypeCompatible(sourceType, targetDef.type)) return;

    const newMapping = { ...mapping };
    newMapping[targetField] = [...currentFields, sourceField];
    onMappingChange(newMapping);
  };

  const handleRemoveField = (targetField: string, sourceField: string) => {
    const newMapping = { ...mapping };
    newMapping[targetField] = (newMapping[targetField] || []).filter(
      (f) => f !== sourceField
    );
    onMappingChange(newMapping);
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              Mapeo de Campos
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Arrastra las columnas del archivo hacia los campos destino.
            </p>
          </div>
          <Badge variant={mappedTargetCount > 0 ? "default" : "secondary"}>
            {mappedTargetCount} / {targetFields.length} mapeados
          </Badge>
        </div>

        {/* Match field selector */}
        {onMatchFieldChange && (
          <div className="flex items-center gap-3 mx-5 mt-4 px-4 py-3 rounded-lg bg-brand-50 border border-brand-100 shrink-0">
            <div className="flex-1">
              <p className="text-xs font-medium text-gray-700">Actualizar contactos existentes</p>
              <p className="text-[11px] text-gray-500">Si se encuentra un registro con el mismo valor en el campo clave, se actualizará en lugar de crear uno nuevo.</p>
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => setMatchSelectorOpen((v) => !v)}
                className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-700 flex items-center gap-2 min-w-[140px] justify-between"
              >
                <span>{matchField === "none" ? "No actualizar" : targetFields.find((f) => f.field === matchField)?.label || matchField}</span>
                <svg className={`h-3.5 w-3.5 text-gray-400 transition-transform ${matchSelectorOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
              {matchSelectorOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg border border-gray-200 shadow-lg py-1 z-50 max-h-48 overflow-auto">
                  <button onClick={() => { onMatchFieldChange("none"); setMatchSelectorOpen(false); }} className={`w-full px-3 py-1.5 text-xs text-left transition-colors ${matchField === "none" ? "bg-brand-50 text-brand-700 font-medium" : "text-gray-700 hover:bg-gray-50"}`}>
                    No actualizar (crear nuevos)
                  </button>
                  {targetFields.map((f) => (
                    <button key={f.field} onClick={() => { onMatchFieldChange(f.field); setMatchSelectorOpen(false); }} className={`w-full px-3 py-1.5 text-xs text-left transition-colors ${matchField === f.field ? "bg-brand-50 text-brand-700 font-medium" : "text-gray-700 hover:bg-gray-50"}`}>
                      {f.label} <span className="text-gray-400 font-mono">({f.field})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-0 p-5">
          {/* Panel izquierdo: Columnas del archivo (draggables) */}
          <Card className="lg:col-span-1 overflow-hidden flex flex-col">
            <CardHeader className="pb-2 pt-4 shrink-0">
              <CardTitle className="text-sm">Columnas del Archivo</CardTitle>
              <CardDescription className="text-xs">
                Tipo detectado automáticamente
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 pb-4">
              <div className="space-y-1.5 h-full overflow-y-auto overflow-x-hidden pr-1">
                {sourceHeaders.map((header) => (
                  <DraggableField
                    key={header}
                    id={header}
                    label={header}
                    type={sourceColumnTypes[header]}
                    isMapped={mappedSourceFields.has(header)}
                  />
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Panel derecho: Campos destino agrupados por categoría */}
          <Card className="lg:col-span-2 flex flex-col overflow-hidden">
            <CardHeader className="pb-2 pt-4 shrink-0">
              <CardTitle className="text-sm">Campos Destino</CardTitle>
              <CardDescription className="text-xs">
                Organizados por categoría para segmentación
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 pb-4">
              <div className="space-y-3 h-full overflow-y-auto pr-1">
                {Object.entries(categories).map(([category, fields]) => (
                  <div key={category}>
                    <h4 className="text-xs font-semibold uppercase text-gray-400 tracking-wider mb-2 px-1">
                      {category}
                    </h4>
                    <div className="space-y-2">
                      {fields.map((field) => (
                        <div key={field.field} className="flex items-start gap-1">
                          <div className="flex-1">
                            <DroppableTarget
                              id={field.field}
                              label={field.label}
                              required={field.required}
                              type={field.type}
                              allowMultiple={field.allowMultiple || transforms[field.field]?.type === 'concat'}
                              mappedFields={mapping[field.field] || []}
                              onRemoveField={(sourceField) =>
                                handleRemoveField(field.field, sourceField)
                              }
                              isInvalid={overId === field.field && getDropValidity(field.field)}
                            />
                          </div>
                          <button
                              onClick={() => setTransformModalField(field.field)}
                              className={`mt-2 p-1.5 rounded-lg transition-colors ${transforms[field.field]?.type && transforms[field.field].type !== 'none' ? 'bg-purple-50 text-purple-600' : 'text-gray-300 hover:text-purple-500 hover:bg-purple-50'}`}
                              title="Transformar valor"
                            >
                              <Zap className="h-3.5 w-3.5" />
                            </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Botón guardar */}
        <div className="px-5 py-3 shrink-0 flex justify-end border-t border-gray-100">
          <Button
            onClick={() => onSubmit(transforms)}
            disabled={isLoading || mappedTargetCount === 0}
            size="lg"
            className="min-w-[200px] bg-brand-800 hover:bg-brand-700 text-white"
          >
            {isLoading ? (
              <>
                <span className="animate-spin mr-2">⏳</span>
                Guardando...
              </>
            ) : (
              <>
                Guardar Mapeo
                {mappedTargetCount > 0 && (
                  <span className="ml-2 text-xs opacity-75">
                    ({mappedTargetCount} campos)
                  </span>
                )}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Drag Overlay */}
      <DragOverlay dropAnimation={null}>
        {activeId ? (
          <div className="flex items-center gap-2 rounded-md border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm shadow-lg cursor-grabbing whitespace-nowrap">
            <GripVertical className="h-4 w-4 text-indigo-400 shrink-0" />
            <span className="font-medium text-indigo-700">
              {activeId}
            </span>
          </div>
        ) : null}
      </DragOverlay>

      {/* Transform Modal */}
      {transformModalField && (
        <TransformModal
          open={!!transformModalField}
          onClose={() => setTransformModalField(null)}
          fieldLabel={targetFields.find((f) => f.field === transformModalField)?.label || transformModalField}
          sourceFields={mapping[transformModalField] || []}
          value={transforms[transformModalField] || { type: 'none' }}
          onChange={(config) => {
            setTransforms((prev) => ({ ...prev, [transformModalField]: config }));
            setTransformModalField(null);
          }}
        />
      )}
    </DndContext>
  );
}
