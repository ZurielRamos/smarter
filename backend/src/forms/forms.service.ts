import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Form, FormField, FormStyle } from './form.entity';
import { ClientRecord } from '../records/record.entity';
import { Conversation } from '../chats/conversation.entity';
import { Message } from '../chats/message.entity';

@Injectable()
export class FormsService {
  /** Columnas del contacto mapeables desde el editor de formularios (además de nombre, email y teléfono). */
  static readonly DIRECT_FIELDS = [
    'company', 'jobTitle', 'documentType', 'documentNumber', 'website', 'gender',
    'birthDate', 'city', 'region', 'address', 'notes', 'source',
  ] as const;

  constructor(
    @InjectRepository(Form)
    private readonly formRepo: Repository<Form>,
    @InjectRepository(ClientRecord)
    private readonly clientRecordRepo: Repository<ClientRecord>,
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
  ) {}

  async findAll(tenantId: string): Promise<Form[]> {
    return this.formRepo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Form> {
    const form = await this.formRepo.findOne({ where: { id } });
    if (!form) throw new NotFoundException('Form not found');
    return form;
  }

  async findBySlug(slug: string): Promise<Form> {
    const form = await this.formRepo.findOne({ where: { slug, status: 'published' } });
    if (!form) throw new NotFoundException('Form not found');
    return form;
  }

  async create(data: {
    tenantId: string;
    inboxId?: string;
    name: string;
    description?: string;
    fields?: FormField[];
    style?: FormStyle;
  }): Promise<Form> {
    const slug = this.generateSlug(data.name);
    const form = this.formRepo.create({
      ...data,
      inboxId: data.inboxId || null,
      fields: data.fields || [],
      style: data.style || null,
      slug,
      status: 'draft',
    });
    return this.formRepo.save(form);
  }

  async update(id: string, data: Partial<{
    name: string;
    description: string;
    fields: FormField[];
    style: FormStyle;
    status: string;
    inboxId: string;
    slug: string;
  }>): Promise<Form> {
    const form = await this.findOne(id);
    Object.assign(form, data);
    return this.formRepo.save(form);
  }

  async delete(id: string): Promise<void> {
    await this.formRepo.delete(id);
  }

  async incrementSubmissions(id: string): Promise<void> {
    await this.formRepo.increment({ id }, 'submissionCount', 1);
  }

  private generateSlug(name: string): string {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const suffix = Math.random().toString(36).substring(2, 8);
    return `${base}-${suffix}`;
  }

  async handleSubmission(formId: string, values: Record<string, string>): Promise<{ success: boolean }> {
    const form = await this.formRepo.findOne({ where: { id: formId }, relations: { inbox: true } });
    if (!form) throw new NotFoundException('Form not found');

    // Extract mapped values
    const contactData: Partial<{ firstName: string; lastName: string; email: string; phone: string }> = {};
    // Otras columnas del contacto que el editor permite mapear (company, jobTitle, city...).
    const extraData: Partial<Record<(typeof FormsService.DIRECT_FIELDS)[number], string>> = {};
    let message = '';
    // Resumen de todos los campos enviados (mapeados o no) para el mensaje del chat.
    const summaryLines: string[] = [];
    const customData: Record<string, string> = {};

    for (const field of form.fields) {
      const raw = values[field.id];
      const value = typeof raw === 'string' ? raw.trim() : raw != null ? String(raw) : '';
      if (!value) continue;

      const mapTo = field.mapTo || '';
      if (mapTo !== 'message') summaryLines.push(`${field.label}: ${value}`);
      if (mapTo === 'firstName' || mapTo === 'lastName' || mapTo === 'email' || mapTo === 'phone') {
        contactData[mapTo] = mapTo === 'email' ? value.toLowerCase() : value;
      } else if (mapTo === 'message') {
        message = value;
      } else if ((FormsService.DIRECT_FIELDS as readonly string[]).includes(mapTo)) {
        extraData[mapTo as (typeof FormsService.DIRECT_FIELDS)[number]] = value;
      } else if (mapTo.startsWith('custom:')) {
        customData[mapTo.slice('custom:'.length)] = value;
      } else if (mapTo === 'custom') {
        customData[field.label] = value;
      }
    }

    // Mensaje del chat: todos los campos + el texto libre (campo mapeado a "message").
    const msgContent = [summaryLines.join('\n'), message].filter(Boolean).join('\n\n');
    const preview = (message || summaryLines.join(' · ')).substring(0, 100) || 'Nuevo envío de formulario';

    // Create or find contact
    const contactId = contactData.email || contactData.phone || `form-${Date.now()}`;
    let record: ClientRecord | null = null;

    if (contactData.email) {
      record = await this.clientRecordRepo.findOne({ where: { email: contactData.email, tenantId: form.tenantId } });
    }
    if (!record && contactData.phone) {
      record = await this.clientRecordRepo.findOne({ where: { phone: contactData.phone, tenantId: form.tenantId } });
    }

    if (!record) {
      record = this.clientRecordRepo.create({
        tenantId: form.tenantId,
        firstName: contactData.firstName || null,
        lastName: contactData.lastName || null,
        email: contactData.email || null,
        phone: contactData.phone || null,
        status: 'active',
        ...extraData,
        channelSource: form.inboxId || 'form',
        lastContactAt: new Date(),
        customData: Object.keys(customData).length > 0 ? customData : null,
      } as Partial<ClientRecord>);
      record = await this.clientRecordRepo.save(record);
    } else {
      // Update existing record
      if (contactData.firstName) record.firstName = contactData.firstName;
      if (contactData.lastName) record.lastName = contactData.lastName;
      if (contactData.email && !record.email) record.email = contactData.email;
      if (contactData.phone && !record.phone) record.phone = contactData.phone;
      Object.assign(record, extraData);
      record.lastContactAt = new Date();
      if (Object.keys(customData).length > 0) {
        record.customData = { ...(record.customData || {}), ...customData };
      }
      await this.clientRecordRepo.save(record);
    }

    // Create conversation in the linked inbox
    if (form.inboxId) {
      let conversation = await this.conversationRepo.findOne({
        where: { inboxId: form.inboxId, contactId },
      });

      if (!conversation) {
        conversation = this.conversationRepo.create({
          inboxId: form.inboxId,
          contactId,
          contactName: [contactData.firstName, contactData.lastName].filter(Boolean).join(' ') || contactId,
          recordId: record.id,
          status: 'open',
          lastMessage: preview,
          lastMessageAt: new Date(),
          unreadCount: 1,
        });
        conversation = await this.conversationRepo.save(conversation);
      } else {
        conversation.lastMessage = preview;
        conversation.lastMessageAt = new Date();
        conversation.unreadCount = (conversation.unreadCount || 0) + 1;
        await this.conversationRepo.save(conversation);
      }

      const msg = this.messageRepo.create({
        conversationId: conversation.id,
        direction: 'inbound',
        messageType: 'text',
        content: msgContent || 'Nuevo envío de formulario',
        status: 'delivered',
      });
      await this.messageRepo.save(msg);
    }

    await this.incrementSubmissions(formId);
    return { success: true };
  }
}
