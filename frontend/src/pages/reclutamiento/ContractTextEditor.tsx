import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { caretCoordinates } from "@/pages/comunicaciones/flujos/caretCoordinates";
import { detectTrigger, type Trigger } from "@/pages/comunicaciones/flujos/variables";
import { filterVariables, insertVariable } from "./variableHelpers";
import type { VariableDef, VariableGroup } from "@/services/reclutamiento";

const GROUP_LABELS: Record<VariableGroup, string> = {
  contacto: "Contacto",
  campos: "Campos personalizados del CRM",
  contrato: "Contrato",
  datos: "Datos a completar al generar",
};
const GROUP_ORDER: VariableGroup[] = ["contacto", "campos", "contrato", "datos"];

interface Coords {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
}

const POPUP_WIDTH = 340;
const POPUP_MAX_HEIGHT = 300;
const POPUP_MARGIN = 8;
const POPUP_GAP = 6;

/**
 * Editor del texto del contrato. Al escribir «{» o «{{» abre una lista con las
 * variables disponibles (contacto, campos del CRM, contrato y datos a completar).
 * Flechas para moverse, Enter o Tab para insertar, Esc para cerrar.
 */
export function ContractTextEditor({
  value,
  onChange,
  variables,
  disabled,
  className,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  variables: VariableDef[];
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const baseId = useId();
  const listId = `${baseId}-list`;
  const optionId = (i: number) => `${baseId}-opt-${i}`;

  const [trigger, setTrigger] = useState<Trigger | null>(null);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const [active, setActive] = useState(0);
  const [coords, setCoords] = useState<Coords | null>(null);
  const pendingCaret = useRef<number | null>(null);
  // Entre insertar y que React confirme el texto, un evento de selección reabriría la lista con el disparador viejo.
  const inserting = useRef(false);

  const grouped = useMemo(() => {
    const found = trigger ? filterVariables(variables, trigger.query) : [];
    return GROUP_ORDER.map((group) => ({ group, items: found.filter((o) => o.group === group) })).filter((g) => g.items.length > 0);
  }, [variables, trigger]);
  const flat = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);
  const open = !!trigger && dismissedAt !== trigger.start && variables.length > 0 && !disabled;

  const sync = (el: HTMLTextAreaElement) => {
    if (inserting.current) return;
    const caret = el.selectionStart;
    if (caret === null || el.selectionEnd !== caret) {
      setTrigger(null);
      return;
    }
    const next = detectTrigger(el.value, caret);
    setTrigger((prev) => (prev && next && prev.start === next.start && prev.end === next.end && prev.query === next.query ? prev : next));
    setDismissedAt((prev) => (next && prev === next.start ? prev : null));
  };

  const triggerStart = trigger?.start;
  const triggerQuery = trigger?.query;
  useEffect(() => {
    setActive(0);
  }, [triggerStart, triggerQuery]);

  useEffect(() => {
    if (open) document.getElementById(optionId(active))?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active]);

  useLayoutEffect(() => {
    inserting.current = false;
    const caret = pendingCaret.current;
    if (caret === null || !ref.current) return;
    pendingCaret.current = null;
    ref.current.setSelectionRange(caret, caret);
  }, [value]);

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
      const top = Math.min(Math.max(caret.top, field.top), Math.max(field.top, field.bottom - caret.height));
      const left = Math.min(Math.max(caret.left, field.left), field.right);
      const width = Math.min(POPUP_WIDTH, window.innerWidth - 2 * POPUP_MARGIN);
      const x = Math.min(Math.max(POPUP_MARGIN, left), Math.max(POPUP_MARGIN, window.innerWidth - width - POPUP_MARGIN));
      const belowTop = top + caret.height + POPUP_GAP;
      const spaceBelow = window.innerHeight - belowTop - POPUP_MARGIN;
      const spaceAbove = top - POPUP_GAP - POPUP_MARGIN;
      if (spaceBelow >= Math.min(POPUP_MAX_HEIGHT, 180) || spaceBelow >= spaceAbove) {
        setCoords({ left: x, width, top: belowTop, maxHeight: Math.min(POPUP_MAX_HEIGHT, spaceBelow) });
      } else {
        setCoords({ left: x, width, bottom: window.innerHeight - top + POPUP_GAP, maxHeight: Math.min(POPUP_MAX_HEIGHT, spaceAbove) });
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

  const choose = (option: VariableDef) => {
    const el = ref.current;
    if (!el || !trigger) return;
    const current = detectTrigger(el.value, el.selectionStart ?? el.value.length) ?? trigger;
    const result = insertVariable(el.value, current, option);
    pendingCaret.current = result.caret;
    inserting.current = true;
    onChange(result.text);
    setTrigger(null);
    setDismissedAt(null);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
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

  let index = 0;
  const list =
    open && coords
      ? createPortal(
          <div
            onMouseDown={(e) => e.preventDefault()}
            className="fixed z-[70] flex flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-xl ring-1 ring-black/5"
            style={{ left: coords.left, width: coords.width, top: coords.top, bottom: coords.bottom, maxHeight: coords.maxHeight }}
          >
            <div id={listId} role="listbox" aria-label="Variables disponibles" className="min-h-0 flex-1 overflow-y-auto py-1">
              {flat.length === 0 ? (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  Sin coincidencias. Para un dato que se pide al generar el contrato escribe <code className="font-mono">datos.nombre</code>.
                </div>
              ) : (
                grouped.map(({ group, items }) => (
                  <div key={group} role="group" aria-label={GROUP_LABELS[group]}>
                    <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase text-muted-foreground" aria-hidden>
                      {GROUP_LABELS[group]}
                    </div>
                    {items.map((o) => {
                      const i = index++;
                      const isActive = i === Math.min(active, flat.length - 1);
                      return (
                        <div
                          key={o.insert}
                          id={optionId(i)}
                          role="option"
                          aria-selected={isActive}
                          onMouseEnter={() => setActive(i)}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            choose(o);
                          }}
                          className={cn("cursor-pointer px-3 py-1.5", isActive ? "bg-brand-50 dark:bg-brand-700/40" : "hover:bg-muted")}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="truncate text-xs text-foreground">{o.label}</span>
                            <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{`{{${o.insert}}}`}</span>
                          </div>
                          {o.hint && <div className="truncate text-[10px] text-muted-foreground">{o.hint}</div>}
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
            <div className="shrink-0 border-t border-border px-3 py-1 text-[10px] text-muted-foreground">↑↓ mover · Enter insertar · Esc cerrar</div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <textarea
        ref={ref}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        className={className}
        spellCheck
        autoComplete="off"
        role="combobox"
        aria-label="Texto del contrato"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && flat.length > 0 ? optionId(Math.min(active, flat.length - 1)) : undefined}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
          inserting.current = false;
          onChange(e.target.value);
          sync(e.target);
        }}
        onSelect={(e) => sync(e.currentTarget)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          inserting.current = false;
          setTrigger(null);
          setDismissedAt(null);
        }}
      />
      {list}
    </>
  );
}
