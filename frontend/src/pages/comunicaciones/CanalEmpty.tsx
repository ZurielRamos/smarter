import { MessageSquare } from "lucide-react";

export function CanalEmpty() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
      <MessageSquare className="h-8 w-8 text-gray-300 mb-2" />
      <p className="text-sm text-gray-500 font-medium">Selecciona un canal</p>
      <p className="text-[11px] text-gray-400 mt-1">O crea uno nuevo para conectar un proveedor de comunicación</p>
    </div>
  );
}
