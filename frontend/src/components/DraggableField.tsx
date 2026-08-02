import { useDraggable } from "@dnd-kit/core";
import { GripVertical, Calendar, DollarSign, Percent, List, Type, Hash, ToggleLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FieldType } from "@/types";

interface DraggableFieldProps {
  id: string;
  label: string;
  type: FieldType;
  isMapped?: boolean;
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

const typeBgColors: Record<FieldType, string> = {
  text: "bg-blue-50 text-blue-600",
  number: "bg-cyan-50 text-cyan-600",
  date: "bg-orange-50 text-orange-600",
  currency: "bg-emerald-50 text-emerald-600",
  percentage: "bg-purple-50 text-purple-600",
  boolean: "bg-pink-50 text-pink-600",
  list: "bg-amber-50 text-amber-600",
};

const typeShortLabels: Record<FieldType, string> = {
  text: "ABC",
  number: "123",
  date: "📅",
  currency: "$",
  percentage: "%",
  boolean: "T/F",
  list: "☰",
};

export function DraggableField({ id, label, type, isMapped }: DraggableFieldProps) {
  const { attributes, listeners, setNodeRef, isDragging } =
    useDraggable({ id });

  const Icon = typeIcons[type];

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        "flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-grab active:cursor-grabbing select-none transition-colors",
        isDragging && "opacity-30 border-dashed border-indigo-300 bg-indigo-50/50",
        !isDragging && isMapped
          ? "bg-green-50 border-green-200 text-green-700"
          : !isDragging && "bg-white border-gray-200 hover:border-indigo-300 hover:bg-indigo-50"
      )}
    >
      <GripVertical className="h-4 w-4 text-gray-400 shrink-0" />
      <span className="truncate flex-1">{label}</span>
      <span className={cn("inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium", typeBgColors[type])}>
        <Icon className="h-3 w-3" />
        {typeShortLabels[type]}
      </span>
      {isMapped && !isDragging && (
        <span className="text-xs text-green-500">✓</span>
      )}
    </div>
  );
}
