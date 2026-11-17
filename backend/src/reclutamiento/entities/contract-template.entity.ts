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

export const TEMPLATE_STATUSES = ['draft', 'published', 'archived'] as const;
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];

/**
 * Plantilla de contrato de una cuenta reclutadora.
 *
 * El contrato es solo el texto (`body`), con variables «{{contacto.ciudad}}».
 * Las columnas company, clauses, variables, legalConfig, requiredPartyFields,
 * legalReview, contractType y currency pertenecen al modelo anterior: ya no se
 * usan, pero se conservan para no perder datos al sincronizar el esquema.
 *
 * Una plantilla publicada es INMUTABLE: para cambiarla se crea una nueva versión
 * (misma `familyId`, `version` + 1). Los contratos generados guardan una copia
 * del texto, de modo que cambiar o archivar una plantilla nunca altera un
 * contrato ya emitido.
 */
@Entity('contract_templates')
@Index(['tenantId'])
@Index(['tenantId', 'status'])
@Index(['tenantId', 'countryCode'])
@Index(['tenantId', 'familyId', 'version'], { unique: true })
export class ContractTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  /** Agrupa las versiones de una misma plantilla. */
  @Column({ name: 'family_id', type: 'uuid' })
  familyId: string;

  @Column({ type: 'integer', default: 1 })
  version: number;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** País de aplicación (ISO 3166-1 alfa-2). */
  @Column({ name: 'country_code', type: 'varchar', length: 2 })
  countryCode: string;

  @Column({ name: 'language_code', type: 'varchar', length: 5, default: 'es' })
  languageCode: string;

  @Column({ name: 'contract_type', type: 'varchar', length: 40, default: 'service_provision' })
  contractType: string;

  /** Texto del contrato con variables. */
  @Column({ type: 'text', default: '' })
  body: string;

  /** @deprecated modelo anterior; sin uso. */
  @Column({ type: 'varchar', length: 3, nullable: true })
  currency: string | null;

  /** Prefijo de la numeración de los contratos de esta plantilla (p. ej. «CT»). */
  @Column({ name: 'contract_prefix', type: 'varchar', length: 10, nullable: true })
  contractPrefix: string | null;

  /** @deprecated modelo anterior. */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  company: Record<string, any>;

  // draft | published | archived
  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: TemplateStatus;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  clauses: any[];

  /** @deprecated modelo anterior. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  variables: any[];

  /** @deprecated modelo anterior. */
  @Column({ name: 'legal_config', type: 'jsonb', default: () => "'{}'" })
  legalConfig: Record<string, any>;

  /** @deprecated modelo anterior. */
  @Column({ name: 'required_party_fields', type: 'jsonb', default: () => "'[]'" })
  requiredPartyFields: string[];

  /** @deprecated modelo anterior. */
  @Column({ name: 'legal_review', type: 'jsonb', nullable: true })
  legalReview: Record<string, any> | null;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @Column({ name: 'published_by', type: 'uuid', nullable: true })
  publishedBy: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
