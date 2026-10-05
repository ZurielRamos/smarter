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

  // ── Preservación quirúrgica ──
  // Nodo original tal cual venía en el flow.json (si el componente ya existía).
  // Al serializar se parte de este raw y se aplican SOLO las props editadas,
  // conservando cualquier propiedad que el editor no gestiona.
  _raw?: Record<string, any>;
  // true si en el original este componente estaba FUERA del Form (headings
  // sueltos en el layout). Se usa para recolocarlo igual al serializar.
  _outsideForm?: boolean;

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

  // ── Preservación quirúrgica ──
  // Pantalla original completa (si ya existía en el flow.json).
  _rawScreen?: Record<string, any>;
  // Nombre original del Form (p. ej. "form_intro"); si no, se deriva del id.
  _formName?: string;
  // Acción original del Footer tal cual venía: "data_exchange" | "navigate" |
  // "complete". Se preserva para no cambiar la semántica de navegación.
  _footerActionName?: string;
  // Footer original completo (para conservar su estructura exacta).
  _rawFooter?: Record<string, any>;
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
