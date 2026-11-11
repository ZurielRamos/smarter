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

/** Botón de respuesta rápida de un nodo Mensaje. */
export interface FlowButton {
  id: string;
  title: string;
}

export type FlowNodeType =
  'start' | 'message' | 'user_input' | 'action' | 'condition' | 'start_flow';

export type FlowInputValidation = 'any' | 'number' | 'email' | 'phone';

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

export type FlowConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'is_set'
  | 'is_not_set'
  | 'greater_than'
  | 'less_than';

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
  /** message: botones (máx. 10) */
  buttons?: FlowButton[];
  /** user_input: variable donde se guarda la respuesta */
  variable?: string;
  /** user_input: validación de la respuesta */
  validation?: FlowInputValidation;
  /** user_input: mensaje cuando la respuesta no es válida */
  errorMessage?: string;
  /** action: acciones a ejecutar en orden */
  actions?: FlowAction[];
  /** condition */
  conditionVariable?: string;
  conditionOperator?: FlowConditionOperator;
  conditionValue?: string;
  /** start_flow: flujo a iniciar */
  targetFlowId?: string;
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
 *   - 'true' / 'false' → ramas de un nodo Condición
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
  waitingFor: 'button' | 'input';
  retries: number;
  startedAt: string;
  updatedAt: string;
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
