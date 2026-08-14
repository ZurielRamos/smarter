import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Template } from './template.entity';
import { TemplateTranslation } from './template-translation.entity';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';

@Injectable()
export class TemplatesService {
  constructor(
    @InjectRepository(Template)
    private readonly templateRepo: Repository<Template>,
    @InjectRepository(TemplateTranslation)
    private readonly translationRepo: Repository<TemplateTranslation>,
  ) {}

  async findAll(tenantId: string, channel?: string): Promise<Template[]> {
    const where: any = { tenantId };
    if (channel) {
      where.channel = channel;
    }
    return this.templateRepo.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Template> {
    const template = await this.templateRepo.findOne({ where: { id } });
    if (!template) {
      throw new NotFoundException('Plantilla no encontrada');
    }
    return template;
  }

  async create(dto: CreateTemplateDto): Promise<Template> {
    if (!dto.translations || dto.translations.length === 0) {
      throw new BadRequestException('Se requiere al menos una traducción');
    }

    const defaultLang = dto.defaultLanguage || 'es';
    const hasDefaultLang = dto.translations.some((t) => t.language === defaultLang);
    if (!hasDefaultLang) {
      throw new BadRequestException(`Se requiere una traducción para el idioma por defecto: ${defaultLang}`);
    }

    const template = this.templateRepo.create({
      tenantId: dto.tenantId,
      name: dto.name,
      channel: dto.channel,
      defaultLanguage: defaultLang,
      whatsappTemplateName: dto.whatsappTemplateName || null,
      whatsappMetaId: dto.whatsappMetaId || null,
      whatsappCategory: dto.whatsappCategory || null,
      translations: dto.translations.map((t) => this.mapTranslationDto(t)),
    });

    return this.templateRepo.save(template);
  }

  async update(id: string, dto: UpdateTemplateDto): Promise<Template> {
    const template = await this.findOne(id);

    if (dto.name !== undefined) template.name = dto.name;
    if (dto.defaultLanguage !== undefined) template.defaultLanguage = dto.defaultLanguage;
    if (dto.whatsappTemplateName !== undefined) template.whatsappTemplateName = dto.whatsappTemplateName;
    if (dto.whatsappMetaId !== undefined) template.whatsappMetaId = dto.whatsappMetaId;
    if (dto.whatsappCategory !== undefined) template.whatsappCategory = dto.whatsappCategory;

    if (dto.translations !== undefined) {
      await this.translationRepo.delete({ templateId: id });
      template.translations = dto.translations.map((t) =>
        this.translationRepo.create({ templateId: id, ...this.mapTranslationDto(t) }),
      );
    }

    return this.templateRepo.save(template);
  }

  async remove(id: string): Promise<void> {
    const template = await this.findOne(id);
    await this.templateRepo.remove(template);
  }

  /**
   * Upsert a single translation for a template.
   */
  async upsertTranslation(
    templateId: string,
    language: string,
    data: Partial<Omit<TemplateTranslation, 'id' | 'templateId' | 'language' | 'template' | 'createdAt' | 'updatedAt'>>,
  ): Promise<TemplateTranslation> {
    await this.findOne(templateId);

    let translation = await this.translationRepo.findOne({
      where: { templateId, language },
    });

    if (translation) {
      Object.assign(translation, data);
    } else {
      translation = this.translationRepo.create({
        templateId,
        language,
        ...data,
      });
    }

    return this.translationRepo.save(translation);
  }

  /**
   * Remove a specific translation.
   */
  async removeTranslation(templateId: string, language: string): Promise<void> {
    const template = await this.findOne(templateId);
    if (template.defaultLanguage === language) {
      throw new BadRequestException('No se puede eliminar la traducción del idioma por defecto');
    }

    const result = await this.translationRepo.delete({ templateId, language });
    if (result.affected === 0) {
      throw new NotFoundException(`Traducción para idioma "${language}" no encontrada`);
    }
  }

  /**
   * Resolve the best translation for a given language.
   * Falls back to default language, then first available.
   */
  async resolveTranslation(templateId: string, language: string): Promise<TemplateTranslation> {
    const template = await this.findOne(templateId);

    let translation = template.translations.find((t) => t.language === language);
    if (translation) return translation;

    translation = template.translations.find((t) => t.language === template.defaultLanguage);
    if (translation) return translation;

    if (template.translations.length > 0) {
      return template.translations[0];
    }

    throw new NotFoundException('No se encontró ninguna traducción para esta plantilla');
  }

  private mapTranslationDto(t: any): Partial<TemplateTranslation> {
    return {
      language: t.language,
      subject: t.subject || null,
      blocks: t.blocks || null,
      html: t.html || null,
      body: t.body || null,
      voice: t.voice || null,
      audioCode: t.audioCode || null,
      whatsappComponents: t.whatsappComponents || null,
    };
  }
}
