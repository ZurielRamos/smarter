import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_ROWS = 500;

interface Row {
  path: string;
  label: string;
  value: unknown;
  depth: number;
}

const isContainer = (v: unknown): v is Record<string, unknown> | unknown[] => typeof v === "object" && v !== null;

const childPath = (parent: string, key: string | number) =>
  typeof key === "number" ? `${parent === "$" ? "" : parent}[${key}]` : parent === "$" ? key : `${parent}.${key}`;

function entries(v: Record<string, unknown> | unknown[]): [string | number, unknown][] {
  return Array.isArray(v) ? v.map((x, i) => [i, x]) : Object.entries(v);
}

/** Aplana el árbol visible (solo los nodos abiertos) hasta MAX_ROWS filas. */
function flatten(root: unknown, open: Set<string>): { rows: Row[]; truncated: boolean } {
  const rows: Row[] = [];
  let truncated = false;
  const walk = (value: unknown, path: string, depth: number) => {
    for (const [key, child] of entries(value as Record<string, unknown> | unknown[])) {
      if (rows.length >= MAX_ROWS) {
        truncated = true;
        return;
      }
      const p = childPath(path, key);
      rows.push({ path: p, label: typeof key === "number" ? `[${key}]` : key, value: child, depth });
      if (isContainer(child) && open.has(p)) walk(child, p, depth + 1);
      if (truncated) return;
    }
  };
  if (isContainer(root)) walk(root, "$", 0);
  else rows.push({ path: "$", label: "$", value: root, depth: 0 });
  return { rows, truncated };
}

function summary(v: unknown): string {
  if (Array.isArray(v)) return `[${v.length}]`;
  if (isContainer(v)) return `{${Object.keys(v).length}}`;
  if (typeof v === "string") return JSON.stringify(v.length > 80 ? `${v.slice(0, 80)}…` : v);
  return String(v);
}

interface Props {
  value: unknown;
  /** Se llama al pulsar cualquier nodo (hoja u objeto) con su ruta, p. ej. `data.items[0].nombre`. */
  onPick: (path: string, value: unknown) => void;
}

/** Árbol navegable y plegable de una respuesta JSON. */
export function JsonTree({ value, onPick }: Props) {
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const { rows, truncated } = useMemo(() => flatten(value, open), [value, open]);

  const toggle = (path: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  return (
    <div role="tree" aria-label="Respuesta" className="max-h-64 overflow-auto rounded-lg border border-border bg-background py-1 font-mono text-[11px]">
      {rows.map((r) => {
        const container = isContainer(r.value);
        const expanded = open.has(r.path);
        return (
          <div
            key={r.path}
            role="treeitem"
            aria-expanded={container ? expanded : undefined}
            className="flex items-center gap-0.5 pr-1 hover:bg-muted"
            style={{ paddingLeft: 4 + r.depth * 12 }}
          >
            {container ? (
              <button
                type="button"
                aria-label={expanded ? `Plegar ${r.label}` : `Desplegar ${r.label}`}
                onClick={() => toggle(r.path)}
                className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
              >
                {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </button>
            ) : (
              <span className="inline-block w-4 shrink-0" />
            )}
            <button
              type="button"
              title={`Guardar ${r.path}`}
              onClick={() => onPick(r.path, r.value)}
              className="flex min-w-0 flex-1 items-baseline gap-1.5 py-0.5 text-left"
            >
              <span className="shrink-0 text-brand-700 dark:text-brand-300">{r.label}</span>
              <span className={cn("truncate", container ? "text-muted-foreground" : "text-foreground")}>{summary(r.value)}</span>
            </button>
          </div>
        );
      })}
      {truncated && (
        <p className="px-2 py-1 font-sans text-[10px] text-amber-600 dark:text-amber-400">
          Se muestran los primeros {MAX_ROWS} nodos. Pliega secciones para ver el resto.
        </p>
      )}
    </div>
  );
}
