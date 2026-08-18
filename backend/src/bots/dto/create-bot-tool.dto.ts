import { IsString, IsOptional, IsObject, IsIn, IsBoolean, IsArray, MaxLength } from 'class-validator';

export class CreateBotToolDto {
  @IsString()
  botId: string;

  @IsString()
  @MaxLength(100)
  name: string;

  @IsString()
  description: string;

  @IsOptional()
  @IsObject()
  parameters?: object;

  @IsString()
  @IsIn(['webhook', 'static', 'internal'])
  executionType: string;

  // Webhook
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
  webhookRawBody?: string;

  @IsOptional()
  @IsString()
  webhookAuthType?: string;

  @IsOptional()
  @IsString()
  webhookAuthValue?: string;

  // Static
  @IsOptional()
  @IsString()
  staticResponse?: string;

  @IsOptional()
  @IsString()
  internalAction?: string;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}
