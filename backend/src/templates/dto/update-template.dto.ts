import { IsString, IsOptional, IsArray, ValidateNested, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { TranslationDto } from './create-template.dto';

export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  defaultLanguage?: string;

  // WhatsApp-specific
  @IsOptional()
  @IsString()
  whatsappTemplateName?: string | null;

  @IsOptional()
  @IsString()
  whatsappMetaId?: string | null;

  @IsOptional()
  @IsString()
  whatsappCategory?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TranslationDto)
  translations?: TranslationDto[];
}
