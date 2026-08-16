import { IsString, IsOptional, IsObject, IsIn, IsBoolean, MaxLength } from 'class-validator';

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
}
