import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';

@Entity('custom_fields')
export class CustomField {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ name: 'field_key', type: 'varchar', length: 50 })
  fieldKey: string;

  @Column({ name: 'field_label', type: 'varchar', length: 100 })
  fieldLabel: string;

  @Column({ name: 'field_type', type: 'varchar', length: 20 })
  fieldType: string; // text, number, date, select, boolean, url

  @Column({ type: 'jsonb', nullable: true })
  options: string[] | null; // for select type

  @Column({ name: 'is_required', type: 'boolean', default: false })
  isRequired: boolean;

  @Column({ name: 'is_system', type: 'boolean', default: false })
  isSystem: boolean;

  @Column({ name: 'is_unique', type: 'boolean', default: false })
  isUnique: boolean;

  @Column({ name: 'is_nullable', type: 'boolean', default: true })
  isNullable: boolean;

  @Column({ name: 'default_value', type: 'varchar', nullable: true })
  defaultValue: string | null;

  @Column({ type: 'jsonb', nullable: true })
  validations: Record<string, any> | null;

  @Column({ name: 'field_group', type: 'varchar', length: 50, default: 'general' })
  fieldGroup: string; // identificacion, contacto, ubicacion, segmentacion, consentimiento, actividad, general

  @Column({ name: 'sort_order', type: 'integer', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
