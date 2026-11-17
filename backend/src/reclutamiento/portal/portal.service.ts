import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientRecord } from '../../records/record.entity';
import { TenantAuditService } from '../../audit/tenant-audit.service';
import { ContractsService } from '../contracts.service';
import { SurveyorContract } from '../entities/surveyor-contract.entity';
import { PortalAuthService, PortalSession, OtpChannel, maskDestination } from './portal-auth.service';
import { PortalConfigService } from './portal-config.service';
import { PortalFieldDef, normalizeFieldValue, readFieldValue } from './portal-fields';
import { ProfileDocumentsService } from './profile-documents.service';

/** Lo que el encuestador hace en el portal, siempre sobre SU perfil (viene de la sesión, nunca del cliente). */
@Injectable()
export class PortalService {
  constructor(
    @InjectRepository(ClientRecord) private readonly records: Repository<ClientRecord>,
    @InjectRepository(SurveyorContract) private readonly contractRepo: Repository<SurveyorContract>,
    private readonly auth: PortalAuthService,
    private readonly portalConfig: PortalConfigService,
    private readonly documents: ProfileDocumentsService,
    private readonly contracts: ContractsService,
    private readonly audit: TenantAuditService,
  ) {}

  private async requireRecord(session: PortalSession): Promise<ClientRecord> {
    const record = await this.records.findOne({ where: { id: session.profile.recordId, tenantId: session.tenant.id } });
    if (!record || record.deletedAt) throw new NotFoundException('No encontramos tu ficha');
    return record;
  }

  private hasSignedContract(tenantId: string, profileId: string): Promise<boolean> {
    return this.contractRepo.exists({ where: { tenantId, profileId, signatureStatus: 'signed' } });
  }

  /** Datos que el encuestador debe revisar o completar, documentos y contratos. */
  async me(session: PortalSession) {
    const { tenant, profile } = session;
    const [cfg, catalog, record, docs, contracts, signed] = await Promise.all([
      this.portalConfig.get(tenant.id),
      this.portalConfig.fieldCatalog(tenant.id),
      this.requireRecord(session),
      this.documents.list(tenant.id, profile.id),
      this.contracts.listForPortal(tenant.id, profile.id),
      this.hasSignedContract(tenant.id, profile.id),
    ]);
    const byKey = new Map(catalog.map((f) => [f.key, f]));

    const fields = cfg.fields
      .map((f) => {
        const def = byKey.get(f.key);
        if (!def) return null;
        return {
          key: def.key,
          label: def.label,
          type: def.type,
          options: def.options,
          suggestions: def.suggestions,
          maxLength: def.maxLength,
          required: f.required,
          value: readFieldValue(record, def),
          locked: !!def.lockedWhenSigned && signed,
        };
      })
      .filter((f): f is NonNullable<typeof f> => !!f);

    const documentItems = cfg.documents.map((d) => {
      const doc = docs.find((x) => x.docKey === d.key);
      return {
        key: d.key,
        label: d.label,
        help: d.help,
        required: d.required,
        current: doc
          ? { id: doc.id, fileName: doc.fileName, mimeType: doc.mimeType, sizeBytes: doc.sizeBytes, status: doc.status, rejectReason: doc.rejectReason, uploadedAt: doc.updatedAt }
          : null,
      };
    });

    return {
      tenant: { name: tenant.name, slug: tenant.slug },
      welcomeMessage: cfg.welcomeMessage,
      profile: {
        status: profile.status,
        name: record.fullName || [record.firstName, record.lastName].filter(Boolean).join(' ') || null,
        email: record.email || null,
        phone: record.phone || null,
      },
      verificationChannel: cfg.verification.channel,
      fields,
      documents: documentItems,
      contracts,
      progress: {
        missingFields: fields.filter((f) => f.required && !f.value).length,
        missingDocuments: documentItems.filter((d) => d.required && (!d.current || d.current.status === 'rejected')).length,
        contractsToSign: contracts.filter((c) => c.canSign).length,
      },
    };
  }

  /** Guarda los datos del contacto que el encuestador completó. Solo los campos configurados y no bloqueados. */
  async updateData(session: PortalSession, body: Record<string, unknown>) {
    const { tenant, profile } = session;
    const values = body?.values;
    if (!values || typeof values !== 'object' || Array.isArray(values)) throw new BadRequestException('Envía los datos a guardar');
    const [cfg, catalog, record, signed] = await Promise.all([
      this.portalConfig.get(tenant.id),
      this.portalConfig.fieldCatalog(tenant.id),
      this.requireRecord(session),
      this.hasSignedContract(tenant.id, profile.id),
    ]);
    const defs = new Map<string, PortalFieldDef>(catalog.map((f) => [f.key, f]));
    const configured = new Map(cfg.fields.map((f) => [f.key, f.required]));

    const patch: Record<string, unknown> = {};
    const custom: Record<string, unknown> = { ...(record.customData ?? {}) };
    let customChanged = false;
    const changed: string[] = [];

    for (const [key, raw] of Object.entries(values as Record<string, unknown>)) {
      const def = defs.get(key);
      if (!def || !configured.has(key)) throw new BadRequestException(`El campo «${key}» no se puede modificar desde el portal`);
      if (def.lockedWhenSigned && signed) {
        throw new BadRequestException(`«${def.label}» ya no se puede cambiar porque tienes un contrato firmado. Contacta a quien te contrató.`);
      }
      let value: string;
      try {
        value = normalizeFieldValue(def, raw);
      } catch (e) {
        throw new BadRequestException((e as Error).message);
      }
      if (!value && configured.get(key)) throw new BadRequestException(`«${def.label}» es obligatorio`);

      if (def.source === 'fixed') {
        patch[def.prop as string] = value || null;
      } else {
        customChanged = true;
        if (!value) delete custom[key];
        else custom[key] = def.type === 'number' ? Number(value) : def.type === 'boolean' ? value === 'true' : value;
      }
      changed.push(key);
    }
    if (changed.length === 0) return this.me(session);
    if (customChanged) patch.customData = custom;

    await this.records.update({ id: record.id, tenantId: tenant.id }, patch as any);
    await this.audit.log({
      tenantId: tenant.id,
      actorType: 'surveyor',
      actorId: profile.id,
      action: 'reclutamiento.portal.data_update',
      targetType: 'contact_profile',
      targetId: profile.id,
      scopeId: profile.id,
      metadata: { fields: changed },
    });
    return this.me(session);
  }

  // ───────── Documentos ─────────

  uploadDocument(session: PortalSession, docKey: string, file: { buffer?: Buffer; originalname?: string } | undefined) {
    return this.documents.upload(session.tenant.id, session.profile.id, docKey, file, { kind: 'surveyor', profileId: session.profile.id });
  }

  readDocument(session: PortalSession, id: string) {
    return this.documents.read(session.tenant.id, session.profile.id, id);
  }

  removeDocument(session: PortalSession, id: string) {
    return this.documents.removeByContact(session.tenant.id, session.profile.id, id);
  }

  // ───────── Contratos ─────────

  contractDocument(session: PortalSession, contractId: string) {
    return this.contracts.documentForPortal(session.tenant.id, session.profile.id, contractId);
  }

  /** Envía un código para confirmar la firma de un contrato. */
  async requestSignCode(session: PortalSession, contractId: string, channelRaw: unknown) {
    const { tenant, profile } = session;
    await this.contracts.assertSignableByContact(tenant.id, profile.id, contractId);
    const cfg = await this.portalConfig.get(tenant.id);
    const channel = channelRaw as OtpChannel;
    if (channel !== 'email' && channel !== 'phone') throw new BadRequestException('Canal de verificación inválido');
    if (cfg.verification.channel !== 'both' && cfg.verification.channel !== channel) {
      throw new BadRequestException('Ese canal de verificación no está habilitado');
    }
    const record = await this.requireRecord(session);
    const destination = this.auth.destinationOf(record, channel);
    if (!destination) throw new BadRequestException(channel === 'email' ? 'No tenemos tu correo registrado' : 'No tenemos tu teléfono registrado');
    this.auth.throttleRequests(`sign:${tenant.id}:${profile.id}`);
    return this.auth.issueCode(tenant, cfg, profile.id, 'sign', contractId, channel, destination);
  }

  /** Confirma la firma con el código recibido. */
  async sign(
    session: PortalSession,
    contractId: string,
    body: { otpId?: unknown; code?: unknown; accept?: unknown },
    ctx: { ip?: string; userAgent?: string },
  ) {
    const { tenant, profile } = session;
    if (body?.accept !== true) throw new BadRequestException('Debes aceptar el contrato para firmarlo');
    await this.contracts.assertSignableByContact(tenant.id, profile.id, contractId);
    const otp = await this.auth.consumeCode(tenant.id, body.otpId, body.code, { purpose: 'sign', profileId: profile.id, contractId });
    return this.contracts.signByContact(tenant.id, profile.id, contractId, {
      channel: otp.channel,
      destinationMasked: maskDestination(otp.channel, otp.destination),
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
  }
}
