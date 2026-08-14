import { IsString, IsUUID, IsOptional, MaxLength } from 'class-validator';

export class CreateBotDto {
  @IsUUID()
  tenantId: string;

  @IsString()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  description?: string | null;
}
