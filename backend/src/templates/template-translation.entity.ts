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
import { Template } from './template.entity';

@Entity('template_translations')
@Index(['templateId', 'language'])
@Unique(['templateId', 'language'])
export class TemplateTranslation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'template_id', type: 'uuid' })
  templateId: string;

  @ManyToOne(() => Template, (t) => t.translations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'template_id' })
  template: Template;

  @Column({ type: 'varchar', length: 10 })
  language: string; // ISO 639-1: es, en, pt, fr, de...

  // === Email fields ===
  @Column({ type: 'varchar', length: 500, nullable: true })
  subject: string | null;

  @Column({ type: 'jsonb', nullable: true })
  blocks: any[] | null; // Email builder block structure

  @Column({ type: 'text', nullable: true })
  html: string | null;

  // === SMS & Call fields ===
  @Column({ type: 'text', nullable: true })
  body: string | null; // Text content for SMS and TTS for calls

  // === Call-specific fields ===
  @Column({ type: 'varchar', length: 50, nullable: true })
  voice: string | null; // TTS voice: Mariana, Penelope, etc.

  @Column({ name: 'audio_code', type: 'varchar', nullable: true })
  audioCode: string | null; // Pre-recorded audio ID (Onurix)

  // === WhatsApp fields ===
  @Column({ name: 'whatsapp_components', type: 'jsonb', nullable: true })
  whatsappComponents: any[] | null; // WhatsApp template components structure

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
