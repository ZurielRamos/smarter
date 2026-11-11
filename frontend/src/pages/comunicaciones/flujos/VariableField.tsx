import {
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { caretCoordinates } from "./caretCoordinates";
import { FlowVariablesContext } from "./editorContext";
import {
  VARIABLE_GROUP_LABELS,
  applyVariable,
  detectTrigger,
  filterOptions,
  groupOptions,
  type Trigger,
  type VariableOption,
} from "./variables";

type FieldElement = HTMLInputElement | HTMLTextAreaElement;

interface FieldProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  className?: string;
  maxLength?: number;
  type?: "text" | "url" | "tel";
  inputMode?: "text" | "url" | "tel";
  "aria-label"?: string;
  "aria-invalid"?: boolean;
}

/** Campo de una línea que sugiere variables al escribir `{` o `{{`. */
export function VariableInput(props: FieldProps) {
  return <VariableField {...props} />;
}

/** Área de texto que sugiere variables al escribir `{` o `{{`. */
export function VariableTextarea(props: FieldProps & { rows?: number }) {
  return <VariableField {...props} multiline />;
}

interface Coords {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  /** Alto máximo de toda la ventana, ajustado al espacio libre para no salirse de la pantalla */
  maxHeight: number;
}

/** Ancho de la lista flotante. */
const POPUP_WIDTH = 288;
/** Alto máximo (lista + pie de ayuda). */
const POPUP_MAX_HEIGHT = 272;
/** Separación mínima con los bordes de la ventana. */
const POPUP_MARGIN = 8;
/** Separación entre el cursor y la lista. */
const POPUP_GAP = 6;

/**
 * Campo de texto con autocompletado de variables.
 *
 * Al escribir `{` o `{{` se abre una lista con las variables del flujo, los
 * campos del CRM y los personalizados; se filtra mientras se escribe. Flechas
 * para moverse, Enter o Tab para insertar, Esc para cerrar. Se inserta como
 * `{{clave}}`. El cursor queda al final de la variable insertada.
 *
 * La lista se dibuja en un portal con posición fija para que no la recorte el
 * panel con scroll; se abre hacia arriba si abajo no hay espacio.
 */
function VariableField({
  multiline = false,
  rows,
  value,
  onChange,
  className,
  type = "text",
  ...rest
}: FieldProps & { multiline?: boolean; rows?: number }) {
  const options = useContext(FlowVariablesContext);
  const ref = useRef<FieldElement | null>(null);
  const baseId = useId();
  const listId = `${baseId}-list`;
  const optionId = (i: number) => `${baseId}-opt-${i}`;

  const [trigger, setTrigger] = useState<Trigger | null>(null);
  // Esc cierra la lista hasta que se escriba otro `{`.
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const [active, setActive] = useState(0);
  const [coords, setCoords] = useState<Coords | null>(null);
  const pendingCaret = useRef<number | null>(null);
  // Entre insertar una variable y que React confirme el texto nuevo, el DOM aún
  // tiene el valor anterior: un evento de selección que llegue en ese hueco
  // reabriría la lista con el disparador viejo.
  const inserting = useRef(false);

  const grouped = useMemo(
    () => groupOptions(trigger ? filterOptions(options, trigger.query) : []),
    [options, trigger],
  );
  // El orden de navegación con el teclado es el que se ve en pantalla (agrupado).
  const flat = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);
  const open = !!trigger && dismissedAt !== trigger.start && options.length > 0;

  const sync = (el: FieldElement) => {
    if (inserting.current) return;
    const caret = el.selectionStart;
    // Con texto seleccionado no se sugiere nada.
    if (caret === null || el.selectionEnd !== caret) {
      setTrigger(null);
      return;
    }
    const next = detectTrigger(el.value, caret);
    setTrigger((prev) =>
      prev && next && prev.start === next.start && prev.end === next.end && prev.query === next.query ? prev : next,
    );
    // Esc descarta solo el disparador actual: con otro `{` (o sin ninguno) se olvida.
    setDismissedAt((prev) => (next && prev === next.start ? prev : null));
  };

  const triggerStart = trigger?.start;
  const triggerQuery = trigger?.query;
  useEffect(() => {
    setActive(0);
  }, [triggerStart, triggerQuery]);

  // Mantener la opción activa a la vista al navegar con el teclado.
  useEffect(() => {
    if (open) document.getElementById(optionId(active))?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active]);

  // Restaurar el cursor tras insertar (el texto cambia con el siguiente render).
  useLayoutEffect(() => {
    // El texto ya está confirmado: vuelven a valer los eventos de selección.
    inserting.current = false;
    const caret = pendingCaret.current;
    if (caret === null || !ref.current) return;
    pendingCaret.current = null;
    ref.current.setSelectionRange(caret, caret);
  }, [value]);

  // La lista flota junto al cursor, anclada a la `{` que se escribió, no al borde del campo.
  useLayoutEffect(() => {
    if (!open || triggerStart === undefined) {
      setCoords(null);
      return;
    }
    const update = () => {
      const el = ref.current;
      if (!el) return;
      const field = el.getBoundingClientRect();
      const caret = caretCoordinates(el, triggerStart);
      // Si el cursor quedó fuera de la parte visible del campo (texto con scroll), se ancla al borde visible.
      const top = Math.min(Math.max(caret.top, field.top), Math.max(field.top, field.bottom - caret.height));
      const left = Math.min(Math.max(caret.left, field.left), field.right);

      const width = Math.min(POPUP_WIDTH, window.innerWidth - 2 * POPUP_MARGIN);
      const x = Math.min(Math.max(POPUP_MARGIN, left), Math.max(POPUP_MARGIN, window.innerWidth - width - POPUP_MARGIN));
      const belowTop = top + caret.height + POPUP_GAP;
      const spaceBelow = window.innerHeight - belowTop - POPUP_MARGIN;
      const spaceAbove = top - POPUP_GAP - POPUP_MARGIN;
      // Debajo del cursor si cabe una lista razonable (o hay más sitio que arriba); si no, arriba.
      if (spaceBelow >= Math.min(POPUP_MAX_HEIGHT, 180) || spaceBelow >= spaceAbove) {
        setCoords({ left: x, width, top: belowTop, maxHeight: Math.min(POPUP_MAX_HEIGHT, spaceBelow) });
      } else {
        setCoords({
          left: x,
          width,
          bottom: window.innerHeight - top + POPUP_GAP,
          maxHeight: Math.min(POPUP_MAX_HEIGHT, spaceAbove),
        });
      }
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, value, triggerStart]);

  const choose = (option: VariableOption) => {
    const el = ref.current;
    if (!el || !trigger) return;
    const current = detectTrigger(el.value, el.selectionStart ?? el.value.length) ?? trigger;
    const result = applyVariable(el.value, current, option.key);
    pendingCaret.current = result.caret;
    inserting.current = true;
    onChange(result.text);
    setTrigger(null);
    setDismissedAt(null);
  };

  const handleKeyDown = (e: KeyboardEvent<FieldElement>) => {
    // Una tecla nueva es una acción nueva: si el padre no cambió el texto (p. ej.
    // lo recortó al mismo valor), no se queda ignorando la selección.
    inserting.current = false;
    if (!open || e.nativeEvent.isComposing) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setDismissedAt(trigger!.start);
      return;
    }
    if (flat.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % flat.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + flat.length) % flat.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      choose(flat[Math.min(active, flat.length - 1)]);
    }
  };

  const shared = {
    id: rest.id,
    value,
    placeholder: rest.placeholder,
    maxLength: rest.maxLength,
    className,
    autoComplete: "off",
    role: "combobox" as const,
    "aria-label": rest["aria-label"],
    "aria-invalid": rest["aria-invalid"],
    "aria-autocomplete": "list" as const,
    "aria-expanded": open,
    "aria-controls": open ? listId : undefined,
    "aria-activedescendant": open && flat.length > 0 ? optionId(Math.min(active, flat.length - 1)) : undefined,
    onChange: (e: ChangeEvent<FieldElement>) => {
      inserting.current = false;
      onChange(e.target.value);
      sync(e.target);
    },
    onSelect: (e: React.SyntheticEvent<FieldElement>) => sync(e.currentTarget),
    onKeyDown: handleKeyDown,
    onBlur: () => {
      inserting.current = false;
      setTrigger(null);
      setDismissedAt(null);
    },
  };

  let index = 0;
  const list =
    open && coords
      ? createPortal(
          // Evita que pulsar la lista (o su barra de desplazamiento) le quite el foco al campo.
          <div
            onMouseDown={(e) => e.preventDefault()}
            className="fixed z-[70] flex flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-xl ring-1 ring-black/5 animate-in fade-in duration-100"
            style={{
              left: coords.left,
              width: coords.width,
              top: coords.top,
              bottom: coords.bottom,
              maxHeight: coords.maxHeight,
            }}
          >
            <div id={listId} role="listbox" aria-label="Variables disponibles" className="min-h-0 flex-1 overflow-y-auto py-1">
              {flat.length === 0 ? (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  Sin coincidencias. Si es una variable nueva, cierra con <code className="font-mono">{"}}"}</code> al
                  terminar.
                </div>
              ) : (
                grouped.map(({ group, items }) => (
                  <div key={group} role="group" aria-label={VARIABLE_GROUP_LABELS[group]}>
                    <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase text-muted-foreground" aria-hidden>
                      {VARIABLE_GROUP_LABELS[group]}
                    </div>
                    {items.map((o) => {
                      const i = index++;
                      const isActive = i === Math.min(active, flat.length - 1);
                      return (
                        <div
                          key={o.key}
                          id={optionId(i)}
                          role="option"
                          aria-selected={isActive}
                          onMouseEnter={() => setActive(i)}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            choose(o);
                          }}
                          title={o.hint}
                          className={cn(
                            "cursor-pointer px-3 py-1.5",
                            isActive ? "bg-brand-50 dark:bg-brand-700/40" : "hover:bg-muted",
                          )}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="truncate text-xs text-foreground">{o.label}</span>
                            <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{`{{${o.key}}}`}</span>
                          </div>
                          {o.hint && <div className="truncate text-[10px] text-muted-foreground">{o.hint}</div>}
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
            <div className="shrink-0 border-t border-border px-3 py-1 text-[10px] text-muted-foreground">
              ↑↓ mover · Enter insertar · Esc cerrar
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      {multiline ? (
        <textarea ref={(n) => void (ref.current = n)} rows={rows} {...shared} />
      ) : (
        <input ref={(n) => void (ref.current = n)} type={type} inputMode={rest.inputMode} {...shared} />
      )}
      {list}
    </>
  );
}
