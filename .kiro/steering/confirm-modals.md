# Modales de confirmación

Nunca usar `confirm()`, `alert()`, o `prompt()` nativos del navegador. Siempre utilizar el componente `ConfirmModal` ubicado en `@/components/ConfirmModal.tsx`.

## Uso básico

```tsx
import { ConfirmModal } from "@/components/ConfirmModal";

// State
const [showConfirm, setShowConfirm] = useState(false);

// En el JSX
<ConfirmModal
  open={showConfirm}
  onClose={() => setShowConfirm(false)}
  onConfirm={handleAction}
  title="Título de la acción"
  description="Descripción de lo que va a ocurrir."
  confirmLabel="Confirmar"
  variant="danger" // "danger" | "warning" | "default"
/>
```

## Props

| Prop | Tipo | Default | Descripción |
|------|------|---------|-------------|
| open | boolean | — | Controla visibilidad |
| onClose | () => void | — | Cerrar sin confirmar |
| onConfirm | () => void \| Promise<void> | — | Acción al confirmar (soporta async) |
| title | string | — | Título del modal |
| description | string | — | Texto descriptivo |
| confirmLabel | string | "Confirmar" | Texto del botón de confirmación |
| cancelLabel | string | "Cancelar" | Texto del botón de cancelar |
| variant | "danger" \| "warning" \| "default" | "default" | Estilo visual |
| verificationText | string | — | Si se proporciona, el usuario debe escribir este texto exacto para habilitar el botón |
| verificationPlaceholder | string | — | Placeholder del input de verificación |
| loading | boolean | false | Muestra spinner en el botón de confirmar |

## Ejemplo con verificación de texto

Para acciones destructivas críticas (eliminar cuenta, borrar todos los datos):

```tsx
<ConfirmModal
  open={showConfirm}
  onClose={() => setShowConfirm(false)}
  onConfirm={handleDeleteAccount}
  title="Eliminar cuenta"
  description="Se eliminarán todos los datos permanentemente."
  confirmLabel="Eliminar cuenta"
  variant="danger"
  verificationText="ELIMINAR"
  verificationPlaceholder="Escribe ELIMINAR"
/>
```

## Variantes

- `default`: Acciones normales (azul brand)
- `warning`: Precaución, reversible (amarillo)
- `danger`: Destructivo, irreversible (rojo)
