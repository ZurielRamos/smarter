import axios from "axios";

export const flowsApi = axios.create({ baseURL: import.meta.env.VITE_API_URL || "/api" });
flowsApi.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ─── Modelo (espejo de backend/src/conversation-flows/conversation-flow.entity.ts) ───

export interface FlowButton {
  id: string;
  title: string;
}

export type FlowNodeType = "start" | "message" | "user_input" | "action" | "condition" | "start_flow";
export type FlowInputValidation = "any" | "number" | "email" | "phone";
export type FlowActionType = "set_variable" | "add_label" | "remove_label" | "handoff" | "resolve";
export type FlowConditionOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "is_set"
  | "is_not_set"
  | "greater_than"
  | "less_than";

export interface FlowAction {
  type: FlowActionType;
  variable?: string;
  value?: string;
  labelId?: string;
}

export interface FlowNodeData {
  text?: string;
  buttons?: FlowButton[];
  variable?: string;
  validation?: FlowInputValidation;
  errorMessage?: string;
  actions?: FlowAction[];
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

export const OPERATOR_LABELS: Record<FlowConditionOperator, string> = {
  equals: "es igual a",
  not_equals: "es distinto de",
  contains: "contiene",
  is_set: "tiene valor",
  is_not_set: "está vacía",
  greater_than: "es mayor que",
  less_than: "es menor que",
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
