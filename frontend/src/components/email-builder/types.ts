// === Content blocks (go inside cells) ===
export type BlockType = "heading" | "text" | "image" | "button" | "divider" | "spacer" | "html" | "social";

export interface ContentBlock {
  id: string;
  type: BlockType;
  props: Record<string, any>;
}

// === Row structure (top-level canvas items) ===
export interface RowCell {
  id: string;
  width: number; // flex proportion (1, 2, 3...)
  blocks: ContentBlock[];
}

export interface EmailRow {
  id: string;
  cells: RowCell[];
  style?: {
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
  };
}

// === Layout presets ===
export interface LayoutPreset {
  id: string;
  label: string;
  widths: number[];
}

export const LAYOUT_PRESETS: LayoutPreset[] = [
  { id: "1", label: "1 columna", widths: [1] },
  { id: "2", label: "2 iguales", widths: [1, 1] },
  { id: "1-2", label: "1/3 + 2/3", widths: [1, 2] },
  { id: "2-1", label: "2/3 + 1/3", widths: [2, 1] },
  { id: "3", label: "3 iguales", widths: [1, 1, 1] },
  { id: "1-1-2", label: "1/4 + 1/4 + 1/2", widths: [1, 1, 2] },
];

// === Block catalog ===
export const BLOCK_CATALOG: Array<{ type: BlockType; label: string; description: string }> = [
  { type: "heading", label: "Encabezado", description: "Titulo o encabezado de seccion" },
  { type: "text", label: "Parrafo", description: "Bloque de texto con formato" },
  { type: "image", label: "Imagen", description: "Permite cargar y mostrar imagenes" },
  { type: "button", label: "Boton", description: "Boton con enlace personalizable" },
  { type: "divider", label: "Divisor", description: "Linea separadora horizontal" },
  { type: "spacer", label: "Espacio", description: "Espacio vertical configurable" },
  { type: "html", label: "HTML", description: "Codigo HTML personalizado" },
  { type: "social", label: "Redes sociales", description: "Iconos de redes sociales con enlaces" },
];

// === Factories ===
export function createRow(widths: number[]): EmailRow {
  return {
    id: crypto.randomUUID(),
    cells: widths.map((w) => ({
      id: crypto.randomUUID(),
      width: w,
      blocks: [],
    })),
    style: {
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
    },
  };
}

export function createBlock(type: BlockType): ContentBlock {
  const id = crypto.randomUUID();
  switch (type) {
    case "heading":
      return { id, type, props: { text: "Encabezado", level: "h2", align: "center", color: "#333333" } };
    case "text":
      return { id, type, props: { text: "Escribe tu contenido aqui...", align: "left", color: "#555555", fontSize: "14px", fontFamily: "Arial, sans-serif", paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0, verticalAlign: "top" } };
    case "image":
      return { id, type, props: { src: "", alt: "Imagen", width: "100%", maxHeight: 300, align: "center", link: "" } };
    case "button":
      return { id, type, props: { text: "Clic aqui", url: "#", align: "center", bgColor: "#007bff", textColor: "#ffffff", borderRadius: "4px", paddingTop: 12, paddingRight: 24, paddingBottom: 12, paddingLeft: 24, marginTop: 0, marginRight: 0, marginBottom: 0, marginLeft: 0, verticalAlign: "top" } };
    case "divider":
      return { id, type, props: { color: "#e0e0e0", thickness: "1px", margin: "20px 0" } };
    case "spacer":
      return { id, type, props: { height: "30px" } };
    case "html":
      return { id, type, props: { code: "<p>HTML personalizado</p>" } };
    case "social":
      return { id, type, props: {
        icons: [
          { network: "facebook", url: "https://", label: "Facebook" },
          { network: "x", url: "https://", label: "X" },
          { network: "instagram", url: "https://", label: "Instagram" },
          { network: "youtube", url: "https://", label: "YouTube" },
        ],
        iconSize: 32,
        gap: 10,
        align: "center",
        iconStyle: "circle-color",
      } };
  }
}
