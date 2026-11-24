import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Tenant } from '../../tenants/tenant.entity';

export const ORGANIZATION_TYPES = ['client', 'establishment', 'other'] as const;
export type OrganizationType = (typeof ORGANIZATION_TYPES)[number];

export const ORGANIZATION_SIZES = ['micro', 'small', 'medium', 'large'] as const;
export type OrganizationSize = (typeof ORGANIZATION_SIZES)[number];

export const EMPLOYEE_RANGES = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5001+'] as const;
export type EmployeeRange = (typeof EMPLOYEE_RANGES)[number];

export interface OrganizationPhone {
  number: string;
  /** Etiqueta libre: oficina, WhatsApp, gerencia… */
  label?: string | null;
}

export const ORGANIZATION_STATUSES = ['active', 'inactive'] as const;
export type OrganizationStatus = (typeof ORGANIZATION_STATUSES)[number];

/**
 * Empresa o establecimiento de una cuenta. Una cadena es una empresa sin
 * `parentId` y cada sucursal apunta a ella con `parentId`.
 *
 * El documento (NIT, RUC, etc.) es único por cuenta cuando existe. El índice es
 * parcial: ignora empresas sin documento y empresas eliminadas, para que un
 * documento se pueda reutilizar después de borrar la empresa que lo tenía.
 */
@Entity('organizations')
@Index(['tenantId'])
@Index(['tenantId', 'parentId'])
@Index(['tenantId', 'type'])
@Index(['tenantId', 'city'])
@Index('uq_organizations_tenant_document', ['tenantId', 'documentNumber'], {
  unique: true,
  where: '"document_number" IS NOT NULL AND "deleted_at" IS NULL',
})
export class Organization {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  /** Empresa matriz (cadena). Debe ser de la misma cuenta. */
  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId: string | null;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'varchar', length: 20, default: 'establishment' })
  type: OrganizationType;

  /** Razón social, cuando difiere del nombre comercial (`name`). */
  @Column({ name: 'legal_name', type: 'varchar', length: 200, nullable: true })
  legalName: string | null;

  /** Sector o categoría (por ejemplo, supermercado, farmacia, construcción). */
  @Column({ type: 'varchar', length: 100, nullable: true })
  industry: string | null;

  /** Tamaño de la empresa. */
  @Column({ type: 'varchar', length: 10, nullable: true })
  size: OrganizationSize | null;

  @Column({ name: 'employee_range', type: 'varchar', length: 10, nullable: true })
  employeeRange: EmployeeRange | null;

  @Column({ name: 'document_type', type: 'varchar', length: 20, nullable: true })
  documentType: string | null;

  @Column({ name: 'document_number', type: 'varchar', length: 50, nullable: true })
  documentNumber: string | null;

  @Column({ type: 'jsonb', nullable: true })
  phones: OrganizationPhone[] | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  website: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  address: string | null;

  @Column({ name: 'postal_code', type: 'varchar', length: 20, nullable: true })
  postalCode: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  region: string | null;

  @Column({ name: 'country_code', type: 'varchar', length: 2, nullable: true })
  countryCode: string | null;

  @Column({ type: 'double precision', nullable: true })
  lat: number | null;

  @Column({ type: 'double precision', nullable: true })
  lng: number | null;

  /** Horario de atención, en texto libre (útil para planear visitas). */
  @Column({ name: 'opening_hours', type: 'varchar', length: 300, nullable: true })
  openingHours: string | null;

  @Column({ type: 'jsonb', nullable: true })
  tags: string[] | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: OrganizationStatus;

  @Column({ name: 'custom_data', type: 'jsonb', nullable: true })
  customData: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
