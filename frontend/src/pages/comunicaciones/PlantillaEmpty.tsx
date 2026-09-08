import { FileText } from "lucide-react";

export function PlantillaEmpty() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
      <FileText className="h-8 w-8 text-muted-foreground/40 mb-2" />
      <p className="text-sm text-muted-foreground font-medium">Selecciona una plantilla</p>
      <p className="text-[11px] text-muted-foreground/70 mt-1">
        O crea una nueva para usarla en tus campañas de email
      </p>
    </div>
  );
}
