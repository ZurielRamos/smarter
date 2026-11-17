import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '../../tenants/tenant.entity';
import { ClientRecord } from '../../records/record.entity';
import { TenantAuditService } from '../../audit/tenant-audit.service';
import { ContactProfile } from '../entities/contact-profile.entity';
import { PortalInvitation } from '../entities/portal-invitation.entity';
import { ProfileDocument } from '../entities/profile-document.entity';
import { Actor } from '../validation';
import { PortalAuthService } from './portal-auth.service';
import { PortalConfigService } from './portal-config.service';
import { PortalMessengerService, fillTemplate } from './portal-messenger.service';

/** Invitar a un encuestador al portal y ver cómo va su proceso. Lado de quien administra la cuenta. */
@Injectable()
export class PortalInvitationsService {
  constructor(
    private readonly config: ConfigService,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    @InjectRepository(ContactProfile) private readonly profiles: Repository<ContactProfile>,
    @InjectRepository(ClientRecord) private readonly records: Repository<ClientRecord>,
    @InjectRepository(PortalInvitation) private readonly invitations: Repository<PortalInvitation>,
    @InjectRepository(ProfileDocument) private readonly docs: Repository<ProfileDocument>,
    private readonly portalConfig: PortalConfigService,
    private readonly auth: PortalAuthService,
    private readonly messenger: PortalMessengerService,
    private readonly audit: TenantAuditService,
  ) {}

  /** Enlace público del portal de una cuenta. */
  portalUrl(slug: string, token?: string): string {
    const base = (this.config.get<string>('FRONTEND_URL') || '').replace(/\/$/, '');
    return `${base}/encuestador/${encodeURIComponent(slug)}${token ? `?i=${encodeURIComponent(token)}` : ''}`;
  }

  async invite(tenantId: string, actor: Actor, profileId: string) {
    const profile = await this.profiles.findOne({ where: { id: profileId, tenantId } });
    if (!profile) throw new NotFoundException('Perfil no encontrado');
    if (profile.status === 'suspended' || profile.status === 'ended') {
      throw new ConflictException('Un encuestador suspendido o terminado no puede entrar al portal.');
    }
    const [tenant, record, cfg] = await Promise.all([
      this.tenants.findOne({ where: { id: tenantId } }),
      this.records.findOne({ where: { id: profile.recordId, tenantId } }),
      this.portalConfig.get(tenantId),
    ]);
    if (!tenant) throw new NotFoundException('Cuenta no encontrada');
    if (!record || record.deletedAt) throw new NotFoundException('El contacto del encuestador ya no existe');

    const email = this.auth.destinationOf(record, 'email');
    const phone = this.auth.destinationOf(record, 'phone');
    const mode = cfg.invitation.channel;
    const wantEmail = mode === 'email' || mode === 'both';
    const wantWhatsapp = mode === 'whatsapp' || mode === 'both';
    if (wantEmail && !wantWhatsapp && !email) throw new BadRequestException('El contacto no tiene correo electrónico');
    if (wantWhatsapp && !wantEmail && !phone) throw new BadRequestException('El contacto no tiene teléfono');
    if (mode === 'both' && !email && !phone) throw new BadRequestException('El contacto no tiene correo ni teléfono');

    const { token, expiresAt, id } = await this.auth.createInvitation(tenantId, profileId, cfg.invitation.expiresDays, actor.id, []);
    const link = this.portalUrl(tenant.slug, token);
    const vars: Record<string, string> = {
      nombre: record.firstName || record.fullName?.split(' ')[0] || 'hola',
      empresa: tenant.name,
      enlace: link,
      dias: String(cfg.invitation.expiresDays),
    };

    const sent: string[] = [];
    const failed: string[] = [];
    if (wantEmail && email) {
      try {
        await this.messenger.sendEmail(email, fillTemplate(cfg.invitation.email.subject, vars), fillTemplate(cfg.invitation.email.body, vars), { link });
        sent.push('email');
      } catch {
        failed.push('email');
      }
    }
    if (wantWhatsapp && phone) {
      try {
        await this.messenger.sendWhatsApp(
          tenantId,
          cfg.invitation.whatsapp,
          phone,
          cfg.invitation.whatsapp.variables.map((v) => vars[v] ?? ''),
        );
        sent.push('whatsapp');
      } catch {
        failed.push('whatsapp');
      }
    }
    if (mode !== 'manual' && sent.length === 0) {
      await this.auth.deleteInvitation(id);
      throw new BadRequestException('No se pudo enviar la invitación. Revisa la configuración de los canales o comparte el enlace manualmente.');
    }
    await this.invitations.update({ id }, { channels: sent });

    await this.audit.log({
      tenantId,
      actorType: 'user',
      actorId: actor.id,
      actorLabel: actor.email,
      action: 'reclutamiento.portal.invite',
      targetType: 'contact_profile',
      targetId: profileId,
      scopeId: profileId,
      metadata: { sent, failed, mode, expiresAt },
    });
    // El enlace se devuelve a quien invita para que pueda copiarlo (p. ej. si el canal falló o es manual).
    return { link, expiresAt, sent, failed };
  }

  /** Estado del portal para un encuestador: última invitación, último ingreso y documentos. */
  async status(tenantId: string, profileId: string) {
    const profile = await this.profiles.findOne({ where: { id: profileId, tenantId } });
    if (!profile) throw new NotFoundException('Perfil no encontrado');
    const last = await this.invitations.findOne({ where: { tenantId, profileId }, order: { createdAt: 'DESC' } });
    const docs = await this.docs.find({ where: { tenantId, profileId }, order: { createdAt: 'ASC' } });
    const cfg = await this.portalConfig.get(tenantId);
    return {
      lastInvitation: last ? { createdAt: last.createdAt, expiresAt: last.expiresAt, channels: last.channels, active: last.expiresAt.getTime() > Date.now() } : null,
      lastPortalLoginAt: profile.lastPortalLoginAt,
      documents: cfg.documents.map((d) => {
        const doc = docs.find((x) => x.docKey === d.key);
        return {
          key: d.key,
          label: d.label,
          required: d.required,
          current: doc
            ? { id: doc.id, fileName: doc.fileName, mimeType: doc.mimeType, sizeBytes: doc.sizeBytes, status: doc.status, rejectReason: doc.rejectReason, uploadedAt: doc.updatedAt }
            : null,
        };
      }),
    };
  }
}
