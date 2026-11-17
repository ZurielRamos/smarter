import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export const DOCUMENT_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

/**
 * Documento que sube el encuestador (cédula, certificado bancario...). El
 * archivo se guarda CIFRADO (AES-256-GCM) en el storage; la clave de objeto no
 * es pública. Hay un documento vigente por tipo (`docKey`) y perfil.
 */
@Entity('profile_documents')
@Index(['tenantId', 'profileId'])
@Index(['profileId', 'docKey'], { unique: true })
export class ProfileDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'profile_id', type: 'uuid' })
  profileId: string;

  /** Tipo de documento definido en la configuración del portal. */
  @Column({ name: 'doc_key', type: 'varchar', length: 40 })
  docKey: string;

  @Column({ name: 'file_name', type: 'varchar', length: 200 })
  fileName: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 100 })
  mimeType: string;

  @Column({ name: 'size_bytes', type: 'integer' })
  sizeBytes: number;

  /** Clave del objeto cifrado en el storage. */
  @Column({ name: 'storage_key', type: 'varchar', length: 300, select: false })
  storageKey: string;

  /** SHA-256 del archivo original. */
  @Column({ type: 'varchar', length: 64 })
  sha256: string;

  // pending | approved | rejected
  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: DocumentStatus;

  @Column({ name: 'reject_reason', type: 'text', nullable: true })
  rejectReason: string | null;

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
