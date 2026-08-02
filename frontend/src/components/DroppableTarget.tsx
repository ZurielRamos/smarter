import { useDroppable } from "@dnd-kit/core";
import { X, Calendar, DollarSign, Percent, List, Type, Hash, ToggleLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FieldType } from "@/types";

interface DroppableTargetProps {
  id: string;
  label: string;
  required?: boolean;
  type: FieldType;
  allowMultiple: boolean;
  mappedFields: string[];
  onRemoveField: (field: string) => void;
  isInvalid?: boolean;
}

const typeIcons: Record<FieldType, typeof Type> = {
  text: Type,
  number: Hash,
  date: Calendar,
  currency: DollarSign,
  percentage: Percent,
  boolean: ToggleLeft,
  list: List,
};

const typeLabels: Record<FieldType, string> = {
  text: "Texto",
  number: "Número",
  date: "Fecha",
  currency: "Moneda",
  percentage: "Porcentaje",
  boolean: "Sí/No",
  list: "Lista",
};

const typeColors: Record<FieldType, string> = {
  text: "text-blue-500",
  number: "text-cyan-500",
  date: "text-orange-500",
  currency: "text-emerald-500",
  percentage: "text-purple-500",
  boolean: "text-pink-500",
  list: "text-amber-500",
};

export function DroppableTarget({
  id,
  label,
  required,
  type,
  allowMultiple,
  mappedFields,
  onRemoveField,
  isInvalid,
}: DroppableTargetProps) {
  const { isOver, setNodeRef } = useDroppable({ id });
  const hasMappings = mappedFields.length > 0;
  const Icon = typeIcons[type];

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border-2 border-dashed p-3 transition-all min-h-[52px]",
        isInvalid && isOver && "border-red-400 bg-red-50",
        !isInvalid && isOver && "border-indigo-400 bg-indigo-50",
        !isOver && hasMappings && "border-solid border-green-300 bg-green-50",
        !isOver && !hasMappings && "border-gray-200 bg-gray-50/50"
      )}
    >
      {/* Target label + type icon */}
      <div className="w-[200px] shrink-0">
        <div className="flex items-center gap-1.5">
          <Icon className={cn("h-3.5 w-3.5 shrink-0", typeColors[type])} />
          <span className="text-sm font-medium text-gray-700">{label}</span>
          {required && (
            <span className="text-xs text-red-500 font-bold">*</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[11px] text-gray-400">{typeLabels[type]}</span>
          {allowMultiple && (
            <span className="text-[11px] text-indigo-400">• múltiple</span>
          )}
        </div>
      </div>

      {/* Arrow */}
      <div className="text-gray-300 shrink-0">←</div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 min-w-0 rounded-md px-3 py-2 text-sm transition-all min-h-[36px]",
          isInvalid && isOver && "bg-red-100 border border-red-300",
          !isInvalid && hasMappings && "bg-white border border-green-200",
          !isInvalid && !hasMappings && isOver && "bg-indigo-100 border border-indigo-300",
          !isInvalid && !hasMappings && !isOver && "bg-white border border-dashed border-gray-300"
        )}
      >
        {isInvalid && isOver ? (
          <span className="text-red-500 text-xs font-medium">
            {!allowMultiple && hasMappings
              ? "Este campo solo acepta una columna"
              : "Tipo incompatible"}
          </span>
        ) : hasMappings ? (
          <div className="flex flex-wrap gap-1.5">
            {mappedFields.map((field, idx) => (
              <div
                key={field}
                className="inline-flex items-center gap-1 bg-green-100 text-green-700 rounded px-2 py-0.5 text-xs font-medium"
              >
                {idx > 0 && (
                  <span className="text-green-400 mr-0.5">+</span>
                )}
                <span>{field}</span>
                <button
                  onClick={() => onRemoveField(field)}
                  className="ml-0.5 rounded-full p-0.5 hover:bg-red-100 text-green-500 hover:text-red-500 transition-colors"
                  type="button"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <span className="text-gray-400 text-xs">
            {isOver ? "Soltar aquí" : "Arrastra uno o más campos aquí"}
          </span>
        )}
      </div>
    </div>
  );
}
