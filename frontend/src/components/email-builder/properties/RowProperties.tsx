import { useState } from "react";
import { ColorPicker, FourSideEditor, Stepper } from "./shared";
import { ImageUploader } from "./ImageUploader";

interface RowStyle {
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
  gap: number;
  backgroundColor: string;
  backgroundImage: string;
  backgroundSize: string;
  backgroundPosition: string;
  backgroundRepeat: string;
  borderColor: string;
  borderWidth: number;
  borderRadius: number;
  heightMode: "auto" | "fixed" | "min";
  height: number;
  minHeight: number;
}

interface Props {
  style: RowStyle;
  onChange: (style: RowStyle) => void;
}

// Tab: Espacios
function SpacingTab({ style, onChange }: Props) {
  return (
    <div className="divide-y divide-gray-100">
      <div className="py-4">
        <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide mb-3">Alto de la fila</p>
        <div className="flex gap-1 mb-3">
          {(["auto", "fixed", "min"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => onChange({ ...style, heightMode: mode })}
              className={`flex-1 py-1.5 rounded-md text-[10px] font-medium border transition-colors ${style.heightMode === mode ? "bg-brand-50 border-brand-300 text-brand-700" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}
            >
              {mode === "auto" ? "Automatico" : mode === "fixed" ? "Fijo" : "Minimo"}
            </button>
          ))}
        </div>
        {style.heightMode === "fixed" && (
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-gray-400">Altura (px)</span>
            <Stepper value={style.height} onChange={(v) => onChange({ ...style, height: v })} min={20} max={800} />
          </div>
        )}
        {style.heightMode === "min" && (
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-gray-400">Minimo (px)</span>
            <Stepper value={style.minHeight} onChange={(v) => onChange({ ...style, minHeight: v })} min={20} max={800} />
          </div>
        )}
      </div>

      <div className="py-4">
        <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide mb-3">Relleno (padding)</p>
        <FourSideEditor
          top={style.paddingTop}
          right={style.paddingRight}
          bottom={style.paddingBottom}
          left={style.paddingLeft}
          onChange={(t, r, b, l) => onChange({ ...style, paddingTop: t, paddingRight: r, paddingBottom: b, paddingLeft: l })}
        />
      </div>

      <div className="py-4">
        <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide mb-3">Espacio entre columnas (gap)</p>
        <div className="flex justify-center">
          <Stepper value={style.gap} onChange={(v) => onChange({ ...style, gap: v })} />
        </div>
      </div>

      <div className="py-4">
        <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide mb-3">Margenes</p>
        <FourSideEditor
          top={style.marginTop}
          right={style.marginRight}
          bottom={style.marginBottom}
          left={style.marginLeft}
          onChange={(t, r, b, l) => onChange({ ...style, marginTop: t, marginRight: r, marginBottom: b, marginLeft: l })}
        />
      </div>
    </div>
  );
}

// Tab: Estilos
function StylesTab({ style, onChange }: Props) {
  const update = (key: keyof RowStyle, value: any) => onChange({ ...style, [key]: value });

  return (
    <div className="divide-y divide-gray-100">
      <div className="py-4">
        <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide mb-3">Color de fondo</p>
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={() => update("backgroundColor", "transparent")}
            className={`px-2.5 py-1 rounded-md text-[10px] font-medium border transition-colors ${style.backgroundColor === "transparent" ? "bg-brand-50 border-brand-300 text-brand-700" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}
          >
            Sin fondo
          </button>
        </div>
        {style.backgroundColor !== "transparent" && (
          <ColorPicker value={style.backgroundColor} onChange={(v) => update("backgroundColor", v)} />
        )}
        {style.backgroundColor === "transparent" && (
          <button onClick={() => update("backgroundColor", "#ffffff")} className="text-[10px] text-brand-600 hover:text-brand-700 font-medium">
            Agregar color
          </button>
        )}
      </div>

      <div className="py-4">
        <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide mb-3">Imagen de fondo</p>
        <ImageUploader value={style.backgroundImage} onChange={(v) => update("backgroundImage", v)} compact />
        {style.backgroundImage && (
          <div className="mt-3 space-y-2.5">
            {/* Size */}
            <div>
              <span className="text-[9px] text-gray-400 block mb-1">Tamano</span>
              <div className="flex gap-1">
                {["cover", "contain", "auto"].map((opt) => (
                  <button
                    key={opt}
                    onClick={() => update("backgroundSize", opt)}
                    className={`flex-1 py-1.5 rounded-md text-[10px] font-medium border transition-colors ${style.backgroundSize === opt ? "bg-brand-50 border-brand-300 text-brand-700" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}
                  >
                    {opt === "cover" ? "Cubrir" : opt === "contain" ? "Contener" : "Auto"}
                  </button>
                ))}
              </div>
            </div>
            {/* Position */}
            <div>
              <span className="text-[9px] text-gray-400 block mb-1">Posicion</span>
              <div className="grid grid-cols-3 gap-1">
                {["top left", "top center", "top right", "center left", "center", "center right", "bottom left", "bottom center", "bottom right"].map((pos) => (
                  <button
                    key={pos}
                    onClick={() => update("backgroundPosition", pos)}
                    className={`py-1.5 rounded-md text-[9px] border transition-colors ${style.backgroundPosition === pos ? "bg-brand-50 border-brand-300 text-brand-700" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}
                  >
                    {pos.split(" ").map((w) => w === "top" ? "Arr" : w === "bottom" ? "Aba" : w === "left" ? "Izq" : w === "right" ? "Der" : "Cen").join(" ")}
                  </button>
                ))}
              </div>
            </div>
            {/* Repeat */}
            <div>
              <span className="text-[9px] text-gray-400 block mb-1">Repetir</span>
              <div className="flex gap-1">
                {["no-repeat", "repeat", "repeat-x", "repeat-y"].map((opt) => (
                  <button
                    key={opt}
                    onClick={() => update("backgroundRepeat", opt)}
                    className={`flex-1 py-1.5 rounded-md text-[9px] font-medium border transition-colors ${style.backgroundRepeat === opt ? "bg-brand-50 border-brand-300 text-brand-700" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}
                  >
                    {opt === "no-repeat" ? "No" : opt === "repeat" ? "Si" : opt === "repeat-x" ? "Horiz" : "Vert"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="py-4">
        <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide mb-3">Borde</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-[9px] text-gray-400 block mb-1">Grosor</span>
            <Stepper value={style.borderWidth} onChange={(v) => update("borderWidth", v)} />
          </div>
          <div>
            <span className="text-[9px] text-gray-400 block mb-1">Radio</span>
            <Stepper value={style.borderRadius} onChange={(v) => update("borderRadius", v)} />
          </div>
        </div>
        {style.borderWidth > 0 && (
          <div className="mt-3">
            <span className="text-[9px] text-gray-400 block mb-1">Color</span>
            <ColorPicker value={style.borderColor} onChange={(v) => update("borderColor", v)} fullWidth />
          </div>
        )}
      </div>
    </div>
  );
}

export function RowProperties({ style, onChange }: Props) {
  const [activeTab, setActiveTab] = useState<"spacing" | "styles">("spacing");

  return (
    <div>
      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-3">
        <button
          onClick={() => setActiveTab("spacing")}
          className={`flex-1 pb-2 text-[10px] font-semibold uppercase tracking-wide border-b-2 transition-colors ${activeTab === "spacing" ? "border-brand-500 text-brand-700" : "border-transparent text-gray-400 hover:text-gray-600"}`}
        >
          Espacios
        </button>
        <button
          onClick={() => setActiveTab("styles")}
          className={`flex-1 pb-2 text-[10px] font-semibold uppercase tracking-wide border-b-2 transition-colors ${activeTab === "styles" ? "border-brand-500 text-brand-700" : "border-transparent text-gray-400 hover:text-gray-600"}`}
        >
          Estilos
        </button>
      </div>

      {/* Content */}
      {activeTab === "spacing" && <SpacingTab style={style} onChange={onChange} />}
      {activeTab === "styles" && <StylesTab style={style} onChange={onChange} />}
    </div>
  );
}

export const DEFAULT_ROW_STYLE: RowStyle = {
  paddingTop: 10,
  paddingRight: 10,
  paddingBottom: 10,
  paddingLeft: 10,
  marginTop: 0,
  marginRight: 0,
  marginBottom: 0,
  marginLeft: 0,
  gap: 10,
  backgroundColor: "transparent",
  backgroundImage: "",
  backgroundSize: "cover",
  backgroundPosition: "center",
  backgroundRepeat: "no-repeat",
  borderColor: "#e0e0e0",
  borderWidth: 0,
  borderRadius: 0,
  heightMode: "auto",
  height: 100,
  minHeight: 50,
};
