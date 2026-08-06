import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  BeforeInsert,
} from 'typeorm';
import { UserTenant } from './user-tenant.entity';
import { randomBytes } from 'crypto';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', unique: true })
  email: string;

  @Column({ type: 'varchar', select: false })
  password: string;

  @Column({ name: 'is_super_admin', type: 'boolean', default: false })
  isSuperAdmin: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  /** true si el usuario fue creado por invitación y aún no ha configurado su contraseña */
  @Column({ name: 'needs_password_setup', type: 'boolean', default: false })
  needsPasswordSetup: boolean;

  @Column({ name: 'avatar_path', type: 'varchar', nullable: true })
  avatarPath: string;

  /** Token fijo para acceso a la API */
  @Column({ name: 'api_token', type: 'varchar', unique: true, nullable: true })
  apiToken: string;

  /** Notification preferences: which notification types are enabled */
  @Column({ name: 'notification_preferences', type: 'jsonb', nullable: true })
  notificationPreferences: Record<string, boolean> | null;

  @OneToMany(() => UserTenant, (ut) => ut.user, { eager: true })
  tenantRoles: UserTenant[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @BeforeInsert()
  generateApiToken() {
    if (!this.apiToken) {
      this.apiToken = randomBytes(32).toString('hex');
    }
  }
}
