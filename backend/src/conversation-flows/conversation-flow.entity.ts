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
  | 'ai_agent';

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
export interface FlowAgentConfig {
  /** 'bot': usa un bot existente (prompt, conocimiento, herramientas); 'custom': solo las instrucciones */
  source: 'bot' | 'custom';
  botId?: string;
  /** Objetivo e instrucciones del tramo (en modo bot se suman a las del bot) */
  instructions?: string;
  /** Primer mensaje al entrar; vacío = lo escribe la IA */
  firstMessage?: string;
  outcomes: FlowAgentOutcome[];
  collect?: FlowAgentCollect[];
  /** Mensajes del contacto antes de salir por `limit` (1–30, predeterminado 10) */
  maxTurns?: number;
  /** Permitir que la IA transfiera a un agente (salida `handoff`); predeterminado sí */
  allowHandoff?: boolean;
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
  'set_variable' | 'add_label' | 'remove_label' | 'handoff' | 'resolve';

export interface FlowAction {
  type: FlowActionType;
  /** set_variable: nombre de la variable */
  variable?: string;
  /** set_variable: valor (admite {{variables}}) */
  value?: string;
  /** add_label / remove_label: id de la etiqueta */
  labelId?: string;
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
  | 'random';

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
  /** user_input: variable donde se guarda la respuesta */
  variable?: string;
  /** user_input: validación de la respuesta */
  validation?: FlowInputValidation;
  /** user_input: mensaje cuando la respuesta no es válida */
  errorMessage?: string;
  /** user_input: campo del CRM donde también se guarda la respuesta */
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

export interface FlowTriggers {
  /** Palabras clave que inician el flujo */
  keywords: string[];
  matchType: 'exact' | 'contains';
  /** Iniciar automáticamente con el primer mensaje de una conversación nueva */
  onNewConversation: boolean;
  /** Bandejas donde aplica. Vacío = todas las del tenant */
  inboxIds: string[];
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
