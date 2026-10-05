// Modelo interno del editor de WhatsApp Flows.
// Se mantiene un modelo propio (con ids estables para DnD) y se serializa
// hacia/desde el flow.json oficial de Meta.

export type FlowComponentType =
  | "TextHeading"
  | "TextSubheading"
  | "TextBody"
  | "TextCaption"
  | "TextInput"
  | "TextArea"
  | "Dropdown"
  | "RadioButtonsGroup"
  | "CheckboxGroup"
  | "DatePicker"
  | "OptIn"
  | "Image"
  | "EmbeddedLink";

export interface FlowOption {
  id: string;
  title: string;
}

// Componente de una pantalla con un id interno estable para DnD.
export interface FlowComponent {
  _id: string; // id interno del editor (no va al flow.json)
  type: FlowComponentType;
  // Texto (headings / body / caption)
  text?: string;
  // Campos de formulario
  name?: string;
  label?: string;
  required?: boolean;
  helperText?: string;
  inputType?: string; // text | number | email | phone (TextInput)
  // Opciones (dropdown / radio / checkbox)
  options?: FlowOption[];
  // Image
  src?: string;
  altText?: string;
  // EmbeddedLink
  url?: string;
}

export interface FlowScreenModel {
  _id: string; // id interno del editor
  id: string; // id oficial de la pantalla (SCREEN_X)
  title: string;
  terminal?: boolean;
  success?: boolean;
  components: FlowComponent[];
  // Texto del botón de la pantalla (Footer). La acción (data_exchange o
  // complete) se deriva de si la pantalla es terminal.
  footerLabel: string;
  // Siguiente pantalla (routing lineal). null = terminal.
  next: string | null;
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
  category: "texto" | "entrada" | "seleccion" | "medios";
  isField: boolean; // tiene name/required
  hasText: boolean;
  hasOptions: boolean;
}

let counter = 0;
export function uid(prefix = "c"): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter}`;
}
