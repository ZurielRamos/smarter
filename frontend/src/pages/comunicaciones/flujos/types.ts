import axios from "axios";

export const flowsApi = axios.create({ baseURL: import.meta.env.VITE_API_URL || "/api" });
flowsApi.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ─── Modelo (espejo de backend/src/conversation-flows/conversation-flow.entity.ts) ───

export type FlowButtonType = "reply" | "url" | "call";

/** Botón de un nodo Mensaje. Sin `type` es una respuesta (flujos antiguos). */
export interface FlowButton {
  id: string;
  title: string;
  type?: FlowButtonType;
  /** type 'url': enlace http(s); admite {{variables}} */
  url?: string;
  /** type 'url': registrar clics y habilitar la salida «Al hacer clic» (activo si no es false) */
  track?: boolean;
  /** type 'call': teléfono en formato internacional */
  phone?: string;
}

export type FlowNodeType = "start" | "message" | "user_input" | "action" | "condition" | "start_flow";
export type FlowInputValidation = "any" | "number" | "email" | "phone";
export type FlowHeaderType = "text" | "image" | "video" | "document";

export const HEADER_TYPE_LABELS: Record<FlowHeaderType, string> = {
  text: "Texto",
  image: "Imagen",
  video: "Video",
  document: "Documento",
};

/** Tipos de archivo aceptados por el selector según el encabezado. */
export const HEADER_ACCEPT: Record<Exclude<FlowHeaderType, "text">, string> = {
  image: "image/jpeg,image/png,image/webp",
  video: "video/mp4,video/quicktime,video/webm,video/3gpp",
  document: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt",
};
export type FlowActionType = "set_variable" | "add_label" | "remove_label" | "handoff" | "resolve";
/** Operadores de condición (espejo del backend: flow-conditions.util.ts). */
export type FlowConditionOperator =
  // Texto
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "in_list"
  | "not_in_list"
  | "regex"
  // Presencia
  | "is_set"
  | "is_not_set"
  // Número
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between"
  // Fecha
  | "date_before"
  | "date_after"
  | "date_on"
  | "date_between"
  | "within_last_days"
  | "older_than_days"
  // Sí / No
  | "is_true"
  | "is_false"
  // Reparto al azar
  | "percent"
  // Nombres del nodo antiguo de una sola regla
  | "greater_than"
  | "less_than";

/** Qué evalúa una regla. */
export type FlowConditionSource =
  | "variable"
  | "message"
  | "channel"
  | "inbox"
  | "label"
  | "new_conversation"
  | "has_contact"
  | "inbound_count"
  | "conversation_status"
  | "time_of_day"
  | "weekday"
  | "date"
  | "random";

export interface FlowConditionRule {
  id: string;
  source: FlowConditionSource;
  /** variable: clave de la variable o campo · label: id de la etiqueta */
  field?: string;
  operator: FlowConditionOperator;
  value?: string;
  value2?: string;
}

/** Rama de un nodo Condición: sale por `cond:<id>` si se cumplen todas (o alguna) de sus reglas. */
export interface FlowConditionBranch {
  id: string;
  name: string;
  match: "all" | "any";
  rules: FlowConditionRule[];
}

export interface FlowAction {
  type: FlowActionType;
  variable?: string;
  value?: string;
  labelId?: string;
}

export interface FlowNodeData {
  text?: string;
  /** Encabezado del mensaje (≤ 60) */
  header?: string;
  /** Pie del mensaje (≤ 60) */
  footer?: string;
  /** Tipo de encabezado: texto (header) o archivo (headerMediaUrl) */
  headerType?: FlowHeaderType;
  headerMediaUrl?: string;
  headerMediaName?: string;
  buttons?: FlowButton[];
  /** Más de 3 respuestas con archivo en el encabezado: 'paginate' (predeterminado) o 'list' */
  overflow?: "paginate" | "list";
  variable?: string;
  validation?: FlowInputValidation;
  errorMessage?: string;
  actions?: FlowAction[];
  /** condition: ramas evaluadas en orden; si ninguna se cumple sale por `else` */
  branches?: FlowConditionBranch[];
  /** condition (formato antiguo de una sola regla; el editor lo convierte al abrir) */
  conditionVariable?: string;
  conditionOperator?: FlowConditionOperator;
  conditionValue?: string;
  targetFlowId?: string;
  [key: string]: unknown;
}

export interface FlowNodeModel {
  id: string;
  type: FlowNodeType;
  position: { x: number; y: number };
  data: FlowNodeData;
}

export interface FlowEdgeModel {
  id: string;
  source: string;
  sourceHandle?: string | null;
  target: string;
}

export interface FlowTriggers {
  keywords: string[];
  matchType: "exact" | "contains";
  onNewConversation: boolean;
  inboxIds: string[];
}

export type FlowStatus = "draft" | "active" | "inactive";

export interface ConversationFlowSummary {
  id: string;
  name: string;
  description: string | null;
  status: FlowStatus;
  triggers: FlowTriggers | null;
  runCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationFlow extends ConversationFlowSummary {
  nodes: FlowNodeModel[];
  edges: FlowEdgeModel[];
}

export interface InboxOption {
  id: string;
  name: string;
  channel: string;
}

export interface LabelOption {
  id: string;
  label: string;
  color: string;
}

// ─── Constantes de UI ───

/** Límite de botones por mensaje (listas de WhatsApp). */
export const MAX_BUTTONS = 10;
/** WhatsApp: botones de respuesta ≤ 20 caracteres (3 botones); filas de lista ≤ 24. */
export const MAX_BUTTON_TITLE = 24;
export const WA_REPLY_BUTTON_TITLE = 20;
/** WhatsApp: encabezado y pie de mensajes interactivos ≤ 60 caracteres. */
export const MAX_HEADER_FOOTER = 60;
/** Botones de enlace o llamada por mensaje (Messenger admite 3 en su plantilla). */
export const MAX_ACTION_BUTTONS = 3;
/** Título de botones de enlace/llamada (límite de WhatsApp cta_url y Messenger). */
export const MAX_ACTION_TITLE = 20;

export const statusLabels: Record<FlowStatus, string> = {
  draft: "borrador",
  active: "activo",
  inactive: "inactivo",
};

export const statusColors: Record<FlowStatus, string> = {
  active: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300",
  inactive: "bg-muted text-muted-foreground",
  draft: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300",
};

export const VALIDATION_LABELS: Record<FlowInputValidation, string> = {
  any: "Cualquier texto",
  number: "Número",
  email: "Correo electrónico",
  phone: "Teléfono",
};

export const ACTION_LABELS: Record<FlowActionType, string> = {
  set_variable: "Asignar variable",
  add_label: "Agregar etiqueta",
  remove_label: "Quitar etiqueta",
  handoff: "Transferir a un agente",
  resolve: "Marcar como resuelta",
};

export const NODE_LABELS: Record<FlowNodeType, string> = {
  start: "Inicio",
  message: "Mensaje",
  user_input: "Entrada de usuario",
  action: "Acción",
  condition: "Condición",
  start_flow: "Iniciar flujo",
};

/** Id corto para nodos y botones (sin ":" porque viaja en el payload del canal). */
export function shortId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}
