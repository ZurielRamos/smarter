import {
  Heading,
  Type,
  AlignLeft,
  Text,
  TextCursorInput,
  List,
  Circle,
  CheckSquare,
  Calendar,
  ToggleLeft,
  Image as ImageIcon,
  Link as LinkIcon,
} from "lucide-react";
import type {
  FlowModel,
  FlowScreenModel,
  FlowComponent,
  FlowComponentType,
  ComponentTypeMeta,
  FlowOption,
} from "./types";
import { uid } from "./types";

// ─── Metadata de componentes (paleta) ───────────────────────────────

export const COMPONENT_META: Record<FlowComponentType, ComponentTypeMeta & { icon: any }> = {
  TextHeading: { type: "TextHeading", label: "Título", category: "texto", isField: false, hasText: true, hasOptions: false, icon: Heading },
  TextSubheading: { type: "TextSubheading", label: "Subtítulo", category: "texto", isField: false, hasText: true, hasOptions: false, icon: Type },
  TextBody: { type: "TextBody", label: "Párrafo", category: "texto", isField: false, hasText: true, hasOptions: false, icon: AlignLeft },
  TextCaption: { type: "TextCaption", label: "Nota", category: "texto", isField: false, hasText: true, hasOptions: false, icon: Text },
  TextInput: { type: "TextInput", label: "Campo de texto", category: "entrada", isField: true, hasText: false, hasOptions: false, icon: TextCursorInput },
  TextArea: { type: "TextArea", label: "Área de texto", category: "entrada", isField: true, hasText: false, hasOptions: false, icon: AlignLeft },
  DatePicker: { type: "DatePicker", label: "Fecha", category: "entrada", isField: true, hasText: false, hasOptions: false, icon: Calendar },
  Dropdown: { type: "Dropdown", label: "Lista desplegable", category: "seleccion", isField: true, hasText: false, hasOptions: true, icon: List },
  RadioButtonsGroup: { type: "RadioButtonsGroup", label: "Opción única", category: "seleccion", isField: true, hasText: false, hasOptions: true, icon: Circle },
  CheckboxGroup: { type: "CheckboxGroup", label: "Casillas", category: "seleccion", isField: true, hasText: false, hasOptions: true, icon: CheckSquare },
  OptIn: { type: "OptIn", label: "Consentimiento", category: "seleccion", isField: true, hasText: false, hasOptions: false, icon: ToggleLeft },
  Image: { type: "Image", label: "Imagen", category: "medios", isField: false, hasText: false, hasOptions: false, icon: ImageIcon },
  EmbeddedLink: { type: "EmbeddedLink", label: "Enlace", category: "medios", isField: false, hasText: false, hasOptions: false, icon: LinkIcon },
};

export const PALETTE_ORDER: FlowComponentType[] = [
  "TextHeading",
  "TextSubheading",
  "TextBody",
  "TextCaption",
  "TextInput",
  "TextArea",
  "DatePicker",
  "Dropdown",
  "RadioButtonsGroup",
  "CheckboxGroup",
  "OptIn",
  "Image",
  "EmbeddedLink",
];

// ─── Creación de componentes nuevos ─────────────────────────────────

export function createComponent(type: FlowComponentType): FlowComponent {
  const meta = COMPONENT_META[type];
  const base: FlowComponent = { _id: uid(), type };
  if (meta.hasText) base.text = defaultText(type);
  if (meta.isField) {
    base.name = `campo_${Math.random().toString(36).slice(2, 7)}`;
    base.label = meta.label;
    if (type !== "OptIn") base.required = false;
    else {
      base.label = "Acepto los términos";
      base.required = true;
    }
    if (type === "TextInput") base.inputType = "text";
  }
  if (meta.hasOptions) {
    base.options = [
      { id: "opcion_1", title: "Opción 1" },
      { id: "opcion_2", title: "Opción 2" },
    ];
  }
  if (type === "Image") base.altText = "Imagen";
  if (type === "EmbeddedLink") {
    base.text = "Más información";
    base.url = "https://";
  }
  return base;
}

function defaultText(type: FlowComponentType): string {
  switch (type) {
    case "TextHeading":
      return "Título";
    case "TextSubheading":
      return "Subtítulo";
    case "TextBody":
      return "Escribe aquí el contenido…";
    case "TextCaption":
      return "Nota al pie";
    default:
      return "";
  }
}

export function createScreen(index: number): FlowScreenModel {
  const n = index + 1;
  return {
    _id: uid("s"),
    id: `SCREEN_${n}`,
    title: `Pantalla ${n}`,
    components: [],
    footerLabel: "Continuar",
    next: null,
    terminal: false,
  };
}

// ─── Parse: flow.json (Meta) → modelo del editor ────────────────────

export function parseFlowJson(flowJson: Record<string, any>): FlowModel {
  const screensRaw: any[] = flowJson?.screens || [];
  const routing: Record<string, string[]> = flowJson?.routing_model || {};

  const screens: FlowScreenModel[] = screensRaw.map((s) => {
    const formChildren = extractFormChildren(s);
    const footer = formChildren.find((c) => c.type === "Footer");
    const components = formChildren
      .filter((c) => c.type !== "Footer")
      .map(parseComponent)
      .filter(Boolean) as FlowComponent[];

    const nexts = routing[s.id];
    return {
      _id: uid("s"),
      id: s.id,
      title: s.title || s.id,
      terminal: !!s.terminal,
      success: !!s.success,
      components,
      footerLabel: footer?.label || "Continuar",
      next: Array.isArray(nexts) && nexts.length > 0 ? nexts[0] : null,
    };
  });

  return {
    version: flowJson?.version || "7.3",
    dataApiVersion: flowJson?.data_api_version || "3.0",
    screens,
  };
}

function extractFormChildren(screen: any): any[] {
  const children = screen?.layout?.children || [];
  const form = children.find((c: any) => c.type === "Form");
  if (form) {
    // Mantener headings sueltos fuera del form + los del form.
    const outside = children.filter((c: any) => c.type !== "Form");
    return [...outside, ...(form.children || [])];
  }
  return children;
}

function parseComponent(c: any): FlowComponent | null {
  const type = c.type as FlowComponentType;
  if (!COMPONENT_META[type]) return null;
  const comp: FlowComponent = { _id: uid(), type };
  if (c.text != null) comp.text = c.text;
  if (c.name != null) comp.name = c.name;
  if (c.label != null) comp.label = c.label;
  if (c.required != null) comp.required = !!c.required;
  if (c["helper-text"] != null) comp.helperText = c["helper-text"];
  if (c["input-type"] != null) comp.inputType = c["input-type"];
  if (Array.isArray(c["data-source"])) {
    comp.options = c["data-source"].map((o: any) => ({ id: String(o.id), title: String(o.title) }));
  }
  if (c.src != null) comp.src = c.src;
  if (c["alt-text"] != null) comp.altText = c["alt-text"];
  if (c.url != null) comp.url = c.url;
  return comp;
}

// ─── Serialize: modelo del editor → flow.json (Meta) ────────────────

export function serializeToFlowJson(model: FlowModel): Record<string, any> {
  const routing_model: Record<string, string[]> = {};
  for (const s of model.screens) {
    routing_model[s.id] = s.next ? [s.next] : [];
  }

  const screens = model.screens.map((s) => {
    const isTerminal = !s.next;
    const children = s.components.map((c) => serializeComponent(c));

    // Payload del footer: todos los campos de la pantalla referenciados.
    const payload: Record<string, string> = {};
    for (const c of s.components) {
      if (c.name && isFieldComponent(c.type)) {
        payload[c.name] = `\${form.${c.name}}`;
      }
    }

    const footer = {
      type: "Footer",
      label: s.footerLabel || (isTerminal ? "Enviar" : "Continuar"),
      "on-click-action": {
        name: isTerminal ? "complete" : "data_exchange",
        payload,
      },
    };

    const screen: Record<string, any> = {
      id: s.id,
      title: s.title,
      ...(isTerminal ? { terminal: true, success: true } : {}),
      data: {},
      layout: {
        type: "SingleColumnLayout",
        children: [
          {
            type: "Form",
            name: `form_${s.id.toLowerCase()}`,
            children: [...children, footer],
          },
        ],
      },
    };
    return screen;
  });

  return {
    version: model.version || "7.3",
    data_api_version: model.dataApiVersion || "3.0",
    routing_model,
    screens,
  };
}

function isFieldComponent(type: FlowComponentType): boolean {
  return COMPONENT_META[type]?.isField;
}

function serializeComponent(c: FlowComponent): Record<string, any> {
  const out: Record<string, any> = { type: c.type };
  const meta = COMPONENT_META[c.type];

  if (meta.hasText && c.text != null) out.text = c.text;

  if (meta.isField) {
    if (c.name) out.name = c.name;
    if (c.label != null) out.label = c.label;
    if (c.type !== "OptIn") out.required = !!c.required;
    else out.required = !!c.required;
    if (c.helperText) out["helper-text"] = c.helperText;
    if (c.type === "TextInput" && c.inputType) out["input-type"] = c.inputType;
  }

  if (meta.hasOptions && c.options) {
    out["data-source"] = c.options.map((o) => ({ id: o.id, title: o.title }));
  }

  if (c.type === "Image") {
    if (c.src) out.src = c.src;
    if (c.altText) out["alt-text"] = c.altText;
  }
  if (c.type === "EmbeddedLink") {
    if (c.text) out.text = c.text;
    if (c.url) out["on-click-action"] = { name: "open_url", url: c.url };
  }

  return out;
}

// Opciones de pantallas destino para el selector de routing.
export function screenOptions(model: FlowModel, exceptId?: string): { id: string; title: string }[] {
  return model.screens
    .filter((s) => s.id !== exceptId)
    .map((s) => ({ id: s.id, title: s.title || s.id }));
}
