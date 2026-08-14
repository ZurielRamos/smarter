import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { EmailTemplate } from './email-template.entity';

@Entity('email_template_translations')
@Index(['templateId', 'language'])
@Unique(['templateId', 'language'])
export class EmailTemplateTranslation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'template_id', type: 'uuid' })
  templateId: string;

  @ManyToOne(() => EmailTemplate, (t) => t.translations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'template_id' })
  template: EmailTemplate;

  @Column({ type: 'varchar', length: 10 })
  language: string; // ISO 639-1: es, en, pt, fr, de...

  @Column({ type: 'varchar', length: 500 })
  subject: string;

  @Column({ type: 'jsonb', nullable: true })
  blocks: any[] | null; // Email builder block structure

  @Column({ type: 'text' })
  html: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
