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
  Images,
  Link as LinkIcon,
  Camera,
  FileUp,
  GitBranch,
  Bold,
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
  RichText: { type: "RichText", label: "Texto enriquecido", category: "texto", isField: false, hasText: true, hasOptions: false, icon: Bold },
  TextInput: { type: "TextInput", label: "Campo de texto", category: "entrada", isField: true, hasText: false, hasOptions: false, icon: TextCursorInput },
  TextArea: { type: "TextArea", label: "Área de texto", category: "entrada", isField: true, hasText: false, hasOptions: false, icon: AlignLeft },
  DatePicker: { type: "DatePicker", label: "Fecha", category: "entrada", isField: true, hasText: false, hasOptions: false, icon: Calendar },
  Dropdown: { type: "Dropdown", label: "Lista desplegable", category: "seleccion", isField: true, hasText: false, hasOptions: true, icon: List },
  RadioButtonsGroup: { type: "RadioButtonsGroup", label: "Opción única", category: "seleccion", isField: true, hasText: false, hasOptions: true, icon: Circle },
  CheckboxGroup: { type: "CheckboxGroup", label: "Casillas", category: "seleccion", isField: true, hasText: false, hasOptions: true, icon: CheckSquare },
  OptIn: { type: "OptIn", label: "Consentimiento", category: "seleccion", isField: true, hasText: false, hasOptions: false, icon: ToggleLeft },
  PhotoPicker: { type: "PhotoPicker", label: "Subir foto", category: "medios", isField: true, hasText: false, hasOptions: false, icon: Camera },
  DocumentPicker: { type: "DocumentPicker", label: "Subir documento", category: "medios", isField: true, hasText: false, hasOptions: false, icon: FileUp },
  Image: { type: "Image", label: "Imagen", category: "medios", isField: false, hasText: false, hasOptions: false, icon: ImageIcon },
  ImageCarousel: { type: "ImageCarousel", label: "Carrusel", category: "medios", isField: false, hasText: false, hasOptions: false, icon: Images },
  EmbeddedLink: { type: "EmbeddedLink", label: "Enlace", category: "medios", isField: false, hasText: false, hasOptions: false, icon: LinkIcon },
  If: { type: "If", label: "Condición (Si/Entonces)", category: "logica", isField: false, hasText: false, hasOptions: false, icon: GitBranch },
};

export const PALETTE_ORDER: FlowComponentType[] = [
  "TextHeading",
  "TextSubheading",
  "TextBody",
  "TextCaption",
  "RichText",
  "TextInput",
  "TextArea",
  "DatePicker",
  "Dropdown",
  "RadioButtonsGroup",
  "CheckboxGroup",
  "OptIn",
  "PhotoPicker",
  "DocumentPicker",
  "Image",
  "ImageCarousel",
  "EmbeddedLink",
  "If",
];

// ─── Creación de componentes nuevos ─────────────────────────────────

export function createComponent(type: FlowComponentType): FlowComponent {
  const meta = COMPONENT_META[type];
  const base: FlowComponent = { _id: uid(), type };
  if (meta.hasText) base.text = defaultText(type);
  if (meta.isField) {
    base.name = `campo_${Math.random().toString(36).slice(2, 7)}`;
    base.label = meta.label;
    if (type === "OptIn") {
      base.label = "Acepto los términos";
      base.required = true;
    } else {
      base.required = false;
    }
    if (type === "TextInput") base.inputType = "text";
  }
  if (meta.hasOptions) {
    base.options = [
      { id: "opcion_1", title: "Opción 1" },
      { id: "opcion_2", title: "Opción 2" },
    ];
  }
  if (type === "Image") {
    base.altText = "Imagen";
    base.scaleType = "contain";
  }
  if (type === "ImageCarousel") {
    base.images = [{ src: "https://", altText: "Imagen 1" }];
  }
  if (type === "EmbeddedLink") {
    base.text = "Más información";
    base.url = "https://";
  }
  if (type === "PhotoPicker") base.description = "Toma o adjunta una foto";
  if (type === "DocumentPicker") base.description = "Adjunta un documento";
  if (type === "If") {
    base.condition = "${form.campo} == 'valor'";
    base.thenComponents = [];
    base.elseComponents = [];
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
    case "RichText":
      return "**Texto** en *markdown*";
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
    const dataSchema: Record<string, string> = {};
    if (s.data && typeof s.data === "object") {
      for (const [k, v] of Object.entries<any>(s.data)) {
        dataSchema[k] = v?.__example__ != null ? String(v.__example__) : "";
      }
    }

    return {
      _id: uid("s"),
      id: s.id,
      title: s.title || s.id,
      terminal: !!s.terminal,
      success: !!s.success,
      components,
      footerLabel: footer?.label || "Continuar",
      next: Array.isArray(nexts) && nexts.length > 0 ? nexts[0] : footerNavTarget(footer),
      dataSchema: Object.keys(dataSchema).length ? dataSchema : undefined,
    };
  });

  return {
    version: flowJson?.version || "7.3",
    dataApiVersion: flowJson?.data_api_version || "3.0",
    screens,
  };
}

function footerNavTarget(footer: any): string | null {
  const action = footer?.["on-click-action"];
  if (action?.name === "navigate" && action?.next?.name) return action.next.name;
  return null;
}

function extractFormChildren(screen: any): any[] {
  const children = screen?.layout?.children || [];
  const form = children.find((c: any) => c.type === "Form");
  if (form) {
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
  if (c.description != null) comp.description = c.description;
  if (c["input-type"] != null) comp.inputType = c["input-type"];
  if (c["min-chars"] != null) comp.minChars = Number(c["min-chars"]);
  if (c["max-chars"] != null) comp.maxChars = Number(c["max-chars"]);
  if (c["max-length"] != null) comp.maxChars = Number(c["max-length"]);
  if (c["min-date"] != null) comp.minDate = c["min-date"];
  if (c["max-date"] != null) comp.maxDate = c["max-date"];
  if (Array.isArray(c["data-source"])) {
    comp.options = c["data-source"].map((o: any) => ({ id: String(o.id), title: String(o.title) }));
  }
  if (c.src != null) comp.src = c.src;
  if (c["alt-text"] != null) comp.altText = c["alt-text"];
  if (c["scale-type"] != null) comp.scaleType = c["scale-type"];
  if (Array.isArray(c.images)) {
    comp.images = c.images.map((im: any) => ({ src: im.src, altText: im["alt-text"] }));
  }
  if (c.url != null) comp.url = c.url;
  // EmbeddedLink / OptIn navegación
  const nav = c["on-click-action"];
  if (nav?.name === "navigate" && nav?.next?.name) comp.linkScreen = nav.next.name;
  if (nav?.name === "open_url" && nav?.url) comp.url = nav.url;
  // If condicional
  if (type === "If") {
    comp.condition = c.condition || "";
    comp.thenComponents = (c.then || []).map(parseComponent).filter(Boolean) as FlowComponent[];
    comp.elseComponents = (c.else || []).map(parseComponent).filter(Boolean) as FlowComponent[];
  }
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

    const payload: Record<string, string> = {};
    collectFieldPayload(s.components, payload);
    // Reenviar también los datos recibidos (data) hacia la siguiente pantalla.
    if (s.dataSchema) {
      for (const k of Object.keys(s.dataSchema)) payload[k] = `\${data.${k}}`;
    }

    const footer = {
      type: "Footer",
      label: s.footerLabel || (isTerminal ? "Enviar" : "Continuar"),
      "on-click-action": isTerminal
        ? { name: "complete", payload }
        : {
            name: "navigate",
            next: { type: "screen", name: s.next },
            payload,
          },
    };

    const screen: Record<string, any> = {
      id: s.id,
      title: s.title,
      ...(isTerminal ? { terminal: true, success: true } : {}),
    };

    // data schema (lo que la pantalla recibe)
    if (s.dataSchema && Object.keys(s.dataSchema).length) {
      screen.data = {};
      for (const [k, example] of Object.entries(s.dataSchema)) {
        screen.data[k] = { type: "string", __example__: example || "" };
      }
    } else {
      screen.data = {};
    }

    screen.layout = {
      type: "SingleColumnLayout",
      children: [
        {
          type: "Form",
          name: `form_${s.id.toLowerCase()}`,
          children: [...children, footer],
        },
      ],
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

function collectFieldPayload(components: FlowComponent[], payload: Record<string, string>) {
  for (const c of components) {
    if (c.name && isFieldComponent(c.type)) {
      payload[c.name] = `\${form.${c.name}}`;
    }
    if (c.type === "If") {
      collectFieldPayload(c.thenComponents || [], payload);
      collectFieldPayload(c.elseComponents || [], payload);
    }
  }
}

function isFieldComponent(type: FlowComponentType): boolean {
  return COMPONENT_META[type]?.isField;
}

function serializeComponent(c: FlowComponent): Record<string, any> {
  const out: Record<string, any> = { type: c.type };
  const meta = COMPONENT_META[c.type];

  if (c.type === "If") {
    out.condition = c.condition || "";
    out.then = (c.thenComponents || []).map(serializeComponent);
    if (c.elseComponents && c.elseComponents.length) {
      out.else = c.elseComponents.map(serializeComponent);
    }
    return out;
  }

  if (meta.hasText && c.text != null) out.text = c.text;

  if (meta.isField) {
    if (c.name) out.name = c.name;
    if (c.label != null) out.label = c.label;
    out.required = !!c.required;
    if (c.helperText) out["helper-text"] = c.helperText;
    if (c.description) out.description = c.description;
    if (c.type === "TextInput" && c.inputType) out["input-type"] = c.inputType;
    if (c.type === "TextInput") {
      if (c.minChars != null) out["min-chars"] = c.minChars;
      if (c.maxChars != null) out["max-chars"] = c.maxChars;
    }
    if (c.type === "TextArea" && c.maxChars != null) out["max-length"] = c.maxChars;
    if (c.type === "DatePicker") {
      if (c.minDate) out["min-date"] = c.minDate;
      if (c.maxDate) out["max-date"] = c.maxDate;
    }
  }

  if (meta.hasOptions && c.options) {
    out["data-source"] = c.options.map((o) => ({ id: o.id, title: o.title }));
  }

  if (c.type === "Image") {
    if (c.src) out.src = c.src;
    if (c.altText) out["alt-text"] = c.altText;
    if (c.scaleType) out["scale-type"] = c.scaleType;
  }
  if (c.type === "ImageCarousel" && c.images) {
    out.images = c.images.map((im) => ({ src: im.src, "alt-text": im.altText || "" }));
  }
  if (c.type === "EmbeddedLink") {
    if (c.text) out.text = c.text;
    if (c.linkScreen) {
      out["on-click-action"] = { name: "navigate", next: { type: "screen", name: c.linkScreen } };
    } else if (c.url) {
      out["on-click-action"] = { name: "open_url", url: c.url };
    }
  }
  if (c.type === "OptIn" && c.linkScreen) {
    out["on-click-action"] = { name: "navigate", next: { type: "screen", name: c.linkScreen } };
  }

  return out;
}

// Opciones de pantallas destino para selectores de routing/navegación.
export function screenOptions(model: FlowModel, exceptId?: string): { id: string; title: string }[] {
  return model.screens
    .filter((s) => s.id !== exceptId)
    .map((s) => ({ id: s.id, title: s.title || s.id }));
}

// ─── Validación del Flow ────────────────────────────────────────────

export interface FlowValidationIssue {
  level: "error" | "warning";
  message: string;
  screenId?: string;
}

export function validateFlow(model: FlowModel): FlowValidationIssue[] {
  const issues: FlowValidationIssue[] = [];
  if (model.screens.length === 0) {
    issues.push({ level: "error", message: "El Flow no tiene pantallas." });
    return issues;
  }

  // Al menos una pantalla terminal.
  const hasTerminal = model.screens.some((s) => !s.next);
  if (!hasTerminal) {
    issues.push({ level: "error", message: "Debe existir al menos una pantalla final (sin siguiente)." });
  }

  const seenScreenIds = new Set<string>();
  for (const s of model.screens) {
    // IDs de pantalla válidos y únicos.
    if (!/^[A-Z][A-Z0-9_]*$/.test(s.id)) {
      issues.push({ level: "error", screenId: s.id, message: `ID de pantalla inválido: "${s.id}" (usa MAYÚSCULAS y _).` });
    }
    if (seenScreenIds.has(s.id)) {
      issues.push({ level: "error", screenId: s.id, message: `ID de pantalla duplicado: "${s.id}".` });
    }
    seenScreenIds.add(s.id);

    // Routing válido.
    if (s.next && !model.screens.some((o) => o.id === s.next)) {
      issues.push({ level: "error", screenId: s.id, message: `La pantalla "${s.id}" apunta a "${s.next}" que no existe.` });
    }

    // Nombres de campo únicos dentro de la pantalla.
    const names = new Map<string, number>();
    const walk = (comps: FlowComponent[]) => {
      for (const c of comps) {
        if (c.name && isFieldComponent(c.type)) {
          names.set(c.name, (names.get(c.name) || 0) + 1);
        }
        if (c.type === "If") {
          walk(c.thenComponents || []);
          walk(c.elseComponents || []);
        }
      }
    };
    walk(s.components);
    for (const [name, count] of names) {
      if (count > 1) {
        issues.push({ level: "error", screenId: s.id, message: `Campo "${name}" repetido en "${s.id}".` });
      }
    }

    // Advertencia: pantalla sin componentes.
    if (s.components.length === 0) {
      issues.push({ level: "warning", screenId: s.id, message: `La pantalla "${s.id}" no tiene componentes.` });
    }
  }

  return issues;
}
