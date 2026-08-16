import { IsString, IsOptional, IsObject, IsIn, IsBoolean, MaxLength } from 'class-validator';

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
  @IsIn(['GET', 'POST', 'PUT'])
  webhookMethod?: string;

  @IsOptional()
  @IsObject()
  webhookHeaders?: Record<string, string>;

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
