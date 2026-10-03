import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Tenant } from '../../tenants/tenant.entity';
import { Inbox } from '../../chats/inbox.entity';
import { ClientRecord } from '../../records/record.entity';
import { Conversation } from '../../chats/conversation.entity';
import { WhatsAppFlow } from './whatsapp-flow.entity';

/**
 * Una respuesta (sesión) de un usuario a un WhatsApp Flow.
 *
 * Se crea cuando se envía el Flow a un contacto (con su flow_token) y se va
 * completando con los datos de cada pantalla a medida que llegan por el
 * endpoint cifrado. Queda vinculada a tenant, inbox, contacto (ClientRecord)
 * y conversación para tener trazabilidad completa de quién respondió qué.
 */
@Entity('whatsapp_flow_submissions')
@Index(['tenantId'])
@Index(['flowToken'], { unique: true })
@Index(['recordId'])
@Index(['conversationId'])
export class WhatsAppFlowSubmission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  // Flow al que corresponde esta respuesta (opcional: puede llegar antes de
  // haber registrado la definición del Flow en whatsapp_flows).
  @Column({ name: 'flow_id', type: 'uuid', nullable: true })
  flowId: string | null;

  @ManyToOne(() => WhatsAppFlow, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'flow_id' })
  flow: WhatsAppFlow | null;

  // Nombre/ID del Flow en Meta, redundante para consultas sin join.
  @Column({ name: 'meta_flow_id', type: 'varchar', nullable: true })
  metaFlowId: string | null;

  // Token único que correlaciona el envío del Flow con sus respuestas.
  @Column({ name: 'flow_token', type: 'varchar', nullable: true })
  flowToken: string | null;

  // ---- Vínculos de trazabilidad ----

  @Column({ name: 'inbox_id', type: 'uuid', nullable: true })
  inboxId: string | null;

  @ManyToOne(() => Inbox, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'inbox_id' })
  inbox: Inbox | null;

  @Column({ name: 'record_id', type: 'uuid', nullable: true })
  recordId: string | null;

  @ManyToOne(() => ClientRecord, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'record_id' })
  record: ClientRecord | null;

  @Column({ name: 'conversation_id', type: 'uuid', nullable: true })
  conversationId: string | null;

  @ManyToOne(() => Conversation, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'conversation_id' })
  conversation: Conversation | null;

  // Identificador del contacto en WhatsApp (teléfono o BSUID canónico).
  @Column({ name: 'contact_identifier', type: 'varchar', nullable: true })
  contactIdentifier: string | null;

  // ---- Estado y datos recogidos ----

  // started | in_progress | completed | abandoned | error
  @Column({ type: 'varchar', length: 20, default: 'started' })
  status: string;

  // Última pantalla por la que pasó el usuario.
  @Column({ name: 'current_screen', type: 'varchar', length: 100, nullable: true })
  currentScreen: string | null;

  // Datos acumulados de todas las pantallas (merge de cada data_exchange).
  @Column({ name: 'response_data', type: 'jsonb', default: () => "'{}'" })
  responseData: Record<string, any>;

  // Historial por pantalla: [{ screen, data, at }] para auditoría.
  @Column({ name: 'screen_history', type: 'jsonb', default: () => "'[]'" })
  screenHistory: Array<{ screen: string; data: Record<string, any>; at: string }>;

  // Marca de tiempo de finalización (cuando llega a SUCCESS).
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
