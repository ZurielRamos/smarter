import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Registro de borrados para la sincronización incremental: los clientes
 * offline no pueden "ver" una fila que ya no existe, así que se les informa.
 *
 * - `conversation`: la conversación (y sus mensajes) se eliminó.
 * - `messages_cleared`: se vació la conversación pero sigue existiendo.
 */
@Entity('sync_tombstones')
@Index(['tenantId', 'createdAt'])
export class SyncTombstone {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ type: 'varchar', length: 20 })
  kind: 'conversation' | 'messages_cleared';

  @Column({ name: 'entity_id', type: 'uuid' })
  entityId: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
