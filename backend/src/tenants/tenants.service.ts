import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from './tenant.entity';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { UserTenant } from '../users/user-tenant.entity';
import { CustomField } from '../records/custom-field.entity';
import { ConversionEvent } from '../conversions/conversion-event.entity';

const SYSTEM_FIELDS = [
  // Identificación
  { fieldKey: 'firstName', fieldLabel: 'Nombre', fieldType: 'text', fieldGroup: 'identificacion' },
  { fieldKey: 'lastName', fieldLabel: 'Apellido', fieldType: 'text', fieldGroup: 'identificacion' },
  { fieldKey: 'fullName', fieldLabel: 'Nombre completo', fieldType: 'text', fieldGroup: 'identificacion' },
  { fieldKey: 'documentType', fieldLabel: 'Tipo de documento', fieldType: 'select', options: ['CC', 'CE', 'NIT', 'TI', 'Pasaporte', 'RUT'], fieldGroup: 'identificacion' },
  { fieldKey: 'documentNumber', fieldLabel: 'Número de documento', fieldType: 'text', fieldGroup: 'identificacion' },
  // Contacto
  { fieldKey: 'phone', fieldLabel: 'Teléfono', fieldType: 'text', fieldGroup: 'contacto' },
  { fieldKey: 'countryCode', fieldLabel: 'Código de país', fieldType: 'text', fieldGroup: 'contacto' },
  { fieldKey: 'email', fieldLabel: 'Email', fieldType: 'text', fieldGroup: 'contacto' },
  // Demografía
  { fieldKey: 'gender', fieldLabel: 'Género', fieldType: 'select', options: ['male', 'female', 'other', 'prefer_not_to_say'], fieldGroup: 'demografia' },
  { fieldKey: 'birthDate', fieldLabel: 'Fecha de nacimiento', fieldType: 'date', fieldGroup: 'demografia' },
  // Ubicación
  { fieldKey: 'city', fieldLabel: 'Ciudad', fieldType: 'text', fieldGroup: 'ubicacion' },
  { fieldKey: 'region', fieldLabel: 'Departamento / Estado', fieldType: 'text', fieldGroup: 'ubicacion' },
  // Segmentación
  { fieldKey: 'status', fieldLabel: 'Estado', fieldType: 'select', options: ['lead', 'contactado', 'interesado', 'oportunidad', 'cliente', 'premium', 'fidelizado', 'inactivo', 'perdido'], fieldGroup: 'segmentacion' },
  { fieldKey: 'channelSource', fieldLabel: 'Canal de origen', fieldType: 'select', options: ['whatsapp', 'messenger', 'instagram', 'sms', 'llamada', 'email', 'web', 'formulario', 'landing', 'referido', 'campaña', 'import', 'manual', 'api'], fieldGroup: 'segmentacion' },
  { fieldKey: 'source', fieldLabel: 'Fuente de adquisición', fieldType: 'text', fieldGroup: 'segmentacion' },
  { fieldKey: 'score', fieldLabel: 'Score', fieldType: 'number', fieldGroup: 'segmentacion' },
  // Consentimiento
  { fieldKey: 'optInWhatsapp', fieldLabel: 'Opt-in WhatsApp', fieldType: 'boolean', fieldGroup: 'consentimiento' },
  { fieldKey: 'optInEmail', fieldLabel: 'Opt-in Email', fieldType: 'boolean', fieldGroup: 'consentimiento' },
  // Actividad
  { fieldKey: 'lastContactAt', fieldLabel: 'Último contacto', fieldType: 'date', fieldGroup: 'actividad' },
  { fieldKey: 'lastActivityAt', fieldLabel: 'Última actividad', fieldType: 'date', fieldGroup: 'actividad' },
  // Meta
  { fieldKey: 'tags', fieldLabel: 'Etiquetas', fieldType: 'array', fieldGroup: 'segmentacion' },
];

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(UserTenant)
    private readonly userTenantRepo: Repository<UserTenant>,
    @InjectRepository(CustomField)
    private readonly customFieldRepo: Repository<CustomField>,
    @InjectRepository(ConversionEvent)
    private readonly conversionEventRepo: Repository<ConversionEvent>,
  ) {}

  async findAll(): Promise<Tenant[]> {
    return this.tenantRepo.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<Tenant> {
    const tenant = await this.tenantRepo.findOne({ where: { id } });
    if (!tenant) throw new NotFoundException(`Tenant ${id} not found`);
    return tenant;
  }

  async create(
    dto: CreateTenantDto,
    iconPath: string | null,
  ): Promise<Tenant> {
    const existing = await this.tenantRepo.findOne({ where: { slug: dto.slug } });
    if (existing) throw new ConflictException(`Slug "${dto.slug}" already exists`);

    const tenant = this.tenantRepo.create({
      name: dto.name,
      slug: dto.slug,
      iconPath,
    } as Partial<Tenant>);
    const saved = await this.tenantRepo.save(tenant);

    // Seed system fields for the new tenant
    const systemFields = SYSTEM_FIELDS.map((field, i) =>
      this.customFieldRepo.create({
        tenantId: saved.id,
        fieldKey: field.fieldKey,
        fieldLabel: field.fieldLabel,
        fieldType: field.fieldType,
        fieldGroup: field.fieldGroup,
        options: field.options || null,
        isRequired: false,
        isSystem: true,
        sortOrder: i,
      }),
    );
    await this.customFieldRepo.save(systemFields);

    // Seed default conversion event mappings
    const defaultConversionEvents = [
      { triggerType: 'purchase', triggerValue: 'purchase', name: 'Compra', metaEventName: 'Purchase', tiktokEventName: 'CompletePayment', includeValue: true },
      { triggerType: 'appointment', triggerValue: 'appointment', name: 'Cita agendada', metaEventName: 'Schedule', tiktokEventName: 'Contact', includeValue: false },
      { triggerType: 'qualified', triggerValue: 'qualified', name: 'Lead calificado', metaEventName: 'Lead', tiktokEventName: 'SubmitForm', includeValue: false },
      { triggerType: 'registration', triggerValue: 'registration', name: 'Registro', metaEventName: 'CompleteRegistration', tiktokEventName: 'CompleteRegistration', includeValue: false },
      { triggerType: 'subscription', triggerValue: 'subscription', name: 'Suscripción', metaEventName: 'Subscribe', tiktokEventName: 'Subscribe', includeValue: true },
    ].map((evt) => this.conversionEventRepo.create({
      tenantId: saved.id,
      ...evt,
      platforms: [],
      currency: 'COP',
      isActive: true,
    }));
    await this.conversionEventRepo.save(defaultConversionEvents);

    return saved;
  }

  async update(
    id: string,
    dto: UpdateTenantDto,
    iconPath?: string,
  ): Promise<Tenant> {
    const tenant = await this.findOne(id);
    Object.assign(tenant, dto);
    if (iconPath) tenant.iconPath = iconPath;
    return this.tenantRepo.save(tenant);
  }

  async remove(id: string): Promise<void> {
    const tenant = await this.findOne(id);
    await this.tenantRepo.remove(tenant);
  }

  async getStats() {
    const total = await this.tenantRepo.count();
    const active = await this.tenantRepo.count({ where: { isActive: true } });
    const inactive = total - active;
    return { total, active, inactive };
  }

  async checkSlugAvailability(slug: string): Promise<{ available: boolean }> {
    const existing = await this.tenantRepo.findOne({ where: { slug } });
    return { available: !existing };
  }

  async getMembers(tenantId: string): Promise<UserTenant[]> {
    return this.userTenantRepo.find({
      where: [
        { tenantId, status: 'active' },
        { tenantId, status: 'pending' },
      ],
      relations: { user: true },
      order: { createdAt: 'ASC' },
    });
  }
}
