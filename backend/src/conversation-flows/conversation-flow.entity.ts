import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';

// ─── Tipos del grafo ─────────────────────────────────────────────

/**
 * Tipos de botón de un nodo Mensaje:
 *  - reply: respuesta rápida; cada uno tiene su propia salida en el grafo.
 *  - url:   abre un enlace (no genera respuesta ni rama).
 *  - call:  muestra un teléfono para llamar (no genera respuesta ni rama).
 */
export type FlowButtonType = 'reply' | 'url' | 'call';

/** Botón de un nodo Mensaje. Sin `type` se trata como 'reply' (flujos antiguos). */
export interface FlowButton {
  id: string;
  title: string;
  type?: FlowButtonType;
  /** type 'url': enlace http(s); admite {{variables}} (se codifican en la URL) */
  url?: string;
  /**
   * type 'url': registrar los clics con un enlace corto propio. Activo por
   * defecto; con él el nodo tiene la salida «Al hacer clic» (handle `click:<id>`).
   */
  track?: boolean;
  /** type 'call': teléfono en formato internacional, p. ej. +573001234567 */
  phone?: string;
  /** type 'reply': otras palabras con las que el contacto puede elegir esta opción */
  keywords?: string[];
}

export type FlowTimeUnit = 'minutes' | 'hours' | 'days';

/** Plantilla aprobada de WhatsApp para cuando la ventana de 24 h está cerrada. */
export interface FlowTimeoutTemplate {
  name: string;
  /** Código de idioma (predeterminado «es») */
  language?: string;
  /** Variables del cuerpo {{1}}, {{2}}… (admiten {{variables}} del flujo) */
  params?: string[];
}

/** Recordatorio antes de rendirse («¿Sigues ahí?»). */
export interface FlowTimeoutReminder {
  /** Tiempo desde que el nodo empezó a esperar */
  after: number;
  unit: FlowTimeUnit;
  message: string;
  /** Mensaje con botones: repetir las opciones con el recordatorio. Entrada: repetir la pregunta. */
  repeatOptions?: boolean;
  /** Si la ventana de 24 h está cerrada se envía esta plantilla; sin ella, se omite el recordatorio */
  template?: FlowTimeoutTemplate;
}

/**
 * «Si no responde» de un nodo que espera al contacto (Mensaje con botones,
 * Entrada, Conversación con IA). Al vencer sigue por la salida `timeout`.
 * Si la ventana está cerrada, la salida se sigue igual pero sin enviar
 * mensajes libres (etiquetas, CRM, transferir, etc. sí se aplican).
 */
export interface FlowTimeoutConfig {
  enabled: boolean;
  after: number;
  unit: FlowTimeUnit;
  reminders?: FlowTimeoutReminder[];
}

/**
 * Qué hacer cuando el contacto escribe algo que no es ninguna de las opciones
 * de un mensaje con botones. Salida `nomatch` («Otra respuesta»).
 */
export interface FlowNoMatch {
  /**
   * 'retry' (predeterminado): avisa y repite las opciones; al agotar los
   * intentos sigue por `nomatch`. 'branch': sigue por `nomatch` de inmediato.
   */
  mode?: 'retry' | 'branch';
  /** Aviso antes de repetir (admite {{variables}}) */
  message?: string;
  /** Repetir los botones junto al aviso (predeterminado sí) */
  repeatOptions?: boolean;
  /** Intentos antes de seguir por `nomatch` (0–5, predeterminado 2) */
  maxRetries?: number;
  /** Interpretar con IA lo que escribió para ver si corresponde a una opción */
  ai?: boolean;
  aiMode?: FlowAiMode;
}

/** Cómo mostrar más de 3 botones de respuesta cuando el encabezado es un archivo. */
export type FlowOverflowMode = 'paginate' | 'list';

export type FlowNodeType =
  | 'start'
  | 'message'
  | 'user_input'
  | 'action'
  | 'condition'
  | 'start_flow'
  | 'ai_agent'
  | 'ai_generate';

/**
 * Tipo de respuesta que espera un nodo Entrada. Las de texto se validan y
 * normalizan en el servidor; `media` y `location` esperan un archivo o una
 * ubicación en lugar de texto.
 */
export type FlowInputValidation =
  | 'any'
  | 'number'
  | 'email'
  | 'phone'
  | 'date'
  | 'time'
  | 'url'
  | 'yes_no'
  | 'choice'
  | 'regex'
  | 'media'
  | 'location';

/** Formato con el que se guarda una respuesta de texto. */
export type FlowInputTransform = 'none' | 'upper' | 'lower' | 'title';

/** Tipos de archivo que acepta una entrada `media`. */
export type FlowMediaKind = 'image' | 'video' | 'audio' | 'document';

/** Dato adicional que la IA extrae de la misma respuesta. */
export interface FlowAiExtra {
  /** Variable donde se guarda */
  variable: string;
  /** Qué dato es («la ciudad», «el presupuesto en pesos») */
  description: string;
  /** Campo del CRM donde también se guarda (opcional) */
  saveToField?: string;
}

/**
 * Modo de la IA: variante de enrutamiento de OpenRouter sobre el modelo
 * predeterminado de la cuenta (mismas opciones que los bots). Sin modo = balanceado.
 */
export type FlowAiMode = 'nitro' | 'exacto' | 'floor';

/** Resultado posible de un nodo «Conversación con IA»: cada uno es una salida `out:<id>`. */
export interface FlowAgentOutcome {
  id: string;
  name: string;
  /** Cuándo debe elegirlo la IA */
  description?: string;
}

/** Dato que la IA debe averiguar durante la conversación. */
export interface FlowAgentCollect {
  variable: string;
  description: string;
  saveToField?: string;
}

/**
 * Nodo «Conversación con IA»: la IA conversa con el contacto durante varios
 * mensajes y vuelve al flujo por la salida del resultado al que llegó.
 * Salidas: `out:<id>` por resultado, `handoff`, `limit` (máximo de mensajes) y
 * `error` (la IA no está disponible).
 */
export type FlowAgentClosing = 'ai' | 'fixed' | 'none';

export interface FlowAgentConfig {
  /** 'bot': usa un bot existente (prompt, conocimiento, herramientas); 'custom': solo las instrucciones */
  source: 'bot' | 'custom';
  botId?: string;
  /** Objetivo e instrucciones del tramo (en modo bot se suman a las del bot) */
  instructions?: string;
  /** Primer mensaje al entrar; vacío = lo escribe la IA */
  firstMessage?: string;
  /**
   * Mensaje al cumplir el objetivo (salir por un resultado): 'ai' lo escribe la
   * IA (predeterminado), 'fixed' envía `closingMessage`, 'none' no envía nada y
   * pasa al siguiente nodo. No aplica a «Transferir» ni al límite.
   */
  closing?: FlowAgentClosing;
  closingMessage?: string;
  outcomes: FlowAgentOutcome[];
  collect?: FlowAgentCollect[];
  /** Mensajes del contacto antes de salir por `limit` (1–30, predeterminado 10) */
  maxTurns?: number;
  /** Permitir que la IA transfiera a un agente (salida `handoff`); predeterminado sí */
  allowHandoff?: boolean;
  mode?: FlowAiMode;
}

/** Tipo de un dato que genera el nodo «Generación IA» (se valida y normaliza al guardar). */
export type FlowAiFieldType =
  | 'text'
  | 'number'
  | 'date'
  | 'boolean'
  | 'choice'
  | 'email'
  | 'phone';

/** Dato que la IA debe devolver en modo estructurado. */
export interface FlowAiGenerateField {
  /** Variable donde se guarda (también es la clave del JSON que devuelve la IA) */
  variable: string;
  /** Qué dato es y cómo obtenerlo («nivel de interés de 1 a 5 según la conversación») */
  description: string;
  type: FlowAiFieldType;
  /** choice: valores permitidos */
  options?: string[];
  /** Si falta o no es válido, el nodo sale por `error` */
  required?: boolean;
  /** Campo del CRM donde también se guarda */
  saveToField?: string;
}

/** Información que recibe la IA además de las instrucciones. */
export interface FlowAiGenerateContext {
  /** Últimos mensajes de la conversación (0–50; 0 = ninguno) */
  messages?: number;
  /** Variables del flujo o campos del CRM concretos que se incluyen */
  keys?: string[];
  /** Todos los campos del CRM del contacto que tengan valor */
  allContact?: boolean;
  /** Todas las variables del flujo que tengan valor */
  allVariables?: boolean;
  /** Proyectos de reclutamiento del contacto (nombre, estado y perfil) */
  projects?: boolean;
}

/**
 * Nodo «Generación IA»: con las instrucciones y la información elegida, la IA
 * genera un texto o un conjunto de datos y los guarda en variables (y, si se
 * indica, en el CRM). No espera al contacto. Salidas: `next` y `error` (la IA
 * no está disponible o falta un dato obligatorio; sin conexión sigue por `next`).
 */
export interface FlowAiGenerateConfig {
  /** Qué debe generar (admite {{variables}}) */
  instructions: string;
  output: 'text' | 'structured';
  /** text: variable del resultado (predeterminado `ai_text`) */
  variable?: string;
  /** text: campo del CRM donde también se guarda */
  saveToField?: string;
  /** text: enviar el texto generado al contacto como mensaje */
  send?: boolean;
  /** text: extensión orientativa */
  length?: 'short' | 'medium' | 'long';
  /** structured: datos a devolver (1–15) */
  fields?: FlowAiGenerateField[];
  context?: FlowAiGenerateContext;
  /** Preciso (0), equilibrado (0.4) o creativo (0.8); predeterminado equilibrado */
  creativity?: 'precise' | 'balanced' | 'creative';
  mode?: FlowAiMode;
}

/** Procesamiento de la respuesta con IA (OpenRouter). */
export interface FlowInputAi {
  enabled: boolean;
  /** Qué dato debe obtener de la respuesta («el nombre completo», «el monto») */
  instruction?: string;
  /** Otros datos a sacar de la misma respuesta (máx. 5) */
  extras?: FlowAiExtra[];
  /** Transcribir notas de voz antes de procesarlas */
  transcribeAudio?: boolean;
  /** Rápido (nitro), preciso (exacto) o económico (floor); sin definir = balanceado */
  mode?: FlowAiMode;
}

export type FlowHeaderType = 'text' | 'image' | 'video' | 'document';

/** Encabezado multimedia ya resuelto para enviar. */
export interface FlowHeaderMedia {
  type: 'image' | 'video' | 'document';
  url: string;
  filename?: string;
}

export type FlowActionType =
  | 'set_variable'
  | 'add_label'
  | 'remove_label'
  | 'update_contact'
  | 'handoff'
  | 'resolve'
  // Reclutamiento (solo con el módulo activo):
  | 'add_to_project'
  | 'set_project_status'
  | 'set_project_answers';
export interface FlowAction {
  type: FlowActionType;
  /** set_variable: nombre de la variable */
  variable?: string;
  /** set_variable: valor (admite {{variables}}) */
  value?: string;
  /** add_label / remove_label: id de la etiqueta */
  labelId?: string;
  /** update_contact: clave del campo del CRM (el valor va en `value`, admite {{variables}}) */
  field?: string;
  /** update_contact: solo escribir si el campo está vacío (por defecto sobrescribe) */
  onlyIfEmpty?: boolean;
  /** add_to_project / set_project_status: proyecto de reclutamiento de la cuenta */
  projectId?: string;
  /** add_to_project: perfil con que entra (por defecto, el de entrada del proyecto) */
  role?: string;
  /** add_to_project: estado de entrada (por defecto «Nuevo»); set_project_status: estado nuevo */
  status?: string;
  /**
   * set_project_answers: valores para el formulario del proyecto (admiten
   * {{variables}}). `item` = `question:<id>` (pregunta) o `field:<clave>` (dato personal).
   * Con `onlyIfEmpty` no reemplaza lo que ya tenía.
   */
  answers?: FlowProjectAnswer[];
}

export interface FlowProjectAnswer {
  item: string;
  value: string;
}

/**
 * Operadores de condición. Se agrupan por el tipo de dato que comparan; el
 * evaluador (flow-conditions.util.ts) decide cómo interpretar cada valor.
 */
export type FlowConditionOperator =
  // Texto (sin distinguir mayúsculas ni tildes)
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'in_list'
  | 'not_in_list'
  | 'regex'
  // Presencia
  | 'is_set'
  | 'is_not_set'
  // Número
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'between'
  // Fecha
  | 'date_before'
  | 'date_after'
  | 'date_on'
  | 'date_between'
  | 'within_last_days'
  | 'older_than_days'
  // Sí / No
  | 'is_true'
  | 'is_false'
  // Reparto al azar
  | 'percent'
  // Nombres del nodo antiguo (de una sola regla); se siguen entendiendo
  | 'greater_than'
  | 'less_than';

/**
 * Qué evalúa una regla:
 *  - variable: variable del flujo o campo del CRM (`field` = clave)
 *  - message: último mensaje del contacto
 *  - channel / inbox / conversation_status: datos de la conversación
 *  - label: la conversación tiene la etiqueta `field` (id)
 *  - new_conversation / has_contact: sí o no
 *  - inbound_count: cuántos mensajes ha enviado el contacto
 *  - time_of_day / weekday / date: ahora mismo (hora de Bogotá)
 *  - random: reparto al azar (A/B)
 *  - project: el contacto está en el proyecto `field` (id) · Reclutamiento
 *  - project_status / project_role: estado o perfil del contacto en el
 *    proyecto `field`; `value` = lista de claves separadas por coma
 */
export type FlowConditionSource =
  | 'variable'
  | 'message'
  | 'channel'
  | 'inbox'
  | 'label'
  | 'new_conversation'
  | 'has_contact'
  | 'inbound_count'
  | 'conversation_status'
  | 'time_of_day'
  | 'weekday'
  | 'date'
  | 'random'
  | 'project'
  | 'project_status'
  | 'project_role';

export interface FlowConditionRule {
  id: string;
  source: FlowConditionSource;
  /** variable: clave de la variable/campo · label: id de la etiqueta */
  field?: string;
  operator: FlowConditionOperator;
  /** Valor a comparar (admite {{variables}}). In_list: separados por coma. */
  value?: string;
  /** Segundo valor de between / date_between */
  value2?: string;
}

/** Una rama de un nodo Condición: se cumple si todas (o cualquiera de) sus reglas se cumplen. */
export interface FlowConditionBranch {
  id: string;
  name: string;
  match: 'all' | 'any';
  rules: FlowConditionRule[];
}

export interface FlowNodeData {
  /** message / user_input: texto a enviar (admite {{variables}}) */
  text?: string;
  /** message: encabezado (≤ 60 caracteres, admite {{variables}}) */
  header?: string;
  /** message: pie de mensaje (≤ 60 caracteres, admite {{variables}}) */
  footer?: string;
  /** message: tipo de encabezado. 'text' usa `header`; el resto usa `headerMediaUrl`. */
  headerType?: FlowHeaderType;
  /** message: URL pública del archivo del encabezado (imagen JPEG, video MP4 o documento) */
  headerMediaUrl?: string;
  /** message: nombre del archivo (documentos) */
  headerMediaName?: string;
  /** message: botones (máx. 10 de respuesta y 3 de enlace/llamada) */
  buttons?: FlowButton[];
  /**
   * message: con más de 3 botones de respuesta y un archivo en el encabezado,
   * WhatsApp no permite mostrarlos juntos. 'paginate' (predeterminado) muestra
   * el archivo con 2 opciones y un botón «Más opciones»; 'list' envía el archivo
   * aparte y las opciones en una lista desplegable.
   */
  overflow?: FlowOverflowMode;
  /** message: qué hacer si el contacto escribe otra cosa que no es una opción */
  noMatch?: FlowNoMatch;
  /** message con botones / user_input / ai_agent: si no responde a tiempo (salida `timeout`) */
  timeout?: FlowTimeoutConfig;
  /** user_input: variable donde se guarda la respuesta · message con botones: título del botón elegido */
  variable?: string;
  /** user_input: validación de la respuesta */
  validation?: FlowInputValidation;
  /** user_input: mensaje cuando la respuesta no es válida */
  errorMessage?: string;
  /** user_input / message con botones: campo del CRM donde también se guarda la respuesta */
  saveToField?: string;
  /** user_input: no preguntar si la variable o el campo del CRM ya tienen valor */
  skipIfFilled?: boolean;
  /** user_input: formato al guardar (solo respuestas de texto) */
  transform?: FlowInputTransform;
  /** user_input: intentos extra tras una respuesta no válida (0–10, predeterminado 3) */
  maxRetries?: number;
  /** user_input: palabras con las que el contacto puede saltar la pregunta */
  skipKeywords?: string[];
  /** user_input (any): longitud mínima y máxima del texto */
  minLength?: number;
  maxLength?: number;
  /** user_input (number): rango permitido y si solo admite enteros */
  minValue?: number;
  maxValue?: number;
  integerOnly?: boolean;
  /** user_input (date): solo fechas pasadas o futuras (hoy cuenta en ambas) */
  dateRange?: 'any' | 'past' | 'future';
  /** user_input (choice): opciones válidas */
  choices?: string[];
  /** user_input (choice): añadir la lista numerada de opciones a la pregunta */
  showChoices?: boolean;
  /** user_input (regex): patrón que debe cumplir la respuesta */
  pattern?: string;
  /** user_input (media): tipos de archivo aceptados; vacío = cualquiera */
  mediaKinds?: FlowMediaKind[];
  /** user_input: procesamiento con IA */
  ai?: FlowInputAi;
  /** action: acciones a ejecutar en orden */
  actions?: FlowAction[];
  /**
   * condition: ramas evaluadas en orden; gana la primera que se cumple y, si
   * ninguna, sigue la salida `else`. Salidas: `cond:<id de rama>` y `else`.
   */
  branches?: FlowConditionBranch[];
  /** condition (formato antiguo de una sola regla, salidas `true`/`false`) */
  conditionVariable?: string;
  conditionOperator?: FlowConditionOperator;
  conditionValue?: string;
  /** start_flow: flujo a iniciar */
  targetFlowId?: string;
  /** ai_agent: configuración de la conversación con IA */
  agent?: FlowAgentConfig;
  /** ai_generate: configuración de la generación con IA */
  generate?: FlowAiGenerateConfig;
}

export interface FlowNode {
  id: string;
  type: FlowNodeType;
  position: { x: number; y: number };
  data: FlowNodeData;
}

/**
 * Conexión entre nodos. `sourceHandle` identifica la salida:
 *   - 'next'           → salida por defecto
 *   - 'btn:<buttonId>' → botón de un nodo Mensaje
 *   - 'true' / 'false' → ramas de un nodo Condición (formato antiguo)
 *   - 'cond:<id>' / 'else' → ramas de un nodo Condición
 *   - 'invalid'        → nodo Entrada: se agotaron los intentos
 */
export interface FlowEdge {
  id: string;
  source: string;
  sourceHandle?: string | null;
  target: string;
}

/** Cómo se compara una palabra clave con el mensaje (sin mayúsculas ni tildes). */
export type FlowKeywordMatch = 'exact' | 'contains' | 'starts_with' | 'regex';

export type FlowTriggerType =
  'keyword' | 'new_conversation' | 'template_reply' | 'ad_click';

/** Un disparador del flujo. Un flujo puede tener varios. */
export interface FlowTrigger {
  id: string;
  type: FlowTriggerType;
  /** keyword: palabras o expresiones (regex) que inician el flujo */
  keywords?: string[];
  /** keyword: cómo se comparan */
  matchType?: FlowKeywordMatch;
  /** keyword: si el mensaje contiene alguna de estas, no se inicia */
  exclude?: string[];
  /** template_reply: nombre de la plantilla; vacío = cualquier plantilla */
  templateName?: string;
  /** template_reply: títulos de botón que inician el flujo; vacío = cualquier botón */
  buttons?: string[];
  /** template_reply: también inicia si responde con texto (sin pulsar un botón) */
  anyReply?: boolean;
  /** template_reply: horas desde el envío en las que la respuesta cuenta (1–720) */
  withinHours?: number;
  /** ad_click: ids de anuncio (source_id de Meta); vacío = cualquier anuncio */
  adIds?: string[];
  /** ad_click: el titular del anuncio contiene este texto */
  headlineContains?: string;
}

/** Ventana horaria en la que el flujo se puede iniciar (zona de los flujos). */
export interface FlowTriggerSchedule {
  /** inside = solo dentro del horario; outside = solo fuera */
  mode: 'inside' | 'outside';
  /** Días de la semana (0 = domingo … 6 = sábado) */
  days: number[];
  /** «HH:mm» */
  from: string;
  to: string;
}

/** Cada cuánto puede iniciarse el flujo para un mismo contacto. */
export interface FlowTriggerFrequency {
  /** once = una sola vez; cooldown = una vez cada `after` `unit` */
  mode: 'once' | 'cooldown';
  after?: number;
  unit?: 'hours' | 'days';
}

/**
 * Disparadores de un flujo (formato 2). Los flujos guardados con el formato
 * antiguo ({ keywords, matchType, onNewConversation, inboxIds }) se convierten
 * al leerlos con `normalizeTriggers`.
 */
export interface FlowTriggers {
  version: 2;
  items: FlowTrigger[];
  /** Bandejas donde aplica. Vacío = todas las del tenant */
  inboxIds: string[];
  /** Solo se inicia desde otro flujo, una campaña o un agente: se ignoran los disparadores */
  subflowOnly?: boolean;
  schedule?: FlowTriggerSchedule | null;
  /** Condiciones sobre el contacto y la conversación (mismo formato que el nodo Condición) */
  audience?: { match: 'all' | 'any'; rules: FlowConditionRule[] } | null;
  /** Sin definir = siempre */
  frequency?: FlowTriggerFrequency | null;
  /** Si el contacto ya está en otro flujo: interrumpirlo (predeterminado) o no iniciar */
  ifRunning?: 'interrupt' | 'skip';
  /** Mayor = se evalúa antes cuando varios flujos coinciden (0–100) */
  priority?: number;
}

/**
 * Estado de ejecución de un flujo dentro de una conversación: el nodo que
 * espera respuesta. Las variables se guardan aparte (Conversation.flowVariables)
 * para que persistan entre flujos aunque el flujo termine.
 */
export interface ConversationFlowState {
  flowId: string;
  /** Nodo que espera respuesta (message con botones o user_input) */
  nodeId: string;
  waitingFor: 'button' | 'input' | 'agent';
  /**
   * Ficha de esta espera. Cambia cada vez que el contacto responde; un
   * temporizador solo actúa si la conversación sigue con la ficha con que se armó.
   */
  token?: string;
  retries: number;
  startedAt: string;
  updatedAt: string;
  /** ai_agent: conversación del tramo con IA (últimos mensajes) y mensajes del contacto */
  agent?: {
    history: { role: 'user' | 'assistant'; content: string }[];
    turns: number;
  };
}

// ─── Entidad ─────────────────────────────────────────────────────

@Entity('conversation_flows')
@Index(['tenantId'])
export class ConversationFlow {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  // draft | active | inactive
  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  nodes: FlowNode[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  edges: FlowEdge[];

  @Column({ type: 'jsonb', nullable: true })
  triggers: FlowTriggers | null;

  /** Veces que el flujo se ha iniciado en una conversación */
  @Column({ name: 'run_count', type: 'int', default: 0 })
  runCount: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
