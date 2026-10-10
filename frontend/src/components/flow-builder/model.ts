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

/**
 * Convierte un índice (0,1,2…) a sufijo de letras (A, B, …, Z, AA, AB…).
 * Meta exige que los IDs de pantalla solo tengan letras y guiones bajos (sin
 * números), así que los IDs generados usan este sufijo en vez de un número.
 */
export function letterSuffix(index: number): string {
  let n = index;
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

export function createScreen(index: number): FlowScreenModel {
  const n = index + 1;
  return {
    _id: uid("s"),
    id: `SCREEN_${letterSuffix(index)}`, // SCREEN_A, SCREEN_B, … (sin números)
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
    const layoutChildren: any[] = s?.layout?.children || [];
    const form = layoutChildren.find((c: any) => c.type === "Form");
    const footer = (form?.children || layoutChildren).find((c: any) => c.type === "Footer");

    // Componentes que estaban FUERA del Form (headings sueltos en el layout).
    const outside = layoutChildren
      .filter((c: any) => c.type !== "Form" && c.type !== "Footer")
      .map((c: any) => parseComponent(c, true))
      .filter(Boolean) as FlowComponent[];

    // Componentes DENTRO del Form (excluyendo el Footer).
    const inside = (form?.children || [])
      .filter((c: any) => c.type !== "Footer")
      .map((c: any) => parseComponent(c, false))
      .filter(Boolean) as FlowComponent[];

    const components = [...outside, ...inside];

    const nexts = routing[s.id];
    const dataSchema: Record<string, string> = {};
    if (s.data && typeof s.data === "object") {
      for (const [k, v] of Object.entries<any>(s.data)) {
        dataSchema[k] = v?.__example__ != null ? String(v.__example__) : "";
      }
    }

    const footerAction = footer?.["on-click-action"];

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
      // Preservación quirúrgica.
      _rawScreen: s,
      _formName: form?.name,
      _footerActionName: footerAction?.name,
      _rawFooter: footer,
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

function parseComponent(c: any, outsideForm: boolean): FlowComponent | null {
  const type = c.type as FlowComponentType;
  if (!COMPONENT_META[type]) return null;
  const comp: FlowComponent = { _id: uid(), type, _raw: c, _outsideForm: outsideForm };
  if (c.text != null) comp.text = c.text;
  if (c.markdown === true) comp.markdown = true;
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
    comp.thenComponents = (c.then || []).map((x: any) => parseComponent(x, false)).filter(Boolean) as FlowComponent[];
    comp.elseComponents = (c.else || []).map((x: any) => parseComponent(x, false)).filter(Boolean) as FlowComponent[];
  }
  return comp;
}

// ─── Serialize: modelo del editor → flow.json (Meta) ────────────────

/**
 * Serialización QUIRÚRGICA: parte del flow.json original de cada pantalla y
 * aplica solo los cambios del editor, preservando:
 *  - la posición de los componentes (fuera/dentro del Form) tal como venían,
 *  - la acción del Footer original (data_exchange | navigate | complete) y su
 *    payload,
 *  - cualquier propiedad que el editor no gestiona (no se pierde nada),
 *  - el data schema de la pantalla.
 * Los componentes/pantallas NUEVOS (sin _raw) se generan desde cero.
 */
export function serializeToFlowJson(model: FlowModel): Record<string, any> {
  const routing_model: Record<string, string[]> = {};
  for (const s of model.screens) {
    routing_model[s.id] = s.next ? [s.next] : [];
  }

  const screens = model.screens.map((s) => serializeScreen(s));

  return {
    version: model.version || "7.3",
    data_api_version: model.dataApiVersion || "3.0",
    routing_model,
    screens,
  };
}

function serializeScreen(s: FlowScreenModel): Record<string, any> {
  const isTerminal = !s.next;

  // Componentes dentro / fuera del Form, respetando su posición original.
  // Un componente nuevo (sin _raw) hereda la posición: textos sueltos quedan
  // dentro del Form por defecto (comportamiento estándar), salvo que su _raw
  // dijera lo contrario.
  const outsideChildren = s.components
    .filter((c) => c._outsideForm)
    .map((c) => serializeComponent(c));
  const insideChildren = s.components
    .filter((c) => !c._outsideForm)
    .map((c) => serializeComponent(c));

  // Footer: partir del original si existía y actualizar solo label + routing.
  const footer = serializeFooter(s, isTerminal);

  // Partir de la pantalla original para no perder propiedades no gestionadas.
  const screen: Record<string, any> = s._rawScreen
    ? { ...s._rawScreen }
    : { id: s.id, title: s.title };

  screen.id = s.id;
  screen.title = s.title;
  if (isTerminal) {
    screen.terminal = true;
    screen.success = true;
  } else {
    delete screen.terminal;
    delete screen.success;
  }

  // data schema (lo que la pantalla recibe).
  if (s.dataSchema && Object.keys(s.dataSchema).length) {
    screen.data = {};
    for (const [k, example] of Object.entries(s.dataSchema)) {
      screen.data[k] = { type: "string", __example__: example || "" };
    }
  } else if (s._rawScreen?.data && Object.keys(s._rawScreen.data).length) {
    screen.data = s._rawScreen.data; // preservar el data original si lo había
  } else {
    screen.data = {};
  }

  // Reconstruir el layout preservando el tipo original y el nombre del Form.
  const layoutType = s._rawScreen?.layout?.type || "SingleColumnLayout";
  const formName = s._formName || `form_${s.id.toLowerCase()}`;

  // Caso especial RichText: Meta exige que, si una pantalla usa RichText, sea
  // el ÚNICO componente de la pantalla (solo acompañado del Footer). No puede ir
  // dentro de un Form ni junto a otros componentes. Si la pantalla es
  // exclusivamente RichText, emitimos el RichText suelto + Footer, sin Form.
  const richTextOnly =
    s.components.length > 0 && s.components.every((c) => c.type === "RichText");
  if (richTextOnly) {
    screen.layout = {
      type: layoutType,
      children: [...s.components.map((c) => serializeComponent(c)), footer],
    };
    return screen;
  }

  screen.layout = {
    type: layoutType,
    children: [
      ...outsideChildren,
      {
        type: "Form",
        name: formName,
        children: [...insideChildren, footer],
      },
    ],
  };
  return screen;
}

/**
 * Construye el Footer preservando el original: mantiene su acción
 * (data_exchange/navigate/complete) y reconstruye el payload con los campos
 * actuales de la pantalla. Solo cambia label y, en navigate, el destino.
 */
function serializeFooter(s: FlowScreenModel, isTerminal: boolean): Record<string, any> {
  const payload: Record<string, string> = {};
  collectFieldPayload(s.components, payload);
  if (s.dataSchema) {
    for (const k of Object.keys(s.dataSchema)) payload[k] = `\${data.${k}}`;
  }

  // Determinar la acción: preservar la original salvo que el routing la fuerce.
  let actionName = s._footerActionName;
  if (!actionName) {
    // Footer nuevo: terminal => complete; con endpoint-less navigation => navigate.
    actionName = isTerminal ? "complete" : "navigate";
  }
  // Coherencia con el routing: si ahora es terminal, debe ser complete.
  if (isTerminal && actionName !== "complete") actionName = "complete";
  // Si dejó de ser terminal y era complete, pasa a la acción de navegación.
  if (!isTerminal && actionName === "complete") actionName = s._footerActionName === "navigate" ? "navigate" : "data_exchange";

  const action: Record<string, any> = { name: actionName, payload };
  if (actionName === "navigate") {
    action.next = { type: "screen", name: s.next };
  }

  // Partir del footer original para conservar cualquier extra.
  const base = s._rawFooter ? { ...s._rawFooter } : { type: "Footer" };
  base.type = "Footer";
  base.label = s.footerLabel || (isTerminal ? "Enviar" : "Continuar");
  base["on-click-action"] = action;
  return base;
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

/**
 * Serializa un componente de forma quirúrgica: si tiene _raw (ya existía),
 * parte de él y sobrescribe solo lo que el editor gestiona, preservando el
 * resto. Si es nuevo, lo genera desde cero.
 */
function serializeComponent(c: FlowComponent): Record<string, any> {
  const meta = COMPONENT_META[c.type];

  // If: estructura propia, recursiva.
  if (c.type === "If") {
    const out: Record<string, any> = c._raw ? { ...c._raw } : { type: "If" };
    out.type = "If";
    out.condition = c.condition || "";
    out.then = (c.thenComponents || []).map(serializeComponent);
    if (c.elseComponents && c.elseComponents.length) {
      out.else = c.elseComponents.map(serializeComponent);
    } else {
      delete out.else;
    }
    return out;
  }

  // Partir del raw original (preserva props no gestionadas) o de cero.
  const out: Record<string, any> = c._raw ? { ...c._raw } : { type: c.type };
  out.type = c.type;

  if (meta.hasText) {
    if (c.text != null) out.text = c.text;
    // markdown: true habilita formato (negrita, enlaces, listas) en TextBody y
    // TextCaption. Meta solo lo acepta en esos dos componentes.
    if ((c.type === "TextBody" || c.type === "TextCaption") && c.markdown) {
      out.markdown = true;
    } else {
      delete out.markdown;
    }
  }

  if (meta.isField) {
    if (c.name) out.name = c.name;
    if (c.label != null) out.label = c.label;
    out.required = !!c.required;
    // helper-text SOLO en componentes que Meta lo permite (no en Dropdown,
    // Radio, Checkbox ni OptIn: Meta devuelve INVALID_PROPERTY_KEY).
    const allowsHelper =
      c.type === "TextInput" ||
      c.type === "TextArea" ||
      c.type === "DatePicker" ||
      c.type === "PhotoPicker" ||
      c.type === "DocumentPicker";
    if (allowsHelper) {
      setOrDelete(out, "helper-text", c.helperText);
    } else {
      delete out["helper-text"];
    }
    setOrDelete(out, "description", c.description);
    if (c.type === "TextInput") {
      if (c.inputType) out["input-type"] = c.inputType;
      setOrDelete(out, "min-chars", c.minChars);
      setOrDelete(out, "max-chars", c.maxChars);
    }
    if (c.type === "TextArea") setOrDelete(out, "max-length", c.maxChars);
    if (c.type === "DatePicker") {
      setOrDelete(out, "min-date", c.minDate);
      setOrDelete(out, "max-date", c.maxDate);
    }
  }

  if (meta.hasOptions && c.options) {
    out["data-source"] = c.options.map((o) => ({ id: o.id, title: o.title }));
  }

  if (c.type === "Image") {
    setOrDelete(out, "src", c.src);
    setOrDelete(out, "alt-text", c.altText);
    setOrDelete(out, "scale-type", c.scaleType);
  }
  if (c.type === "ImageCarousel" && c.images) {
    out.images = c.images.map((im) => ({ src: im.src, "alt-text": im.altText || "" }));
  }
  if (c.type === "EmbeddedLink") {
    if (c.text != null) out.text = c.text;
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

/** Asigna la clave si el valor está definido; si no, la elimina del objeto. */
function setOrDelete(obj: Record<string, any>, key: string, value: any) {
  if (value === undefined || value === null || value === "") delete obj[key];
  else obj[key] = value;
}

// Opciones de pantallas destino para selectores de routing/navegación.
export function screenOptions(model: FlowModel, exceptId?: string): { id: string; title: string }[] {
  return model.screens
    .filter((s) => s.id !== exceptId)
    .map((s) => ({ id: s.id, title: s.title || s.id }));
}

/**
 * Plantilla mínima válida para crear un Flow nuevo DESDE CERO en el editor
 * visual, sin que el usuario escriba JSON. Una sola pantalla terminal con un
 * título y un campo de texto de ejemplo, lista para editar visualmente.
 */
export function createStarterFlowJson(): Record<string, any> {
  return {
    version: "7.3",
    data_api_version: "3.0",
    routing_model: { SCREEN_INICIO: [] },
    screens: [
      {
        id: "SCREEN_INICIO",
        title: "Pantalla 1",
        terminal: true,
        success: true,
        data: {},
        layout: {
          type: "SingleColumnLayout",
          children: [
            {
              type: "Form",
              name: "form_screen_inicio",
              children: [
                { type: "TextHeading", text: "Título de ejemplo" },
                {
                  type: "TextInput",
                  name: "respuesta",
                  label: "Tu respuesta",
                  "input-type": "text",
                  required: false,
                },
                {
                  type: "Footer",
                  label: "Enviar",
                  "on-click-action": {
                    name: "complete",
                    payload: { respuesta: "${form.respuesta}" },
                  },
                },
              ],
            },
          ],
        },
      },
    ],
  };
}

// ─── Límites de longitud de Meta (WhatsApp Flows) ───────────────────
// Fuente: documentación de Meta/Sprinklr. Si se exceden, Meta rechaza el Flow.
export const FLOW_LIMITS = {
  heading: 80, // TextHeading
  subheading: 80, // TextSubheading
  body: 4096, // TextBody
  caption: 4096, // TextCaption
  richText: 4096,
  label: 20, // label de inputs (TextInput, Dropdown, Radio, Checkbox, OptIn, DatePicker, pickers)
  helperText: 80, // helper-text
  optionTitle: 30, // título de cada opción (data-source)
  footerLabel: 35, // texto del botón del Footer
  screenTitle: 30, // título de pantalla
} as const;

/** Devuelve el límite de caracteres del "texto" de un componente de texto. */
export function textLimitFor(type: FlowComponentType): number {
  switch (type) {
    case "TextHeading":
      return FLOW_LIMITS.heading;
    case "TextSubheading":
      return FLOW_LIMITS.subheading;
    case "TextCaption":
      return FLOW_LIMITS.caption;
    case "RichText":
      return FLOW_LIMITS.richText;
    default:
      return FLOW_LIMITS.body;
  }
}

// ─── Describir respuestas de forma legible ──────────────────────────

export interface DescribedAnswer {
  key: string; // nombre técnico del campo
  question: string; // label/pregunta (o el key si no se encuentra)
  value: string; // valor legible (título de la opción, o el valor crudo)
  screen: string; // título de la pantalla a la que pertenece
}

/**
 * Convierte el responseData de una submission en respuestas legibles usando el
 * flow.json: resuelve el label de cada campo (la pregunta) y traduce los ids de
 * opción a sus títulos (data-source). Agrupa por pantalla.
 */
/** Normaliza el texto de una pregunta (recorta espacios y saltos). */
function cleanQuestion(text: string | null): string | null {
  if (!text) return null;
  const t = text.replace(/\s+/g, " ").trim();
  return t.length ? t : null;
}

export function describeSubmission(
  flowJson: Record<string, any> | null | undefined,
  responseData: Record<string, any>,
): DescribedAnswer[] {
  const data = responseData || {};

  const translate = (val: any, options?: Map<string, string>): string => {
    if (val == null || val === "") return "—";
    if (Array.isArray(val)) {
      return val.map((v) => options?.get(String(v)) || String(v)).join(", ");
    }
    if (typeof val === "boolean") return val ? "Sí" : "No";
    return options?.get(String(val)) || String(val);
  };

  const TEXT_TYPES = new Set([
    "TextSubheading",
    "TextBody",
    "TextHeading",
    "TextCaption",
    "RichText",
  ]);

  const result: DescribedAnswer[] = [];
  const seen = new Set<string>();

  // Recorremos el flow.json EN SU ORDEN NATURAL (pantalla por pantalla, campo
  // por campo) y para cada campo tomamos su valor del responseData. Así el
  // resultado respeta el orden del formulario, no el orden arbitrario de las
  // claves del objeto responseData.
  if (flowJson?.screens) {
    for (const s of flowJson.screens) {
      const screenTitle = s.title || s.id;

      const walkChildren = (children: any[]) => {
        let lastText: string | null = null;
        for (const node of children || []) {
          if (!node || typeof node !== "object") continue;
          if (TEXT_TYPES.has(node.type) && typeof node.text === "string") {
            lastText = node.text;
            continue;
          }
          if (node.name && (node.label != null || node["data-source"])) {
            const name = node.name as string;
            if (Object.prototype.hasOwnProperty.call(data, name) && !seen.has(name)) {
              const opts = Array.isArray(node["data-source"])
                ? new Map<string, string>(
                    node["data-source"].map((o: any) => [String(o.id), String(o.title)]),
                  )
                : undefined;
              const question = cleanQuestion(lastText) || node.label || name;
              result.push({
                key: name,
                question,
                value: translate(data[name], opts),
                screen: screenTitle,
              });
              seen.add(name);
            }
            lastText = null; // el texto ya se consumió para este campo
          }
          if (Array.isArray(node.children)) walkChildren(node.children);
          if (Array.isArray(node.then)) walkChildren(node.then);
          if (Array.isArray(node.else)) walkChildren(node.else);
        }
      };

      const layoutChildren: any[] = s.layout?.children || [];
      for (const c of layoutChildren) {
        if (c?.type === "Form" && Array.isArray(c.children)) {
          walkChildren(c.children);
        } else {
          walkChildren([c]);
        }
      }
    }
  }

  // Campos presentes en la respuesta que no se encontraron en el flow.json
  // (p. ej. flows sin definición cacheada). Se añaden al final, sin perder nada.
  // Se omiten claves reservadas internas (token, flags, ubicación), que se
  // tratan por separado en la UI.
  const RESERVED = new Set(["flow_token", "completed", "__location__"]);
  for (const [key, raw] of Object.entries(data)) {
    if (RESERVED.has(key) || seen.has(key)) continue;
    result.push({ key, question: key, value: translate(raw), screen: "" });
  }

  return result;
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
    // IDs de pantalla válidos y únicos. Meta solo permite letras y guiones
    // bajos (SIN números), p. ej. SCREEN_INICIO. No se permiten dígitos.
    if (!/^[A-Za-z_]+$/.test(s.id)) {
      issues.push({
        level: "error",
        screenId: s.id,
        message: `ID de pantalla inválido: "${s.id}". Meta solo permite letras y guiones bajos (sin números). Ej: SCREEN_INICIO.`,
      });
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

    // Límites de longitud de Meta.
    const tooLong = (label: string, text: string | undefined, max: number) => {
      if (text && text.length > max) {
        issues.push({
          level: "error",
          screenId: s.id,
          message: `${label} supera ${max} caracteres en "${s.id}" (${text.length}).`,
        });
      }
    };
    if ((s.title || "").length > FLOW_LIMITS.screenTitle) {
      tooLong("El título de pantalla", s.title, FLOW_LIMITS.screenTitle);
    }
    tooLong("El texto del botón", s.footerLabel, FLOW_LIMITS.footerLabel);

    const checkLen = (comps: FlowComponent[]) => {
      for (const c of comps) {
        const meta = COMPONENT_META[c.type];
        if (meta?.hasText) tooLong(`El texto de ${meta.label}`, c.text, textLimitFor(c.type));
        if (meta?.isField) {
          // Meta exige que todo campo tenga etiqueta no vacía.
          if (!c.label || !c.label.trim()) {
            issues.push({
              level: "error",
              screenId: s.id,
              message: `El campo "${c.name || meta.label}" en "${s.id}" no tiene etiqueta. Añade una etiqueta (Meta la exige).`,
            });
          }
          // Nombre de campo (clave) obligatorio y sin espacios.
          if (!c.name || !c.name.trim()) {
            issues.push({
              level: "error",
              screenId: s.id,
              message: `Un campo en "${s.id}" no tiene nombre de campo (clave).`,
            });
          }
          tooLong(`La etiqueta de "${c.name || meta.label}"`, c.label, FLOW_LIMITS.label);
          tooLong(`El texto de ayuda de "${c.name || meta.label}"`, c.helperText, FLOW_LIMITS.helperText);
        }
        if (meta?.hasOptions && c.options) {
          for (const o of c.options) {
            tooLong(`La opción "${o.id}"`, o.title, FLOW_LIMITS.optionTitle);
          }
        }
        if (c.type === "If") {
          checkLen(c.thenComponents || []);
          checkLen(c.elseComponents || []);
        }
      }
    };
    checkLen(s.components);

    // Advertencia: pantalla sin componentes.
    if (s.components.length === 0) {
      issues.push({ level: "warning", screenId: s.id, message: `La pantalla "${s.id}" no tiene componentes.` });
    }

    // Regla de Meta para RichText: debe ser el ÚNICO componente de la pantalla
    // (solo acompañado del botón). No puede convivir con campos ni otros textos.
    const hasRichText = s.components.some((c) => c.type === "RichText");
    if (hasRichText && s.components.length > 1) {
      issues.push({
        level: "error",
        screenId: s.id,
        message: `En "${s.id}": "Texto enriquecido" debe ser el único elemento de la pantalla (Meta no permite combinarlo con otros componentes). Muévelo a una pantalla propia.`,
      });
    }
  }

  return issues;
}
