import { IsString, IsOptional, IsObject, IsIn, IsBoolean, IsArray, MaxLength } from 'class-validator';

export class UpdateBotToolDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  parameters?: object;

  @IsOptional()
  @IsString()
  @IsIn(['webhook', 'static', 'internal'])
  executionType?: string;

  @IsOptional()
  @IsString()
  webhookUrl?: string;

  @IsOptional()
  @IsString()
  webhookMethod?: string;

  @IsOptional()
  @IsArray()
  webhookHeaders?: { key: string; value: string }[];

  @IsOptional()
  @IsArray()
  webhookQueryParams?: { key: string; value: string }[];

  @IsOptional()
  @IsString()
  webhookBodyType?: string;

  @IsOptional()
  @IsArray()
  webhookBodyFields?: { key: string; value: string }[];

  @IsOptional()
  @IsString()
  webhookAuthType?: string;

  @IsOptional()
  @IsString()
  webhookAuthValue?: string;

  @IsOptional()
  @IsString()
  staticResponse?: string;

  @IsOptional()
  @IsString()
  internalAction?: string;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  sortOrder?: number;
}
