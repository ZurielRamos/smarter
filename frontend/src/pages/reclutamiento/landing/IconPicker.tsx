import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { ModalShell, inputClass, secondaryButton } from "../shared";
import { getLandingIcon, searchLandingIcons } from "./landingIcons";

/** Botón con el icono actual que abre un buscador para elegir otro. */
export function IconPicker({ value, onChange, label }: { value: string; onChange: (id: string) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchLandingIcons(query), [query]);
  const Current = getLandingIcon(value);
  const close = () => {
    setOpen(false);
    setQuery("");
  };
  const pick = (id: string) => {
    onChange(id);
    close();
  };
  return (
    <>
      <button
        type="button"
        aria-label={`Elegir icono de ${label}`}
        title="Elegir icono"
        onClick={() => setOpen(true)}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-brand-700 transition-colors hover:bg-muted dark:text-brand-200"
      >
        <Current className="h-4 w-4" aria-hidden="true" />
      </button>
      {open && (
        <ModalShell title="Elegir icono" onClose={close}>
          <div className="space-y-3 px-5 py-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                autoFocus
                type="search"
                aria-label="Buscar icono"
                placeholder="Buscar: dinero, reloj, equipo, seguro…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && results[0]) pick(results[0].id);
                }}
                className={`${inputClass} pl-9`}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{results.length === 1 ? "1 icono" : `${results.length} iconos`}</span>
              {value && (
                <button type="button" onClick={() => pick("")} className={`${secondaryButton} !px-2 !py-1`}>
                  Usar el predeterminado
                </button>
              )}
            </div>
            {results.length === 0 ? (
              <p className="rounded-lg bg-muted px-3 py-6 text-center text-xs text-muted-foreground">No hay iconos para «{query}». Prueba con otra palabra, por ejemplo «dinero» o «equipo».</p>
            ) : (
              <div role="listbox" aria-label="Iconos" className="grid max-h-80 grid-cols-5 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-6">
                {results.map(({ id, label: name, Icon }) => {
                  const selected = id === value;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      aria-label={name}
                      title={name}
                      onClick={() => pick(id)}
                      className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${selected ? "border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-700/30 dark:text-brand-100" : "border-transparent text-foreground hover:bg-muted"}`}
                    >
                      <Icon className="h-5 w-5" aria-hidden="true" />
                      <span className="w-full truncate text-center text-[10px] text-muted-foreground">{name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </ModalShell>
      )}
    </>
  );
}
