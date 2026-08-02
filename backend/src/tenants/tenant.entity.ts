import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // === IDENTIDAD ===
  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  slug: string;

  @Column({ name: 'icon_path', type: 'varchar', nullable: true })
  iconPath: string;

  // === ESTADO ===
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  // === CONFIGURACIÓN ===
  @Column({ name: 'table_config', type: 'jsonb', nullable: true })
  tableConfig: Record<string, any> | null;

  // === AUDITORÍA ===
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
