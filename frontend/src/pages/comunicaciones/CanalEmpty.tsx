import { MessageSquare } from "lucide-react";

export function CanalEmpty() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
      <MessageSquare className="h-8 w-8 text-muted-foreground/40 mb-2" />
      <p className="text-sm text-muted-foreground font-medium">Selecciona un canal</p>
      <p className="text-[11px] text-muted-foreground/70 mt-1">O crea uno nuevo para conectar un proveedor de comunicación</p>
    </div>
  );
}
