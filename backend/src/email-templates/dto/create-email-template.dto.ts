import { IsString, IsOptional, IsArray, ValidateNested, IsNotEmpty, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class TranslationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  language: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  subject: string;

  @IsOptional()
  blocks?: any[] | null;

  @IsString()
  @IsNotEmpty()
  html: string;
}

export class CreateEmailTemplateDto {
  @IsString()
  @IsNotEmpty()
  tenantId: string;

  @IsOptional()
  @IsString()
  inboxId?: string | null;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(10)
  defaultLanguage?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TranslationDto)
  translations: TranslationDto[];
}
