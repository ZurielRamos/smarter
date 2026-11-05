import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, Check } from "lucide-react";
import { COUNTRY_CODES, DEFAULT_COUNTRY, type CountryCode } from "@/lib/country-codes";

/**
 * Input de teléfono para el portal: selector de indicativo (país) con buscador
 * autocompletado + campo para el número local. Expone el valor combinado en
 * formato E.164 aproximado ("+<dial><numero>") vía `onChange`.
 */
export function PhonePortalInput({
  value,
  onChange,
  onEnter,
  primary = "#0f766e",
}: {
  /** Número nacional (sin indicativo). */
  value: string;
  /** Devuelve { national, e164, dial }. */
  onChange: (v: { national: string; e164: string; dial: string }) => void;
  onEnter?: () => void;
  primary?: string;
}) {
  const [country, setCountry] = useState<CountryCode>(DEFAULT_COUNTRY);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const emit = (national: string, c: CountryCode) => {
    const digits = national.replace(/[^0-9]/g, "");
    onChange({ national: digits, dial: c.dial, e164: `${c.dial}${digits}` });
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return COUNTRY_CODES;
    return COUNTRY_CODES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.dial.includes(q.replace(/[^0-9+]/g, "")) ||
        c.iso.toLowerCase().includes(q),
    );
  }, [search]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    // Foco al buscador al abrir.
    const t = setTimeout(() => searchRef.current?.focus(), 30);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      clearTimeout(t);
    };
  }, [open]);

  const pick = (c: CountryCode) => {
    setCountry(c);
    setOpen(false);
    setSearch("");
    emit(value, c);
  };

  return (
    <div ref={rootRef} className="relative">
      <div className="flex items-stretch rounded-xl border border-slate-200 focus-within:ring-2 focus-within:ring-slate-900/10 focus-within:border-slate-400 overflow-hidden">
        {/* Botón del indicativo */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 px-4 border-r border-slate-200 hover:bg-slate-50 transition-colors shrink-0"
        >
          <span className="text-2xl leading-none">{country.flag}</span>
          <span className="text-base font-semibold text-slate-700">{country.dial}</span>
          <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {/* Número local */}
        <input
          type="tel"
          inputMode="tel"
          value={value}
          onChange={(e) => emit(e.target.value, country)}
          onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
          placeholder="300 000 0000"
          className="flex-1 min-w-0 px-4 py-3.5 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none"
        />
      </div>

      {/* Dropdown con buscador */}
      {open && (
        <div className="absolute z-20 mt-1.5 w-full rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          <div className="p-2.5 border-b border-slate-100">
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-slate-50">
              <Search className="h-5 w-5 text-slate-400 shrink-0" />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar país o indicativo…"
                className="flex-1 min-w-0 bg-transparent text-base text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-sm text-slate-400 text-center">Sin resultados</p>
            ) : (
              filtered.map((c) => {
                const active = c.iso === country.iso;
                return (
                  <button
                    key={c.iso}
                    type="button"
                    onClick={() => pick(c)}
                    className={`flex items-center gap-3 w-full px-3.5 py-2.5 text-left text-base transition-colors ${
                      active ? "bg-slate-50" : "hover:bg-slate-50"
                    }`}
                  >
                    <span className="text-xl leading-none">{c.flag}</span>
                    <span className="flex-1 min-w-0 truncate text-slate-700">{c.name}</span>
                    <span className="text-sm font-medium text-slate-400">{c.dial}</span>
                    {active && <Check className="h-5 w-5 shrink-0" style={{ color: primary }} />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
