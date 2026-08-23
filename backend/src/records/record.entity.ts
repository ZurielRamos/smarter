import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';

@Entity('clients')
@Index(['status'])
@Index(['channelSource'])
@Index(['tenantId'])
@Index(['createdAt'])
@Index(['tenantId', 'createdAt'])
@Index(['tenantId', 'phone'])
@Index(['tenantId', 'email'])
@Index(['tenantId', 'documentNumber'])
@Index(['tenantId', 'city'])
@Index(['tenantId', 'region'])
@Index(['tenantId', 'score'])
@Index(['tenantId', 'assignedTo'])
export class ClientRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // === TENANT ===
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  // === IDENTIFICACIÓN ===
  @Column({ name: 'avatar_url', type: 'varchar', nullable: true })
  avatarUrl: string; // URL de la foto de perfil del contacto

  @Column({ name: 'first_name', type: 'varchar', nullable: true })
  firstName: string;

  @Column({ name: 'last_name', type: 'varchar', nullable: true })
  lastName: string;

  @Column({ name: 'full_name', type: 'varchar', nullable: true })
  fullName: string;

  @Column({ name: 'document_type', type: 'varchar', length: 20, nullable: true })
  documentType: string; // CC, CE, NIT, TI, pasaporte, RUT

  @Column({ name: 'document_number', type: 'varchar', nullable: true })
  documentNumber: string;

  @Column({ type: 'varchar', nullable: true })
  company: string;

  @Column({ name: 'job_title', type: 'varchar', nullable: true })
  jobTitle: string;

  @Column({ type: 'varchar', nullable: true })
  phone: string;

  @Column({ name: 'country_code', type: 'varchar', length: 5, nullable: true })
  countryCode: string; // +57, +1, +52

  @Column({ type: 'varchar', nullable: true })
  email: string;

  @Column({ type: 'varchar', nullable: true })
  website: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  gender: string; // male, female, other, prefer_not_to_say

  @Column({ name: 'birth_date', type: 'date', nullable: true })
  birthDate: Date;

  // === UBICACIÓN ===
  @Column({ type: 'varchar', nullable: true })
  city: string;

  @Column({ type: 'varchar', nullable: true })
  region: string; // departamento, estado, provincia

  @Column({ type: 'varchar', nullable: true })
  address: string;

  // === ESTADO Y SEGMENTACIÓN ===
  @Column({ type: 'varchar', default: 'lead' })
  status: string; // lead, contactado, interesado, oportunidad, cliente, premium, fidelizado, inactivo, perdido

  @Column({ name: 'channel_source', type: 'varchar', nullable: true })
  channelSource: string; // whatsapp, web, import, manual

  @Column({ type: 'varchar', nullable: true })
  source: string; // fuente granular: nombre de campaña, formulario, referido, etc.

  @Column({ type: 'integer', default: 0 })
  score: number; // lead scoring 0-100

  // === PREFERENCIAS ===
  @Column({ type: 'varchar', length: 10, default: 'es' })
  language: string; // ISO 639-1: es, en, pt, fr, de...

  // === CONSENTIMIENTO ===
  @Column({ name: 'opt_in_whatsapp', type: 'boolean', default: true })
  optInWhatsapp: boolean;

  @Column({ name: 'opt_in_email', type: 'boolean', default: true })
  optInEmail: boolean;

  // === ASIGNACIÓN ===
  @Column({ name: 'assigned_to', type: 'uuid', nullable: true })
  assignedTo: string; // user ID del agente asignado

  @Column({ name: 'assigned_team_id', type: 'uuid', nullable: true })
  assignedTeamId: string; // team ID del equipo asignado

  // === ACTIVIDAD ===
  @Column({ name: 'last_contact_at', type: 'timestamp', nullable: true })
  lastContactAt: Date;

  @Column({ name: 'last_activity_at', type: 'timestamp', nullable: true })
  lastActivityAt: Date;

  // === SOFT DELETE ===
  @Column({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt: Date | null;

  // === ETIQUETAS Y DATOS CUSTOM ===
  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'jsonb', nullable: true })
  tags: string[];

  @Column({ name: 'custom_data', type: 'jsonb', nullable: true })
  customData: Record<string, any>;

  // === AD TRACKING ===
  @Column({ name: 'has_ad_tracking', type: 'boolean', default: false })
  hasAdTracking: boolean;

  /** First ad platform that brought this contact */
  @Column({ name: 'ad_first_platform', type: 'varchar', length: 20, nullable: true })
  adFirstPlatform: string | null;

  /** Last (most recent) ad platform */
  @Column({ name: 'ad_last_platform', type: 'varchar', length: 20, nullable: true })
  adLastPlatform: string | null;

  /** Number of ad touchpoints for this contact */
  @Column({ name: 'ad_touchpoints', type: 'integer', default: 0 })
  adTouchpoints: number;

  // === AUDITORÍA ===
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
