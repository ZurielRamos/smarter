import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientRecord } from '../records/record.entity';
import { RecordsService } from '../records/records.service';
import { ChatsService } from '../chats/chats.service';
import { ATTRIBUTION_FIELD_KEYS } from '../records/attribution-fields';
import { Inbox } from '../chats/inbox.entity';
import { renderText, TemplateContext } from './utils/template.util';

type Data = Record<string, unknown>;

export interface ContactSummary {
  id: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  phone: string | null;
  email: string | null;
  status: string | null;
  tags: string[];
  customData: Record<string, unknown>;
  /** Atribución (firstTouch* / lastTouch*): disponible como {{trigger.contact.firstTouchCampaign}}. */
  [attributionKey: string]: unknown;
}

const digits = (v: string) => v.replace(/\D/g, '');

/**
 * Acciones del CRM disponibles como nodos: buscar/crear/actualizar contactos y
 * enviar mensajes por un canal. Reutiliza RecordsService y ChatsService, de modo
 * que webhooks, actividad y emisión en tiempo real siguen funcionando.
 */
@Injectable()
export class AutomationCrmService {
  constructor(
    @InjectRepository(ClientRecord)
    private readonly recordRepo: Repository<ClientRecord>,
    @InjectRepository(Inbox)
    private readonly inboxRepo: Repository<Inbox>,
    private readonly records: RecordsService,
    private readonly chats: ChatsService,
  ) {}

  summary(r: ClientRecord): ContactSummary {
    return {
      id: r.id,
      firstName: r.firstName ?? null,
      lastName: r.lastName ?? null,
      fullName: r.fullName ?? null,
      phone: r.phone ?? null,
      email: r.email ?? null,
      status: r.status ?? null,
      tags: Array.isArray(r.tags) ? r.tags : [],
      customData: (r.customData as Record<string, unknown>) ?? {},
      ...Object.fromEntries(
        ATTRIBUTION_FIELD_KEYS.map((k) => [k, (r as unknown as Record<string, unknown>)[k] ?? null]),
      ),
    };
  }

  async getSummary(recordId: string, tenantId: string): Promise<ContactSummary | null> {
    const r = await this.recordRepo.findOne({ where: { id: recordId, tenantId } });
    return r ? this.summary(r) : null;
  }

  /** Busca por teléfono (últimos 10 dígitos, tolerante al prefijo de país) o email. */
  async findRecord(
    tenantId: string,
    q: { phone?: string; email?: string },
  ): Promise<ClientRecord | null> {
    const phone = q.phone ? digits(q.phone) : '';
    if (phone.length >= 7) {
      const suffix = phone.slice(-10);
      const byPhone = await this.recordRepo
        .createQueryBuilder('c')
        .where('c.tenantId = :tenantId', { tenantId })
        .andWhere('c.deletedAt IS NULL')
        .andWhere("RIGHT(regexp_replace(c.phone, '\\D', '', 'g'), 10) = :suffix", { suffix })
        .getOne();
      if (byPhone) return byPhone;
    }
    const email = q.email?.trim().toLowerCase();
    if (email) {
      return this.recordRepo
        .createQueryBuilder('c')
        .where('c.tenantId = :tenantId', { tenantId })
        .andWhere('c.deletedAt IS NULL')
        .andWhere('lower(c.email) = :email', { email })
        .getOne();
    }
    return null;
  }

  private kv(list: unknown, ctx: TemplateContext): Record<string, string> {
    const out: Record<string, string> = {};
    if (!Array.isArray(list)) return out;
    for (const it of list as { key: string; value: string }[]) {
      if (it?.key) out[renderText(it.key, ctx)] = renderText(it.value, ctx);
    }
    return out;
  }

  // ─── Nodos ───────────────────────────────────────────────────

  async findContact(tenantId: string, d: Data, ctx: TemplateContext) {
    const phone = renderText(d.phone, ctx);
    const email = renderText(d.email, ctx);
    if (!phone && !email) throw new Error('Indica un teléfono o un email');
    const r = await this.findRecord(tenantId, { phone, email });
    return {
      input: { phone, email },
      output: { found: !!r, contact: r ? this.summary(r) : null },
    };
  }

  async upsertContact(tenantId: string, d: Data, ctx: TemplateContext) {
    const phoneRaw = renderText(d.phone, ctx);
    const email = renderText(d.email, ctx).trim().toLowerCase();
    const phone = phoneRaw ? digits(phoneRaw) : '';
    if (!phone && !email) throw new Error('Indica un teléfono o un email');

    const firstName = renderText(d.firstName, ctx).trim();
    const lastName = renderText(d.lastName, ctx).trim();
    const status = renderText(d.status, ctx).trim();
    const tags = renderText(d.tags, ctx)
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const custom = this.kv(d.customData, ctx);
    const input = { phone, email, firstName, lastName, status, tags, customData: custom };

    const apply = async (existing: ClientRecord) => {
      const patch: Partial<ClientRecord> = {};
      if (firstName) patch.firstName = firstName;
      if (lastName) patch.lastName = lastName;
      if (email && !existing.email) patch.email = email;
      if (phone && !existing.phone) patch.phone = phone;
      if (status) patch.status = status;
      if (tags.length) {
        patch.tags = [...new Set([...(existing.tags ?? []), ...tags])];
      }
      if (Object.keys(custom).length) {
        patch.customData = { ...(existing.customData ?? {}), ...custom };
      }
      const updated = Object.keys(patch).length
        ? await this.records.updateRecord(existing.id, patch)
        : existing;
      return { input, output: { created: false, id: updated.id, contact: this.summary(updated) } };
    };

    const existing = await this.findRecord(tenantId, { phone, email });
    if (existing) {
      if (d.mode === 'create_only') {
        return { input, output: { created: false, id: existing.id, contact: this.summary(existing) } };
      }
      return apply(existing);
    }
    if (d.mode === 'update_only') {
      return { input, output: { created: false, id: null, contact: null } };
    }

    try {
      const created = await this.records.createRecord({
        tenantId,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        phone: phone || undefined,
        email: email || undefined,
        status: status || undefined,
        channelSource: 'automatizacion',
        tags: tags.length ? tags : undefined,
        customData: Object.keys(custom).length ? custom : undefined,
      });
      return { input, output: { created: true, id: created.id, contact: this.summary(created) } };
    } catch (err) {
      // Carrera con otro proceso: el teléfono ya existe, se actualiza ese contacto.
      if (err instanceof ConflictException) {
        const id = (err.getResponse() as { existingId?: string }).existingId;
        const row = id ? await this.recordRepo.findOne({ where: { id, tenantId } }) : null;
        if (row) return apply(row);
      }
      throw err;
    }
  }

  async sendMessage(tenantId: string, d: Data, ctx: TemplateContext) {
    const inboxId = String(d.inboxId || '');
    if (!inboxId) throw new Error('Selecciona un canal');
    const inbox = await this.inboxRepo.findOne({ where: { id: inboxId, tenantId } });
    if (!inbox) throw new Error('El canal ya no existe');

    const text = renderText(d.text, ctx);
    if (!text.trim()) throw new Error('El mensaje está vacío');

    const recordIdTpl = renderText(d.recordId, ctx).trim();
    const phone = renderText(d.phone, ctx);
    const email = renderText(d.email, ctx);

    let record: ClientRecord | null = null;
    if (recordIdTpl) {
      record = await this.recordRepo.findOne({ where: { id: recordIdTpl, tenantId } });
    } else {
      if (!phone && !email) throw new Error('Indica un destinatario (teléfono, email o id de contacto)');
      record = await this.findRecord(tenantId, { phone, email });
      if (!record && d.createIfMissing !== false) {
        record = await this.records.createRecord({
          tenantId,
          phone: phone ? digits(phone) : undefined,
          email: email || undefined,
          channelSource: 'automatizacion',
        });
      }
    }
    if (!record) throw new Error('No se encontró el contacto destinatario');

    const conv = await this.chats.findOrCreateConversationForRecord(inbox.id, record.id);
    const input = { inboxId, recordId: record.id, text };

    try {
      const sent = await this.chats.sendMessage(conv.id, text, 'text');
      if (sent.status === 'failed') {
        throw new Error('El canal no pudo entregar el mensaje');
      }
      return { input, output: { messageId: sent.id, conversationId: conv.id, recordId: record.id, via: 'text' } };
    } catch (err) {
      const msg = (err as Error).message || '';
      const windowClosed = err instanceof BadRequestException && /plantilla/i.test(msg);
      const templateName = renderText(d.templateName, ctx).trim();
      if (!windowClosed || !templateName) throw err;

      // Ventana de 24 h cerrada: se usa la plantilla configurada en el nodo.
      const params = Array.isArray(d.templateParams)
        ? (d.templateParams as { key: string; value: string }[]).map((p) => renderText(p.value, ctx))
        : [];
      const components = params.length
        ? [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }]
        : undefined;
      const sent = await this.chats.sendTemplateMessage(
        conv.id,
        templateName,
        renderText(d.templateLanguage, ctx).trim() || 'es',
        components,
        undefined,
        text,
      );
      return {
        input: { ...input, templateName },
        output: { messageId: sent.id, conversationId: conv.id, recordId: record.id, via: 'template' },
      };
    }
  }

  async listInboxes(tenantId: string) {
    const list = await this.inboxRepo.find({ where: { tenantId }, order: { createdAt: 'ASC' } });
    return list.map((i) => ({ id: i.id, name: i.name, channel: i.channel }));
  }
}
