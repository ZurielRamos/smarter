import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Un inicio de flujo en una conversación y qué lo disparó. Sirve para la regla
 * de frecuencia («una vez por contacto cada N días») y para las estadísticas
 * de inicios por disparador.
 */
@Entity('flow_starts')
@Index('idx_flow_starts_flow_record', ['flowId', 'recordId', 'createdAt'])
@Index('idx_flow_starts_flow_conversation', [
  'flowId',
  'conversationId',
  'createdAt',
])
@Index('idx_flow_starts_flow_created', ['flowId', 'createdAt'])
export class FlowStart {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'flow_id', type: 'uuid' })
  flowId: string;

  @Column({ name: 'conversation_id', type: 'uuid' })
  conversationId: string;

  /** Contacto del CRM; la frecuencia se cuenta por contacto si existe */
  @Column({ name: 'record_id', type: 'uuid', nullable: true })
  recordId: string | null;

  /** keyword | new_conversation | template_reply | ad_click | campaign | subflow | manual */
  @Column({ name: 'source', type: 'varchar', length: 24 })
  source: string;

  /** Id del disparador dentro del flujo, o de la campaña */
  @Column({ name: 'source_ref', type: 'varchar', length: 64, nullable: true })
  sourceRef: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
