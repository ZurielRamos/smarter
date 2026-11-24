import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomField } from '../../records/custom-field.entity';
import { Inbox } from '../../chats/inbox.entity';
import { WhatsAppService } from '../../campaigns/whatsapp.service';
import { TenantAuditService } from '../../audit/tenant-audit.service';
import { MediaStorageService } from '../../media/media-storage.service';
import { PortalConfigRow } from '../entities/portal-config.entity';
import { Actor, requireObject } from '../validation';
import { storeLandingImage } from './landing-images';
import { PortalFieldDef, buildFieldCatalog } from './portal-fields';
import {
  DEFAULT_LANDING,
  LANDING_MEDIA_CHANNEL,
  LandingConfig,
  landingImageUrls,
  mergeLanding,
  parseLanding,
} from './portal-landing';

export type InvitationChannel = 'email' | 'whatsapp' | 'both' | 'manual';
export type VerificationChannel = 'email' | 'phone' | 'both';
/** Quién puede crear su perfil: solo invitados, o cualquiera que verifique su correo o teléfono. */
export type RegistrationMode = 'invite' | 'open';
export const DEFAULT_CONSENT_TEXT =
  'Acepto que {{empresa}} trate mis datos personales para evaluar mi postulación y gestionar mi vinculación.';
export const INVITATION_VARIABLES = ['nombre', 'empresa', 'enlace'] as const;

export interface PortalConfig {
  invitation: {
    channel: InvitationChannel;
    expiresDays: number;
    email: { subject: string; body: string };
    whatsapp: { inboxId: string | null; templateName: string; language: string; variables: string[] };
  };
  verification: {
    channel: VerificationChannel;
    email: { subject: string; body: string };
    whatsapp: { inboxId: string | null; templateName: string; language: string };
  };
  fields: Array<{ key: string; required: boolean }>;
  documents: Array<{ key: string; label: string; required: boolean; help: string }>;
  sessionHours: number;
  welcomeMessage: string;
  registration: { mode: RegistrationMode; consentText: string };
  landing: LandingConfig;
}

export const DEFAULT_CONFIG: PortalConfig = {
  invitation: {
    channel: 'email',
    expiresDays: 7,
    email: {
      subject: '{{empresa}} te invita a completar tu registro',
      body: 'Hola {{nombre}},\n\n{{empresa}} te invita a completar tu información, subir tus documentos y firmar tu contrato en su portal:\n\n{{enlace}}\n\nEl enlace vence en {{dias}} días. Al entrar te enviaremos un código de verificación.',
    },
    whatsapp: { inboxId: null, templateName: '', language: 'es', variables: ['nombre', 'enlace'] },
  },
  verification: {
    channel: 'email',
    email: {
      subject: 'Tu código de verificación',
      body: 'Tu código de verificación para {{empresa}} es:\n\n{{code}}\n\nVence en 10 minutos. Si no lo solicitaste, ignora este mensaje.',
    },
    whatsapp: { inboxId: null, templateName: '', language: 'es' },
  },
  fields: [
    { key: 'nombre_completo', required: true },
    { key: 'tipo_documento', required: true },
    { key: 'numero_documento', required: true },
    { key: 'fecha_nacimiento', required: true },
    { key: 'direccion', required: true },
    { key: 'ciudad', required: true },
  ],
  documents: [{ key: 'documento_identidad', label: 'Documento de identidad', required: true, help: 'Foto o PDF legible, por ambos lados.' }],
  sessionHours: 12,
  welcomeMessage: '',
  registration: { mode: 'invite', consentText: DEFAULT_CONSENT_TEXT },
  landing: DEFAULT_LANDING,
};

const str = (v: unknown, field: string, max: number, fallback = ''): string => {
  if (v === undefined || v === null) return fallback;
  if (typeof v !== 'string') throw new BadRequestException(`${field} es inválido`);
  const t = v.trim();
  if (t.length > max) throw new BadRequestException(`${field} no puede superar ${max} caracteres`);
  return t;
};
const int = (v: unknown, field: string, min: number, max: number, fallback: number): number => {
  if (v === undefined || v === null || v === '') return fallback;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new BadRequestException(`${field} debe estar entre ${min} y ${max}`);
  return n;
};

@Injectable()
export class PortalConfigService {
  constructor(
    @InjectRepository(PortalConfigRow) private readonly rows: Repository<PortalConfigRow>,
    @InjectRepository(CustomField) private readonly customFields: Repository<CustomField>,
    @InjectRepository(Inbox) private readonly inboxes: Repository<Inbox>,
    private readonly whatsapp: WhatsAppService,
    private readonly audit: TenantAuditService,
    private readonly media: MediaStorageService,
  ) {}

  /** Configuración vigente: lo guardado completado con los valores por defecto. */
  async get(tenantId: string): Promise<PortalConfig> {
    const row = await this.rows.findOne({ where: { tenantId } });
    return this.merge(row?.config ?? {});
  }

  private merge(saved: Record<string, any>): PortalConfig {
    const d = DEFAULT_CONFIG;
    return {
      invitation: {
        ...d.invitation,
        ...(saved.invitation ?? {}),
        email: { ...d.invitation.email, ...(saved.invitation?.email ?? {}) },
        whatsapp: { ...d.invitation.whatsapp, ...(saved.invitation?.whatsapp ?? {}) },
      },
      verification: {
        ...d.verification,
        ...(saved.verification ?? {}),
        email: { ...d.verification.email, ...(saved.verification?.email ?? {}) },
        whatsapp: { ...d.verification.whatsapp, ...(saved.verification?.whatsapp ?? {}) },
      },
      fields: Array.isArray(saved.fields) ? saved.fields : d.fields,
      documents: Array.isArray(saved.documents) ? saved.documents : d.documents,
      sessionHours: typeof saved.sessionHours === 'number' ? saved.sessionHours : d.sessionHours,
      welcomeMessage: typeof saved.welcomeMessage === 'string' ? saved.welcomeMessage : d.welcomeMessage,
      registration: {
        mode: saved.registration?.mode === 'open' ? 'open' : 'invite',
        consentText:
          typeof saved.registration?.consentText === 'string' && saved.registration.consentText.trim()
            ? saved.registration.consentText
            : d.registration.consentText,
      },
      landing: mergeLanding(saved.landing),
    };
  }

  async fieldCatalog(tenantId: string): Promise<PortalFieldDef[]> {
    const custom = await this.customFields.find({ where: { tenantId }, order: { sortOrder: 'ASC' } });
    return buildFieldCatalog(custom);
  }

  async update(tenantId: string, actor: Actor, body: Record<string, unknown>): Promise<PortalConfig> {
    const input = requireObject(body, 'La configuración');
    const current = await this.get(tenantId);
    const inv = requireObject(input.invitation ?? {}, 'La invitación');
    const ver = requireObject(input.verification ?? {}, 'La verificación');
    const d = DEFAULT_CONFIG;

    const invChannel = (inv.channel ?? d.invitation.channel) as string;
    if (!['email', 'whatsapp', 'both', 'manual'].includes(invChannel)) throw new BadRequestException('Canal de invitación inválido');
    const verChannel = (ver.channel ?? d.verification.channel) as string;
    if (!['email', 'phone', 'both'].includes(verChannel)) throw new BadRequestException('Canal de verificación inválido');

    const invEmail = requireObject(inv.email ?? {}, 'El correo de invitación');
    const invWa = requireObject(inv.whatsapp ?? {}, 'La plantilla de WhatsApp de la invitación');
    const verEmail = requireObject(ver.email ?? {}, 'El correo de verificación');
    const verWa = requireObject(ver.whatsapp ?? {}, 'La plantilla de WhatsApp de verificación');

    const variables = Array.isArray(invWa.variables) ? invWa.variables : d.invitation.whatsapp.variables;
    if (variables.length > 6 || variables.some((v) => !(INVITATION_VARIABLES as readonly string[]).includes(String(v)))) {
      throw new BadRequestException('Variables de la plantilla de WhatsApp inválidas');
    }

    const config: PortalConfig = {
      invitation: {
        channel: invChannel as InvitationChannel,
        expiresDays: int(inv.expiresDays, 'Los días de vigencia de la invitación', 1, 60, d.invitation.expiresDays),
        email: {
          subject: str(invEmail.subject, 'El asunto de la invitación', 200, d.invitation.email.subject) || d.invitation.email.subject,
          body: str(invEmail.body, 'El mensaje de la invitación', 3000, d.invitation.email.body) || d.invitation.email.body,
        },
        whatsapp: {
          inboxId: invWa.inboxId ? String(invWa.inboxId) : null,
          templateName: str(invWa.templateName, 'La plantilla de invitación', 100),
          language: str(invWa.language, 'El idioma de la plantilla', 10, 'es') || 'es',
          variables: variables.map(String),
        },
      },
      verification: {
        channel: verChannel as VerificationChannel,
        email: {
          subject: str(verEmail.subject, 'El asunto del código', 200, d.verification.email.subject) || d.verification.email.subject,
          body: str(verEmail.body, 'El mensaje del código', 3000, d.verification.email.body) || d.verification.email.body,
        },
        whatsapp: {
          inboxId: verWa.inboxId ? String(verWa.inboxId) : null,
          templateName: str(verWa.templateName, 'La plantilla del código', 100),
          language: str(verWa.language, 'El idioma de la plantilla', 10, 'es') || 'es',
        },
      },
      fields: await this.parseFields(tenantId, input.fields ?? d.fields),
      documents: this.parseDocuments(input.documents ?? d.documents),
      sessionHours: int(input.sessionHours, 'Las horas de sesión', 1, 168, d.sessionHours),
      welcomeMessage: str(input.welcomeMessage, 'El mensaje de bienvenida', 1000),
      registration: this.parseRegistration(input.registration, current.registration),
      // La landing tiene su propio endpoint: aquí nunca se modifica.
      landing: current.landing,
    };

    if (!config.invitation.email.body.includes('{{enlace}}') && (config.invitation.channel === 'email' || config.invitation.channel === 'both')) {
      throw new BadRequestException('El correo de invitación debe incluir {{enlace}}');
    }
    if (!config.verification.email.body.includes('{{code}}') && (config.verification.channel === 'email' || config.verification.channel === 'both')) {
      throw new BadRequestException('El correo del código debe incluir {{code}}');
    }
    // Un canal de WhatsApp debe estar completo y pertenecer a la cuenta.
    if (config.invitation.channel === 'whatsapp' || config.invitation.channel === 'both') {
      await this.assertWhatsappReady(tenantId, config.invitation.whatsapp, 'de invitación');
      if (!config.invitation.whatsapp.variables.includes('enlace')) {
        throw new BadRequestException('La plantilla de WhatsApp de invitación debe incluir la variable «enlace»');
      }
    }
    if (config.verification.channel === 'phone' || config.verification.channel === 'both') {
      await this.assertWhatsappReady(tenantId, config.verification.whatsapp, 'del código de verificación');
    }

    await this.rows.upsert({ tenantId, config: config as unknown as Record<string, any>, updatedBy: actor.id }, ['tenantId']);
    await this.audit.log({
      tenantId,
      actorType: 'user',
      actorId: actor.id,
      actorLabel: actor.email,
      action: 'reclutamiento.portal.config_update',
      targetType: 'portal_config',
      metadata: {
        invitationChannel: config.invitation.channel,
        verificationChannel: config.verification.channel,
        registrationMode: config.registration.mode,
        fields: config.fields.length,
        documents: config.documents.length,
      },
    });
    return config;
  }

  private parseRegistration(raw: unknown, fallback: PortalConfig['registration']): PortalConfig['registration'] {
    if (raw === undefined || raw === null) return fallback;
    const o = requireObject(raw, 'El registro');
    const mode = (o.mode ?? fallback.mode) as string;
    if (mode !== 'invite' && mode !== 'open') throw new BadRequestException('El modo de registro es inválido');
    const consentText = str(o.consentText, 'El texto de consentimiento', 500, fallback.consentText) || DEFAULT_CONSENT_TEXT;
    return { mode, consentText };
  }

  // ───────────── Landing ─────────────

  /** Carpeta de las imágenes de landing de una cuenta dentro del bucket público. */
  private imageFolder(tenantId: string): string {
    return `media/${tenantId}/${LANDING_MEDIA_CHANNEL}/`;
  }

  async updateLanding(tenantId: string, actor: Actor, body: Record<string, unknown>): Promise<LandingConfig> {
    const input = requireObject(body, 'La landing');
    const folder = this.imageFolder(tenantId);
    const landing = parseLanding(input, { isOwnImage: (url) => this.media.isOwnUrl(url, folder) });
    const current = await this.get(tenantId);
    const config: PortalConfig = { ...current, landing };
    await this.rows.upsert({ tenantId, config: config as unknown as Record<string, any>, updatedBy: actor.id }, ['tenantId']);
    // Imágenes que ya no se usan: se borran del almacenamiento (solo las de esta cuenta).
    const kept = new Set(landingImageUrls(landing));
    for (const url of landingImageUrls(current.landing)) {
      if (!kept.has(url) && this.media.isOwnUrl(url, folder)) await this.media.deleteByUrl(url).catch(() => undefined);
    }
    await this.audit.log({
      tenantId,
      actorType: 'user',
      actorId: actor.id,
      actorLabel: actor.email,
      action: 'reclutamiento.portal.landing_update',
      targetType: 'portal_config',
      metadata: { enabled: landing.enabled, sections: landing.sections.filter((s) => s.enabled).map((s) => s.id) },
    });
    return landing;
  }

  /** Sube una imagen de la landing y devuelve su URL; el editor la guarda con la landing. */
  uploadLandingImage(
    tenantId: string,
    slot: string,
    file: { buffer: Buffer; mimetype: string; originalname?: string } | undefined,
  ): Promise<{ url: string }> {
    return storeLandingImage(this.media, tenantId, 'landing', slot, file);
  }

  async assertWhatsappReady(tenantId: string, wa: { inboxId: string | null; templateName: string }, what: string) {
    if (!wa.inboxId || !wa.templateName) {
      throw new BadRequestException(`Elige el número de WhatsApp y la plantilla ${what}`);
    }
    const inbox = await this.inboxes.findOne({ where: { id: wa.inboxId, tenantId } });
    if (!inbox || inbox.channel !== 'whatsapp') throw new BadRequestException('El número de WhatsApp elegido no pertenece a esta cuenta');
  }

  private async parseFields(tenantId: string, raw: unknown): Promise<PortalConfig['fields']> {
    if (!Array.isArray(raw) || raw.length > 40) throw new BadRequestException('Los campos son inválidos (máximo 40)');
    const catalog = new Set((await this.fieldCatalog(tenantId)).map((f) => f.key));
    const seen = new Set<string>();
    return raw.map((item) => {
      const o = requireObject(item, 'Un campo');
      const key = String(o.key ?? '');
      if (!catalog.has(key)) throw new BadRequestException(`El campo «${key}» no existe en el contacto`);
      if (seen.has(key)) throw new BadRequestException(`El campo «${key}» está repetido`);
      seen.add(key);
      return { key, required: o.required === true };
    });
  }

  private parseDocuments(raw: unknown): PortalConfig['documents'] {
    if (!Array.isArray(raw) || raw.length > 15) throw new BadRequestException('Los documentos son inválidos (máximo 15)');
    const seen = new Set<string>();
    return raw.map((item) => {
      const o = requireObject(item, 'Un documento');
      const key = String(o.key ?? '');
      if (!/^[a-z][a-z0-9_]{0,38}$/.test(key)) throw new BadRequestException(`La clave «${key}» del documento es inválida (minúsculas, números y _)`);
      if (seen.has(key)) throw new BadRequestException(`El documento «${key}» está repetido`);
      seen.add(key);
      const label = str(o.label, 'El nombre del documento', 100);
      if (!label) throw new BadRequestException('Cada documento necesita un nombre');
      return { key, label, required: o.required === true, help: str(o.help, 'La ayuda del documento', 300) };
    });
  }

  // ───────── Selectores para la interfaz ─────────

  async listInboxes(tenantId: string) {
    const rows = await this.inboxes.find({ where: { tenantId, channel: 'whatsapp' }, order: { createdAt: 'DESC' } });
    return rows.map((i) => ({ id: i.id, name: i.name, connected: i.status === 'connected' && !!i.accessToken && !!i.phoneNumberId }));
  }

  async listTemplates(tenantId: string, inboxId: string) {
    const inbox = await this.inboxes.findOne({ where: { id: inboxId, tenantId } });
    if (!inbox) throw new NotFoundException('Canal de WhatsApp no encontrado');
    const templates = await this.whatsapp.getTemplates({ metaToken: inbox.accessToken || '', metaBusinessId: inbox.wabaId || '' });
    return templates.map((t) => {
      const body = (t.components || []).find((c: any) => c?.type === 'BODY');
      const text: string = body?.text || '';
      return { name: t.name, language: t.language, category: t.category, bodyText: text, variableCount: (text.match(/\{\{\s*\d+\s*\}\}/g) || []).length };
    });
  }
}
