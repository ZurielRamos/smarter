import { useState, useEffect, useRef, useCallback } from "react";
import { Search, X, Loader2, Check } from "lucide-react";
import { api } from "@/services/api";

interface ModelOption {
  id: string;
  name: string;
  pricing: { prompt: string; completion: string } | null;
  context_length: number;
}

interface ModelSelectorProps {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}

export function ModelSelector({ value, onChange, className }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<ModelOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedName, setSelectedName] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (open && results.length === 0) fetchModels("");
  }, [open]);

  useEffect(() => {
    if (value && !selectedName) {
      fetchModels(value.split("/").pop() || "").then((models) => {
        const match = models.find((m) => m.id === value);
        if (match) setSelectedName(match.name);
      });
    }
  }, [value]);

  const fetchModels = useCallback(async (q: string): Promise<ModelOption[]> => {
    setLoading(true);
    try {
      const { data } = await api.get<ModelOption[]>("/bots/models/search", { params: { q } });
      setResults(data);
      return data;
    } catch { return []; }
    finally { setLoading(false); }
  }, []);

  const handleSearch = (val: string) => {
    setSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchModels(val), 300);
  };

  const handleSelect = (model: ModelOption) => {
    onChange(model.id);
    setSelectedName(model.name);
    setSearch("");
    setOpen(false);
  };

  const formatPrice = (price: string) => {
    const num = parseFloat(price) * 1_000_000;
    if (num === 0) return "gratis";
    if (num < 1) return `$${num.toFixed(2)}/M`;
    return `$${num.toFixed(1)}/M`;
  };

  return (
    <div className={`relative ${className || ""}`} ref={ref}>
      <button
        type="button"
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-800 hover:border-gray-300 focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200 bg-white transition-colors"
      >
        <span className="truncate">
          {value ? (
            <>
              <span className="font-medium">{selectedName || value}</span>
              <span className="text-gray-400 ml-1.5 text-xs">{value}</span>
            </>
          ) : (
            <span className="text-gray-400">Busca y selecciona un modelo...</span>
          )}
        </span>
        {value ? (
          <X className="h-3.5 w-3.5 text-gray-400 hover:text-gray-600 shrink-0" onClick={(e) => { e.stopPropagation(); onChange(""); setSelectedName(""); }} />
        ) : (
          <Search className="h-3.5 w-3.5 text-gray-400 shrink-0" />
        )}
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="px-3 py-2 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Buscar modelo..."
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400"
              />
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
              </div>
            ) : results.length === 0 ? (
              <div className="py-6 text-center text-xs text-gray-400">No se encontraron modelos</div>
            ) : (
              results.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleSelect(m)}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors border-b border-gray-50 last:border-0 ${m.id === value ? "bg-brand-50" : "hover:bg-gray-50"}`}
                >
                  <Check className={`h-3.5 w-3.5 shrink-0 ${m.id === value ? "text-brand-600" : "text-transparent"}`} />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-gray-900 truncate block">{m.name}</span>
                    <span className="text-[10px] text-gray-400 font-mono">
                      {m.id}{m.context_length ? ` · ${Math.round(m.context_length / 1000)}k ctx` : ""}
                    </span>
                  </div>
                  {m.pricing && (
                    <div className="text-right shrink-0">
                      <p className="text-[10px] text-gray-500">{formatPrice(m.pricing.prompt)} in</p>
                      <p className="text-[10px] text-gray-500">{formatPrice(m.pricing.completion)} out</p>
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
