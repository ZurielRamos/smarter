import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
  /** Texto secundario a la derecha (p. ej. la clave de una variable) */
  hint?: string;
  /** Opciones con el mismo `group` se muestran juntas bajo un título */
  group?: string;
}

interface FlowSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  id?: string;
  placeholder?: string;
  "aria-label"?: string;
  /** Muestra un buscador dentro de la lista (útil con muchas opciones) */
  searchable?: boolean;
  /** Tamaño compacto para filas dentro de tarjetas */
  compact?: boolean;
  className?: string;
}

const MENU_MAX = 288;

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

interface Pos {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
}

/**
 * Selector propio (sin `<select>` nativo): lista flotante en un portal para que
 * ningún panel con scroll la recorte, con grupos, buscador opcional y teclado
 * (flechas, Enter, Escape, escribir para ir a una opción).
 */
export function FlowSelect({
  value,
  onChange,
  options,
  id,
  placeholder = "Elige…",
  "aria-label": ariaLabel,
  searchable = false,
  compact = false,
  className,
}: FlowSelectProps) {
  const uid = useId();
  const listId = `${uid}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<Pos | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const typeAhead = useRef({ text: "", at: 0 });

  const selected = options.find((o) => o.value === value);

  const visible = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return options;
    return options.filter((o) => normalize(o.label).includes(q) || normalize(o.hint ?? "").includes(q));
  }, [options, query]);

  const place = useCallback(() => {
    const el = buttonRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const up = below < 180 && above > below;
    const width = Math.max(r.width, 200);
    setPos({
      left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
      width,
      top: up ? undefined : r.bottom + 4,
      bottom: up ? window.innerHeight - r.top + 4 : undefined,
      maxHeight: Math.min(MENU_MAX, Math.max(120, up ? above : below)),
    });
  }, []);

  const close = useCallback((refocus = true) => {
    setOpen(false);
    setQuery("");
    if (refocus) buttonRef.current?.focus();
  }, []);

  const openMenu = () => {
    place();
    const idx = options.findIndex((o) => o.value === value);
    setActive(Math.max(0, idx));
    setOpen(true);
  };

  const choose = (o: SelectOption) => {
    onChange(o.value);
    close();
  };

  // Cierra al hacer clic fuera y reposiciona al hacer scroll o cambiar el tamaño.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!buttonRef.current?.contains(t) && !menuRef.current?.contains(t)) close(false);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place, close]);

  useLayoutEffect(() => {
    if (open && searchable) searchRef.current?.focus();
    else if (open) menuRef.current?.focus();
  }, [open, searchable]);

  // Mantiene visible la opción activa.
  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open, visible]);

  const move = (delta: number) => {
    if (visible.length === 0) return;
    setActive((a) => (a + delta + visible.length) % visible.length);
  };

  const onMenuKey = (e: KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        move(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        move(-1);
        break;
      case "Home":
        if (!searchable) {
          e.preventDefault();
          setActive(0);
        }
        break;
      case "End":
        if (!searchable) {
          e.preventDefault();
          setActive(Math.max(0, visible.length - 1));
        }
        break;
      case "Enter":
        e.preventDefault();
        if (visible[active]) choose(visible[active]);
        break;
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        close();
        break;
      case "Tab":
        close(false);
        break;
      default:
        // Sin buscador: escribir salta a la opción que empieza con lo tecleado.
        if (!searchable && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
          const now = Date.now();
          const ta = typeAhead.current;
          ta.text = now - ta.at > 700 ? e.key : ta.text + e.key;
          ta.at = now;
          const q = normalize(ta.text);
          const idx = visible.findIndex((o) => normalize(o.label).startsWith(q));
          if (idx >= 0) setActive(idx);
        }
    }
  };

  const onButtonKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) openMenu();
    }
  };

  let lastGroup: string | undefined;

  return (
    <div className={cn("relative", className)}>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => (open ? close(false) : openMenu())}
        onKeyDown={onButtonKey}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-lg border bg-background text-left text-foreground transition-colors focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200",
          compact ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm",
          open ? "border-brand-400 ring-1 ring-brand-300" : "border-border hover:border-brand-200",
        )}
      >
        <span className={cn("truncate", !selected && "text-muted-foreground")}>
          {selected ? selected.label : value || placeholder}
        </span>
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            tabIndex={-1}
            onKeyDown={onMenuKey}
            style={{
              position: "fixed",
              left: pos.left,
              width: pos.width,
              top: pos.top,
              bottom: pos.bottom,
              maxHeight: pos.maxHeight,
            }}
            className="z-[9999] flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-lg focus:outline-none"
          >
            {searchable && (
              <div className="flex items-center gap-1.5 border-b border-border px-2.5 py-1.5">
                <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActive(0);
                  }}
                  aria-label="Buscar"
                  aria-controls={listId}
                  placeholder="Buscar…"
                  className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
              </div>
            )}
            <div id={listId} role="listbox" aria-label={ariaLabel} className="overflow-y-auto p-1">
              {visible.length === 0 && <p className="px-2.5 py-2 text-xs text-muted-foreground">Sin resultados</p>}
              {visible.map((o, i) => {
                const showGroup = o.group && o.group !== lastGroup;
                lastGroup = o.group;
                const isSelected = o.value === value;
                return (
                  <div key={o.value || `__${i}`}>
                    {showGroup && (
                      <p className="px-2.5 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {o.group}
                      </p>
                    )}
                    <div
                      role="option"
                      aria-selected={isSelected}
                      data-index={i}
                      onMouseEnter={() => setActive(i)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => choose(o)}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-xs",
                        i === active ? "bg-muted" : "",
                        isSelected ? "font-medium text-brand-700 dark:text-brand-300" : "text-foreground",
                      )}
                    >
                      <Check className={cn("h-3.5 w-3.5 shrink-0", isSelected ? "opacity-100" : "opacity-0")} />
                      <span className="min-w-0 flex-1 truncate">{o.label}</span>
                      {o.hint && <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{o.hint}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
