import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';
import { TemplateTranslation } from './template-translation.entity';

@Entity('templates')
@Index(['tenantId'])
@Index(['tenantId', 'channel'])
export class Template {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 20 })
  channel: string; // email, sms, whatsapp, llamada

  @Column({ name: 'default_language', type: 'varchar', length: 10, default: 'es' })
  defaultLanguage: string;

  // === WhatsApp-specific fields ===
  @Column({ name: 'whatsapp_template_name', type: 'varchar', nullable: true })
  whatsappTemplateName: string | null;

  @Column({ name: 'whatsapp_meta_id', type: 'varchar', nullable: true })
  whatsappMetaId: string | null;

  @Column({ name: 'whatsapp_category', type: 'varchar', nullable: true })
  whatsappCategory: string | null; // UTILITY, MARKETING, AUTHENTICATION

  @OneToMany(() => TemplateTranslation, (t) => t.template, { cascade: true, eager: true })
  translations: TemplateTranslation[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
