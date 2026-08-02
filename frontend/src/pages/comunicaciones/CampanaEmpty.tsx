import { Megaphone } from "lucide-react";

export function CampanaEmpty() {
  return (
    <div className="flex-1 flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="relative mx-auto mb-6 w-32 h-32">
          <div className="absolute inset-0 rounded-full bg-gray-200/60" />
          <div className="absolute top-4 left-2 w-16 h-2 rounded-full bg-gray-300/50" />
          <div className="absolute top-10 right-2 w-12 h-2 rounded-full bg-gray-300/50" />
          <div className="absolute bottom-10 left-4 w-14 h-2 rounded-full bg-gray-300/50" />
          <div className="absolute bottom-4 right-4 w-10 h-2 rounded-full bg-gray-300/50" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
            <Megaphone className="h-10 w-10 text-gray-400" />
          </div>
        </div>
        <p className="text-gray-500 text-sm font-medium">Selecciona una campaña del panel izquierdo</p>
        <p className="text-gray-400 text-xs mt-1">O crea una nueva para empezar</p>
      </div>
    </div>
  );
}
