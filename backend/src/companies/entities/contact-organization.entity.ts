import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export const CONTACT_ORG_ROLES = ['owner', 'manager', 'employee', 'other'] as const;
export type ContactOrgRole = (typeof CONTACT_ORG_ROLES)[number];

/**
 * Vínculo entre un contacto del CRM y una empresa. Un contacto puede estar en
 * varias empresas y una empresa tiene varios contactos. El mismo contacto puede
 * repetirse en una empresa solo con roles distintos.
 */
@Entity('contact_organizations')
@Index(['tenantId', 'organizationId'])
@Index(['tenantId', 'recordId'])
@Index('uq_contact_organizations_link', ['recordId', 'organizationId', 'role'], { unique: true })
export class ContactOrganization {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'record_id', type: 'uuid' })
  recordId: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @Column({ type: 'varchar', length: 20, default: 'employee' })
  role: ContactOrgRole;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
