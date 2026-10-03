import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Tenant } from '../../tenants/tenant.entity';
import { Inbox } from '../../chats/inbox.entity';

/**
 * Definición de un WhatsApp Flow publicado en Meta, vinculada al tenant.
 *
 * Guarda los metadatos del Flow (id de Meta, nombre, estado, categorías) y,
 * opcionalmente, el JSON de pantallas/routing para referencia. Un tenant
 * puede tener varios Flows; cada uno pertenece a un Inbox de WhatsApp.
 */
@Entity('whatsapp_flows')
@Index(['tenantId'])
@Index(['metaFlowId'])
export class WhatsAppFlow {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  // Inbox de WhatsApp al que pertenece el Flow (opcional hasta vincularlo).
  @Column({ name: 'inbox_id', type: 'uuid', nullable: true })
  inboxId: string | null;

  @ManyToOne(() => Inbox, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'inbox_id' })
  inbox: Inbox | null;

  // ID del Flow en Meta (el que aparece en el Administrador de WhatsApp).
  @Column({ name: 'meta_flow_id', type: 'varchar', nullable: true })
  metaFlowId: string | null;

  // Nombre legible del Flow (p. ej. "lubricante_b2b").
  @Column({ type: 'varchar', length: 150 })
  name: string;

  // draft | published | deprecated | throttled | blocked
  @Column({ type: 'varchar', length: 30, default: 'draft' })
  status: string;

  // Categorías declaradas en Meta (SURVEY, LEAD_GENERATION, etc.).
  @Column({ type: 'jsonb', nullable: true })
  categories: string[] | null;

  // Versión del data_api_version declarada en el JSON del Flow.
  @Column({ name: 'data_api_version', type: 'varchar', length: 10, nullable: true })
  dataApiVersion: string | null;

  // Pantalla inicial del routing model.
  @Column({ name: 'entry_screen', type: 'varchar', length: 100, nullable: true })
  entryScreen: string | null;

  // JSON completo del Flow (pantallas, routing) para referencia/edición.
  @Column({ name: 'flow_json', type: 'jsonb', nullable: true })
  flowJson: Record<string, any> | null;

  // Metadata libre (quién lo creó, notas, etc.).
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
