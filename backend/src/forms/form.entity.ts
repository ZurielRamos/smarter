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
import { Inbox } from '../chats/inbox.entity';

export interface FormField {
  id: string;
  type: 'text' | 'email' | 'phone' | 'number' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'date' | 'file' | 'heading' | 'paragraph';
  label: string;
  placeholder?: string;
  required: boolean;
  options?: string[]; // For select, radio, checkbox
  mapTo?: string; // Map to contact field: firstName, lastName, phone, email, or custom_data key
  validation?: {
    minLength?: number;
    maxLength?: number;
    pattern?: string;
  };
  width?: 'full' | 'half'; // Layout
  order: number;
}

export interface FormStyle {
  primaryColor?: string;
  backgroundColor?: string;
  fontFamily?: string;
  borderRadius?: string;
  buttonText?: string;
  successMessage?: string;
  logoUrl?: string;
}

@Entity('forms')
@Index(['tenantId'])
@Index(['inboxId'])
export class Form {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ name: 'inbox_id', type: 'uuid', nullable: true })
  inboxId: string | null;

  @ManyToOne(() => Inbox, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'inbox_id' })
  inbox: Inbox | null;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  // Form fields configuration
  @Column({ type: 'jsonb', default: [] })
  fields: FormField[];

  // Visual customization
  @Column({ type: 'jsonb', nullable: true })
  style: FormStyle | null;

  // published | draft | archived
  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: string;

  // Public slug for the form URL
  @Column({ type: 'varchar', length: 100, unique: true, nullable: true })
  slug: string | null;

  @Column({ name: 'submission_count', type: 'integer', default: 0 })
  submissionCount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
