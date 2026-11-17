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
import { Tenant } from '../../tenants/tenant.entity';
import { ContactProfile } from './contact-profile.entity';

export const CONTRACT_STATUSES = ['draft', 'active', 'ended'] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export type SignatureStatus = 'unsigned' | 'signed';

/** Cláusula ya redactada (texto final, sin variables) guardada con el contrato. */
export interface RenderedClause {
  key: string;
  number: number;
  title: string;
  body: string;
}

export interface SignatureEvidence {
  method: string;
  reference?: string;
  notes?: string;
  witnessName?: string;
  registeredBy: string;
  registeredAt: string;
  /** Huella del contenido que se firmó. */
  contentHash: string;
  /** Quién firmó: el administrador registró la firma o el contratista aceptó en el portal. */
  signedBy?: 'admin' | 'contractor_portal';
  /** Datos de la aceptación en el portal. */
  ip?: string;
  userAgent?: string;
  verifiedChannel?: string;
  verifiedDestination?: string;
}

const numericTransformer = {
  to: (v: number | null) => v,
  from: (v: string | null) => (v === null || v === undefined ? null : parseFloat(v)),
};

/**
 * Contrato de prestación de servicios entre la cuenta reclutadora y un
 * encuestador. Solo es editable en estado `draft`; un contrato activo solo
 * puede terminarse (los cambios de tarifa se hacen con un contrato nuevo, para
 * conservar el historial de lo pactado).
 */
@Entity('surveyor_contracts')
@Index(['tenantId'])
@Index(['tenantId', 'profileId'])
@Index('uq_surveyor_contracts_number', ['tenantId', 'contractNumber'], { unique: true, where: `"contract_number" IS NOT NULL` })
// A lo sumo un contrato ACTIVO por perfil (índice parcial).
@Index('uq_surveyor_contracts_one_active', ['profileId'], { unique: true, where: `"status" = 'active'` })
export class SurveyorContract {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ name: 'profile_id', type: 'uuid' })
  profileId: string;

  @ManyToOne(() => ContactProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'profile_id' })
  profile: ContactProfile;

  /** País del contrato (ISO 3166-1 alfa-2). */
  @Column({ name: 'country_code', type: 'varchar', length: 2 })
  countryCode: string;

  @Column({ name: 'start_date', type: 'date' })
  startDate: string;

  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate: string | null;

  /** Tarifa por defecto por respuesta aprobada. */
  @Column({ name: 'default_rate', type: 'decimal', precision: 14, scale: 2, transformer: numericTransformer })
  defaultRate: number;

  /** Moneda (ISO 4217). */
  @Column({ type: 'varchar', length: 3 })
  currency: string;

  // draft | active | ended
  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: ContractStatus;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  // ── Contrato generado desde una plantilla (todos nulos en contratos manuales) ──

  /** Plantilla y versión de origen. El texto vive en `renderedClauses`: es una copia congelada. */
  @Column({ name: 'template_id', type: 'uuid', nullable: true })
  templateId: string | null;

  @Column({ name: 'template_name', type: 'varchar', length: 200, nullable: true })
  templateName: string | null;

  @Column({ name: 'template_version', type: 'integer', nullable: true })
  templateVersion: number | null;

  @Column({ name: 'contract_type', type: 'varchar', length: 40, nullable: true })
  contractType: string | null;

  @Column({ name: 'language_code', type: 'varchar', length: 5, nullable: true })
  languageCode: string | null;

  /** Consecutivo legible, único por cuenta (p. ej. CT-2026-0007). */
  @Column({ name: 'contract_number', type: 'varchar', length: 40, nullable: true })
  contractNumber: string | null;

  @Column({ name: 'issue_date', type: 'date', nullable: true })
  issueDate: string | null;

  /** Valores capturados al generar el contrato (variables y datos del contratista). */
  @Column({ name: 'variable_values', type: 'jsonb', nullable: true })
  variableValues: Record<string, any> | null;

  /** Parámetros legales vigentes cuando se generó el contrato. */
  @Column({ name: 'legal_config', type: 'jsonb', nullable: true })
  legalConfig: Record<string, any> | null;

  /** Datos de las partes tal como quedaron en el documento. */
  @Column({ name: 'parties_snapshot', type: 'jsonb', nullable: true })
  partiesSnapshot: Record<string, any> | null;

  @Column({ name: 'rendered_clauses', type: 'jsonb', nullable: true })
  renderedClauses: RenderedClause[] | null;

  /** SHA-256 del contenido: permite comprobar que el documento no cambió. */
  @Column({ name: 'content_hash', type: 'varchar', length: 64, nullable: true })
  contentHash: string | null;

  /** Cuándo se puso el contrato a disposición del contratista en el portal. */
  @Column({ name: 'sent_to_contact_at', type: 'timestamptz', nullable: true })
  sentToContactAt: Date | null;

  // unsigned | signed
  @Column({ name: 'signature_status', type: 'varchar', length: 20, default: 'unsigned' })
  signatureStatus: SignatureStatus;

  @Column({ name: 'signed_at', type: 'date', nullable: true })
  signedAt: string | null;

  @Column({ name: 'signature_evidence', type: 'jsonb', nullable: true })
  signatureEvidence: SignatureEvidence | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
