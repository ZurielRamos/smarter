import { Workflow } from "lucide-react";

export function FlowEmpty() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
      <Workflow className="h-8 w-8 text-muted-foreground/40 mb-2" />
      <p className="text-sm text-muted-foreground font-medium">Selecciona un Flow</p>
      <p className="text-[11px] text-muted-foreground/70 mt-1">
        O crea uno nuevo para enviarlo por WhatsApp y capturar respuestas
      </p>
    </div>
  );
}
