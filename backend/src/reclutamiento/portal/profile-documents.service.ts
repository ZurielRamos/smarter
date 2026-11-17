import { BadRequestException, ConflictException, Injectable, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantAuditService } from '../../audit/tenant-audit.service';
import { ProfileDocument } from '../entities/profile-document.entity';
import { Actor, requireObject } from '../validation';
import { PortalConfigService } from './portal-config.service';
import { PrivateFileService } from './private-file.service';

export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;

/** Tipo real del archivo según sus primeros bytes (no se confía en el nombre ni en el tipo que declara el navegador). */
export function sniffMime(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return { mime: 'application/pdf', ext: 'pdf' };
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  if (buf.length >= 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}

/** Nombre de archivo seguro para guardar y mostrar. */
function safeName(raw: string | undefined, ext: string): string {
  const base = (raw ?? '').split(/[\\/]/).pop() ?? '';
  const cleaned = base.replace(/[^\p{L}\p{N} ._()-]/gu, '_').replace(/\.{2,}/g, '.').trim().slice(0, 120);
  const stem = cleaned.replace(/\.[A-Za-z0-9]{1,5}$/, '') || 'documento';
  return `${stem}.${ext}`;
}

export type DocumentActor = { kind: 'surveyor'; profileId: string } | { kind: 'user'; actor: Actor };

@Injectable()
export class ProfileDocumentsService {
  constructor(
    @InjectRepository(ProfileDocument) private readonly docs: Repository<ProfileDocument>,
    private readonly files: PrivateFileService,
    private readonly portalConfig: PortalConfigService,
    private readonly audit: TenantAuditService,
  ) {}

  list(tenantId: string, profileId: string): Promise<ProfileDocument[]> {
    return this.docs.find({ where: { tenantId, profileId }, order: { createdAt: 'ASC' } });
  }

  private async require(tenantId: string, profileId: string | null, id: string): Promise<ProfileDocument> {
    const qb = this.docs
      .createQueryBuilder('d')
      .addSelect('d.storageKey')
      .where('d.id = :id AND d.tenantId = :tenantId', { id, tenantId });
    if (profileId) qb.andWhere('d.profileId = :profileId', { profileId });
    const doc = await qb.getOne();
    if (!doc) throw new NotFoundException('Documento no encontrado');
    return doc;
  }

  /** Sube o reemplaza el documento de un tipo. Un documento aprobado no se reemplaza. */
  async upload(
    tenantId: string,
    profileId: string,
    docKey: string,
    file: { buffer?: Buffer; originalname?: string; size?: number } | undefined,
    by: DocumentActor,
  ): Promise<ProfileDocument> {
    const cfg = await this.portalConfig.get(tenantId);
    if (!cfg.documents.some((d) => d.key === docKey)) throw new BadRequestException('Ese documento no se solicita');
    if (!file?.buffer || file.buffer.length === 0) throw new BadRequestException('Adjunta un archivo');
    if (file.buffer.length > MAX_DOCUMENT_BYTES) throw new PayloadTooLargeException('El archivo no puede superar 8 MB');
    const kind = sniffMime(file.buffer);
    if (!kind) throw new BadRequestException('Formato no admitido. Sube un PDF o una imagen (JPG, PNG o WebP).');

    const existing = await this.docs
      .createQueryBuilder('d')
      .addSelect('d.storageKey')
      .where('d.tenantId = :tenantId AND d.profileId = :profileId AND d.docKey = :docKey', { tenantId, profileId, docKey })
      .getOne();
    if (existing?.status === 'approved') throw new ConflictException('Este documento ya fue aprobado y no se puede reemplazar.');

    const stored = await this.files.save(tenantId, profileId, file.buffer);
    const fields = {
      fileName: safeName(file.originalname, kind.ext),
      mimeType: kind.mime,
      sizeBytes: file.buffer.length,
      storageKey: stored.storageKey,
      sha256: stored.sha256,
      status: 'pending' as const,
      rejectReason: null,
      reviewedBy: null,
      reviewedAt: null,
    };
    let saved: ProfileDocument;
    try {
      if (existing) {
        const res = await this.docs.update({ id: existing.id, tenantId, status: existing.status }, fields);
        if (!res.affected) throw new ConflictException('El documento cambió mientras se subía. Inténtalo de nuevo.');
        saved = await this.require(tenantId, profileId, existing.id);
      } else {
        saved = await this.docs.save(this.docs.create({ ...fields, tenantId, profileId, docKey }));
      }
    } catch (err) {
      await this.files.remove(stored.storageKey);
      if ((err as { code?: string })?.code === '23505') throw new ConflictException('El documento ya se estaba subiendo. Inténtalo de nuevo.');
      throw err;
    }
    if (existing) await this.files.remove(existing.storageKey);

    await this.audit.log({
      tenantId,
      actorType: by.kind === 'surveyor' ? 'surveyor' : 'user',
      actorId: by.kind === 'surveyor' ? by.profileId : by.actor.id,
      actorLabel: by.kind === 'user' ? by.actor.email : null,
      action: 'reclutamiento.document.upload',
      targetType: 'profile_document',
      targetId: saved.id,
      scopeId: profileId,
      metadata: { docKey, mimeType: kind.mime, sizeBytes: fields.sizeBytes, replaced: !!existing },
    });
    return saved;
  }

  /** Descifra el archivo. `viewer` queda en la auditoría cuando lo consulta el personal de la cuenta. */
  async read(tenantId: string, profileId: string | null, id: string, viewer?: Actor): Promise<{ doc: ProfileDocument; data: Buffer }> {
    const doc = await this.require(tenantId, profileId, id);
    const data = await this.files.read(tenantId, doc.profileId, doc.storageKey);
    if (viewer) {
      await this.audit.log({
        tenantId,
        actorType: 'user',
        actorId: viewer.id,
        actorLabel: viewer.email,
        action: 'reclutamiento.document.view',
        targetType: 'profile_document',
        targetId: doc.id,
        scopeId: doc.profileId,
        metadata: { docKey: doc.docKey },
      });
    }
    return { doc, data };
  }

  /** El encuestador retira un documento que aún no fue aprobado. */
  async removeByContact(tenantId: string, profileId: string, id: string): Promise<{ success: true }> {
    const doc = await this.require(tenantId, profileId, id);
    if (doc.status === 'approved') throw new ConflictException('Este documento ya fue aprobado y no se puede eliminar.');
    const res = await this.docs.delete({ id, tenantId, profileId, status: doc.status });
    if (!res.affected) throw new ConflictException('El documento cambió mientras se procesaba. Inténtalo de nuevo.');
    await this.files.remove(doc.storageKey);
    await this.audit.log({
      tenantId,
      actorType: 'surveyor',
      actorId: profileId,
      action: 'reclutamiento.document.delete',
      targetType: 'profile_document',
      targetId: id,
      scopeId: profileId,
      metadata: { docKey: doc.docKey },
    });
    return { success: true };
  }

  async review(tenantId: string, actor: Actor, id: string, body: Record<string, unknown>): Promise<ProfileDocument> {
    const input = requireObject(body, 'La revisión');
    const decision = input.decision;
    if (decision !== 'approve' && decision !== 'reject') throw new BadRequestException('La decisión debe ser aprobar o rechazar');
    const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
    if (decision === 'reject' && (reason.length < 3 || reason.length > 500)) {
      throw new BadRequestException('Explica el motivo del rechazo (entre 3 y 500 caracteres) para que el encuestador sepa qué corregir');
    }
    const doc = await this.require(tenantId, null, id);
    const status = decision === 'approve' ? 'approved' : 'rejected';
    const res = await this.docs.update(
      { id, tenantId, sha256: doc.sha256 },
      { status, rejectReason: decision === 'reject' ? reason : null, reviewedBy: actor.id, reviewedAt: new Date() },
    );
    // Si el encuestador subió otro archivo entre tanto, la revisión ya no corresponde.
    if (!res.affected) throw new ConflictException('El documento cambió mientras lo revisabas. Revísalo de nuevo.');
    await this.audit.log({
      tenantId,
      actorType: 'user',
      actorId: actor.id,
      actorLabel: actor.email,
      action: `reclutamiento.document.${decision}`,
      targetType: 'profile_document',
      targetId: id,
      scopeId: doc.profileId,
      metadata: { docKey: doc.docKey },
    });
    return this.require(tenantId, null, id);
  }
}
