import { IsInt, IsString, IsOptional, Min } from 'class-validator';

export class ConsumeCreditsDto {
  @IsInt()
  @Min(1)
  amount: number;

  /** Identificador de la acción (ej: whatsapp_message, call_minute) */
  @IsString()
  source: string;

  /** ID de referencia a la entidad que originó el consumo */
  @IsString()
  @IsOptional()
  referenceId?: string;

  @IsString()
  @IsOptional()
  description?: string;
}
