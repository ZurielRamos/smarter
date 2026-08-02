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

@Entity('mapping_templates')
@Index(['tenantId'])
@Index(['tenantId', 'structureHash'])
export class MappingTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ name: 'structure_hash', type: 'varchar', nullable: true })
  structureHash: string;

  @Column({ name: 'structure_headers', type: 'jsonb', nullable: true })
  structureHeaders: string[];

  @Column({ type: 'jsonb' })
  mapping: Record<string, string[]>;

  @Column({ type: 'jsonb', nullable: true })
  transforms: Record<string, any> | null;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
