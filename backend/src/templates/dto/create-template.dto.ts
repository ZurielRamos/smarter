import { IsString, IsOptional, IsArray, ValidateNested, IsNotEmpty, MaxLength, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class TranslationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  language: string;

  // Email fields
  @IsOptional()
  @IsString()
  @MaxLength(500)
  subject?: string | null;

  @IsOptional()
  blocks?: any[] | null;

  @IsOptional()
  @IsString()
  html?: string | null;

  // SMS & Call fields
  @IsOptional()
  @IsString()
  body?: string | null;

  // Call-specific
  @IsOptional()
  @IsString()
  voice?: string | null;

  @IsOptional()
  @IsString()
  audioCode?: string | null;

  // WhatsApp fields
  @IsOptional()
  whatsappComponents?: any[] | null;
}

export class CreateTemplateDto {
  @IsString()
  @IsNotEmpty()
  tenantId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsString()
  @IsIn(['email', 'sms', 'whatsapp', 'llamada'])
  channel: string;

  @IsString()
  @IsOptional()
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

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TranslationDto)
  translations: TranslationDto[];
}
