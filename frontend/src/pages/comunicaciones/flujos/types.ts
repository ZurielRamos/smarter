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
  /** type 'reply': otras palabras con las que el contacto puede elegir esta opción */
  keywords?: string[];
}

export type FlowTimeUnit = "minutes" | "hours" | "days";
/** Plantilla aprobada de WhatsApp para cuando la ventana de 24 h está cerrada. */
export interface FlowTimeoutTemplate {
  name: string;
  language?: string;
  /** Variables del cuerpo {{1}}, {{2}}… (admiten {{variables}} del flujo) */
  params?: string[];
}
export interface FlowTimeoutReminder {
  /** Tiempo desde que el nodo empezó a esperar */
  after: number;
  unit: FlowTimeUnit;
  message: string;
  repeatOptions?: boolean;
  template?: FlowTimeoutTemplate;
}
/** «Si no responde»: al vencer sigue por la salida `timeout`. */
export interface FlowTimeoutConfig {
  enabled: boolean;
  after: number;
  unit: FlowTimeUnit;
  reminders?: FlowTimeoutReminder[];
}

/** Mensaje con botones: qué hacer si el contacto escribe otra cosa (salida `nomatch`). */
export interface FlowNoMatch {
  /** 'retry' (sin definir): avisa y repite; 'branch': sigue por «Otra respuesta» de inmediato */
  mode?: "branch";
  message?: string;
  /** false = no repetir los botones con el aviso */
  repeatOptions?: false;
  /** Intentos antes de «Otra respuesta» (0–5; sin definir = 2) */
  maxRetries?: number;
  ai?: boolean;
  aiMode?: FlowAiMode;
}

export type FlowNodeType =
  | "start"
  | "message"
  | "user_input"
  | "action"
  | "condition"
  | "start_flow"
  | "ai_agent"
  | "ai_generate";
export type FlowInputValidation =
  | "any"
  | "number"
  | "email"
  | "phone"
  | "date"
  | "time"
  | "url"
  | "yes_no"
  | "choice"
  | "regex"
  | "media"
  | "location";
export type FlowInputTransform = "none" | "upper" | "lower" | "title";
export type FlowMediaKind = "image" | "video" | "audio" | "document";
/** Dato adicional que la IA saca de la misma respuesta. */
export interface FlowAiExtra {
  variable: string;
  description: string;
  saveToField?: string;
}
/** Variante de OpenRouter sobre el modelo de la cuenta; sin modo = balanceado. */
export type FlowAiMode = "nitro" | "exacto" | "floor";
/** Resultado de una conversación con IA: cada uno es una salida `out:<id>`. */
export interface FlowAgentOutcome {
  id: string;
  name: string;
  /** Cuándo debe elegirlo la IA */
  description?: string;
}
export interface FlowAgentCollect {
  variable: string;
  description: string;
  saveToField?: string;
}
/** Nodo «Conversación con IA». Salidas: `out:<id>`, `handoff`, `limit` y `error`. */
export interface FlowAgentConfig {
  source: "bot" | "custom";
  botId?: string;
  instructions?: string;
  firstMessage?: string;
  outcomes: FlowAgentOutcome[];
  collect?: FlowAgentCollect[];
  maxTurns?: number;
  allowHandoff?: boolean;
  mode?: FlowAiMode;
}
/** Tipo de un dato del nodo «Generación IA» (el servidor lo valida y normaliza). */
export type FlowAiFieldType = "text" | "number" | "date" | "boolean" | "choice" | "email" | "phone";
export interface FlowAiGenerateField {
  /** Variable donde se guarda */
  variable: string;
  /** Qué dato es y cómo obtenerlo */
  description: string;
  type: FlowAiFieldType;
  /** choice: valores permitidos */
  options?: string[];
  /** Si falta, el nodo sale por «Si falla» */
  required?: boolean;
  saveToField?: string;
}
export interface FlowAiGenerateContext {
  /** Últimos mensajes de la conversación (0 = ninguno) */
  messages?: number;
  /** Variables o campos concretos */
  keys?: string[];
  allContact?: boolean;
  allVariables?: boolean;
  /** Proyectos de reclutamiento del contacto */
  projects?: boolean;
}
/** Nodo «Generación IA». Salidas: `next` y `error`. */
export interface FlowAiGenerateConfig {
  instructions: string;
  output: "text" | "structured";
  /** text: variable del resultado (vacío = ai_text) */
  variable?: string;
  saveToField?: string;
  /** text: enviar el texto al contacto */
  send?: boolean;
  length?: "short" | "medium" | "long";
  fields?: FlowAiGenerateField[];
  context?: FlowAiGenerateContext;
  creativity?: "precise" | "balanced" | "creative";
  mode?: FlowAiMode;
}
export interface FlowInputAi {
  enabled: boolean;
  /** Qué dato debe obtener («el nombre completo», «el monto en pesos») */
  instruction?: string;
  extras?: FlowAiExtra[];
  /** Transcribir notas de voz antes de procesarlas */
  transcribeAudio?: boolean;
  mode?: FlowAiMode;
}
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
export type FlowActionType =
  | "set_variable"
  | "add_label"
  | "remove_label"
  | "update_contact"
  | "handoff"
  | "resolve"
  // Reclutamiento (solo con el módulo activo)
  | "add_to_project"
  | "set_project_status"
  | "set_project_answers";
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
  | "random"
  // Reclutamiento: `field` = id del proyecto; `value` = estados o perfiles separados por coma
  | "project"
  | "project_status"
  | "project_role";

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
  /** update_contact: clave del campo del CRM; el valor va en `value` */
  field?: string;
  /** update_contact: solo escribir si el campo está vacío */
  onlyIfEmpty?: boolean;
  /** add_to_project / set_project_status: proyecto de reclutamiento */
  projectId?: string;
  /** add_to_project: perfil (vacío = el de entrada del proyecto) */
  role?: "participant" | "surveyor" | "moderator";
  /** add_to_project: estado de entrada (vacío = «Nuevo»); set_project_status: estado nuevo */
  status?: string;
  /** set_project_answers: `item` = `question:<id>` o `field:<clave>`; `value` admite {{variables}} */
  answers?: Array<{ item: string; value: string }>;
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
  /** message con botones: si escribe otra cosa */
  noMatch?: FlowNoMatch;
  /** message con botones / user_input / ai_agent: si no responde a tiempo */
  timeout?: FlowTimeoutConfig;
  /** user_input: variable de la respuesta · message con botones: título del botón elegido */
  variable?: string;
  validation?: FlowInputValidation;
  errorMessage?: string;
  /** user_input / message con botones: campo del CRM donde también se guarda la respuesta */
  saveToField?: string;
  /** user_input: no preguntar si la variable o el campo del CRM ya tienen valor */
  skipIfFilled?: boolean;
  transform?: FlowInputTransform;
  /** user_input: intentos extra tras una respuesta no válida (0–10; sin definir = 3) */
  maxRetries?: number;
  skipKeywords?: string[];
  minLength?: number;
  maxLength?: number;
  minValue?: number;
  maxValue?: number;
  integerOnly?: boolean;
  dateRange?: "any" | "past" | "future";
  choices?: string[];
  showChoices?: boolean;
  pattern?: string;
  mediaKinds?: FlowMediaKind[];
  ai?: FlowInputAi;
  actions?: FlowAction[];
  /** condition: ramas evaluadas en orden; si ninguna se cumple sale por `else` */
  branches?: FlowConditionBranch[];
  /** condition (formato antiguo de una sola regla; el editor lo convierte al abrir) */
  conditionVariable?: string;
  conditionOperator?: FlowConditionOperator;
  conditionValue?: string;
  targetFlowId?: string;
  agent?: FlowAgentConfig;
  generate?: FlowAiGenerateConfig;
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

// ─── Disparadores (espejo de backend: conversation-flow.entity.ts y flow-triggers.util.ts) ───
export type FlowKeywordMatch = "exact" | "contains" | "starts_with" | "regex";
export type FlowTriggerType = "keyword" | "new_conversation" | "template_reply" | "ad_click";
export interface FlowTrigger {
  id: string;
  type: FlowTriggerType;
  keywords?: string[];
  matchType?: FlowKeywordMatch;
  exclude?: string[];
  /** template_reply: vacío = cualquier plantilla */
  templateName?: string;
  /** template_reply: vacío = cualquier botón */
  buttons?: string[];
  anyReply?: boolean;
  withinHours?: number;
  /** ad_click: vacío = cualquier anuncio */
  adIds?: string[];
  headlineContains?: string;
}
export interface FlowTriggerSchedule {
  mode: "inside" | "outside";
  days: number[];
  from: string;
  to: string;
}
export interface FlowTriggerFrequency {
  mode: "once" | "cooldown";
  after?: number;
  unit?: "hours" | "days";
}
export interface FlowTriggers {
  version: 2;
  items: FlowTrigger[];
  inboxIds: string[];
  subflowOnly?: boolean;
  schedule?: FlowTriggerSchedule | null;
  audience?: { match: "all" | "any"; rules: FlowConditionRule[] } | null;
  frequency?: FlowTriggerFrequency | null;
  ifRunning?: "interrupt" | "skip";
  priority?: number;
}
/** GET /conversation-flows/:id/trigger-overview */
export interface FlowTriggerOverview {
  starts30d: Record<string, number>;
  callers: { id: string; name: string }[];
  campaigns: { id: string; name: string }[];
}
export const TRIGGER_LABELS: Record<FlowTriggerType, string> = {
  keyword: "Palabras clave",
  new_conversation: "Conversación nueva",
  template_reply: "Respuesta a plantilla",
  ad_click: "Anuncio de Meta",
};
/** Nombres de los orígenes registrados en flow_starts. */
export const START_SOURCE_LABELS: Record<string, string> = {
  ...TRIGGER_LABELS,
  campaign: "Campaña",
  subflow: "Desde otro flujo",
  manual: "Desde el chat",
  automation: "Automatización",
  api: "API",
};

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
  any: "Texto libre",
  number: "Número",
  email: "Correo electrónico",
  phone: "Teléfono",
  date: "Fecha",
  time: "Hora",
  url: "Enlace web",
  yes_no: "Sí / No",
  choice: "Una opción de una lista",
  regex: "Formato propio (expresión regular)",
  media: "Archivo (foto, video, audio, documento)",
  location: "Ubicación",
};

export const ACTION_LABELS: Record<FlowActionType, string> = {
  set_variable: "Asignar variable",
  add_label: "Agregar etiqueta",
  remove_label: "Quitar etiqueta",
  update_contact: "Actualizar contacto",
  handoff: "Transferir a un agente",
  resolve: "Marcar como resuelta",
  add_to_project: "Agregar a proyecto",
  set_project_status: "Cambiar estado en proyecto",
  set_project_answers: "Guardar respuestas en proyecto",
};

/** Acciones que solo existen con Reclutamiento activo. */
export const PROJECT_ACTIONS = new Set<FlowActionType>(["add_to_project", "set_project_status", "set_project_answers"]);

export const NODE_LABELS: Record<FlowNodeType, string> = {
  start: "Inicio",
  message: "Mensaje",
  user_input: "Entrada de usuario",
  action: "Acción",
  condition: "Condición",
  start_flow: "Iniciar flujo",
  ai_agent: "Conversación con IA",
  ai_generate: "Generación IA",
};

/** Id corto para nodos y botones (sin ":" porque viaja en el payload del canal). */
export function shortId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}
