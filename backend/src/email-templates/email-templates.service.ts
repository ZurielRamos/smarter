import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailTemplate } from './email-template.entity';
import { EmailTemplateTranslation } from './email-template-translation.entity';
import { CreateEmailTemplateDto } from './dto/create-email-template.dto';
import { UpdateEmailTemplateDto } from './dto/update-email-template.dto';

@Injectable()
export class EmailTemplatesService {
  constructor(
    @InjectRepository(EmailTemplate)
    private readonly templateRepo: Repository<EmailTemplate>,
    @InjectRepository(EmailTemplateTranslation)
    private readonly translationRepo: Repository<EmailTemplateTranslation>,
  ) {}

  async findAll(tenantId: string, inboxId?: string): Promise<EmailTemplate[]> {
    const where: any = { tenantId };
    if (inboxId) {
      where.inboxId = inboxId;
    }
    return this.templateRepo.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<EmailTemplate> {
    const template = await this.templateRepo.findOne({ where: { id } });
    if (!template) {
      throw new NotFoundException('Plantilla no encontrada');
    }
    return template;
  }

  async create(dto: CreateEmailTemplateDto): Promise<EmailTemplate> {
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
      inboxId: dto.inboxId || null,
      name: dto.name,
      defaultLanguage: defaultLang,
      translations: dto.translations.map((t) => ({
        language: t.language,
        subject: t.subject,
        blocks: t.blocks || null,
        html: t.html,
      })),
    });

    return this.templateRepo.save(template);
  }

  async update(id: string, dto: UpdateEmailTemplateDto): Promise<EmailTemplate> {
    const template = await this.findOne(id);

    if (dto.name !== undefined) {
      template.name = dto.name;
    }
    if (dto.defaultLanguage !== undefined) {
      template.defaultLanguage = dto.defaultLanguage;
    }
    if (dto.inboxId !== undefined) {
      template.inboxId = dto.inboxId;
    }

    if (dto.translations !== undefined) {
      // Remove existing translations and replace with new ones
      await this.translationRepo.delete({ templateId: id });
      template.translations = dto.translations.map((t) =>
        this.translationRepo.create({
          templateId: id,
          language: t.language,
          subject: t.subject,
          blocks: t.blocks || null,
          html: t.html,
        }),
      );
    }

    return this.templateRepo.save(template);
  }

  async remove(id: string): Promise<void> {
    const template = await this.findOne(id);
    await this.templateRepo.remove(template);
  }

  /**
   * Add or update a single translation for a template.
   */
  async upsertTranslation(
    templateId: string,
    language: string,
    data: { subject: string; blocks?: any[] | null; html: string },
  ): Promise<EmailTemplateTranslation> {
    await this.findOne(templateId); // Validate template exists

    let translation = await this.translationRepo.findOne({
      where: { templateId, language },
    });

    if (translation) {
      translation.subject = data.subject;
      translation.blocks = data.blocks || null;
      translation.html = data.html;
    } else {
      translation = this.translationRepo.create({
        templateId,
        language,
        subject: data.subject,
        blocks: data.blocks || null,
        html: data.html,
      });
    }

    return this.translationRepo.save(translation);
  }

  /**
   * Remove a specific translation from a template.
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
   * Falls back to default language if the requested language is not available.
   */
  async resolveTranslation(
    templateId: string,
    language: string,
  ): Promise<EmailTemplateTranslation> {
    const template = await this.findOne(templateId);

    // Try exact match
    let translation = template.translations.find((t) => t.language === language);
    if (translation) return translation;

    // Fallback to default language
    translation = template.translations.find((t) => t.language === template.defaultLanguage);
    if (translation) return translation;

    // Fallback to first available
    if (template.translations.length > 0) {
      return template.translations[0];
    }

    throw new NotFoundException('No se encontró ninguna traducción para esta plantilla');
  }
}
