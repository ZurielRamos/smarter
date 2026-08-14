import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Plus, Trash2, GripVertical, ChevronDown, Check } from "lucide-react";
import { labelCls, AlignButtons, Stepper } from "./shared";
import { SOCIAL_NETWORKS, SOCIAL_SVG_PATHS, getNetworkInfo } from "./social-icons";

interface SocialIcon {
  network: string;
  url: string;
  label: string;
}

interface Props {
  props: Record<string, any>;
  onChange: (props: Record<string, any>) => void;
}

/* ─── Icon Style Definitions ─── */
type IconStyle = "color" | "black" | "gray" | "white-on-dark" | "circle-color" | "circle-color-border" | "rounded-color" | "rounded-color-border" | "square-color" | "square-color-border" | "circle-black" | "circle-gray";

const ICON_STYLES: Array<{ id: IconStyle; label: string }> = [
  { id: "color", label: "Logotipos de colores" },
  { id: "black", label: "Logotipos negros" },
  { id: "gray", label: "Logotipos grises" },
  { id: "white-on-dark", label: "Logotipos blancos" },
  { id: "circle-color", label: "Circulares de colores" },
  { id: "circle-color-border", label: "Circulo de color con borde" },
  { id: "rounded-color", label: "Redondeados de colores" },
  { id: "rounded-color-border", label: "Redondeado de color con borde" },
  { id: "square-color", label: "Cuadrados de colores" },
  { id: "square-color-border", label: "Cuadrado de color con borde" },
  { id: "circle-black", label: "Circulares negros" },
  { id: "circle-gray", label: "Circulares grises" },
];

function getStyleConfig(style: IconStyle) {
  switch (style) {
    case "color": return { bg: "transparent", fill: "brand", shape: "none", border: false };
    case "black": return { bg: "transparent", fill: "#000000", shape: "none", border: false };
    case "gray": return { bg: "transparent", fill: "#9CA3AF", shape: "none", border: false };
    case "white-on-dark": return { bg: "#1F2937", fill: "#ffffff", shape: "rounded", border: false };
    case "circle-color": return { bg: "brand", fill: "#ffffff", shape: "circle", border: false };
    case "circle-color-border": return { bg: "transparent", fill: "brand", shape: "circle", border: true };
    case "rounded-color": return { bg: "brand", fill: "#ffffff", shape: "rounded", border: false };
    case "rounded-color-border": return { bg: "transparent", fill: "brand", shape: "rounded", border: true };
    case "square-color": return { bg: "brand", fill: "#ffffff", shape: "square", border: false };
    case "square-color-border": return { bg: "transparent", fill: "brand", shape: "square", border: true };
    case "circle-black": return { bg: "#000000", fill: "#ffffff", shape: "circle", border: false };
    case "circle-gray": return { bg: "#6B7280", fill: "#ffffff", shape: "circle", border: false };
    default: return { bg: "brand", fill: "#ffffff", shape: "circle", border: false };
  }
}

/* ─── Preview icon for style selector ─── */
function StylePreviewIcon({ network, style, size = 24 }: { network: string; style: IconStyle; size?: number }) {
  const info = getNetworkInfo(network);
  const config = getStyleConfig(style);
  const path = SOCIAL_SVG_PATHS[network];
  const brandColor = info.color;

  const bg = config.bg === "brand" ? brandColor : config.bg === "transparent" ? "transparent" : config.bg;
  const fill = config.fill === "brand" ? brandColor : config.fill;
  const borderRadius = config.shape === "circle" ? "50%" : config.shape === "rounded" ? "20%" : config.shape === "square" ? "4px" : "0";
  const border = config.border ? `2px solid ${fill}` : "none";
  const svgSize = config.shape === "none" ? size : Math.round(size * 0.6);

  if (config.shape === "none") {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" width={svgSize} height={svgSize} viewBox="0 0 24 24" fill={fill}>
        <path d={path || ""} />
      </svg>
    );
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: size, height: size, backgroundColor: bg, borderRadius, border }}>
      <svg xmlns="http://www.w3.org/2000/svg" width={svgSize} height={svgSize} viewBox="0 0 24 24" fill={fill}>
        <path d={path || ""} />
      </svg>
    </span>
  );
}

/* ─── Style Selector ─── */
function IconStyleSelector({ value, onChange }: { value: IconStyle; onChange: (v: IconStyle) => void }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const handleOpen = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setCoords({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 260) });
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const currentLabel = ICON_STYLES.find((s) => s.id === value)?.label || "Logotipos de colores";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
      >
        <div className="flex items-center gap-1.5">
          <StylePreviewIcon network="facebook" style={value} size={20} />
          <StylePreviewIcon network="instagram" style={value} size={20} />
          <StylePreviewIcon network="youtube" style={value} size={20} />
        </div>
        <span className="text-xs text-gray-600 flex-1 text-left truncate">{currentLabel}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && createPortal(
        <div
          ref={popoverRef}
          className="fixed z-[9999] bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden"
          style={{ top: coords.top, left: coords.left, width: coords.width }}
        >
          <div className="max-h-[320px] overflow-y-auto py-1">
            {ICON_STYLES.map((style) => (
              <button
                key={style.id}
                onClick={() => { onChange(style.id); setOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors ${value === style.id ? "bg-brand-50" : ""}`}
              >
                <div className="flex items-center gap-1.5 shrink-0">
                  <StylePreviewIcon network="facebook" style={style.id} size={22} />
                  <StylePreviewIcon network="instagram" style={style.id} size={22} />
                  <StylePreviewIcon network="youtube" style={style.id} size={22} />
                </div>
                <span className="text-xs text-gray-700 flex-1">{style.label}</span>
                {value === style.id && <Check className="h-3.5 w-3.5 text-brand-600 shrink-0" />}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

/* ─── SVG Icon component ─── */
function NetworkIcon({ network, size = 20, bgSize = 28 }: { network: string; size?: number; bgSize?: number }) {
  const info = getNetworkInfo(network);
  const path = SOCIAL_SVG_PATHS[network];

  return (
    <span
      className="inline-flex items-center justify-center rounded-full shrink-0"
      style={{ width: bgSize, height: bgSize, backgroundColor: info.color }}
    >
      {path ? (
        <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="#ffffff">
          <path d={path} />
        </svg>
      ) : (
        <span className="text-white text-[10px] font-bold">{info.label.charAt(0)}</span>
      )}
    </span>
  );
}

/* ─── Add Network Dropdown ─── */
function AddNetworkDropdown({ onSelect, existingNetworks }: { onSelect: (network: string) => void; existingNetworks: string[] }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const handleOpen = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setCoords({ top: rect.bottom + 4, left: Math.min(rect.left, window.innerWidth - 240) });
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        className="w-full py-2 rounded-lg border-2 border-dashed border-gray-300 text-xs text-gray-500 hover:border-brand-300 hover:text-brand-600 hover:bg-brand-50/50 transition-colors flex items-center justify-center gap-1.5"
      >
        <Plus className="h-3.5 w-3.5" />
        Agregar red social
      </button>

      {open && createPortal(
        <div
          ref={popoverRef}
          className="fixed z-[9999] bg-white rounded-xl shadow-2xl border border-gray-200 w-[230px] overflow-hidden"
          style={{ top: coords.top, left: coords.left }}
        >
          <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide px-3 pt-2 pb-1">Seleccionar red social</p>
          <div className="max-h-[280px] overflow-y-auto pb-1">
            {SOCIAL_NETWORKS.map((network) => {
              const alreadyAdded = existingNetworks.includes(network.id);
              return (
                <button
                  key={network.id}
                  onClick={() => { if (!alreadyAdded) { onSelect(network.id); setOpen(false); } }}
                  disabled={alreadyAdded}
                  className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2.5 transition-colors ${alreadyAdded ? "opacity-40 cursor-not-allowed" : "hover:bg-gray-50"}`}
                >
                  <NetworkIcon network={network.id} size={14} bgSize={24} />
                  <span className="text-gray-700">{network.label}</span>
                  {alreadyAdded && <span className="ml-auto text-[9px] text-gray-400">Agregado</span>}
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

/* ─── Social Icon Item ─── */
function SocialIconItem({ icon, onUpdate, onDelete }: { icon: SocialIcon; onUpdate: (icon: SocialIcon) => void; onDelete: () => void }) {
  const info = getNetworkInfo(icon.network);

  return (
    <div className="border border-gray-200 rounded-lg p-2.5 space-y-2">
      <div className="flex items-center gap-2">
        <GripVertical className="h-3 w-3 text-gray-300 shrink-0 cursor-grab" />
        <NetworkIcon network={icon.network} size={14} bgSize={22} />
        <span className="text-xs font-medium text-gray-700 flex-1">{info.label}</span>
        <button onClick={onDelete} className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      <input
        type="text"
        value={icon.url}
        onChange={(e) => onUpdate({ ...icon, url: e.target.value })}
        placeholder="https://"
        className="w-full px-2 py-1.5 rounded-md border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
    </div>
  );
}

/* ─── Social Properties Panel ─── */
export function SocialProperties({ props: p, onChange }: Props) {
  const icons: SocialIcon[] = p.icons || [];
  const update = (key: string, value: any) => onChange({ ...p, [key]: value });

  const addNetwork = (networkId: string) => {
    const info = getNetworkInfo(networkId);
    const newIcons = [...icons, { network: networkId, url: "https://", label: info.label }];
    update("icons", newIcons);
  };

  const updateIcon = (index: number, icon: SocialIcon) => {
    const newIcons = [...icons];
    newIcons[index] = icon;
    update("icons", newIcons);
  };

  const deleteIcon = (index: number) => {
    const newIcons = icons.filter((_, i) => i !== index);
    update("icons", newIcons);
  };

  return (
    <div className="space-y-4">
      {/* Style selector */}
      <div>
        <label className={labelCls}>Estilo de iconos</label>
        <IconStyleSelector value={p.iconStyle || "circle-color"} onChange={(v) => update("iconStyle", v)} />
      </div>

      {/* Icon list */}
      <div className="space-y-2">
        {icons.map((icon, i) => (
          <SocialIconItem
            key={`${icon.network}-${i}`}
            icon={icon}
            onUpdate={(updated) => updateIcon(i, updated)}
            onDelete={() => deleteIcon(i)}
          />
        ))}
      </div>

      {/* Add button */}
      <AddNetworkDropdown
        onSelect={addNetwork}
        existingNetworks={icons.map((ic) => ic.network)}
      />

      {/* Settings */}
      <div className="pt-3 border-t border-gray-100 space-y-3">
        <div>
          <label className={labelCls}>Tamano de icono (px)</label>
          <Stepper value={p.iconSize || 32} onChange={(v) => update("iconSize", v)} min={16} max={64} />
        </div>
        <div>
          <label className={labelCls}>Espacio entre iconos (px)</label>
          <Stepper value={p.gap || 10} onChange={(v) => update("gap", v)} min={0} max={40} />
        </div>
        <div>
          <label className={labelCls}>Alineacion</label>
          <AlignButtons value={p.align || "center"} onSelect={(v) => update("align", v)} />
        </div>
      </div>
    </div>
  );
}
