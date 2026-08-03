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
import { Tenant } from '../tenants/tenant.entity';

@Entity('record_lists')
@Index(['tenantId'])
export class RecordList {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  // 'static' = manual records, 'dynamic' = filter-based
  @Column({ type: 'varchar', length: 20, default: 'static' })
  type: 'static' | 'dynamic';

  // For dynamic lists: filter configuration (supports nested groups)
  // { groups: [{ logic: 'and'|'or', conditions: [{ field, operator, value }] }], groupLogic: 'and'|'or' }
  @Column({ type: 'jsonb', nullable: true })
  filters: {
    groups: { logic: 'and' | 'or'; conditions: { field: string; operator: string; value: string }[] }[];
    groupLogic: 'and' | 'or';
  } | {
    logic: 'and' | 'or';
    conditions: { field: string; operator: string; value: string }[];
  } | null;

  // For static lists: array of record IDs
  @Column({ name: 'record_ids', type: 'jsonb', nullable: true })
  recordIds: string[] | null;

  @Column({ type: 'varchar', nullable: true })
  color: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
