import {
  Controller,
  Post,
  Param,
  Body,
  UseGuards,
  Req,
  Logger,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { withMessagingAccount } from './whatsapp-messaging-account.util';
import { ApiTokenGuard } from '../auth/api-token.guard';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';
import { Inbox } from './inbox.entity';
import { TenantRole, isAdminRole } from '../users/enums/tenant-role.enum';

interface SendAuthTemplateBody {
  inboxId: string;
  to: string;
  templateName: string;
  languageCode?: string;
  code: string;
}

/**
 * API pública para enviar plantillas de autenticación (OTP) de WhatsApp.
 * Ruta: POST /api/v1/:slug/whatsapp/auth-template
 * Autenticación: API Token (x-api-token o Authorization: Bearer)
 */
@Controller('v1/:slug/whatsapp')
@UseGuards(ApiTokenGuard)
export class ApiWhatsappAuthController {
  private readonly logger = new Logger(ApiWhatsappAuthController.name);

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(Inbox)
    private readonly inboxRepo: Repository<Inbox>,
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
   * Idioma real de la plantilla en Meta: si el pedido no existe (p. ej. "es" y la
   * plantilla está en "es_CO"), usa la traducción con la misma base de idioma o
   * la única disponible. Si no puede consultarlo, devuelve el pedido.
   */
  private async resolveTemplateLanguage(inbox: Inbox, templateName: string, preferred: string): Promise<string> {
    if (!inbox.wabaId || !inbox.accessToken) return preferred;
    try {
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${inbox.wabaId}/message_templates?fields=name,language&name=${encodeURIComponent(templateName)}&limit=50`,
        { headers: { Authorization: `Bearer ${inbox.accessToken}` } },
      );
      const data: any = await res.json();
      const langs: string[] = (Array.isArray(data?.data) ? data.data : [])
        .filter((t: any) => t?.name === templateName)
        .map((t: any) => String(t.language));
      if (!langs.length || langs.includes(preferred)) return preferred;
      const base = preferred.split(/[_-]/)[0].toLowerCase();
      return langs.find((l) => l.split(/[_-]/)[0].toLowerCase() === base) || (langs.length === 1 ? langs[0] : preferred);
    } catch {
      return preferred;
    }
  }

  /**
   * POST /api/v1/:slug/whatsapp/auth-template
   * Envía una plantilla de autenticación de Meta con el código en el cuerpo
   * y en el botón (copiar código / one-tap). Solo administradores.
   */
  @Post('auth-template')
  async sendAuthTemplate(
    @Req() req: any,
    @Param('slug') slug: string,
    @Body() body: SendAuthTemplateBody,
  ) {
    const { tenantId, role } = await this.resolveTenant(req.user, slug);
    if (!isAdminRole(role)) {
      throw new ForbiddenException('Necesitas permisos de administrador para esta acción.');
    }

    const inboxId = String(body?.inboxId || '').trim();
    const templateName = String(body?.templateName || '').trim();
    const code = String(body?.code || '').trim();
    const languageCode = String(body?.languageCode || 'es').trim();
    const to = String(body?.to || '').replace(/[^\d]/g, '');

    if (!inboxId) throw new BadRequestException('inboxId es requerido');
    if (!templateName) throw new BadRequestException('templateName es requerido');
    if (!to) throw new BadRequestException('to es requerido (teléfono del destinatario)');
    if (!code) throw new BadRequestException('code es requerido');
    // Meta limita el parámetro del botón de copiar código a 15 caracteres alfanuméricos.
    if (!/^[A-Za-z0-9]{1,15}$/.test(code)) {
      throw new BadRequestException('code debe ser alfanumérico de máximo 15 caracteres');
    }

    const inbox = await this.inboxRepo.findOne({ where: { id: inboxId } });
    if (!inbox || inbox.tenantId !== tenantId) {
      throw new NotFoundException('Bandeja no encontrada');
    }
    if (inbox.channel !== 'whatsapp' || !inbox.accessToken || !inbox.phoneNumberId) {
      throw new BadRequestException('La bandeja no es un canal de WhatsApp conectado');
    }

    const bodyComponent = { type: 'body', parameters: [{ type: 'text', text: code }] };
    const buttonComponent = {
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: code }],
    };
    const payload: any = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components: [bodyComponent, buttonComponent],
      },
    };

    const send = (data: any) =>
      fetch(`https://graph.facebook.com/v21.0/${inbox.phoneNumberId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${inbox.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(withMessagingAccount(data, inbox.messagingAccountId)),
      });

    // Mensaje de error de Meta con el detalle (error_data.details) y el fbtrace_id.
    const describe = (r: any) => {
      const e = r?.error;
      if (!e) return 'Error desconocido';
      const details = e.error_data?.details ? ` | ${e.error_data.details}` : '';
      return `${e.message || 'Error'}${details} (code ${e.code}, fbtrace_id ${e.fbtrace_id || '-'})`;
    };

    try {
      payload.template.language.code = await this.resolveTemplateLanguage(inbox, templateName, languageCode);
      let res = await send(payload);
      let result: any = await res.json();
      // Solo si Meta indica que sobran parámetros (132000) se reintenta sin el
      // botón. En cualquier otro caso el reintento ocultaría el error real.
      if (!res.ok && result?.error?.code === 132000) {
        this.logger.warn(`auth-template a ${to}: ${describe(result)}; reintento sin botón`);
        res = await send({ ...payload, template: { ...payload.template, components: [bodyComponent] } });
        result = await res.json();
      }
      const messageId = result?.messages?.[0]?.id;
      if (!res.ok || !messageId) {
        throw new Error(describe(result));
      }
      return { success: true, messageId, to, templateName };
    } catch (err) {
      this.logger.error(`Fallo envío auth-template a ${to}: ${String(err)}`);
      throw new BadRequestException(`No se pudo enviar la plantilla: ${err instanceof Error ? err.message : 'error'}`);
    }
  }
}
