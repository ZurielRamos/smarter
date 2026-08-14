import { FileText } from "lucide-react";

export function PlantillaEmpty() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
      <FileText className="h-8 w-8 text-gray-300 mb-2" />
      <p className="text-sm text-gray-500 font-medium">Selecciona una plantilla</p>
      <p className="text-[11px] text-gray-400 mt-1">
        O crea una nueva para usarla en tus campañas de email
      </p>
    </div>
  );
}
