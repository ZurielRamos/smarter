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
import { Inbox } from '../chats/inbox.entity';
import { EmailTemplateTranslation } from './email-template-translation.entity';

@Entity('email_templates')
@Index(['tenantId'])
@Index(['tenantId', 'inboxId'])
export class EmailTemplate {
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

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'default_language', type: 'varchar', length: 10, default: 'es' })
  defaultLanguage: string;

  @OneToMany(() => EmailTemplateTranslation, (t) => t.template, { cascade: true, eager: true })
  translations: EmailTemplateTranslation[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
