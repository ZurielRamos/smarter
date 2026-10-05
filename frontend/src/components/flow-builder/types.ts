// Modelo interno del editor de WhatsApp Flows.
// Se mantiene un modelo propio (con ids estables para DnD) y se serializa
// hacia/desde el flow.json oficial de Meta.

export type FlowComponentType =
  | "TextHeading"
  | "TextSubheading"
  | "TextBody"
  | "TextCaption"
  | "RichText"
  | "TextInput"
  | "TextArea"
  | "Dropdown"
  | "RadioButtonsGroup"
  | "CheckboxGroup"
  | "DatePicker"
  | "OptIn"
  | "PhotoPicker"
  | "DocumentPicker"
  | "Image"
  | "ImageCarousel"
  | "EmbeddedLink"
  | "If";

export interface FlowOption {
  id: string;
  title: string;
}

export interface CarouselImage {
  src: string;
  altText?: string;
}

// Componente de una pantalla con un id interno estable para DnD.
export interface FlowComponent {
  _id: string; // id interno del editor (no va al flow.json)
  type: FlowComponentType;

  // Texto (headings / body / caption / richtext)
  text?: string;

  // Campos de formulario
  name?: string;
  label?: string;
  required?: boolean;
  helperText?: string;
  description?: string;
  inputType?: string; // text | number | email | phone | password | passcode (TextInput)

  // Validaciones avanzadas
  minChars?: number;
  maxChars?: number;
  minDate?: string; // ISO (DatePicker)
  maxDate?: string;

  // Opciones (dropdown / radio / checkbox)
  options?: FlowOption[];

  // Image
  src?: string;
  altText?: string;
  scaleType?: "cover" | "contain";

  // ImageCarousel
  images?: CarouselImage[];

  // EmbeddedLink / OptIn navegación: pantalla a abrir
  linkScreen?: string | null; // id de pantalla destino
  url?: string; // para EmbeddedLink con open_url

  // If (lógica condicional)
  condition?: string;
  thenComponents?: FlowComponent[];
  elseComponents?: FlowComponent[];
}

export interface FlowScreenModel {
  _id: string; // id interno del editor
  id: string; // id oficial de la pantalla (SCREEN_X)
  title: string;
  terminal?: boolean;
  success?: boolean;
  components: FlowComponent[];
  // Texto del botón de la pantalla (Footer).
  footerLabel: string;
  // Siguiente pantalla (routing). null = terminal.
  next: string | null;
  // Datos que esta pantalla espera recibir de la anterior (data schema).
  // Mapa nombre -> ejemplo. Se referencian con ${data.nombre}.
  dataSchema?: Record<string, string>;
}

export interface FlowModel {
  version: string;
  dataApiVersion: string;
  screens: FlowScreenModel[];
}

// Metadata de cada tipo de componente para la paleta y el panel.
export interface ComponentTypeMeta {
  type: FlowComponentType;
  label: string;
  category: "texto" | "entrada" | "seleccion" | "medios" | "logica";
  isField: boolean; // tiene name/required
  hasText: boolean;
  hasOptions: boolean;
}

let counter = 0;
export function uid(prefix = "c"): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter}`;
}
