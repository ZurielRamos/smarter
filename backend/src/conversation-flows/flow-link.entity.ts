import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Conversation } from '../chats/conversation.entity';

/**
 * Enlace corto con seguimiento de clics. Se crea cada vez que un flujo envía un
 * botón de enlace con «Rastrear clics» activo. El contacto recibe
 * `<origen público>/webhooks/l/<code>`; al abrirlo el servidor registra el clic,
 * redirige al destino real y puede continuar el flujo por la salida
 * «Al hacer clic» del nodo.
 */
@Entity('flow_links')
@Index(['code'], { unique: true })
@Index(['conversationId'])
export class FlowLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Código aleatorio no adivinable (96 bits) que va en la URL corta. */
  @Column({ type: 'varchar', length: 16 })
  code: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'conversation_id', type: 'uuid' })
  conversationId: string;

  @ManyToOne(() => Conversation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation: Conversation;

  @Column({ name: 'flow_id', type: 'uuid' })
  flowId: string;

  @Column({ name: 'node_id', type: 'varchar', length: 64 })
  nodeId: string;

  @Column({ name: 'button_id', type: 'varchar', length: 64 })
  buttonId: string;

  /** Título del botón en el momento del envío (para notas y reportes). */
  @Column({ type: 'varchar', length: 64 })
  title: string;

  /** Destino real. Solo se redirige a lo guardado aquí, nunca a un parámetro de la URL. */
  @Column({ type: 'text' })
  url: string;

  @Column({ name: 'click_count', type: 'int', default: 0 })
  clickCount: number;

  @Column({ name: 'first_click_at', type: 'timestamptz', nullable: true })
  firstClickAt: Date | null;

  @Column({ name: 'last_click_at', type: 'timestamptz', nullable: true })
  lastClickAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
