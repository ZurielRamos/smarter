import { useState } from "react";
import { X, ChevronLeft, RotateCcw } from "lucide-react";
import type { FlowModel, FlowComponent } from "./types";

/**
 * Vista previa navegable: simula el recorrido del Flow pantalla por pantalla,
 * siguiendo el routing (next). Solo visual, no envía datos.
 */
export function FlowPreview({ model, onClose }: { model: FlowModel; onClose: () => void }) {
  const entry = model.screens[0]?.id || "";
  const [current, setCurrent] = useState(entry);
  const [history, setHistory] = useState<string[]>([]);

  const screen = model.screens.find((s) => s.id === current);

  const goNext = () => {
    if (!screen) return;
    if (screen.next) {
      setHistory((h) => [...h, current]);
      setCurrent(screen.next);
    }
  };
  const goBack = () => {
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setCurrent(prev);
      return h.slice(0, -1);
    });
  };
  const restart = () => {
    setCurrent(entry);
    setHistory([]);
  };

  const isTerminal = !screen?.next;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div className="relative flex flex-col items-center gap-3">
        {/* Teléfono */}
        <div className="w-[320px] rounded-[2.2rem] border-[8px] border-gray-900 bg-[#e5ddd5] shadow-2xl overflow-hidden">
          {/* Barra superior */}
          <div className="bg-[#008069] text-white px-4 py-3 flex items-center gap-2">
            {history.length > 0 ? (
              <button onClick={goBack} className="p-0.5 hover:bg-white/10 rounded">
                <ChevronLeft className="h-4 w-4" />
              </button>
            ) : (
              <div className="h-7 w-7 rounded-full bg-white/20" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{screen?.title}</p>
              <p className="text-[10px] text-white/70">Vista previa</p>
            </div>
          </div>

          {/* Contenido */}
          <div className="bg-white min-h-[440px] max-h-[520px] overflow-y-auto p-4 space-y-3">
            {screen?.components.map((comp) => (
              <PreviewComponent key={comp._id} comp={comp} />
            ))}
          </div>

          {/* Footer */}
          <div className="bg-white px-4 pb-4 pt-1">
            <button
              onClick={goNext}
              disabled={isTerminal}
              className={`w-full rounded-full text-center text-sm font-medium py-3 transition-colors ${
                isTerminal
                  ? "bg-gray-200 text-gray-500 cursor-default"
                  : "bg-[#008069] text-white hover:bg-[#026e5a]"
              }`}
            >
              {screen?.footerLabel || (isTerminal ? "Enviar" : "Continuar")}
            </button>
            {isTerminal && (
              <p className="text-[10px] text-center text-gray-400 mt-2">Fin del formulario</p>
            )}
          </div>
        </div>

        {/* Controles */}
        <div className="flex items-center gap-2">
          <button
            onClick={restart}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/90 text-gray-800 text-xs font-medium hover:bg-white transition-colors"
          >
            <RotateCcw className="h-3 w-3" /> Reiniciar
          </button>
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/90 text-gray-800 text-xs font-medium hover:bg-white transition-colors"
          >
            <X className="h-3 w-3" /> Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function PreviewComponent({ comp }: { comp: FlowComponent }) {
  switch (comp.type) {
    case "TextHeading":
      return <p className="text-base font-bold text-gray-900">{comp.text}</p>;
    case "TextSubheading":
      return <p className="text-sm font-semibold text-gray-800">{comp.text}</p>;
    case "TextBody":
      return <p className="text-xs text-gray-700 leading-relaxed">{comp.text}</p>;
    case "TextCaption":
      return <p className="text-[11px] text-gray-400">{comp.text}</p>;
    case "TextInput":
      return (
        <label className="block">
          <span className="text-[11px] text-gray-600">{comp.label}{comp.required ? " *" : ""}</span>
          <input className="mt-1 w-full h-9 rounded-lg border border-gray-300 px-2 text-xs" placeholder={comp.helperText || ""} />
        </label>
      );
    case "TextArea":
      return (
        <label className="block">
          <span className="text-[11px] text-gray-600">{comp.label}{comp.required ? " *" : ""}</span>
          <textarea className="mt-1 w-full h-16 rounded-lg border border-gray-300 px-2 py-1 text-xs" />
        </label>
      );
    case "DatePicker":
      return (
        <label className="block">
          <span className="text-[11px] text-gray-600">{comp.label}</span>
          <input type="date" className="mt-1 w-full h-9 rounded-lg border border-gray-300 px-2 text-xs" />
        </label>
      );
    case "Dropdown":
      return (
        <label className="block">
          <span className="text-[11px] text-gray-600">{comp.label}{comp.required ? " *" : ""}</span>
          <select className="mt-1 w-full h-9 rounded-lg border border-gray-300 px-2 text-xs">
            <option>Selecciona…</option>
            {(comp.options || []).map((o) => (
              <option key={o.id}>{o.title}</option>
            ))}
          </select>
        </label>
      );
    case "RadioButtonsGroup":
      return (
        <div>
          <p className="text-[11px] text-gray-600 mb-1">{comp.label}</p>
          <div className="space-y-1.5">
            {(comp.options || []).map((o) => (
              <label key={o.id} className="flex items-center gap-2">
                <input type="radio" name={comp.name} className="h-3.5 w-3.5" />
                <span className="text-xs text-gray-700">{o.title}</span>
              </label>
            ))}
          </div>
        </div>
      );
    case "CheckboxGroup":
      return (
        <div>
          <p className="text-[11px] text-gray-600 mb-1">{comp.label}</p>
          <div className="space-y-1.5">
            {(comp.options || []).map((o) => (
              <label key={o.id} className="flex items-center gap-2">
                <input type="checkbox" className="h-3.5 w-3.5" />
                <span className="text-xs text-gray-700">{o.title}</span>
              </label>
            ))}
          </div>
        </div>
      );
    case "OptIn":
      return (
        <label className="flex items-center gap-2">
          <input type="checkbox" className="h-3.5 w-3.5" />
          <span className="text-xs text-gray-700">{comp.label}</span>
        </label>
      );
    case "Image":
      return (
        comp.src ? (
          <img src={comp.src} alt={comp.altText || ""} className="w-full rounded-lg" />
        ) : (
          <div className="w-full h-24 rounded-lg bg-gray-100 flex items-center justify-center text-[11px] text-gray-400">
            {comp.altText || "Imagen"}
          </div>
        )
      );
    case "EmbeddedLink":
      return <p className="text-xs text-brand-600 underline">{comp.text}</p>;
    default:
      return null;
  }
}
