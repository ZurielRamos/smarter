import { Toggle } from "./Toggle";

/**
 * «¿Reemplazar el dato actual?» de toda escritura a un campo del contacto.
 * Por defecto reemplaza; apagado, un campo que ya tiene valor se conserva.
 */
export function ReplaceToggle({ keepExisting, onChange }: { keepExisting?: boolean; onChange: (keepExisting: true | undefined) => void }) {
  const replace = !keepExisting;
  return (
    <Toggle
      checked={replace}
      onChange={(v) => onChange(v ? undefined : true)}
      label="Reemplazar el dato actual del contacto"
      description={
        replace
          ? "Si el contacto ya tiene un valor en este campo, se reemplaza por el nuevo."
          : "Si el contacto ya tiene un valor en este campo, se conserva; solo se escribe si está vacío."
      }
    />
  );
}
