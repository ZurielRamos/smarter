import {
  Controller,
  Post,
  Param,
  Body,
  UseGuards,
  Req,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ApiTokenGuard } from '../auth/api-token.guard';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';
import { Inbox } from './inbox.entity';
import { TenantRole, isAdminRole } from '../users/enums/tenant-role.enum';
import { MailgunService } from '../providers/mailgun.service';
import { EmailDomainService } from '../providers/email-domain.service';
import { EmailUnsubscribeService } from '../providers/email-unsubscribe.service';
import { TemplatesService } from '../templates/templates.service';

interface SendEmailBody {
  /** Email del destinatario */
  to: string;
  /** ID de la plantilla a usar */
  templateId: string;
  /** Idioma de la plantilla (default: 'es') */
  language?: string;
  /** Variables para interpolar en la plantilla {{variable}} */
  variables?: Record<string, string>;
  /** Asunto personalizado (sobreescribe el de la plantilla) */
  subject?: string;
  /** ID del inbox de email_transaccional a usar (opcional si solo hay uno) */
  inboxId?: string;
  /** Tags para agrupar en Mailgun analytics */
  tags?: string[];
}

interface SendEmailBatchBody {
  /** Lista de emails a enviar */
  messages: {
    to: string;
    templateId: string;
    language?: string;
    variables?: Record<string, string>;
    subject?: string;
    tags?: string[];
  }[];
  /** ID del inbox de email_transaccional a usar (opcional si solo hay uno) */
  inboxId?: string;
}

/**
 * API pública para envío de emails transaccionales.
 * Permite a los tenants enviar emails usando sus plantillas y dominio configurado en Mailgun.
 *
 * Autenticación: API Token (header x-api-token)
 *
 * Endpoints:
 *   POST /api/v1/:slug/email/send       — Enviar un email individual
 *   POST /api/v1/:slug/email/send-batch — Enviar múltiples emails en lote
 */
@Controller('v1/:slug/email')
@UseGuards(ApiTokenGuard)
export class ApiEmailController {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(Inbox)
    private readonly inboxRepo: Repository<Inbox>,
    private readonly mailgunService: MailgunService,
    private readonly emailDomainService: EmailDomainService,
    private readonly emailUnsubscribeService: EmailUnsubscribeService,
    private readonly templatesService: TemplatesService,
  ) {}

  private async resolveTenant(user: any, slug: string): Promise<{ tenantId: string; role: TenantRole }> {
    if (user.isSuperAdmin) {
      const tenant = await this.tenantRepo.findOne({ where: { slug } });
      if (!tenant) throw new NotFoundException('Cuenta no encontrada');
      return { tenantId: tenant.id, role: TenantRole.ADMIN };
    }

    const tenantRole = user.tenantRoles?.find((tr: any) => tr.tenant.slug === slug);
    if (!tenantRole) {
      throw new ForbiddenException('No tienes acceso a esta cuenta');
    }

    return { tenantId: tenantRole.tenantId, role: tenantRole.role };
  }

  /**
   * POST /api/v1/:slug/email/send
   *
   * Envía un email transaccional individual usando una plantilla.
   *
   * Headers:
   *   x-api-token: <token>
   *
   * Body:
   *   {
   *     "to": "cliente@ejemplo.com",
   *     "templateId": "uuid-de-la-plantilla",
   *     "language": "es",
   *     "variables": { "firstName": "Juan", "orderNumber": "12345" },
   *     "subject": "Tu pedido #12345 está en camino",
   *     "inboxId": "uuid-del-inbox",
   *     "tags": ["order-confirmation"]
   *   }
   */
  @Post('send')
  async sendEmail(
    @Req() req: any,
    @Param('slug') slug: string,
    @Body() body: SendEmailBody,
  ) {
    const { tenantId, role } = await this.resolveTenant(req.user, slug);
    if (!isAdminRole(role)) {
      throw new ForbiddenException('Se requieren permisos de administrador para enviar emails');
    }

    // Validate required fields
    if (!body.to || !body.templateId) {
      throw new BadRequestException('Se requiere "to" y "templateId"');
    }

    if (!body.to.includes('@')) {
      throw new BadRequestException('Email de destinatario inválido');
    }

    // Check Mailgun is configured
    if (!this.mailgunService.isConfigured()) {
      throw new BadRequestException('Mailgun no está configurado. Contacta al administrador de la plataforma.');
    }

    // Resolve inbox
    const inbox = await this.resolveInbox(tenantId, body.inboxId);

    // Check if recipient is unsubscribed
    const isUnsubscribed = await this.emailUnsubscribeService.isUnsubscribed(tenantId, body.to);
    if (isUnsubscribed) {
      throw new BadRequestException(`El email ${body.to} se ha dado de baja y no puede recibir correos.`);
    }

    // Get email domain config
    const emailConfig = await this.emailDomainService.findByInbox(inbox.id);
    if (!emailConfig || !emailConfig.domain) {
      throw new BadRequestException('El inbox no tiene dominio de email configurado. Configúralo en Comunicaciones → Canales.');
    }

    // Resolve template
    const template = await this.templatesService.findOne(body.templateId);
    if (template.tenantId !== tenantId) {
      throw new ForbiddenException('No tienes acceso a esta plantilla');
    }
    if (template.channel !== 'email') {
      throw new BadRequestException('La plantilla debe ser de canal "email"');
    }

    // Resolve translation
    const language = body.language || 'es';
    const translation = await this.templatesService.resolveTranslation(body.templateId, language);

    // Interpolate variables
    const variables = body.variables || {};
    const subject = this.interpolate(body.subject || translation.subject || 'Sin asunto', variables);
    const html = this.interpolate(translation.html || '', variables);

    if (!html) {
      throw new BadRequestException('La plantilla no tiene contenido HTML');
    }

    // Send via Mailgun
    const from = `"${emailConfig.fromName}" <${emailConfig.fromEmail}>`;
    const result = await this.mailgunService.sendEmail({
      domain: emailConfig.domain,
      from,
      to: body.to,
      subject,
      html,
      text: this.stripHtml(html),
      variables: { tenantId, inboxId: inbox.id, templateId: body.templateId },
      tags: body.tags || ['transactional'],
      tracking: true,
      unsubscribeUrl: this.emailUnsubscribeService.getUnsubscribeUrl(tenantId, body.to),
    });

    return {
      success: true,
      messageId: result.id,
      to: body.to,
      subject,
      template: template.name,
    };
  }

  /**
   * POST /api/v1/:slug/email/send-batch
   *
   * Envía múltiples emails transaccionales en lote.
   * Máximo 50 mensajes por request.
   *
   * Body:
   *   {
   *     "inboxId": "uuid-del-inbox",
   *     "messages": [
   *       { "to": "a@b.com", "templateId": "...", "variables": { ... } },
   *       { "to": "c@d.com", "templateId": "...", "variables": { ... } }
   *     ]
   *   }
   */
  @Post('send-batch')
  async sendBatch(
    @Req() req: any,
    @Param('slug') slug: string,
    @Body() body: SendEmailBatchBody,
  ) {
    const { tenantId, role } = await this.resolveTenant(req.user, slug);
    if (!isAdminRole(role)) {
      throw new ForbiddenException('Se requieren permisos de administrador para enviar emails');
    }

    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      throw new BadRequestException('Se requiere un array "messages" con al menos un elemento');
    }

    if (body.messages.length > 50) {
      throw new BadRequestException('Máximo 50 mensajes por request. Para envíos masivos usa campañas.');
    }

    if (!this.mailgunService.isConfigured()) {
      throw new BadRequestException('Mailgun no está configurado. Contacta al administrador de la plataforma.');
    }

    // Resolve inbox
    const inbox = await this.resolveInbox(tenantId, body.inboxId);

    // Get email domain config
    const emailConfig = await this.emailDomainService.findByInbox(inbox.id);
    if (!emailConfig || !emailConfig.domain) {
      throw new BadRequestException('El inbox no tiene dominio de email configurado.');
    }

    const from = `"${emailConfig.fromName}" <${emailConfig.fromEmail}>`;

    // Cache templates to avoid repeated DB lookups
    const templateCache = new Map<string, { template: any; translations: Map<string, any> }>();

    const results: { to: string; success: boolean; messageId?: string; error?: string }[] = [];

    for (const msg of body.messages) {
      try {
        if (!msg.to || !msg.to.includes('@')) {
          results.push({ to: msg.to || '', success: false, error: 'Email inválido' });
          continue;
        }

        if (!msg.templateId) {
          results.push({ to: msg.to, success: false, error: 'templateId requerido' });
          continue;
        }

        // Check unsubscribe
        const unsub = await this.emailUnsubscribeService.isUnsubscribed(tenantId, msg.to);
        if (unsub) {
          results.push({ to: msg.to, success: false, error: 'Email dado de baja (unsubscribed)' });
          continue;
        }

        // Resolve template (with cache)
        let cached = templateCache.get(msg.templateId);
        if (!cached) {
          const template = await this.templatesService.findOne(msg.templateId);
          if (template.tenantId !== tenantId) {
            results.push({ to: msg.to, success: false, error: 'Sin acceso a la plantilla' });
            continue;
          }
          if (template.channel !== 'email') {
            results.push({ to: msg.to, success: false, error: 'La plantilla no es de email' });
            continue;
          }
          cached = { template, translations: new Map() };
          templateCache.set(msg.templateId, cached);
        }

        // Resolve translation (with cache)
        const language = msg.language || 'es';
        let translation = cached.translations.get(language);
        if (!translation) {
          translation = await this.templatesService.resolveTranslation(msg.templateId, language);
          cached.translations.set(language, translation);
        }

        // Interpolate
        const variables = msg.variables || {};
        const subject = this.interpolate(msg.subject || translation.subject || 'Sin asunto', variables);
        const html = this.interpolate(translation.html || '', variables);

        if (!html) {
          results.push({ to: msg.to, success: false, error: 'Plantilla sin contenido HTML' });
          continue;
        }

        // Send
        const result = await this.mailgunService.sendEmail({
          domain: emailConfig.domain,
          from,
          to: msg.to,
          subject,
          html,
          text: this.stripHtml(html),
          variables: { tenantId, inboxId: inbox.id, templateId: msg.templateId },
          tags: msg.tags || ['transactional', 'batch'],
          tracking: true,
          unsubscribeUrl: this.emailUnsubscribeService.getUnsubscribeUrl(tenantId, msg.to),
        });

        results.push({ to: msg.to, success: true, messageId: result.id });
      } catch (err: any) {
        results.push({ to: msg.to, success: false, error: err.message || 'Error desconocido' });
      }
    }

    const totalSent = results.filter((r) => r.success).length;
    const totalFailed = results.filter((r) => !r.success).length;

    return {
      total: results.length,
      sent: totalSent,
      failed: totalFailed,
      results,
    };
  }

  // ─── Helpers ───────────────────────────────────────────────────────

  /**
   * Find the email_transaccional inbox for this tenant.
   * If inboxId is provided, validate it belongs to the tenant and is the right channel.
   * Otherwise, auto-select the first email_transaccional inbox.
   */
  private async resolveInbox(tenantId: string, inboxId?: string): Promise<Inbox> {
    if (inboxId) {
      const inbox = await this.inboxRepo.findOne({ where: { id: inboxId, tenantId, channel: 'email_transaccional' } });
      if (!inbox) {
        throw new NotFoundException('Inbox de email transaccional no encontrado o no pertenece a tu cuenta');
      }
      return inbox;
    }

    // Auto-select first email_transaccional inbox
    const inbox = await this.inboxRepo.findOne({
      where: { tenantId, channel: 'email_transaccional' },
      order: { createdAt: 'ASC' },
    });

    if (!inbox) {
      throw new BadRequestException('No tienes una bandeja de Email Transaccional configurada. Créala en Comunicaciones → Nueva Bandeja.');
    }

    return inbox;
  }

  /**
   * Replace {{variable}} placeholders with values from the variables object.
   */
  private interpolate(template: string, variables: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      return variables[key] ?? '';
    });
  }

  /**
   * Strip HTML tags for plain text fallback.
   */
  private stripHtml(html: string): string {
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}
